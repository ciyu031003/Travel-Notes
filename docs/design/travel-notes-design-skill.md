# Travel-Notes UI Design Skill

本 skill 是 Travel-Notes 项目（F:\CodeFiles\Travel-Notes）唯一的前端 UI 设计规范来源。
后续所有 Travel-Notes 的 UI 优化、页面重设计、组件新增，都必须先阅读本规范并严格遵循。

---

## 1. 产品定位（必须内化）

Travel-Notes = **一个以旅行摄影为核心、以时间与地点为线索、以个人旅行记忆为灵魂、带有轻社交能力的数字旅行记忆空间。**（品牌名「行迹」）

英文定位：**A cinematic digital travel memory space.**

> 支持：独旅 / 情侣 / 朋友 / 家庭 / 多人共同旅行 / 长期旅行记录 / 旅行回忆与个人旅行档案。**UI 不得再表现为「情侣旅行 App」。**

页面信息架构：

```text
                    Travel-Notes
                         │
             ┌───────────┴───────────┐
             │                       │
          我的世界                  发现世界
             │                       │
        我的旅行档案               旅行圈
             │                       │
      ┌──────┼──────┐         ┌──────┼──────┐
      │      │      │         │      │      │
    旅行    相册   碎碎念     推荐   最新   热门
      │      │      │         │
      └──────┼──────┘         │
             │                │
          我的记忆 ←────────→ 旅行故事
             │
             │
         情侣 Space
             │
       两个人共同的记忆
```

页面定位对照：

| 页面 | 产品定位 | 核心体验 |
|---|---|---|
| 首页 | Travel World | 进入旅行世界 |
| 我的旅行 | Journey | 管理自己的旅行 |
| 旅行详情 | Story | 讲述一次旅行 |
| 相册 | Memory | 保存视觉记忆 |
| 碎碎念 | Emotion | 保存生活碎片 |
| 地图 | Geography | 看见走过的地方 |
| 情侣 Space | Space / 旅行空间 | 多人共同记忆 |
| 旅行档案（/me） | Personal Archive | 看见自己的旅行人生 |
| 旅行圈（/circle） | Travel Discovery | 看见别人的旅行记忆 |

---

## 2. Travel-Notes UI 设计约束（强制禁止）

请严格避免以下设计：

- 不要设计成后台管理系统
- 不要设计成 SaaS Dashboard
- 不要设计成微博
- 不要设计成小红书
- 不要设计成朋友圈
- 不要设计成普通论坛
- 不要使用大量统一圆角卡片
- 不要让每个功能都变成一个列表按钮
- 不要使用大量描边边框
- 不要出现大面积空白但没有内容层次
- 不要过度使用金色
- 不要使用赛博朋克风格
- 不要使用游戏 UI
- 不要使用过强的霓虹灯
- 不要使用复杂渐变
- 不要让星空元素喧宾夺主
- 不要为了“高级感”牺牲信息可读性
- 不要简单将 Mobile UI 放大到 Desktop
- 不要让 Web UI 变成传统 Dashboard
- 不要让照片变成普通 Card 的装饰图

---

## 3. 核心原则

照片第一，旅行故事第二，旅行地点第三，记忆第四，功能第五，社交第六。

Travel-Notes 首先是一款“旅行记忆产品”，其次才是“社交产品”。

视觉关键词：

Travel Memory / Romantic / Photography / Editorial / Digital Scrapbook / Minimal / Elegant / Galaxy / Film / Cinematic

银河、星光、像素等元素只作为视觉点缀，不能成为主界面语言。

---

## 4. 设计 Token

### 4.1 品牌基调

- 主体：极简旅行杂志 + 数字记忆相册 + 极简银河氛围
- 点缀：银河 / 星光 / 胶片 / 像素
- 情绪：浪漫、克制、高级、有旅行氛围，但不是游戏化

### 4.2 色彩

#### 暖色主站（首页 / 旅行 / 相册 / 碎碎念 / 地图 / 时间线）

> 主色为 `travel.*` 暖陶土语义色（Tailwind config 已定义，禁止再用旧玫瑰粉 `#A64E61`）。

- 米白背景 `travel.cream`：`#FAF6EE`
- 羊皮纸 `travel.parchment`：`#FDF5ED`
- 暖深棕标题 `travel.inkStrong`：`#5A4A3A`
- 正文暖墨灰 `travel.ink`：`#585450`
- **主强调陶土 `travel.accent`：`#A85F3A`**（原玫瑰粉已废弃）
- 陶土深 `travel.accentStrong`：`#8A4A2B`
- 陶土浅 `travel.accentSoft`：`#C97E55`
- 琥珀暖 `travel.bloom`：`#E4B478`
- 暖米浅 `travel.sakura`：`#F3E4D5`
- 天空蓝 `travel.sky`：`#A8C8DC` / 雾蓝 `travel.mist`：`#D6E8F0`
- 暖棕 `travel.sand`：`#8B7355` / 暖棕浅 `travel.sandSoft`：`#C2AF9A`
- 暖浅边框 `travel.line`：`#E8DDD4`

> **语义色对齐**：`primary.*` 已重定义为暖陶土（`primary.500 = #A85F3A`，原天蓝已废弃）；`travel-success/warning/danger` 为语义绿/橙/红。admin 后台与前台共用同一 `primary/travel` 主色，不再有蓝色残留。

#### 相册暗色（/album 专用，Stage 1 已建立）

- 背景：`#050508`
- Surface：`#0b0807` / `#14100e`
- 文字：`rgba(245,247,255,0.92/0.68/0.45)`
- 暖金强调：`#e8b06a`

