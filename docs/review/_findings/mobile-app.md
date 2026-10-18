# 移动端评审发现（mobile-app）

> 范围：模块 5 移动性能（壳/包体/首屏/WebView）、模块 6 移动 UI/UX、离线与同步、发布与 OTA、跨端复用。
> 取证方式：只读源码 + 对 **已构建的 release APK**（`android/app/build/outputs/apk/release/app-release.apk`，26,327,901 B = 25.11 MiB）逐条目统计 + `www/` 目录统计 + 设计规范逐条比对 + 390 宽截图核对。
> 分级：3 🔴 / 7 🟡 / 3 🟢。

## 结论速览

移动端的**工程执行质量高于平均水平**：离线写契约、SQLite 列自愈、设计 token 门禁、原生能力降级都写得有据可查，几乎每处坑都留了"为什么"的注释。但三条真机上最致命的路径没有被真正闭合：**①账号切换后本地库/队列不隔离（跨账号可见 + 串号上传）；②同步上传无幂等键且永久失败无限重试（重复内容/队列永不收敛）；③本地行与同步队列非原子写入且无对账（内容永久卡在"待同步"、且拉取永久跳过该行）**。这三条恰是仓库注释自己记录过的"线上 Travel=0"故障的同族问题，说明结构性风险仍在。
体积侧：APK 26.3MB 中 **DEX 5.18MB（未开 R8）+ 4 个 ABI 的 libsqlcipher 7.27MB（x86/x86_64 纯模拟器库 4.27MB）+ 6.85MB 像素字体 zpix.ttf（仅 /album 装饰标题用）** 是最刺眼的三块；对照 `docs/design/改动记录.md` 2026-09-14 那轮"3 项本地优化"，这几项都没做。
UI/UX：规范定得相当严格（字距、触控 44、图标 3 档、玻璃 3 档），但落地是"抽样式检查通过、行为层缺项"——`useKeyboardInset` 全项目仅 2 处使用、触控目标仍有 16px 反例、同一弹窗存在桌面/移动两套实现且文案不一致。

## 问题清单

### [🔴] P-01 退出登录/切换账号不清本地库、不关连接、不清缓存 → 跨账号数据可见且队列串号上传
- **位置**：`app/me/settings/page.tsx:96-101`（登出只 POST + push）、`lib/modules/offline/native/sqlite-db.ts:240`（`closeOfflineDb` 全仓仅被测试调用）、`lib/modules/offline/travel-read.ts:52-53`（`WHERE deleted = 0`，无 owner/space 作用域）、`app/travel/page.tsx:29-33`（在线时把本地行并入远端列表）、`lib/modules/offline/sync-dispatcher.ts:135-140`（`credentials: 'include'`）
- **问题描述**：`logout()` 仅 `fetch('/api/logout')` + `router.push('/login')`，不清 `tiantu_offline` 库、不删 `Directory.Data/media`、不 `resetSyncQueueStorage()`、不 `stopSyncEngine()`；而本地读 SQL 与 `mergeLocalTravelsIntoRemote` 都不按账号过滤：
  ```ts
  const logout = async () => {
    try { await fetch(apiUrl('/api/logout'), { method: 'POST', credentials: 'include' }) } catch {}
    router.push('/login')
  }
  ```
- **风险影响**：同一台手机换账号登录（本项目是双人/情侣场景，设备共用概率高）后——(a) 上一个账号的旅行/回忆/照片进入 `localOnly` 分支，**直接显示在新账号列表里**（`travel-read.ts:133-140` 只按 remoteId/slug 去重，不按归属）；(b) 旧账号遗留的 PENDING 队列项会在新账号的 cookie 下 replay，把旧账号草稿**写进新账号**（「推断」：按 `app/api/admin/travels` 的会话鉴权模型，草稿 payload 不携带作者字段，服务端只能按当前会话归属落库；未逐行核验该路由是否二次校验 payload 归属，需 task-2/3 确认）。属数据越权与数据污染。
- **改进方案**：① `logout()` 内依次 `stopSyncEngine()` → `closeOfflineDb()` → 清空 `sync_queue`/`media`/实体表 → 删除 `Directory.Data` 下 media 文件 → `resetSyncQueueStorage()`；② 本地表增加 `ownerId/spaceId` 列，所有本地读 SQL 加作用域条件（`travel-read.ts:53`、`moment-read.ts:41`、`album-read.ts`），并在 `meta` 表存 `accountId`，`getOfflineDb()` 后校验与当前会话一致，不一致即整库清空；③ 验证：加 `tests/unit/offline-account-switch.test.ts` 断言登出后各表 0 行、队列 0 项；真机 A→B 登录后列表为空。

