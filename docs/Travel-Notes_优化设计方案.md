# Travel-Notes 下一阶段及未来完整优化设计方案

> 目标：将 Travel-Notes 从“旅行博客 + 多种内容模块”逐步收敛为一个**情侣共同旅行与数字记忆系统**。
>
> 核心原则：**不推倒重写、先安全、后架构、再数据模型、最后扩展功能。**

---

## 1. 产品重新定位

当前项目已经具备旅行、相册、时间线、地图、Markdown、互动等能力，但同时存在学习笔记、技术内容等与核心产品关系较弱的模块。

建议最终定位为：

> **情侣共同旅行与记忆系统**

核心不是“写文章”，而是记录两个人共同经历过的：

- 时间
- 地点
- 旅行
- 照片
- 视频
- 回忆
- 纪念日
- 行程
- 共同生活片段

最终业务模型：

```text
Space
├── Travel
│   ├── TravelDay
│   ├── Location
│   ├── Itinerary
│   └── Expense
├── Memory
├── Album
├── Timeline
├── Anniversary
└── Settings
```

---

# 2. 模块取舍

## 2.1 删除学习笔记模块

建议**彻底删除，而不是隐藏**。

需要清理：

- 学习笔记页面
- 学习笔记 API
- 学习笔记 Service
- 学习笔记 Repository
- 学习笔记类型
- 相关导航
- 相关搜索
- 相关统计
- 相关 Tag
- `Post.type` 中对应类型
- 不再使用的组件和测试

原因：

1. 与情侣旅行/共同回忆主线关系弱。
2. 会持续污染 `Post` 模型。
3. 会增加导航和搜索复杂度。
4. 会让产品从“情侣记忆系统”重新发散成“个人内容系统”。

## 2.2 技术博客 / Repository 模块

与学习笔记不同，技术内容可以保留，但建议**从核心旅行产品中剥离**。

不要继续使用：

```text
Post.type = repo
```

更合理的方式是：

```text
/tech
```

成为独立模块，或者未来独立部署。

核心旅行系统不应依赖技术博客的数据模型。

---

# 3. 最终产品导航

## 前台

```text
首页
旅行
相册
时间线
回忆
地图
纪念日
```

## 后台

```text
Dashboard
旅行管理
回忆管理
相册管理
媒体管理
地点管理
成员与权限
系统设置
```

删除：

- 学习笔记
- 技术仓库
- 与旅行无关的内容入口

---

# 4. 总体实施路线

整个项目建议拆成以下阶段：

```text
Phase 0：安全止血
Phase 1：架构收敛
Phase 2：核心数据模型重构
Phase 3：媒体架构升级
Phase 4：情侣 Space / 权限系统
Phase 5：核心产品功能
Phase 6：旅行规划
Phase 7：搜索、缓存与后台
Phase 8：AI 与高级能力
```

严格遵循：

```text
安全
 ↓
架构
 ↓
数据模型
 ↓
迁移
 ↓
核心功能
 ↓
体验
 ↓
AI
```

不要在旧架构上持续无限堆功能。

---

# 5. Phase 0：安全止血

这是第一优先级。

## 5.1 升级 Next.js

当前版本较旧，首先升级到当前仍受支持的安全版本。

建议：

1. 先升级到最新稳定的 Next 15.x 安全版本。
2. 完成完整回归测试。
3. 再评估 Next 16 大版本迁移。

不要把安全修复与大型架构重构同时进行。

---

## 5.2 删除公开默认管理员账号

禁止生产环境存在：

```text
默认用户名
默认密码
```

推荐第一次启动流程：

```text
第一次启动
    ↓
检测管理员不存在
    ↓
进入初始化页面
    ↓
创建管理员
    ↓
初始化完成
    ↓
关闭初始化入口
```

README 中不再提供真实可用的默认账号密码。

---

## 5.3 环境变量体系

建立：

```text
.env.example
```

核心变量：