#### 旅行记忆宇宙（/me 与 /circle 专用，Stage 3 新规范）

Tailwind 已新增 `night` 色板，个人主页与旅行圈必须使用：

- 背景 `night.bg`：`#080808`（不是死黑）
- Surface `night.surface`：`#111111`
- Surface 2 `night.surface2`：`#171717`
- Surface 3 `night.surface3`：`#1e1d1b`
- 文字 `night.text`：`#F5F1EA`
- 次级 `night.muted`：`rgba(245,241,234,0.70)`
- 弱化 `night.faint`：`rgba(245,241,234,0.46)`
- 主强调 `night.gold`：`#E8B36A`（暖香槟金，克制使用）
- 强强调 `night.goldStrong`：`#F2C88A`
- 金色弱底 `night.goldSoft`：`rgba(232,179,106,0.14)`
- 分隔线 `night.line`：`rgba(245,241,234,0.09)`
- 分隔线强 `night.lineStrong`：`rgba(245,241,234,0.16)`

金色规则：**只用于标题眉标、选中态、地点小字、关键强调和主按钮，禁止大面积铺金。**

### 4.3 字体

- 标题 / 展示：`Noto Serif SC` / `Noto Serif` / Georgia
- 正文：`PingFang SC` / `Hiragino Sans GB` / `Microsoft YaHei`
- 数据 / 代码：`JetBrains Mono` / `Fira Code` / Consolas
- 像素点缀：`Zpix`（仅用于小徽标，不用于正文）

### 4.4 圆角与描边

- 页面层级可使用 `rounded-[1.4rem]` 到 `rounded-[2rem]`，但不要所有元素都做成统一圆角卡片。
- 描边使用 `ring-1 ring-night-line` 或 `border-night-line`，克制、细、低对比。
- 重点区域靠**照片与文字排版**建立层次，不靠边框。

### 4.5 阴影

- 暗色页面尽量少用重阴影；需要时使用柔和扩散阴影。
- 暖色页面使用 `shadow-soft` / `shadow-card`，避免生硬投影。

### 4.6 动效

- 图片淡入、轻微 Hover Zoom、数字 Count Up、星尘缓慢移动。
- 禁止夸张动画，尊重 `prefers-reduced-motion`。

---

## 5. 个人主页 / 旅行圈（Stage 3 落地规范）

### 5.1 个人主页定位

不要叫“个人中心 / 我的主页”，产品语言统一为：

> **我的旅行档案（My Archive）**

内容优先级：

1. 用户身份
2. 旅行数据
3. 最近旅行
4. 旅行记忆
5. 公开旅行
6. 其他功能入口
7. 退出登录

旅行统计不使用 Dashboard Statistic Card，改为大数字 + 小型英文标签：

- Trips（次旅行）
- Places（个地点）
- Photos（张照片）
- Days（天旅途）

“我的记忆”使用相册 / 旅行 / 碎碎念 / 收藏四个章节入口，用小型照片、极简图标、简短文字与轻动效，而不是功能列表。

公开旅行为空时使用叙事性 Empty State：

> “还没有把故事分享出去。”
> 按钮「去选择一段旅途」

### 5.2 旅行圈定位

不要叫“社交 Feed / 内容社区”，产品语言统一为：

> **旅行圈（Travel Discovery）**

顶部 Hero：

> TRAVEL CIRCLE
> 看看别人眼中的世界
> 记录正在发生的旅途，发现那些值得被记住的地方。

轻量胶囊 Tab：推荐 / 最新 / 热门 / 关注，并可加“为你发现”主题标签（#海边 #周末旅行 #情侣旅行 #城市漫游 #星空 #摄影）。

内容使用 **Masonry / Editorial Travel Feed**，不同照片比例、不同高度，摆脱统一高度卡片。

旅行故事信息层级：

> 照片 > 旅行标题 > 地点/日期 > 用户 > 正文 > 互动

互动按钮不能成为视觉重点。

### 5.3 组件规范

- `components/social/SocialFilmCard.tsx`：旅行故事卡片，照片第一、弱边框、支持 hero / card 与不同 frame（wide / portrait / square / landscape）。
- `components/social/SocialAvatar.tsx`：头像，有照片用照片，无照片用暖金首字母。
- `components/social/MeHome.tsx`：我的旅行档案。
- `components/social/TravelCircleFeed.tsx`：旅行圈 Masonry Feed。
- `components/social/PostDetail.tsx`：单篇旅行故事详情。
- `components/social/CommentPanel.tsx`：评论底部抽屉。
- `components/social/SocialBar.tsx`：点赞 / 评论 / 收藏，弱化存在感。

---

## 6. Web 端设计原则

- Web 端不是“Mobile 放大”，利用大屏做 Editorial Hero、双栏/三栏、Masonry、地图探索、时间线。
- ≥1440px：三栏 / Masonry / 地图探索；1280px：两栏 + Sidebar；1024px：两栏；≤768px：回到移动端结构；390px：移动端专用。
- Sidebar 应该是“旅行档案导航”，不是后台菜单。
- 照片优先，内容优先于功能，不要做成 Dashboard，不要做成社交媒体。

---

## 7. 验收清单

- [ ] 页面背景、文字、强调色符合对应页面色板
- [ ] 照片占据主要视觉面积，不是装饰图
- [ ] 没有大量统一圆角卡片、描边边框、功能列表按钮
- [ ] 金色克制，星空只是点缀
- [ ] 移动端与 Web 端信息层级不同，而不是简单缩放
- [ ] 空状态、加载态、错误态、Hover、Active、Selected 状态完整
- [ ] 信息可读性没有被“高级感”牺牲