### [🔴] P-02 同步上传无幂等键 + 永久失败无限重试 + fetch 无超时（重复内容 / 队列永不收敛 / 同步挂死）
- **位置**：`lib/modules/offline/sync-dispatcher.ts:133-145`（POST 无幂等键、失败只 `'HTTP ' + status`、无 AbortSignal）、`lib/modules/offline/sync-engine.ts:112-122`（`Math.min(item.retryCount, 6)` 只封顶**指数**不封顶**次数**）、`lib/modules/offline/sync-engine.ts:53`（固定 30s `setInterval`）
- **问题描述**：
  ```ts
  const delay = BASE_RETRY_MS * Math.pow(2, Math.min(item.retryCount, 6))
  if (now - item.updatedAt >= delay) await this.queue.retry(item.id)   // retryCount 仍会无限增长
  ...
  const res = await fetch(apiUrl(url), { method, credentials: 'include', body: ... })  // 无 signal
  if (!res.ok) throw new Error('HTTP ' + res.status)                    // 4xx/5xx 不可区分
  ```
  与 `docs/design/改动记录.md:1320` 自述的"指数退避（30s×2^n **上限 6 次**）"**不一致**：实现里 6 只是指数上限，第 7 次之后每 32 分钟重试一次，**永久重试**。
- **风险影响**：① 网络抖动下 POST 已到服务端但响应丢失 → 重传 → 用户看到两本同名旅行（该仓注释 `sync-engine.ts:136-141` 已自认此风险，但只处理了"本地回写失败",未处理"响应丢失"）；② 任何永久性 4xx（422 校验失败、403 无权限、410 已删）会被无限重试，队列只增不减，同步中心永远显示"失败 N 项"，用户点"全部重试"仍是同样结果；③ 弱网/黑洞网络下 `fetch` 无超时，单条可卡住整轮 `uploadPending`（串行 for 循环），后续内容全部排队等待。
- **改进方案**：① 上传体加 `clientMutationId`（`crypto.randomUUID()` 于入队时生成并持久化到 `sync_queue`，payload 透传），服务端按该键幂等（属 API 侧改造，需 task-2/3 协同）；② 失败分类：`4xx` 除 408/429 → `status='DEAD'` 并停止重试，同步中心单列"无法同步（需处理）"，显示服务端返回体；③ 所有同步 fetch 加 `signal: AbortSignal.timeout(20_000)`；④ `uploadPending` 增加每轮上限（如 20 条）避免整轮过长；⑤ 验证：`tests/unit/offline-sync-engine.test.ts` 增加"4xx 只试一次""retryCount>10 进 DEAD""超时被中断"三例。

