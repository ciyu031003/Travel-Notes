# Travel-Notes 前后端数据交互评审与并发/缓存优化方案

> **文档版本**: v1.0
> **评审日期**: 2026-08-31
> **评审人**: Codex（代码评审）
> **适用范围**: 前后端数据交互 · 并发能力 · Redis 缓存必要性
> **关联文档**: docs/ARCHITECTURE_OPTIMIZATION.md（v3.5）、docs/DEPLOYMENT.md、docs/Travel-Notes_优化设计方案.md

---

## 0. 结论速览（TL;DR）

1. **当前规模没有性能问题，但架构存在系统性短板**：全站是「客户端 useEffect 拉取 + 45 个 force-dynamic API」架构，Next.js 的 SSR/ISR 能力几乎未生效（代码中**没有任何 `export const revalidate`**），API 响应不带 `Cache-Control`，唯一的缓存是**单实例内存缓存**（2000 条 / 默认 TTL 60s）。
2. **并发瓶颈排序**：① 媒体与静态资源全部经过 Node 进程（nginx 只反代不直接 serve，`/uploads`、`/api/uploads`、`/api/images/[id]` 都走 Node）；② 全表扫描类查询（搜索 `content LIKE`，无 FULLTEXT 索引）；③ 无分页聚合（时间线/标签云全量读）；④ 大 JSON 序列化（画册深 include、推荐 Feed 500 条内存排序）——这些都压在 2C2G 单机的事件循环与 MySQL 上。
3. **当前单机 2C2G 的容量估算**：乐观约 20~50 个同时在线用户、聚合接口数十 QPS。对情侣/个人用途绰绰有余；一旦社交圈做起来（日活数百 + 频繁互动 + 移动端每设备全量离线拉取），会先撞上 Node 事件循环与 MySQL 查询墙，而不是「缺 Redis」。
4. **Redis 结论**：**当前不需要**（与文档阶段五结论一致）；**在多实例横向扩容之前必须引入**。Redis 解决的是「多实例共享缓存 / 分布式限流 / ISR 缓存一致性」；单机内存缓存已覆盖单实例场景。明确触发阈值见 §5.4。
5. **建议立即执行阶段 A（纯代码、零/低成本、收益最大）**，把单实例能力提升一个数量级；当用户/数据量证明需要时再做阶段 B（Redis + 对象存储/CDN + 多实例）。

---

## 1. 评审范围与方法

- 阅读代码：`app/api/*`（103 个路由文件，45 个 force-dynamic）、`lib/*`（服务/仓库/基础设施）、`middleware.ts`、`prisma/schema.prisma`、`lib/db.ts` / `lib/prisma-adapter.ts`、`lib/infrastructure/cache.ts` / `rate-limit.ts`、`lib/modules/offline/*`（移动端同步）、Dockerfile / docker-compose / nginx 配置、CI、运维脚本。
- 对照文档：ARCHITECTURE_OPTIMIZATION.md、DEPLOYMENT.md、优化设计方案。
- 重点：前后端数据交互链路（谁取数、取几次、是否缓存、是否可缓存）、并发与容量、Redis 引入必要性。

## 2. 现状全景

### 2.1 部署拓扑（当前）

单机 2C2G（106.55.2.197 / travel-notes.yuanabd.cn）：

```
浏览器 / Capacitor Android 壳
   │
   ▼
Nginx（80/443/8443）── 全部反代 ──► Next.js App（Docker 单实例，:3000）
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                   MySQL 8.4       public/uploads   /api/uploads 按需变体
                   （同机 Docker）   （本地卷，经 Node 返回）
```

### 2.2 数据交互链路（一次首页访问）

1. 浏览器请求 `/` → Next 返回**静态 HTML 壳**（`app/page.tsx` 是 `'use client'`，仅 loading 态）。
2. 客户端 JS 水合 → `useEffect` → `fetch('/api/home')`。
3. middleware：JWT 校验（登录用户）+ 安全头。
4. `/api/home`（force-dynamic）：`getCurrentUserId()`（登录用户 → 1 次 `user.findUnique`）→ `getPostsHybrid('travel')`（内存缓存未命中 → `post.findMany`）→ `listAnniversaries`（1~2 次查询）→ JSON 返回。
5. 前端渲染。