```text
DATABASE_URL

SESSION_SECRET

STORAGE_ENDPOINT
STORAGE_ACCESS_KEY
STORAGE_SECRET_KEY
STORAGE_BUCKET

NEXT_PUBLIC_SITE_URL
```

所有真实 Secret：

- 不进入 Git
- 不写入 README
- 不写入测试代码
- 不写入 Docker 镜像

---

# 6. Auth / Session 重构

当前 JWT + Blacklist 对项目来说略显复杂。

项目是小型单体应用，更推荐逐步采用：

```text
Database-backed Session
```

数据模型：

```text
Session
├── id
├── userId
├── expiresAt
├── createdAt
├── lastUsedAt
├── userAgent
└── ipHash
```

Cookie：

```text
HttpOnly
Secure
SameSite=Lax
Path=/
```

流程：

```text
登录
 ↓
创建 Session
 ↓
设置 HttpOnly Cookie
 ↓
Middleware 验证
 ↓
数据库查询 Session
```

退出登录：

```text
删除 Session
```

不再依赖 JWT Blacklist 作为主要状态管理方式。

---

# 7. 登录安全

增加：

- IP Rate Limit
- 用户名 Rate Limit
- 登录失败限制
- 密码重置 Rate Limit
- 验证码接口 Rate Limit
- Session 过期
- Session 撤销
- 异常登录审计

例如：

```text
连续失败
 ↓
短暂锁定
 ↓
指数退避
```

---

# 8. 文件上传安全

当前上传系统需要加强。

## 8.1 文件类型

默认允许：

```text
JPEG
PNG
WebP
```

默认禁止：

```text
SVG
```

除非未来存在明确业务需求。

---

## 8.2 不信任客户端 MIME

不能只依赖：

```text
file.type
```

应采用：

```text
客户端 MIME
+
Magic Number
+
文件解码
+
重新编码
```

推荐使用图片处理库重新编码。

流程：

```text
上传
 ↓
大小检查
 ↓
Magic Number
 ↓
图片解码
 ↓
尺寸检查
 ↓
重新编码
 ↓
存储
```

---

## 8.3 上传资源限制

增加：

- 单文件最大大小
- 单请求文件数量
- 单请求总大小
- 最大图片宽度
- 最大图片高度
- 视频大小限制
- 处理超时

防止恶意资源造成内存或 CPU 消耗。

---

# 9. Markdown / Mermaid 安全

建立明确安全边界：

```text
Markdown
 ↓
Parser
 ↓
Sanitizer
 ↓
Safe HTML
 ↓
Renderer
```

禁止：

```text
<script>
javascript:
onerror=
onclick=
<object>
<embed>
危险 iframe
```

Mermaid 同样需要限制其 HTML / SVG 输出能力。

未来如果开放情侣共同编辑、评论、留言，这一部分必须视为重要攻击面。

---

# 10. Security Headers

统一加入：

- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- Frame-Ancestors / X-Frame-Options

CSP 需要结合：

- Mermaid
- Giscus
- 图片
- 视频
- 第三方资源

进行实际测试后确定。

---

# 11. Phase 1：架构收敛

目标：

> 消除旧架构与新架构并存的问题。

当前逐步存在：

```text
Service
Repository
旧的 db-* 文件
旧的 content 层
```

最终统一成：

```text
API
 ↓
Auth / Permission
 ↓
Validation
 ↓
Service
 ↓
Repository
 ↓
Prisma
```

禁止：

```text
Component → Prisma
API → Prisma
```

---

# 12. 模块化目录

推荐逐步从全局平铺改成：

```text
lib/
├── modules/
│   ├── auth/
│   ├── space/
│   ├── travel/
│   ├── memory/
│   ├── album/
│   ├── media/
│   ├── location/
│   ├── timeline/
│   └── anniversary/
│
├── infrastructure/
│   ├── db/
│   ├── storage/
│   ├── cache/
│   └── security/
│
└── shared/
    ├── errors/
    ├── utils/
    └── types/
```