### [🔴] P-03 本地行与队列非原子 + 无对账 → 内容永久卡在"待同步"，且拉取永久跳过该行
- **位置**：`lib/modules/offline/local-write.ts:49-58`（先写行、后 `enqueue`，两条独立语句）、`lib/modules/offline/media-upload.ts:150-169`（文件→media 行→入队，三步无事务）、`lib/modules/offline/pull.ts:52-54`（`syncStatus === 'PENDING_UPLOAD'` 直接 `return false`）、`lib/modules/offline/bootstrap.ts:16-22`（启动只 `start()` 引擎，无对账）
- **问题描述**：`writeLocalEntity` 的注释承诺"先写本地 SQLite，再入 SyncQueue"，实现是**行写入成功、入队前**进程被杀（Android 后台收紧、低内存 kill）就只剩一条 `syncStatus='PENDING_UPLOAD'` 的行。全仓 grep `PENDING_UPLOAD`/`reconcile` 无任何"行内无队列项则补建"的修复路径。
- **风险影响**：该实体永远不上云（`uploadPending` 只读队列），而 `pull.ts:52` 又因 `PENDING_UPLOAD` **永久跳过远端覆盖** —— 这条记录从此既不上传也不更新，UI 上一直挂"待同步"徽标，用户只能删掉重写。这正是仓库注释里"线上 Travel=0"的同族失效模式。
- **改进方案**：① 本地写与入队放进**同一事务**：`db.execute('BEGIN … COMMIT')` 包住行写 + 队列 INSERT（@capacitor-community/sqlite 支持 `execute` 多语句）；② 或改为**先入队再写行**（队列项为唯一真相源，行写失败可由同步回填），与 `write-through.ts:76-79` 已假设的"先入队、再写行"对齐；③ 启动时加一次对账扫描：`SELECT id FROM travel WHERE syncStatus='PENDING_UPLOAD' AND id NOT IN (SELECT entityId FROM sync_queue)` → 补建队列项（各实体表通用化）；④ 验证：单测模拟"行写入后抛错"断言队列仍有项 / 对账后补齐。

### [🟡] P-04 发布包零裁剪：未开 R8/shrinkResources、4 个 ABI 全打、6.85MB 字体只服务装饰标题
- **位置**：`android/app/build.gradle:36-44`（`minifyEnabled false`，无 `shrinkResources`，未配 `ndk.abiFilters`）、`android/variables.gradle:2-7`、`app/globals.css:553-559`（`/zpix.ttf`）、`app/album/page.tsx:361` 等 6 处 `font-zpix`
- **问题描述**（APK 条目实测，26,327,901 B）：

| 条目 | 压缩后 | 说明 |
|---|---|---|
| `classes.dex` + `classes2.dex` | 3.24 + 1.94 = **5.18MB** | 未开 R8，原始 DEX 14MB |
| `lib/{x86,x86_64,arm64-v8a,armeabi-v7a}/libsqlcipher.so` | 2.14+2.13+2.00+1.00 = **7.27MB** | x86/x86_64 仅模拟器用，占 4.27MB |
| `assets/public/zpix.ttf` | 1.27MB（原 6.85MB） | 全量中文像素字体，仅 `/album` 标题与像素相册用 |
| `assets/public/videos/clover.mp4` | 2.83MB（不压缩存储） | 登录页背景，`改动记录` 已决策保留 |
| `assets/public/_next`（240 文件） | 2.83MB（原 7.91MB） | 含 mermaid 0.40MB（压 0.13）、three 0.52MB、katex 0.25MB —— 三者移动端无入口 |
| `assets/public`（www）总 | 原 20.48MB / 709 文件，压缩后约 **8.7MB** | 占 APK 约 1/3；DEX+原生库合计占 47% |

- **风险影响**：26.3MB 安装包在应用商店下载转化、弱网首装（3G 下 ~2 分钟）、低端机安装耗时都直接受影响；x86 双库与未压缩 DEX 是**零收益体积**。
- **改进方案**：① `release { minifyEnabled true; shrinkResources true }` + proguard 保留 Capacitor/插件反射（`-keep class com.getcapacitor.** { *; }`、`-keep class com.getcapacitor.community.database.** { *; }`），预计 DEX 5.18→2MB 级；② `ndk { abiFilters 'arm64-v8a','armeabi-v7a' }` 或直接发 AAB 让商店按 ABI 拆包，省 4.27MB；③ zpix 用 `pyftsubset` 子集化（只保留像素标题实际用到的字符）+ 转 woff2，预计 <200KB；④ 验证：改后 `assembleRelease` 对比体积 + 真机回归（SQLCipher 建库、Camera、Haptics 均需跑通）。**注意**：改用例要覆盖插件反射，否则会白屏/建库失败——这是不做 R8 的常见理由，但可以用 keep 规则换取。

