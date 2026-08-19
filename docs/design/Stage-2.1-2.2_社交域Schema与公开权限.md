# Stage 2.1 / 2.2：社交域 Schema + 公开权限

> 版本：V1 · 2026-08-19
> 所属：Travel-Notes 3.0「银河记忆」大版本 · Stage 2 旅行圈社交
> 本阶段只做「数据地基 + 权限地基」，不写旅行圈页面；UI 从 2.4 开始。

---

## 一、本阶段结论

按大版本计划，先完成两件「必须先于 UI」的地基工作：

1. **社交域 Prisma Schema（2.1）**：新增 3 个枚举 + 8 个模型，核心原则是「Travel 与 TravelPost 解耦」。
2. **公开权限模型（2.2）**：以 Travel.visibility（兼容旧 isPublic）为唯一公开判定，并提供幂等的 syncTravelPost 发布/撤下能力，杜绝「知道 ID 就能读私人数据」。

> 一句话：**公开的是 TravelPost，不是整个 Space。**
> 私人旅行（PRIVATE / COUPLE）永远不进入旅行圈，未公开数据即使猜到 ID 也读不到。

---

## 二、Prisma Schema 社交域（2.1）

### 2.1 新增枚举

| 枚举 | 值 | 用途 |
| --- | --- | --- |
| CommentStatus | VISIBLE / HIDDEN / DELETED / PENDING | 评论审核治理 |
| NotificationType | LIKE / COMMENT / REPLY / FAVORITE / FOLLOW | 通知类型 |
| ReportStatus | PENDING / REVIEWED / DISMISSED / ACTIONED | 举报治理 |

> 可见性复用现有 Visibility（PRIVATE / COUPLE / PUBLIC）。
> 本方案沿用代码中已固定的 COUPLE 命名，对应社交方案里「我的 Space」这一档，避免大规模改名迁移。

### 2.2 新增模型（8 张表）

| 模型 | 关键字段 | 唯一约束（防重复互动） |
| --- | --- | --- |
| TravelPost | travelId（@unique）/ authorId / visibility / title / summary / coverMediaId / publishedAt / likeCount / commentCount / favoriteCount | travelId 唯一 |
| PostLike | postId / userId / createdAt | @@unique([postId, userId]) |
| PostFavorite | postId / userId / createdAt | @@unique([postId, userId]) |
| Comment | postId / userId / parentId / content / status | - |
| CommentLike | commentId / userId / createdAt | @@unique([commentId, userId]) |
| UserFollow | followerId / followingId / createdAt | @@unique([followerId, followingId]) |
| Notification | userId / actorId / type / refType / refId / read（映射 isRead）/ createdAt | - |
| Report | postId / reporterId / reason / status / createdAt | @@unique([postId, reporterId]) |

### 2.3 关系总览

    User
     ├─ TravelPost[]          （作者）
     ├─ PostLike[] / PostFavorite[]
     ├─ Comment[] / CommentLike[]
     ├─ following/followers   （UserFollow 自关联，双关系名 UserFollowing / UserFollowers）
     ├─ Notification[]        （接收者 NotificationReceiver / 触发者 NotificationActor）
     └─ Report[]              （举报人）

    Travel
     └─ TravelPost?           （一次旅行最多一个公开帖子，travelId 唯一）

    TravelPost
     ├─ PostLike[] / PostFavorite[] / Comment[] / Report[]
     └─ travel（Cascade）/ author（Cascade）

### 2.4 关键工程约束

- **外键级联**：删除 Travel → 级联删除其 TravelPost；删除 TravelPost → 级联删除其互动/评论/举报；删除 User → 级联删除其社交内容。
- **评论回复**：Comment.parentId 自关联，onDelete: SetNull（删除父评论时回复不连坐删除）。
- **通知列名**：read 是 MySQL 保留字，schema 已 @map("isRead") 落库为 isRead。
- **计数器**：likeCount/commentCount/favoriteCount 为反规范化计数，后续互动服务在事务内维护。

---

## 三、公开权限模型（2.2）

### 3.1 可见性语义

    PRIVATE  —— 仅自己（ownerId === userId）
    COUPLE   —— 我的 Space（owner 或 Space 活跃成员）
    PUBLIC   —— 公开到旅行圈（任何人）

兼容旧字段：isPublic === true 一律视为 PUBLIC（isPublishedToCircle）。

### 3.2 新增服务与能力

| 文件 | 能力 |
| --- | --- |
| lib/modules/social/social-permissions.ts | canReadTravel(userId, travelId) / canReadMedia(userId, mediaId) / isPublishedToCircle(travel) |
| lib/modules/social/travel-post.service.ts | syncTravelPost（幂等 upsert/删除）、publishTravelPost、unpublishTravelPost、getTravelPostByTravelId、serializeTravelPost |

### 3.3 发布/撤下闭环

- syncTravelPost(travelId)：读取 Travel 的 visibility + isPublic，公开则创建/更新 TravelPost，非公开则删除 TravelPost；作者解析顺序为 Travel.ownerId → Space OWNER 成员 → 首个用户。
- 已接入两处旅行服务（幂等、失败不阻断主流程）：
  - lib/modules/travel/space-travel.service.ts（RBAC + visibility 主路径）的 create / update / delete
  - lib/modules/travel/travel.service.ts（旧 isPublic 路径）的 create / update / delete

### 3.4 IDOR 防护

未公开的 Travel / Media，即使知道 ID，经 canReadTravel/canReadMedia 也会返回 false（后续 2.3 的读接口统一调用）。当前读路径已保留 scopedWhere 兜底，2.3 会统一收敛到上述权限函数。

---

## 四、迁移与回填

- **建表**：已写入 scripts/apply-schema-migration.cjs 的「社交域建表（Stage 2）」段落，幂等 CREATE TABLE IF NOT EXISTS，并带外键/索引；Docker 入口已自动调用，服务器 prisma db push 也会兜底。
- **回填**：新增 scripts/backfill-travel-posts.cjs，为存量 visibility='PUBLIC' OR isPublic=1 的旅行生成 TravelPost（幂等）。

部署后按序执行（入口已自动执行建表，回填可手动）：

    node scripts/apply-schema-migration.cjs
    node scripts/backfill-travel-posts.cjs

---

## 五、验证状态

- [x] npx prisma validate 通过
- [x] npx prisma generate 通过（v7.9.1，Query Compiler）
- [x] npx tsc --noEmit 通过
- [x] 迁移脚本与回填脚本 node --check 语法通过
- [ ] 本地 MySQL 未启动（localhost:3306 ECONNREFUSED），未在本地实跑建表；将在服务器 Docker 入口自动应用

---

## 六、下一步（Stage 2.3+，UI 之前先补 Social API）

1. **2.3 Social API**：推荐/最新/热门/关注 Feed、like/favorite/comment/follow 幂等接口、通知列表与已读。
2. **2.4 旅行圈 UI**：首页 Tab + Feed（复用 TravelFilmCard / AlbumPhoto）、旅行详情互动栏、用户主页、收藏页。
3. **2.5-2.7 互动 + 关系 + 治理 + 后台 /admin/social**。

> 本阶段不新增页面；旅行圈页面在 2.4 才接入。

