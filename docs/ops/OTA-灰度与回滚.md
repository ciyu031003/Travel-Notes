# OTA 灰度发布与回滚 Runbook（1.29.0 起可用）

> 背景：评审 P-07 指出"发版只能全量放量，出问题只能回滚服务器上的 tiantu.apk"。
> 灰度链路（P2-30）服务端与客户端均已实现，本文把它变成**可执行的发版流程**；
> 回滚部分补上此前缺失的服务端操作步骤。

## 一、灰度发布（分批放量）

**链路事实**：
- 服务端 `/api/version` 下发 `rolloutPercent`（env `APP_ROLLOUT_PERCENT`，缺省 100 = 全量）；
- 客户端 `hooks/use-app-update.ts` 的 `inRollout()`：设备首次取到 <100 的灰度值时，
  按 localStorage 里的一次性随机桶（0-99）判定"这台设备是否在灰度内"，此后稳定
  （同一台设备不会这次提示下次不提示）。

**流程**（在服务器工作目录操作，参考 DEPLOYMENT.md 的部署章节）：

```bash
# 1. 全量包先就位（新 APK + 新版本号 + sha256 已按 DEPLOYMENT.md 设置）
# 2. 首批只放 20% 设备：
#    .env 追加/修改后重启 app 容器
APP_ROLLOUT_PERCENT=20
docker compose up -d app   # 或 server-rebuild.sh 的常规流程
# 3. 观察 24h：崩溃上报（见下）+ /api/health + 用户反馈
# 4. 无异常 → 50 → 100，每次改 .env 后 docker compose up -d app
```

**观察手段（1.29.0 起有真实数据源）**：
- 崩溃/JS 异常：`GET /api/admin/diagnostics/client-errors`（站主 cookie；可按 kind 过滤：
  `?kind=js-error` / `unhandled-rejection` / `react-boundary`）；
- 服务器日志：`docker compose logs app --since 1h | grep -i error`；
- `/api/health` 的 db/migrations/storage 三探针。

## 二、回滚

**场景 A：新版本有致命问题，要收回更新提示**
```bash
# .env：把版本指回上一个稳定版（APK 文件保留版本副本是发布纪律，见下）
APP_VERSION=1.28.0
APP_BUILD_NUMBER=59
APP_APK_SHA256=<上一稳定版的 sha256>
APP_APK_SIZE=<上一稳定版字节数>
APP_CHANGELOG=回滚说明
docker compose up -d app
```
- 已装新版的用户：客户端 isNewerVersion(本机 1.29.0 > 服务端 1.28.0) 为 false → **不再弹更新**；
  若新版本身有致命缺陷，需再发 1.29.1 修复版（或调低 `APP_MIN_SUPPORTED_BUILD` 封杀——见下）。
- 未升级的用户：会继续收到旧稳定版的更新提示（正确行为）。

**场景 B：新版本会损坏数据/不可用，必须强制已升级用户离开该版本**
```bash
# .env：低于该 build 的客户端启动即全屏强制更新（forceUpdate=true 且不可关闭）
APP_MIN_SUPPORTED_BUILD=<上一个稳定 build 号>
docker compose up -d app
```
- 服务端同时把 `downloads/tiantu.apk` 换回稳定版文件（OTA 下载的就是它，客户端会校验 sha256）。

**发布纪律（每次发版必须做，回滚依赖它）**：
1. 服务器保留版本副本：`cp tiantu.apk tiantu-2026XXXX-v1.29.0-b60.apk`（历史批次均如此）；
2. `.env` 里的 `APP_APK_SHA256` / `APP_APK_SIZE` 与 APK 实际文件一致（客户端下载后会校验，
   不一致 = 所有更新安装失败）；
3. 回滚后跑一遍 `curl -s https://travel-notes.yuanabd.cn/api/version` 核对字段。

## 三、字段速查（.env → /api/version）

| env | 下发字段 | 语义 |
|---|---|---|
| `APP_VERSION` / `APP_BUILD_NUMBER` | version / buildNumber | 最新版本（客户端比较后决定是否提示） |
| `APP_APK_SHA256` / `APP_APK_SIZE` | sha256 / size | 下载完整性校验 + 进度条兜底（客户端边下边算，不一致删包不装） |
| `APP_MIN_SUPPORTED_BUILD` | minSupportedBuild | 低于它 forceUpdate（封杀坏版本） |
| `APP_ROLLOUT_PERCENT` | rolloutPercent | 灰度比例（100=全量；客户端按稳定随机桶判定） |
| `APP_FORCE_UPDATE=1` | forceUpdate | 全量强制更新（紧急兜底） |
| `APP_CHANGELOG` | changelog | 更新提示文案 |