### [🟡] P-05 本地隐私锁是空壳；SQLite 明文 + allowBackup 允许导出
- **位置**：`lib/modules/offline/privacy-lock.ts:44-47`（`verifyPin` 仅判长度，且全仓**无调用方**）、`components/offline/SyncCenter.tsx:199-207`（文案承诺 PIN/生物识别 + 库加密）、`capacitor.config.ts:20-22`（`androidIsEncryption: false`）、`android/app/src/main/AndroidManifest.xml:6`（`allowBackup="true"`）
- **问题描述**：
  ```ts
  export function verifyPin(pin: string): boolean { return pin.length >= 4 }   // 任何 4 位字符都通过
  export async function deriveDbPassphrase(pin: string) { ... }               // 无调用方
  ```
  `SyncCenter` 的开关只写 `localStorage['tiantu-privacy-lock']`，打开相册/回忆时**没有任何拦截逻辑**（grep `getLockState|verifyPin` 无 UI 调用）。`改动记录.md:1312` 标注为"框架占位",但用户界面呈现的是已生效的隐私承诺。
- **风险影响**：用户（含评审者）会以为开启后他人拿到手机无法查看私密内容，实际**一滑即达**；`allowBackup=true` + 明文 SQLite 还让 `adb backup`/云备份/root 可直接取出全部旅行文案与媒体索引。
- **改进方案**：① 短期：开关旁明确标注"（开发中，暂未生效）"或直接下架该入口，避免虚假安全承诺；② 落地：`getOfflineDb()` 传入 `'encryption'` + passphrase（来自 Keystore/BiometricPrompt），进入 `/album`、`/me/favorites`、回忆详情前统一在路由守卫层校验；③ `allowBackup` 改 `false` 或配 `dataExtractionRules` 排除 `databases/`；④ 验证：单测 `verifyPin` 改为真实哈希比对 + 真机开启后返回再进入应要求解锁。

### [🟡] P-06 release 签名在缺密钥时静默回退 debug；版本号 4 处硬编码且校验脚本不在 CI；移动端产物完全无 CI
- **位置**：`android/app/build.gradle:4-8,26-35,40-42`（`if (keystorePropertiesFile.exists())` 才配 signingConfig）、`:17-18`（`versionCode 54`/`versionName "1.24.8"`）、`scripts/build-mobile.cjs:68-70`（默认 `'1.24.8'`/`'54'`）、`lib/app-version.ts:5-8`、`scripts/verify-version.cjs`（存在但未被引用）、`.github/workflows/ci.yml`（无任何 mobile/android 关键词）
- **问题描述**：换机器或 CI 环境没有 `keystore.properties` 时，`assembleRelease` **不会失败**，而是产出 debug 签名的"release"包；版本号在 package.json / app-version.ts / build-mobile.cjs / build.gradle 四处各写一份，`verify-version.cjs` 已能校验但既没进 `package.json scripts` 也没进 CI（`grep verify-version .github` = 0）。
- **风险影响**：误发 debug 签名包 → 老用户无法覆盖安装（签名冲突），只能卸载重装（丢本地数据）；版本号漂移 → OTA 判定失效（`isNewerVersion` 依赖它）或商店审核 versionCode 不递增被拒。
- **改进方案**：① `signingConfigs.release` 缺失时抛 `GradleException('缺少 keystore.properties')`，宁可构建失败；② 版本号单一来源（`package.json.version` + 环境变量注入，build.gradle 用 `-PversionName`）；③ CI 增加 job：`node scripts/verify-version.cjs` → `build-mobile.cjs` → `npx cap sync android` → `./gradlew assembleRelease` 并上传 artifact；④ 验证：删掉本地 keystore.properties 后 `assembleRelease` 必须失败。

