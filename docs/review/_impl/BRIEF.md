# P1/P2 整改实施 · 团队共享简报（Lead，2026-10-18 第二轮）

## 背景
评审报告见 docs/review/行迹-全维度评审报告-2026-10-18.md（本次实施依据 = 报告 §4 的 P1/P2 清单，编号 10–36）。
品牌已由「行迹」重命名为「甜途」（commit bbbf87a），**不要再改品牌名**，也不要改 JWT issuer（middleware.ts / token-service.ts 的 'travel-notes'，改了会让所有会话失效）。

## 环境事实
- Node 24 / npm 11；Windows + PowerShell；仓库根 F:\CodeFiles\Travel-Notes；分支 master。
- **没有 MySQL、没有 Docker**：数据库相关代码只能静态改 + tsc/单测，不能跑 E2E / db push / migrate。
- Android SDK 在 D:\commandlinetools-win-15859902_latest，keystore.properties 存在，gradlew 可用（可尝试 assembleRelease，但不强制）。
- GitHub SSH 可用；**不要执行任何 git 命令**（add/commit/push 由 Lead 统一做）。
- 网络可用（npm view 正常），但**不要安装新依赖**（除非任务明确允许）。

## 硬性规则
1. **只改任务分给你的文件范围**；范围外需要改动时，先 send_message 问 Lead，不要越界（多人共享同一工作区）。
2. **保持行为兼容**：Web 与 App（Capacitor 壳 + 离线队列）都在线上用；改 API 响应/鉴权/Cookie 时必须向后兼容，宁可加字段不要删字段；同一改动要同时照顾 Web（同源）与 App（跨域 + SameSite=None）。
3. **不要降低安全**：不要为了方便把鉴权改宽；不要删除审计日志；不要动 .env / 证书 / keystore。
4. 类型必须过：结束前跑
   - `npx tsc --noEmit --incremental false`（必须 exit 0）
   - `npx vitest run --reporter=dot`（554 用例必须全绿；若你新增测试，数量会增加）
   tsc 失败必须修到过；vitest 失败必须判断是你的改动还是既有环境问题，是你的就修。
5. 代码风格跟仓库一致：中文注释说明「为什么」，不写无信息注释；不要顺手格式化无关文件。
6. 每完成一块，用 send_message 给 lead 发：改了哪些文件 / 关键决策 / 验证结果 / 未完成项（不要等全部做完才说）。
7. 时间盒：60–75 分钟。做不完的项**明确列为 deferred 并说明原因**，不要留下半成品（半成品要么回退，要么用 TODO 标注 + 不影响构建）。

## 分配总览
- A auth-api：P1-10/11/12/13/14/16/17 + P2-35（Prisma 适配器生命周期）
- B data：P1-15（事务）+ P2-32 的 travel.service 拆分部分
- C web：P1-18/19/20/21 + P2-27/28（含 P2-31 的小范围 token 收敛）
- D mobile：P1-22/23(client)/24 + P2-26/29/30 + P2-6(signing)
- E infra：P1-25（CI）+ P2-33/34 + P2-36（依赖评估，谨慎）
- Lead：品牌重命名（已完成）、最终 tsc/vitest/lint/build 验证、分批 commit、push、文档同步

## 完成定义
- 代码可构建（tsc 0 error）；
- 单测全绿；
- 新增/修改的关键逻辑有注释解释原因；
- 在 send_message 里给出「验收方式」（命令或手工步骤）。
