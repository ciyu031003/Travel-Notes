# 架构决策记录（ADR）

> 目的：把「为什么这样设计」从口头讨论/聊天记录里固化下来，避免半年后只能从代码考古。
> 本目录只收录**影响面大、可回溯、有取舍**的决策；日常小改动仍写 `docs/design/改动记录.md`。

## 什么时候写 ADR

- 引入/替换关键依赖（如 Prisma 适配器、nodemailer 10、tailwind 4）；
- 改变数据模型/迁移策略（如 Prisma Migrate 基线、软删除、幂等键）；
- 改变部署/发布流程（镜像门禁、回滚、备份策略）；
- 安全模型变化（会话撤销、CORS、权限默认值）；
- 任何「当时有两个以上合理方案，最后选了其中一个」的事。

不需要写：修 bug、调整样式、纯重构（写进改动记录即可）。

## 命名与状态

- 文件名：`NNNN-kebab-case-标题.md`（四位序号，如 `0001-prisma-migrate-baseline.md`）；
- 状态：`Proposed`（提议中）→ `Accepted`（已采纳）→ `Superseded by NNNN`（被取代）/ `Deprecated`（废弃）；
- 已接受的 ADR **不修改正文**；要改结论就新写一篇并互相引用（历史可追溯）。

## 怎么写

1. 复制 `docs/adr/TEMPLATE.md` 为 `NNNN-标题.md`；
2. 填 Context（约束/事实）、Decision（选了什么）、Consequences（好处/代价/风险）；
3. 在下方索引表加一行；
4. 关联的改动在 `docs/design/改动记录.md` 里引用 ADR 编号（如「决策见 ADR-0003」）。

## 索引

| 编号 | 标题 | 状态 | 日期 |
|---|---|---|---|
| — | （第一条 ADR 开始记录） | — | — |

## 模板

见 [TEMPLATE.md](./TEMPLATE.md)。