每个模块内部：

```text
travel/
├── travel.service.ts
├── travel.repository.ts
├── travel.schema.ts
├── travel.types.ts
└── travel.mapper.ts
```

---

# 13. 删除旧兼容层

逐步删除：

- `content.ts`
- `db-posts.ts`
- 已被 Service / Repository 替代的旧代码
- 学习笔记相关旧代码

目标：

> 一个业务只有一个正式入口。

---

# 14. Phase 2：核心数据模型

这是整个项目最重要的升级。

不要继续围绕：

```text
Post
```

不断增加字段。

最终转向：

```text
User
 ↓
Space
 ↓
Travel
 ↓
TravelDay
 ↓
Memory
 ↓
Media
```

---

# 15. User

```text
User
├── id
├── username
├── passwordHash
├── displayName
├── avatar
├── createdAt
└── updatedAt
```

---

# 16. Space

Space 是情侣共同生活的数字空间。

```text
Space
├── id
├── name
├── slug
├── description
├── coverMediaId
├── createdAt
└── updatedAt
```

---

# 17. SpaceMember

```text
SpaceMember
├── id
├── spaceId
├── userId
├── role
├── joinedAt
└── status
```

角色：

```text
OWNER
MEMBER
VIEWER
```

---

# 18. Travel

```text
Travel
├── id
├── spaceId
├── title
├── description
├── startDate
├── endDate
├── coverMediaId
├── status
├── createdAt
└── updatedAt
```

---

# 19. TravelDay

```text
TravelDay
├── id
├── travelId
├── date
├── title
├── summary
└── sortOrder
```

支持：

```text
Day 1
Day 2
Day 3
```

以及每天的地点、行程、照片和回忆。

---

# 20. Location

```text
Location
├── id
├── name
├── address
├── country
├── city
├── latitude
├── longitude
├── externalId
└── metadata
```

地点从 Travel 中独立出来，为：

- 地图
- 搜索
- 时间线
- 回忆
- 行程

提供统一基础。

---

# 21. Memory

Memory 是未来产品的核心实体。

```text
Memory
├── id
├── spaceId
├── travelId
├── travelDayId
├── title
├── content
├── happenedAt
├── locationId
├── mood
├── visibility
├── createdBy
├── createdAt
└── updatedAt
```

例如：

> “我们第一次一起去迪士尼。”

可以同时关联：

- 时间
- 地点
- 照片
- 视频
- 文字
- 心情
- 旅行

---

# 22. Media

媒体从 Post 中彻底独立。

```text
Media
├── id
├── spaceId
├── type
├── storageKey
├── mimeType
├── size
├── width
├── height
├── duration
├── hash
├── takenAt
├── latitude
├── longitude
└── createdAt
```

类型：

```text
IMAGE
VIDEO
AUDIO
```

---

# 23. Phase 3：媒体存储升级

当前数据库中的 LongBlob 方案可以用于小规模过渡，但不建议作为长期架构。

最终建议：

```text
MySQL
    ↓
只保存媒体 Metadata

Object Storage
    ↓
真正保存图片 / 视频
```

可选：

- S3
- Cloudflare R2
- MinIO
- OSS

---

# 24. MediaVariant

支持：

```text
Media
 ├── Original
 ├── Thumbnail
 ├── Preview
 └── Blur
```

数据库：

```text
MediaVariant
├── id
├── mediaId
├── variant
├── storageKey
├── width
├── height
├── size
└── mimeType
```

---

# 25. 图片处理

上传：

```text
Original
 ↓
Decode
 ↓
Validate
 ↓
去除不必要的危险 Metadata
 ↓
生成缩略图
 ↓
生成 WebP / AVIF
```

---

# 26. EXIF / GPS

旅行系统可以保留：

- 拍摄时间
- GPS
- 相机
- 焦距

但要区分隐私策略。

公开媒体：