### [🟡] P-07 OTA 无完整性校验 / 无灰度与回滚 / 无崩溃上报
- **位置**：`android/app/src/main/java/com/tiantu/app/AppUpdaterPlugin.java:127-176`（下载→rename→安装，全程无 hash/签名校验）、`app/api/version/route.ts:13-22`（只返回 version/buildNumber/downloadUrl/changelog/forceUpdate）、`hooks/use-app-update.ts:39-49`（启动即拉 `/api/version`）
- **问题描述**：APK 下载后只判断 `contentLength` 与 rename，无 sha256/大小校验；`/api/version` 无签名、无分渠道/分版本区间字段；全仓 grep `sentry|bugly|crashlytics` = 0，没有任何崩溃/错误上报。`forceUpdate` 只有服务端全局环境变量。
- **风险影响**：① CDN/中间环节异常返回损坏包时，用户只能看到系统安装器的"解析包错误"；② 发版只能全量放量，出问题只能回滚服务器上的 `downloads/tiantu.apk`（老用户已装坏版本仍会一直收到同一 latest 提示）；③ 移动端线上崩溃/白屏**完全不可观测**，只能靠用户截图（仓库注释多次自述"只能靠用户截图猜"，说明这是长期痛点）。
- **改进方案**：① `/api/version` 增加 `sha256`、`size`、`minSupportedBuild`、`rolloutPercent`；原生侧下载后校验 sha256 再安装（`MessageDigest` 即可）；② 客户端上报：接 Sentry（React + 原生）、或自建 `/api/diagnostics/client-error`（已有 `AppUpdaterPlugin` 这类原生桥，成本不高）；③ 灰度：`rolloutPercent` + `clientId` 哈希取模；回滚：服务端保留上一版 buildNumber 的下载地址，`/api/version` 可下发"降级提示"。

### [🟡] P-08 图片上传：无上传前压缩、无断点续传、本地文件永不清理、队列里塞无用 thumbBase64
- **位置**：`lib/modules/offline/media-upload.ts:68-98`（`Camera.getPhoto` 2048px/q88 整图 base64 进内存）、`:162-169`（payload 带 `thumbBase64`）、`lib/modules/offline/sync-dispatcher.ts:149-181`（只读 `localPath` 全图 multipart 一次发）、`lib/modules/offline/native/filesystem.ts:40`（`deleteLocalFile` **零生产调用**）
- **问题描述**：拍照后 `pickPhotoFromCamera` 生成缩略图 `thumbBase64` 放进队列 payload，但 `uploadMedia` **从不使用它**，上传的是完整原图；本地文件上传成功后不删除，全仓无配额/LRU/清理逻辑（`deleteLocalFile` 只有定义）。视频侧已实现 5MB 分片断点续传（`改动记录.md:2323-2326`，`/api/admin/videos/resumable`），**图片侧没有对应能力**。
- **风险影响**：① 弱网下一张 2MB 图要一次性传完，失败即从 0 重来，用户拍 20 张照片的离线旅程极易反复失败；② `Directory.Data` 只增不减（原图 + 缓存图），长期使用占满应用私有空间（Android 不自动清理 Data 目录）；③ `thumbBase64` 约 20-40KB/张常驻 SQLite 队列 payload，徒增库体积与读写耗时。
- **改进方案**：① 上传前用 Canvas 压缩到长边 1600 / q82（已有 `makeThumbnail` 可复用，改参数即可），并在 payload 记 `uploadedBytes`；② 图片复用视频的 resumable 通道（`/api/admin/uploads/resumable`，分片 1-2MB），或至少加 Range 断点；③ `markDone` 后删除本地文件（保留缩略图）并写 `media.purgedAt`；启动时按 `SUM(size)` 做 LRU 清理（阈值如 400MB）；④ payload 去掉 `thumbBase64`（上传成功后由服务端变体生成 blur），⑤ 验证：断网传 10 张 → 恢复网络分片续传；`adb shell du` 观察目录增长。

### [🟡] P-09 首屏串行依赖：`/api/home` 单点 + 冷启动立刻 4 个全量拉取 + 首页无离线兜底
- **位置**：`app/page.tsx:47-87`（只走 `useApi('/api/home')`，无 `readWithFallback`）、`app/layout.tsx:64`（`<OfflineBootstrap />`）、`lib/modules/offline/bootstrap.ts:16-22` → `sync-engine.ts:54`（`void this.sync()` 立即执行）、`lib/modules/offline/pull-dispatcher.ts:49,68,95,121`（`moments 200 条 / travels 全量 / albums 全量 / social 50 条`）
- **问题描述**：冷启动同一时刻发生：静态壳 JS 解析 → `/api/home`（聚合接口，含旅行/相册/碎碎念/足迹）→ 同时 SyncEngine 连发 4 个全量 GET + 可能的队列 POST；首页在离线时**直接进 `HomeMobileError`**（无缓存兜底），而 `/travel` 有 `readWithFallback`。
- **风险影响**：弱网首屏要等聚合接口返回才有内容（骨架屏驻留），且 4 个全量拉取与首屏请求争抢同一条移动网络；离线时首页（最高频页）不可用，与"离线优先"定位矛盾；4 个全量请求每 30s 重复（见 P-02）。
- **改进方案**：① `startSyncEngine()` 延迟到 `requestIdleCallback` 或首帧 + 2s，且首轮只上传不拉取；② `/api/home` 结果写入本地 SQLite（新表 `home_snapshot`）供离线首屏；③ 拉取加 `?since=<lastSyncAt>` 游标与 `ETag/If-None-Match`，无变更返回 304；④ 验证：Chrome DevTools "Slow 3G + offline" 打开首页应有内容；记录冷启动网络瀑布图。

