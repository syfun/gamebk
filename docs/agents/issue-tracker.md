# 本地 Markdown 工单

工单和需求规格存放在仓库的 `.scratch/` 下。发布时按约定路径创建文件，读取时使用给定路径或在对应功能目录按编号查找。

## 规格与工单

- 每项功能使用 `.scratch/<feature>/`，规格写在 `spec.md`。
- 每张工单使用独立的 `issues/<NN>-<slug>.md`，编号从 `01` 开始。
- 在文件开头用 `Status:` 记录分流状态，取值见[分流标签](triage-labels.md)。讨论追加到文件末尾的 `## Comments`。

## Wayfinding 操作

- 在 `.scratch/<effort>/map.md` 记录笔记、已定事项和待澄清问题。
- 在 `.scratch/<effort>/issues/` 创建决策工单，沿用相同的编号规则。用 `Type:` 记录 `research`、`prototype`、`grilling` 或 `task`。
- 用 `Blocked by: NN, NN` 记录依赖。按编号领取第一张尚未领取且依赖均为 `resolved` 的待处理工单，写入 `Status: claimed`。
- 完成时将答案追加到 `## Answer`，写入 `Status: resolved`，再把决策摘要和工单链接补到地图的已定事项。