```text
默认删除 GPS
```

情侣私有空间：

```text
可以保留
```

---

# 27. Phase 4：情侣 Space

Space 是整个产品的核心。

最终：

```text
User
 ↓
SpaceMember
 ↓
Space
 ↓
Travel / Memory / Album
```

---

# 28. 邀请机制

```text
Space
 ↓
Invite
 ↓
Token
 ↓
另一方接受
 ↓
SpaceMember
```

建议：

```text
Invite
├── id
├── spaceId
├── tokenHash
├── code
├── role
├── expiresAt
├── createdBy
└── usedAt
```

校验用 Token Hash；明文 Code 仅空间创建者可见（用于再次查看/复制邀请码），非创建者接口不返回。

---

# 29. Visibility

所有核心内容都应该支持：

```text
PRIVATE
COUPLE
PUBLIC
```

例如：

```text
Memory.visibility
Media.visibility
Album.visibility
Travel.visibility
```

这样可以明确控制：

- 只有自己可见
- 情侣双方可见
- 公开展示

---

# 30. 权限体系

统一：

```text
User
 ↓
SpaceMember
 ↓
Role
 ↓
Resource
 ↓
Visibility
```

建议提供统一权限方法：

```text
requireSpaceMember(userId, spaceId)

requireSpaceRole(userId, spaceId, role)

canReadMemory(userId, memoryId)

canEditMemory(userId, memoryId)

canDeleteMedia(userId, mediaId)
```

避免不同 API 自己实现不同权限逻辑。

---

# 31. IDOR 防护

所有资源访问必须验证：

```text
User
 ↓
Space Membership
 ↓
Resource Ownership
```

不能因为知道：

```text
/api/memory/123
```

就读取其他 Space 的 Memory。

---

# 32. AuditLog

建议加入：

```text
AuditLog
├── id
├── spaceId
├── userId
├── action
├── resourceType
├── resourceId
├── metadata
└── createdAt
```

记录：

- 创建旅行
- 修改旅行
- 删除回忆
- 上传媒体
- 删除媒体
- 修改权限
- 邀请成员

对于情侣共同编辑非常有价值。

---

# 33. Phase 5：核心产品功能

安全和数据模型稳定后，再集中开发产品体验。

---

## 33.1 Timeline

首页逐渐从“文章列表”转成时间线：

```text
2026
│
├── 01.15
│   └── 大阪旅行
│
├── 03.20
│   └── 东京樱花
│
├── 05.03
│   └── 京都
│
└── 08.10
    └── 冲绳
```

---

## 33.2 Travel Detail

旅行详情：

```text
旅行封面

日期范围
简介

Day 1
 ├── 地点
 ├── 照片
 └── 回忆

Day 2
 ├── 地点
 ├── 照片
 └── 回忆

地图
相册
花费
旅行总结
```

---

# 34. Album

相册不只是图片列表。

```text
Album
├── id
├── spaceId
├── title
├── description
├── coverMediaId
├── date
├── locationId
└── visibility
```

并通过：

```text
AlbumMedia
```

关联多个媒体。

---

# 35. Memory

Memory 应成为最具产品特色的功能。

一个 Memory 可以包含：

```text
时间
地点
照片
视频
文字
心情
天气
旅行
```

形成真正的共同回忆。

---

# 36. Anniversary

建立：

```text
Anniversary
├── title
├── date
├── recurring
├── description
└── coverMedia
```

例如：

- 第一次见面
- 第一次旅行
- 认识纪念日
- 生日

---

# 37. Phase 6：旅行规划

记录功能成熟后，再加入规划能力。

## 37.1 行程

```text
ItineraryItem
├── travelDayId
├── startTime
├── endTime
├── title
├── locationId
├── type
└── notes
```

类型：

```text
SPOT
RESTAURANT
HOTEL
TRANSPORT
ACTIVITY
OTHER
```

---

# 38. Expense