### [🟡] P-10 WebView 渲染性能：常驻玻璃底栏在 Android 永不降级、长列表无虚拟化、图片 lazy 覆盖不足
- **位置**：`app/mobile.css:386-411`（`.m-glass` = `backdrop-filter: blur(18px)`，降级仅靠 `@media (prefers-reduced-transparency: reduce)`）、`components/layout/MobileBottomNav.tsx:43`（fixed 底栏常驻 `m-glass`）、`components/album/space/*`（three.js 粒子）、`components/album/morphslider/MorphSlider.tsx:5-6`（ogl + gsap）
- **问题描述**：`prefers-reduced-transparency` 是 **WebKit（Safari）媒体特性，Chromium/Android WebView 不支持**，因此源码注释里"中低端设备降级"的闸门在最需要它的平台上永远不会触发；fixed 底栏的 18px 模糊叠在长列表滚动之上是 Android WebView 最常见的掉帧源。全仓 0 处虚拟列表；35 处 `<img>` 仅 18 处 `loading="lazy"`（且移动壳 `next/image` 被强制 `unoptimized`，见 `next.config.js:17`）。
- **风险影响**：中低端 Android（占中国存量机大头）上滚动 Tab 栏区域时掉帧、列表滚动时 GPU 持续重算模糊；3D/银河页在无独立显卡的设备上首帧与滚动明显卡顿。
- **改进方案**：① 底栏去掉 blur，改 `var(--m-surface-solid)`（性价比最高的一处）；② 运行时能力探测：`navigator.hardwareConcurrency <= 4 || deviceMemory <= 4` → `document.documentElement.classList.add('low-end')`，CSS 里 `.low-end .m-glass { backdrop-filter: none }`；③ 3D 页面按同一判定直接降级到静态封面图；④ 全部 `<img>` 补 `loading="lazy" decoding="async"`，>50 项的列表接入 windowing；⑤ 验证：低端机 `chrome://inspect` 录制 Performance，对比滚动 FPS。

### [🟢] P-11 设计规范落地差距（抽查 5 项）：字距、44px 触控、文案一致、键盘避让
- **位置**：规范 `docs/design/移动端设计规范.md:196`（"不要用 0.24em"）vs `components/offline/SyncCenter.tsx:100`、`components/social/MeHome.tsx:317`、`PostDetail.tsx:410`、`TravelCircleFeed.tsx:234`、`UserList.tsx:36`、`FavoritesGrid.tsx:63`（6 处 `tracking-[0.24em]`，另 8 处 `0.2em`）；`app/login/page.tsx:285-293`（"记住我"复选框 `h-4 w-4`，整行高度约 24px）、`:246-253`（密码显隐按钮仅图标、无 44px 热区）；`:376-439` vs `:442-488`（同一"相册解锁"桌面 Modal 与移动 BottomSheet **两套实现**，文案还不同："相册解锁密码" vs "纪念日作为解锁密码"）；`hooks/use-keyboard-inset.ts:30`（全仓仅 `CommentPanel.tsx:113`、`TravelDetailMobile.tsx:90` 两处使用）
- **问题描述**：规范 §3 明确要求眉标字距统一 0.08em（现只有 4 处合规，6 处 0.24em + 8 处 0.2em + 16 处 `tracking-widest`）；§1/§8 要求触达 ≥44，登录页两个交互元素是 16px 级；同一能力两套 UI 且文案漂移；底部固定输入/面板理论上都要做键盘避让，实际只接了 2 处。
- **风险影响**：视觉一致性与可点性下降（登录页是唯一未登录用户能看到的页面，恰恰最容易点不中）；两套实现意味着修一次 bug 要改两遍，且已出现文案不一致，后续必然漂移。
- **改进方案**：① 批量替换 `tracking-[0.24em]`→`tracking-[0.08em]`（6 处，机械替换 + 截图回归）；② 登录页"记住我"用 `Pressable`/`Checkbox` 包 44px 行高、密码显隐换 `IconButton`；③ 相册解锁收敛为单一 `BottomSheet`（桌面用 `md:flex` 居中变体，组件同源）；④ 底部固定输入统一接 `useKeyboardInset`，并在 `BottomSheet` 内预留 `paddingBottom`。