### 2.3 关键数字

| 指标 | 数值 | 说明 |
|---|---|---|
| API 路由文件 | 103 | `app/api/**/route.ts` |
| force-dynamic API | 45 | 读接口几乎全部强制动态 |
| `export const revalidate` | **0** | 代码中不存在；文档声称的 ISR=300 未落地 |
| 客户端页面 | 33/35 | 其余 2 个页面也是壳 |
| API 响应 Cache-Control | 无 | Next 对 force-dynamic 默认 no-store |
| 内存缓存 | 2000 条 / TTL 60s | posts 300s、moments 120s；单实例 |
| 限流 | 进程内存 Map | 登录/上传/油画；单实例 |
| DB 连接池 | 25（queueLimit 50） | `DB_CONNECTION_LIMIT` 默认 |
| 会话 | JWT + DB Session | 每受保护请求 1 次 session 读 |
| 媒体 | 本地卷，经 Node 流式返回 | 视频 Range 支持；变体按需 sharp 生成 |

## 3. 前后端数据交互评审（重点）

### 3.1 架构性发现（影响最大）

**F1 全站客户端取数，SSR/ISR 形同虚设**
- 33/35 页面是 `'use client'` + `useEffect(fetch(apiUrl('/api/...')))`。
- 首页/旅行/时间线/看板/相册/搜索/Feed 全部依赖客户端二次请求；首屏 = HTML 壳 + JS 水合 + 网络往返 + 后端查询链。
- 后果：首屏变慢（移动端弱网尤其明显）、SEO 弱、每次访问都打 DB、无法利用 CDN/边缘缓存。
- 文档 v3.4 声称「revalidate=300 首页/旅行/博客…」，但代码中**没有任何 `export const revalidate`**；`revalidatePath()` 对客户端页面没有实际缓存可失效 → **文档与实际不符**。

**F2 API 响应不设置 Cache-Control**
- 所有 `NextResponse.json(...)` 未设 `Cache-Control`，Next 对 force-dynamic 默认 `no-store`。
- 即使是公开只读数据（首页聚合、旅行列表、时间线、RSS、画册摘要），浏览器/CDN 也完全不缓存，每次访问全量重查。

**F3 无统一客户端请求层**
- 没有 SWR/React Query；没有请求去重、竞态取消、超时、重试、统一错误处理。
- 实例：`app/page.tsx` 对非 2xx 也会 `setData(j)`（仅 `j.error` 进错误分支）；`app/timeline/page.tsx` 同样。页面快速切换时旧响应可能覆盖新状态（React 18 StrictMode 下更明显）。
- 同页多次取数（如相册页 `/api/album` + `/api/travel-book` 并行）无法复用/去重。

**F4 每次请求的固定开销偏高**
- 登录用户每个 API 请求：middleware JWT 校验 + `getCurrentUserId()` → `prisma.user.findUnique`（**每请求 1 次 DB**）。
- 受保护 API：`requireAuth` → JWT 校验 + `session.findById`（DB 读）+ 节流 `touchLastUsed`（≤5 分钟 1 次 DB 写）。DB session 化是安全正确之举，但读路径可缓存。

### 3.2 热点查询与 N+1（数据量增长后最先爆发）