```text
Expense
├── travelId
├── amount
├── currency
├── category
├── payer
├── note
└── happenedAt
```

支持：

- 交通
- 住宿
- 餐饮
- 门票
- 购物
- 其他

以及双方分摊。

---

# 39. Phase 7：搜索

核心搜索对象：

```text
Travel
Memory
Album
Location
```

小规模数据：

> MySQL Full Text 即可。

暂时不要引入 Elasticsearch。

---

# 40. Cache

目前的内存缓存可以保留，但抽象成：

```text
CacheProvider
```

未来：

```text
单实例 → Memory Cache
多实例 → Redis
```

业务层不需要改变。

当前阶段不建议为了“现代化”提前上 Redis。

---

# 41. Dashboard

后台 Dashboard 从：

```text
文章数量
评论数量
点赞数量
```

转向：

```text
旅行数量
旅行天数
照片数量
视频数量
回忆数量
地点数量
共同经历天数
```

例如：

> 已经一起旅行 127 天。

这比传统博客统计更符合产品定位。

---

# 42. Phase 8：AI 能力

AI 放到最后。

不要在核心架构不稳定时引入 AI。

## 42.1 AI 旅行总结

输入：

```text
Travel
+
Memory
+
Media
+
Location
```

生成旅行总结。

---

## 42.2 AI 时间线

自动发现：

- 第一次去某城市
- 第一次旅行
- 第一次出国
- 第一次看樱花
- 特殊纪念日

---

## 42.3 AI 相册整理

基于：

- EXIF
- 时间
- GPS
- 图像内容

自动：

- 聚类
- 去重
- 创建相册
- 推荐封面

---

# 43. 测试体系

不能只依赖：

```text
npm run build
```

至少建立：

```text
Unit Test
Integration Test
E2E Test
Security Test
```

---

## Unit Test

重点：

- Validator
- Service
- Permission
- Session
- Media validation

---

## Integration Test

重点：

- Auth
- Travel CRUD
- Memory CRUD
- Media
- Database

---

## E2E

重点流程：

```text
登录
 ↓
创建 Space
 ↓
邀请成员
 ↓
创建 Travel
 ↓
上传图片
 ↓
创建 Memory
 ↓
编辑
 ↓
删除
 ↓
权限检查
 ↓
退出登录
```

---

# 44. 每次上线前的安全检查

建立固定 Checklist：

```text
□ npm audit
□ dependency audit
□ authentication test
□ authorization test
□ upload test
□ XSS test
□ CSRF test
□ SQL injection test
□ rate limit test
□ file upload abuse test
□ IDOR test
□ security headers test
```

---

# 45. 最终数据库模型

建议核心模型：

```text
User
Session

Space
SpaceMember
SpaceInvite

Travel
TravelDay

Location

Memory

Album
AlbumMedia

Media
MediaVariant

ItineraryItem
Expense

Anniversary

Tag
MemoryTag

Comment
Like

AuditLog
```

逐步退役：

```text
Post
PostImage
学习笔记相关模型
旧的 content/db-posts 数据访问层
```

迁移过程中可以保留兼容层，但最终应删除。

---

# 46. 最终目录结构

建议逐步整理成：

```text
app/
├── (public)/
│   ├── page.tsx
│   ├── travel/
│   ├── albums/
│   ├── memories/
│   ├── timeline/
│   └── map/
│
├── admin/
│   ├── dashboard/
│   ├── travels/
│   ├── memories/
│   ├── albums/
│   ├── media/
│   └── settings/
│
└── api/
    ├── auth/
    ├── travels/
    ├── memories/
    ├── albums/
    ├── media/
    ├── locations/
    └── spaces/

lib/
├── modules/
│   ├── auth/
│   ├── space/
│   ├── travel/
│   ├── memory/
│   ├── album/
│   ├── media/
│   ├── location/
│   ├── timeline/
│   └── anniversary/
│
├── infrastructure/
│   ├── db/
│   ├── storage/
│   ├── cache/
│   └── security/
│
└── shared/
    ├── errors/
    ├── utils/
    └── types/

prisma/
└── schema.prisma
```