### [🟢] P-12 静态壳把 30 个路由全量导出，含无用页与动态路由占位页；`www/uploads` 残留 383 张用户衍生图
- **位置**：`scripts/build-mobile.cjs:24-33`（只排除 `api/feed.xml/admin/albums/dev/middleware`）、`www/` 路由清单
- **问题描述**：导出 31 个 `*.html`（30 路由 + 404），其中 `/download`（App 内下载页）、`/dashboard`（数据看板，移动端无入口）、`/forgot-password`、`/icp-license.txt` 在壳内属冗余；`travel/placeholder.html`、`travel/placeholder/record.html`、`space/placeholder.html`、`circle/0.html`、`circle/user/0.html` 是 `generateStaticParams` 占位产物。另外 `build-mobile.cjs` 只删 `www/uploads/media`，`www/uploads/{covers,memories,travels}` 仍残留 383 个用户照片衍生文件（0.19MB）。
- **风险影响**：体积收益有限（每页 <30KB），但占位路由可被直接访问（`/travel/placeholder` 会渲染占位内容），且用户照片副本随安装包分发有隐私含义。
- **改进方案**：① `EXCLUDES` 增加 `app/download`、`app/dashboard`；② 动态路由 `generateStaticParams` 在 `MOBILE_EXPORT=1` 时返回空数组，避免占位页；③ 直接 `fs.rmSync(www/uploads, {recursive})` 而非只删 media；④ 验证：`node scripts/build-mobile.cjs` 后统计 `www/*.html` 数量与总字节。

### [🟢] P-13 跨端复用：不是"两套组件"，而是"双树 + 页面内分支"，缺一层可复用的数据/状态层
- **位置/量化**：`components/**/*Mobile*` 仅 5 个；但页面内双树普遍存在（`app/**/` 中 6 个文件有 `hidden md:block`、8 个有 `md:hidden`）；`app/travel` 三份实现：`TravelClient.tsx`(323 行) / `TravelMobileClient.tsx`(288) / 共享 `app/travel/page.tsx`(78)；详情页 `TravelDetailShell.tsx`(489) + `TravelDetailMobile.tsx`(690)；首页 `HomeClient.tsx`(648) + `HomeMobile.tsx`(535)；`MeHome.tsx`(527)、`SpaceDetail.tsx`(475) 各自单文件内混排；`isNative` 相关判断 114 处（含测试），`useIsMobile` 8 个文件
- **问题描述**：复用基本停在 `lib/`(`useApi`/`readWithFallback`/`haptics`/`Icon` 做得不错)，**展示层与部分副作用层**在移动/桌面各写一遍；`useIsMobile` 在 SSR 返回 `null` 导致每页都要写三态分支（loading/desktop/mobile），样板重复。
- **风险影响**：一处业务规则改动要在 2-3 个文件同步（已出现文案/行为漂移，如 P-11 的相册锁）；新页面默认会再复制一次双树。
- **改进方案**：① 明确分工原则：**该合的合**～数据获取/写入、格式化、埋点、权限判断、图片解析；**该分的分**～视觉与手势（列表密度、滚动容器、转场）。具体动作：把 `TravelClient`/`TravelMobileClient` 的数据推导抽成 `useTravelList()`（`page.tsx` 已集中取数，只差把过滤/合并/空态判断下沉）；详情页抽 `useTravelDetail(slug)` 供 Shell/Mobile 共用；② `useIsMobile` 提供 `<MobileOnly>/<DesktopOnly>` 声明式包装，减少三态样板；③ 不建议合并视觉：现有移动端实现质量明显更高（`m-*` 体系），应反向让桌面复用移动端原语而非相反。