| # | 位置 | 问题 | 规模影响 |
|---|---|---|---|
| F5 | `lib/modules/timeline/timeline.service.ts` | 4 个并行查询中 travels/posts/memories **无 take 上限**（仅 timelineItem 有 take:500），全量读入内存聚合 | 记录数 10 万级后每次时间线都近似全表扫 |
| F6 | `lib/repositories/post-repository.ts` `getAllTags` | 读**全部** post 的 tags 到内存计数聚合，无分页无缓存 | 随文章数线性增长 |
| F7 | `post-repository.search` | `content: { contains }` → MySQL `LIKE '%kw%'`，TEXT 全表扫描；**无 FULLTEXT 索引** | 搜索是最危险的查询：未登录可触发、无限流 |
| F8 | `lib/modules/social/social.service.ts` `listSocialFeed(recommended)` | 每次取最近 500 条帖子到 JS 内存做热度排序再分页；`page` 深翻页 offset 膨胀 | Feed 并发下 CPU/内存抖动 |
| F9 | `getUserProfile` | ~8 次查询/次（5 个并行 count + 12 条帖子 + attachViewerState 2 次 IN 查询） | 个人主页高并发时放大 |
| F10 | `getSocialPost → collectTravelPhotos` | 详情页额外 3 次查询（travel + memories + media） | 可接受，属 N+1 雏形 |
| F11 | `travel-book.service` `listTravelModelBooks` | 深 include：days→itineraryItems→location；memories→media+variants+mediaLinks→media；单本画册可能展开数百条媒体 → **大 JSON 序列化** | Node 事件循环 + 响应体膨胀 |
| F12 | `app/api/images/[id]/route.ts` | 遗留 `PostImage.data` LongBlob 从 DB 全量读图经 Node 返回 | DB 体积 + Node 内存双压力（迁移后应确认无引用再下线） |

### 3.3 媒体链路（并发杀手）

**F13 媒体全部经过 Node 进程**
- 原图 `/uploads/**`（public 静态，但仍是 Next/Node 进程返回）；变体 `/api/uploads/...`（Node 路由，命中缺失时**按需 sharp 生成**，并发上限 3）。
- nginx 配置只反代，不直接 serve `/uploads`；视频 Range 也是 Node 流式读取。
- 后果：媒体流量（尤其视频、相册原图）全部占用 Node 事件循环与内存；并发看图/视频时，动态 API 延迟被拖高。
- 已具备对象存储能力（`STORAGE_*` 配置即启用）但未启用；启用后可把媒体完全卸到 CDN/OSS。

### 3.4 防滥用与健壮性

| # | 位置 | 问题 |
|---|---|---|
| F14 | `app/api/danmaku/route.ts` POST | **无鉴权、无限流**的公开写接口（垃圾弹幕/刷库） |
| F15 | `app/api/search/route.ts` | 未登录可高频触发全表扫描搜索，无限流 |
| F16 | 客户端 | fetch 多数无 AbortController/竞态标志；错误处理不统一 |
| F17 | `lib/modules/offline/*` | 移动端同步为**全量拉取**（无增量游标）：每设备每次同步都拉列表全量（moments/travels/albums/feed 50 条），设备数 × 数据量线性放大 |
| F18 | 上传 | base64 内存拷贝（≤2048px）→ multipart；服务器 `request.formData()` 整体读入内存；限流基于 IP 且为单实例内存 |

### 3.5 做得好的部分（应保留）

- 安全基线扎实：CSRF Origin 校验、CSP/Security Headers、JWT + DB Session、token 黑名单落库、上传扩展名白名单、路径穿越防护、SSRF 同源强校验、验证码脱敏、敏感配置 AES 加密落库。
- 登录/上传/油画均有限流；写操作统一事务 + 反规范化计数幂等。
- 数据库索引覆盖了大多数热查询（authorId/publishedAt、postId/userId 唯一约束等）。
- 服务层/仓库层/DI 分层清晰，`CacheService` 抽象已预留 Redis 替换点。
- 移动端离线（SQLite + LWW + 墓碑）设计正确。

---

## 4. 并发能力分析

### 4.1 估算模型

- 单次首屏 ≈ 2~5 个 API；每 API ≈ 2~6 个 DB 查询（含用户/会话解析）。
- 2C2G 单实例 Node：纯 API 动态请求（无媒体、查询优化后）约可支撑 **30~80 QPS**；当前未优化实现 + 媒体混跑，实际乐观 **10~30 QPS 聚合接口 / 20~50 同时在线**。
- MySQL 同机共享 CPU：搜索全表扫描或时间线全量读会把 Load 瞬间打满。

