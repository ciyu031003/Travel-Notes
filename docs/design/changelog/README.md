# 变更记录归档索引

> 由 `scripts/split-changelog.cjs` 生成，请勿手改。
> 单一事实源仍是 `docs/design/改动记录.md`（index + 完整历史）；本目录只做按年份归档，便于检索与 Code Review 引用。

| 年份 | 节数 | 文件 | 大小 |
|---|---|---|---|
| 2026 | 113 | [2026.md](2026.md) | 367.2 KB |

## 维护方式

1. 日常变更只追加到 `docs/design/改动记录.md`（保持每节 `## YYYY-MM-DD · 标题` 格式）。
2. 提交前/CI 里跑 `node scripts/split-changelog.cjs` 重新生成归档；`--check` 模式只校验不写。
3. 归档文件禁止手改：需要修历史时改源文件再重新生成。
