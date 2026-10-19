# CHANGELOG 发布条目模板（复制到 CHANGELOG.md 顶部）

> 用法：每次发版在 `CHANGELOG.md` 顶部插入一条，标题格式 `## [<version>] - <YYYY-MM-DD>（build <n>）`。
> 版本号/构建号必须走 `node scripts/bump-version.cjs <version> <build>`，并用 `node scripts/verify-version.cjs <version> <build>` 校验；
> 不要手改 `lib/app-version.ts`、`android/app/build.gradle`、`docker-compose.yml` 里的版本默认值。

```markdown
## [<version>] - <YYYY-MM-DD>（build <n>）

### 新增
- <用户可感知的新功能；写「场景 + 结果」，不写实现细节>

### 修复
- <修掉的真实故障；尽量带复现条件（设备/网络/账号状态）>

### 优化
- <性能/体验/可维护性改进；有数据就写数字（首屏 KB、耗时、APK 体积）>

### 安全
- <鉴权/限流/依赖升级等；如无可整节省略>

### 升级注意（部署/数据）
- [ ] 是否需要数据库迁移（`prisma migrate deploy`，禁止 `db push`）
- [ ] 是否需要新增/变更环境变量（列出变量名，不写值）
- [ ] 是否影响 App 兼容（OTA 强更？旧版 API 是否保留）
- [ ] 回滚方式（镜像 tag / 数据备份）

### 验证
- 构建：`npx tsc --noEmit --incremental false` / `npx vitest run` / `npx next build`（或 CI 链接）
- 手工：<关键路径 3-5 条，含 Web 与 App>
- 数据：<迁移/备份校验结果>
```

## 发布检查清单（发版前逐项勾）

1. [ ] `node scripts/bump-version.cjs <version> <build>` + `node scripts/verify-version.cjs <version> <build>` 通过
2. [ ] `CHANGELOG.md` 顶部条目按本模板补齐
3. [ ] `docs/design/改动记录.md` 已有对应日期的变更节
4. [ ] CI 全绿（lint 预算 / typecheck / coverage / audit gate / drift gate / e2e-smoke）
5. [ ] 数据库：部署前确认最近备份 < 26h（`bash scripts/backup-db.sh --check`）
6. [ ] App：`npx cap sync` + 签名 APK/AAB 构建 + `/api/version` 校验（`APP_BUILD_NUMBER` 已递增）
7. [ ] 部署后 `/api/health` 200 且 `docker compose ps` healthy；镜像 tag 已保留用于回滚