> 说明：以上为经验区间而非实测基准。准确数字需压测（见阶段 C4），但足以支撑「当前够用、规模化需先做 A」的判断。

### 4.2 瓶颈排序（按影响）

1. **Node 事件循环**：媒体流式输出 + 按需 sharp 变体 + 大 JSON 序列化（画册/Feed）。
2. **MySQL 查询**：搜索 LIKE 全表扫描、无分页聚合（时间线/标签）、深 include 扇出。
3. **内存**：大 JSON、推荐 Feed 500 条排序、LongBlob 图。
4. **带宽**：无 CDN，全站流量走单机单出口。

### 4.3 写路径并发

- 点赞/收藏/评论：事务 + 反规范化计数（`increment/decrement`）→ 单写库，热点帖子高并发下会锁竞争；当前规模无虞，规模化后需计数外置或异步化。
- 通知：每次互动写 1 条 Notification；未读数每轮询一次 count。规模化后建议批量/缓存。

### 4.4 移动端放大效应

- 每台手机联网即全量拉取 4 类列表 + 上传队列重放；用户量 × 设备数后，这部分流量会成为服务器常态负载，**早于 Redis 需求出现**。

---

## 5. Redis 必要性评估

### 5.1 分场景结论

| 场景 | 是否需要 Redis | 理由 |
|---|---|---|
| 当前：单实例、个人/情侣、<几百日活 | **不需要** | 内存缓存 + 内存限流 + 单实例已覆盖；Redis 只增加运维与故障点 |
| 多用户社交规模化（数百~数千 DAU）+ 需要 2 个以上实例 | **需要（先于多实例）** | 共享缓存、分布式限流、ISR 缓存一致性、热点聚合缓存 |
| 万级 DAU / 对外公开运营 | 必须 + 更全面架构 | 还需读写分离、队列、全文检索、CDN、监控 |

### 5.2 单实例 → 多实例时，Redis 解决的具体问题

1. **内存缓存碎片化**：现在 `posts:...:u{userId}` 按用户分 key；多用户后缓存 key 数量暴涨 → 单实例 2000 条很快被冲掉。多实例各自缓存 = 命中率再除以实例数 + 缓存击穿/雪崩概率上升。
2. **限流失效**：`rate-limit.ts` 是进程内存 Map。多实例后登录爆破/上传刷量可按实例拆分绕过（每实例各 120 次）。必须换 Redis 滑动窗口。
3. **ISR/页面缓存不一致**：Next 默认文件系统缓存单实例；多实例各自缓存，写后 `revalidate` 只清当前实例。需 `cacheHandler` 指向 Redis。
4. **热点数据共享**：首页聚合、推荐 Feed、画册摘要、站点设置等可跨实例共享并降低 MySQL 压力。

### 5.3 引入 Redis 的成本

- 自托管：1C1G~512MB 容器（同机或单独小机）≈ 低至免费；运维 + 单点风险（需 AOF 持久化 + 定期备份）。
- 托管：Upstash（serverless、按量计费、免运维）最适合小规模起步；国内可选腾讯云/阿里云 Redis（延迟低、有高可用）。
- 代码成本：`CacheService` 抽象已就位，新增 `RedisCacheService` 实现 + DI 切换即可，改动面小。

### 5.4 触发阈值（建议，避免过早/过晚）

满足**任意 2 条**即启动阶段 B（Redis + 对象存储/CDN）：

1. 单日 UV > 500 或同时在线 > 50（持续多日）。
2. API p95 延迟 > 500ms 或错误率 > 1%。
3. MySQL 慢查询（>1s）日增数十条，或连接池经常打满（`queueLimit` 等待）。
4. CPU/load 持续 > 70%（多日观察，排除媒体突发）。
5. 确定要跑 ≥2 个应用实例（发布不停机/蓝绿/容灾）。