---

# 47. 明确禁止过度设计

当前阶段不要引入：

```text
❌ 微服务
❌ Kubernetes
❌ Kafka
❌ Elasticsearch
❌ GraphQL
❌ CQRS
❌ Event Sourcing
❌ 分布式事务
❌ 独立 Auth Service
```

原因：

> 当前系统规模并不需要这些复杂度。

推荐保持：

```text
Next.js
+
TypeScript
+
Prisma
+
MySQL
+
Object Storage
+
可选 Redis
```

---

# 48. 最终技术架构

```text
                    Browser
                       │
                       ▼
                 ┌───────────┐
                 │  Next.js  │
                 └─────┬─────┘
                       │
              ┌────────┴────────┐
              │                 │
           Pages              API
                                │
                         Auth / RBAC
                                │
                          Validation
                                │
                            Services
                                │
                          Repositories
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
              MySQL        Object Storage      Cache
                                │
                           ┌────┴────┐
                           │         │
                        Images     Videos
```

这套架构足以支撑项目长期发展。

---

# 49. 最终产品形态

首页应该逐渐从“博客首页”转变为：

```text
┌─────────────────────────────┐
│        我和你的故事          │
│                             │
│       一起走过 127 天         │
│       去过 12 个城市          │
│       记录 843 个回忆         │
│                             │
│       [开始探索时间线]        │
└─────────────────────────────┘
```

时间线：

```text
2024
└── 第一次旅行

2025
├── 京都
├── 东京
└── 大阪

2026
└── ...
```

旅行：

```text
东京 · 2026

Day 1
 ├── 浅草
 ├── 12 张照片
 └── 一段回忆

Day 2
 ├── 银座
 ├── 32 张照片
 └── 一段回忆

地图
相册
花费
旅行总结
```

照片：

```text
2026-08-10 18:32
东京塔

和 XX 一起

[这一天的回忆]
```

这样 Travel-Notes 就不再只是一个 Next.js 博客，而是：

> **一个围绕两个人共同经历建立的私人数字记忆空间。**

---

# 50. 最终实施优先级

| 优先级 | 工作 | 建议 |
|---|---|---|
| P0 | 升级 Next.js | 必须 |
| P0 | 删除默认管理员密码 | 必须 |
| P0 | Auth / Session 加固 | 必须 |
| P0 | 上传安全 | 必须 |
| P0 | Markdown XSS 防护 | 必须 |
| P0 | Rate Limit | 必须 |
| P0 | Security Headers | 必须 |
| P1 | 删除学习笔记 | 必须 |
| P1 | 删除旧 Post 架构依赖 | 必须 |
| P1 | 建立 Space | 强烈建议 |
| P1 | Travel / Memory 数据模型 | 强烈建议 |
| P1 | Media 独立 | 强烈建议 |
| P1 | Object Storage | 建议 |
| P1 | Permission / RBAC | 必须 |
| P1 | AuditLog | 建议 |
| P2 | Timeline | 核心功能 |
| P2 | Album | 核心功能 |
| P2 | Anniversary | 核心功能 |
| P2 | Itinerary | 建议 |
| P2 | Expense | 建议 |
| P3 | AI 总结 | 后期 |
| P3 | AI 相册整理 | 后期 |
| P3 | AI 时间线 | 后期 |

---

# 51. 一句话总结

**砍掉学习笔记 → 弱化/剥离技术博客 → 摆脱 `Post` 中心 → 建立 `Space` → 建立 `Travel` → 建立 `Memory` → 独立 `Media` → 完善权限 → 完成安全基线 → 最后再做 Timeline / Anniversary / AI。**

这条路线不要求推倒重写现有项目，可以通过渐进式迁移完成，并且能让现有代码和未来的新产品模型逐步过渡。