## 优势（有证据）

1. **离线写契约写得比多数商业代码清楚，且已被故障教育过**：`lib/modules/offline/write-through.ts:1-16,68-96` 用注释固定了"本地先写 / 在线直写 / 失败降级 / 清队列防重复"四条契约，`markDoneByEntityId` 专门消除"在线成功 + 队列重传"造成的重复创建。
2. **SQLite 层有自省自愈 + 跨平台行归一化**：`lib/modules/offline/native/sqlite-db.ts:130-145`（`PRAGMA table_info` 差集补列）、`:275-334`（`normalizeRow`/`toRows`/`rowGet` 同时兼容 Android 对象行与 Web 数组行），把"插件返回值形态不同导致本地读全空"这类隐坑固化成了基础设施。
3. **设计系统是机制而非口号**：`app/mobile.css:374-411` 把全项目 50 个文件里随手写的 `backdrop-blur-*` 收敛成 3 档并给出降级；`scripts/check-design-tokens.mjs` 11 条规则 + 基线门禁已接 CI（`.github/workflows/ci.yml:58-63`），本次实跑报告：原有 7 条 308 处、新增规则 91 处，说明"存量可见、新增受限"的治理方式成立。
4. **原生能力接入克制且各处有 Web 降级**：`lib/mobile/haptics.ts:14-27` 动态 import + 缓存 + 失败静默；`public/register-sw.js:3-9` 在原生壳内**主动跳过** Service Worker（避免 SW 缓存旧壳干扰 OTA，判断很专业）；`MainActivity.java:16-23` 接管系统返回键并回传 `window.__tiantu_handleBack`；`capacitor.config.ts:23-26` 键盘 `resize: 'native'`。
5. **构建产物与密钥不入库**：`.gitignore` 覆盖 `/www/`、`/android/app/build/`、`/android/keystore.properties`、`*.apk/*.aab`、`/public/uploads/`；实测 `git ls-files www` = 0、`git ls-files android/app/build` = 0，仓库未被 20MB 产物污染（`git count-objects` pack 242MB 主要来自历史文档/图片）。

## 未覆盖/待确认

- **无真机/模拟器**：安全区（`env(safe-area-inset-*)` 在 Android WebView 的实际取值）、键盘遮挡、边缘返回手势、冷启动白屏时长均为静态推断。`targetSdk = 36`（`variables.gradle:4`）在 Android 15+ 会强制 edge-to-edge，而 `MainActivity.java` 无任何 `WindowInsets` 处理、全靠 CSS `viewport-fit=cover`（`app/layout.tsx:22-27`），**这条需要真机核验状态栏是否压住 `LargeTitle`**。
- **未重建产物**：`www/` 为 2026-10-17 17:25 的历史构建（与 `app/` 最后修改 17:24 基本同步），本次未执行 `build-mobile.cjs`（会移动/恢复 `app/api` 等目录，属写操作，按约定不做）；APK 体积数据取自该次构建的 release 包。
- **未审 SQLite 事务/并发细节**：多页面同时写、插件 `execute` 事务语义、WAL 行为未验证（P-03 的方案需在真机确认事务可用）。
- **服务端幂等/去重属 API 范围**（task-2/3）：P-02 的服务端 `clientMutationId` 与上传去重是否已有实现，未核验 `app/api/admin/travels` 与 `app/api/upload`。
- **崩溃上报**：结论基于全仓 grep（无 sentry/bugly/crashlytics），未排除自建日志上报端点（未发现）。
- **`prefers-reduced-transparency` 不受 Chromium 支持**为平台事实（MDN），未在目标 WebView 实测。
- **iOS 侧**未评估（项目当前仅 Android 工程）。
- `tracking-[0.24em]` 等设计欠债属存量（checker 已登记 399 处），本文只报移动端相关且可机械收敛的部分，未重复展开。