> 注意：即使不满足上述阈值，**阶段 A 的代码级优化也应该先做**——它不依赖 Redis，能把单实例容量提升一个数量级，并推迟 Redis 引入时间。

---

## 6. 优化方案（分阶段落地）

### 阶段 A（P0 · 代码级 · 零/低成本 · 建议立即做）

**A1 取数架构修正：服务端取数 或 API 缓存头**
- 方案 1（推荐）：把首页/旅行列表/时间线/看板等**公开只读**数据改为 Server Component 直查（RSC），去掉一次客户端往返；需要周期刷新的地方真正写 `export const revalidate = 300`（与文档一致，代码/文档对齐）。
- 方案 2（改动最小）：保留 API，给响应加 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`（公开接口）与 `private, max-age=30`（登录用户个性化接口）。Next 会基于该头让 CDN/浏览器缓存。
- 涉及：`app/page.tsx`、`app/travel/page.tsx`、`app/timeline/page.tsx`、`app/dashboard/page.tsx`、`app/api/{home,travels,timeline,dashboard,album,travel-book,feed.xml}/route.ts`。

**A2 统一客户端请求层**
- 引入 SWR 或 React Query（轻量选 SWR）：统一 `useApi(path, { auth: true })` 封装——去重、缓存、重试、AbortController、竞态保护、统一错误态。
- 收益：消除重复请求、弱网重试、快速切换页面的竞态；页面代码大幅简化。

**A3 查询优化（数据量增长防护）**
- 时间线：travels/posts/memories 加 `take: 500` + 排序（与 timelineItem 一致），或改游标分页。
- 标签云：`getAllTags` 加缓存（TTL 300s，标签云低频变化）并限制返回条数；规模化后改 SQL `GROUP BY`。
- 搜索：MySQL 加 `@@fulltext([title, summary, content])` 索引并改用 `MATCH ... AGAINST`（自然语言模式）；未启用前给搜索加 IP 限流（15 次/分钟）。
- 推荐 Feed：热度排序下沉到 SQL（或缓存「热门前 200」列表，TTL 60s）；分页改游标（`cursor` + `publishedAt`/`id`）。
- 个人主页：5 个 count 合并为 1 个聚合查询；统计加短 TTL 缓存。
- `/api/images/[id]`：确认 PostImage 是否仍被引用；无引用则删除路由与表；有引用则迁移到 Media 文件。

**A4 媒体出 Node**
- nginx 直接 serve `/uploads/**`（`alias` 到 uploads 卷）或 `X-Accel-Redirect` internal redirect（Node 校验后转内部路径，视频 Range 由 nginx 原生支持）。保留 `/api/uploads` 兜底。
- 变体生成移出请求路径：上传时预生成（已有 `generateMediaVariants`）+ 后台队列；现有按需生成（并发 3）作为兜底保留。
- 启用对象存储 + CDN（`STORAGE_*`，配置即启用）：媒体 URL 直指 CDN，Node 零负担。

**A5 每请求固定开销瘦身**
- `getCurrentUserId`：用户信息（nickname/avatar/accountId）按 userId 短 TTL 缓存（30~60s，内存即可），DB 只查一次。
- `requireAuth`：session `findById` 加内存缓存（TTL 30s）；`touchLastUsed` 已节流，保留。
- 收益：登录用户每次 API 从 2 次 DB 降到 0~1 次。

**A6 防滥用补漏**
- 弹幕 POST 加限流（IP 10 次/分钟 + 内容长度已限制 50 字）。
- 搜索加限流（IP 15 次/分钟）。
- 上传限流保留；规模化后切换 Redis 实现（见 B2）。

### 阶段 B（P1 · 触发阈值达成后 · Redis + CDN + 多实例）

**B1 RedisCacheService**
- 新增 `lib/infrastructure/cache-redis.ts` 实现 `CacheService`（`getOrSet` + TTL + tag），DI 切换；保留内存作为 fallback（Redis 不可用时降级，避免单点故障）。
- 迁移热点 key：站点设置、首页聚合、Feed 列表、画册摘要、统计、tag 云。

**B2 分布式限流**
- `rate-limit.ts` 增加 Redis 滑动窗口实现（Lua 脚本原子性）；登录/上传/搜索/弹幕/油画统一走 Redis。

**B3 Next.js 增量缓存外置**
- 配置 `cacheHandler`（Next 15）将 ISR 缓存写入 Redis，保证多实例一致。

**B4 对象存储 + CDN**
- 启用 `STORAGE_*`（R2/OSS/MinIO），上传直写对象存储，媒体 URL 指向 CDN；本地卷只作迁移过渡。

**B5 多实例无状态化**
- app 容器 ×2，nginx `upstream` 负载均衡；会话已 DB-backed 天然无状态；上传卷不再依赖本地（B4 后自然无状态）；发布用蓝绿/滚动。

### 阶段 C（P2 · 更大规模 · 按需）

**C1 MySQL 读写分离/主从**：读多写少场景主从分离；Prisma 侧通过两个 client/适配器路由。
**C2 任务队列**：媒体变体、邮件、AI 油画、通知批量、报表等异步化（BullMQ + Redis Streams）。
**C3 全文检索升级**：搜索成为核心后上 Meilisearch/OpenSearch（中文分词友好）。
**C4 可观测性与压测**：Sentry（错误）+ Prometheus/Grafana（进程/DB/缓存命中率/API 延迟分位）+ 慢查询日志；用 k6/autocannon 建立基线（首页、Feed、搜索、上传、视频），量化每次优化收益。

---

## 7. 决策树（什么时候做什么）

```
当前（单实例 2C2G）──► 立即做阶段 A（A1~A6，纯代码）
        │
        ├─ 观察指标（§5.4）未达阈值 ──► 继续优化 A 内细节，不需要 Redis
        │
        └─ 触发阈值（任意 2 条）──► 阶段 B：先 Redis（B1~B3）→ 对象存储/CDN（B4）→ 多实例（B5）
                                      │
                                      └─ 万级 DAU ──► 阶段 C
```

---

## 8. 涉及文件清单（阶段 A 改动点）

- 取数改造：`app/page.tsx`、`app/travel/page.tsx`、`app/timeline/page.tsx`、`app/dashboard/page.tsx`、`app/search/page.tsx`、`components/HomeClient.tsx`、`components/dashboard/DashboardClient.tsx`、`components/timeline/*`、`components/social/TravelCircleFeed.tsx`
- API 缓存头：`app/api/{home,travels,timeline,dashboard,album,travel-book,feed.xml}/route.ts`、`lib/api-response.ts`
- 查询优化：`lib/modules/timeline/timeline.service.ts`、`lib/repositories/post-repository.ts`、`lib/modules/social/social.service.ts`、`lib/modules/social/profile.service.ts`、`lib/modules/album/travel-book.service.ts`、`prisma/schema.prisma`（FULLTEXT）
- 媒体：nginx 生产配置（`docs/DEPLOYMENT.md` 对应配置）、`app/api/uploads/[...path]/route.ts`、`lib/infrastructure/media-variants.ts`、`.env`（`STORAGE_*`）
- 固定开销：`lib/current-user.ts`、`lib/auth-middleware.ts`、`lib/repositories/session-repository.ts`
- 防滥用：`app/api/danmaku/route.ts`、`app/api/search/route.ts`
- 客户端请求层：新增 `lib/client/api.ts` + 各页面接入
- 文档：`docs/ARCHITECTURE_OPTIMIZATION.md`（修正 ISR 表述）、本文档

---

## 9. 验收方式

- **阶段 A 验收**：`npm run typecheck` + `npm test` + `next build` 通过；用 k6/autocannon 对比改造前后 `/api/home`、`/api/travels`、`/api/social/posts`、搜索的 QPS/p95；首页 Network 面板确认请求数下降；确认响应头带 `Cache-Control`。
- **阶段 B 验收**：Redis 热点 key 命中率 > 80%；多实例下登录限流一致；ISR 写后多实例同时失效；媒体 URL 全部指向 CDN。

---

*— 评审完成，待用户确认后按阶段实施 —*


---

## 10. 阶段 A 实施记录（2026-08-31）

> 本阶段为纯代码/文档级优化，已通过 `tsc --noEmit`、`vitest run`（130 用例全绿）、`SKIP_DB_ON_BUILD=1 next build`。

| 项 | 状态 | 落地内容 |
|---|---|---|
| A1 缓存头 | ✅ | 新增 `lib/http-cache.ts`（`cacheControlHeader`/`applyCacheControl`）；为 home/travels/timeline/dashboard/album(私有)/travel-book/moments/search/social-posts/social-users/feed.xml(公开长TTL)/danmaku-GET 设置 Cache-Control；user 范围附加 `Vary: Cookie` 防串缓存 |
| A1 RSC 方案 | ⚠️ 未采用 | 移动端（Capacitor 静态导出）依赖客户端取数，全量改 RSC 会破坏移动端构建；故采用「API 缓存头」方案（方案 2），收益等价且零风险 |
| A2 请求层 | ✅ | 新增 `lib/client/api.ts`（内存短缓存/并发去重/统一 ApiError/ok() 解包）+ `lib/client/use-api.ts`（AbortController 取消/竞态保护/reload）；首页/时间线/看板/我的 4 页已迁移，其余页面可增量接入 |
| A3 查询优化 | ✅ | 时间线 travels/posts/memories 加 take:500；推荐 Feed 候选+热度评分内存缓存 60s；个人主页 3 个 count 合并进 `_count` 过滤计数（~8 查询→~5） |
| A3 标签云 | ➖ 无需 | `getAllTags` 经核实为**未调用的死代码**（无任何调用点），暂不动 |
| A3 搜索 FULLTEXT | ⏸ 延后 | MySQL 默认分词器对中文无效，需 ngram parser 手工迁移；已先补 IP 限流（A6），完整方案归入阶段 C3（全文检索/ngram） |
| A4 媒体出 Node | ✅ | `app/api/uploads/[...path]` 新增 `UPLOAD_X_ACCEL=1` 可选 X-Accel-Redirect 直出分支（默认行为不变）；`docs/nginx.conf.example` 增加 `^~ /uploads/` 与 `^~ /internal-uploads/` 配置；`docs/DEPLOYMENT.md` 新增 §12 操作手册；对象存储仍为「配置即启用」 |
| A5 用户缓存 | ✅ | `getCurrentUserId` 按 userId 30s 内存短缓存 + `invalidateCurrentUserCache`；已在 profile/avatar/username/email 修改处接入失效 |
| A5 会话缓存 | ❌ 不做 | `requireAuth` 的 session DB 校验是安全权威路径，缓存会引入 10~30s 注销/撤销窗口；session 查询为单条主键查询，收益有限，保持原样 |
| A6 防滥用 | ✅ | 弹幕 POST 限流 10 次/分/IP；搜索限流 15 次/分/IP（均为内存固定窗口，单实例够用，多实例后切换 Redis） |
| 其他 | ✅ | 新增 `tests/unit/http-cache.test.ts`、`tests/unit/client-api.test.ts`（16 个用例） |

### 10.1 遗留/待确认

- **`/api/anniversaries` 匿名返回全部纪念日**：登录门（LoginDoor）产品设计需在未登录时展示最早纪念日作为封条日期，故**未改动**（已还原）。若产品同意收紧，建议登录门仅展示公开纪念日或后端只返回最早一条。
- **`/api/images/[id]` LongBlob 路由**：需在生产库确认 Post.images 是否仍有数字 ID 引用后决定是否下线（见 F12）。
- **`getAllTags` 死代码**：可随清理期移除。
- **会话 DB 校验未缓存**：安全优先，规模化后再评估（如引入 Redis 会话缓存 + 主动失效）。
