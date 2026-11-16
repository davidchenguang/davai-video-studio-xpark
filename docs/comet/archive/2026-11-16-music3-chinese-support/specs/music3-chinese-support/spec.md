# Music 3 中文支持（music3-chinese-support）

## Capability

`music3-chinese-support` — Music 3「长篇音乐」工作区新增演唱语言选择器（默认中文）与 6 个中文向声音预设；所选语言以指令形式注入 caption 提示词，让模型明确按中文（或英文）演唱，同时保持「显示层中文、提示词层英文」的分层不变。

## 完整行为规格

### 1. 演唱语言选择器

歌曲设置区（`music3-structure-controls`）新增「演唱语言」选择器，取值为联合类型 `'zh' | 'en'`，界面显示「中文 / English」，默认 `'zh'`（中文）。选择器写入 `Draft.language`，与其余草稿字段一起经 `useEffect` 持久化到 localStorage（`minimax.music3-workspace`，存储原值 `'zh'`/`'en'`，不存中文显示值），因此切换后重新进入页面仍保持所选值；「重置歌曲」（`setDraft(fresh())`）把语言回退为默认「中文」。

约束：

- 语言是草稿字段，不是全局设置：每个工作区会话各自保存，不影响其他工作区或全局状态。
- 语言不影响歌词字段、段落标签、时长、种子等其它草稿字段。

#### Scenario: 演唱语言可选择与持久化
Acceptance: A1

打开「长篇音乐」工作区，歌曲设置区出现「演唱语言」选择器，默认「中文」，可切换为「English」；切换后重新进入页面仍保持所选值（localStorage 持久化，存储原值 `'zh'`/`'en'`）；「重置歌曲」后回退为默认「中文」。

### 2. 演唱语言指令注入 caption

`buildMusic3Caption` 增加 `language: 'zh' | 'en'` 参数（缺省 `'zh'`），在 caption 中注入**独立 `### Vocal Language` 段**，正文固定为一行：`'zh'` → `Vocal language: Mandarin Chinese`，`'en'` → `Vocal language: English`；该段位置固定在 `### Global Metadata` 与 `### Vocal Details` 之间。指令随 `options.caption` 进入 `MiniMaxMusic3TextEncode.caption`。歌词（lyrics）单独经 `options.lyrics` 传入，不被改写。

机器验证：`scripts/test-music3-vocabulary.cjs`（沿用现有套件，不新开文件）断言 `'zh'`/`'en'` 两种取值下 caption 的语言段正文与位置（`pnpm test:music3-vocabulary`）。

约束：

- caption 其余三段的英文原值（Global Metadata / Vocal Details / Arrangement）不变——只新增语言段，不翻译。
- `Music3GenerationOptions` 结构不变：语言已含在 caption 字符串内。

#### Scenario: 语言指令进入工作流且歌词保留
Acceptance: A2

语言「中文」时，caption 为独立 `### Vocal Language` 段、正文一行 `Vocal language: Mandarin Chinese`、位于 `### Global Metadata` 与 `### Vocal Details` 之间（`pnpm test:music3-vocabulary` 断言机器可验）；语言「English」时该行为 `Vocal language: English`；两种情况下 lyrics 文本原样保留、不被改写。

### 3. 中文向声音预设

`musicPresets` 新增 6 个中文向预设，**排列在全部预设之前（置顶）**；标题、氛围（`mood`）为中文，其余字段沿用英文原值（`genre`/`bpm`/`key`/`progression`/`metadata`/`vocals`/`arrangement`），与现有预设同构：

1. 华语流行（`Mandopop`）
2. 国风·古风（`Chinese traditional`）
3. 中文民谣（`Folk`）
4. 中文说唱（`Hip-hop`）
5. 中文 R&B（`R&B`）
6. 中文摇滚（`Rock`）

新增流派英文原值 `Mandopop`、`Chinese traditional` **同时加入 `music3Genres` 与 `music3GenreLabels` 两个导出**：前者是流派 datalist（`Music3Workspace.tsx:156`）与手动输入建议的数据源，后者提供中文标签（华语流行 / 国风·古风）——两处缺一即视为未完成。现有 `test-music3-vocabulary` 断言遍历 `music3Genres` 逐一要求有中文标签，新原值自动进入遍历范围。

**预设防撞约束**：`activePreset`（`Music3Workspace.tsx:137`）按 `genre + bpm + key + vocals + arrangement` 五字段精确匹配（不含 metadata）。华语流行与国风·古风使用新流派值，天然唯一不撞车；其余 4 个预设复用既有流派，其五字段组合必须与同流派的每个既有预设在至少一个被匹配字段上取不同值（BPM、调性、人声、编曲任选其一差异化），点击中文预设后高亮必须指向所点预设本身，不与既有 34 个预设互串。

约束：

- 点击预设完整填充流派/BPM/调性/情绪走向/全局风格描述（metadata）/人声/编曲七个字段（沿用现有 `applyPreset`），不改歌词。
- 生成时这些字段写进 caption 的仍是英文原值，界面显示中文标签——分层不变。

#### Scenario: 中文预设一键填充、高亮正确且分层不变
Acceptance: A3

声音预设面板出现 6 个中文向预设，排列在预设列表最前（置顶）；点击任一预设完整填充流派/BPM/调性/情绪走向/全局风格描述（metadata）/人声/编曲七个字段；点击后高亮（activePreset）指向所点预设本身，不与既有 34 个预设互串；生成时这些字段写进 caption 的仍是英文原值。

### 4. 存储与旧数据兼容

`Draft` 增加 `language: 'zh' | 'en'` 联合类型字段，`fresh()` 默认 `'zh'`。`load()` 用 `{ ...fresh(), ...JSON.parse(旧值) }` 合并，旧 localStorage 草稿没有 `language` 字段时自动取 `fresh().language = 'zh'`，无需迁移脚本。

约束：

- 不新增存储键、不迁移旧数据结构；只依赖现有合并式 `load()`。
- 未知语言值（理论上不存在，存储只写 `'zh'`/`'en'`）回退 `'zh'` 的安全兜底由实现保证。

#### Scenario: 旧草稿无语言字段回退中文
Acceptance: A4

加载不含 `language` 字段的旧 localStorage 草稿不报错，语言回退为「中文」。

### 5. 交付验证

交付前按 `AGENTS.md` 运行 `pnpm typecheck && pnpm lint && pnpm test && pnpm build:web`，全部通过。
