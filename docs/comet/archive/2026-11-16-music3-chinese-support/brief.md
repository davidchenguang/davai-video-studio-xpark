# 目标

给 Music 3「长篇音乐」工作区增加面向国内客户的中文一等公民支持，两个改动：新增「演唱语言」选择器（默认中文），把所选语言以指令形式注入 Music 3 的 caption 提示词；新增 6 个中文向声音预设，让国内客户无需理解英文制作描述即可一键起步。

现状事实（已当场核实）：

- 模型为 MiniMax Music 3.0（GB10 上 `minimax_music3_dit_fp16` + `minimax_music3_text_encoder_pruned_int8_convrot` + `minimax_music3_dav`），原生支持中英文歌词（词表来自 Qwen2），本次不替换、不新增模型。
- 界面已是全中文；歌词（lyrics）字段是自由文本，中文英文都能填；段落标签 `[Verse]`/`[Chorus]` 等是英文结构指令（与语言无关，不动）。
- caption 由 `src/lib/music3Workflow.ts:28` `buildMusic3Caption` 生成，当前纯英文（`### Global Metadata / Vocal Details / Arrangement`）；流派/调性/情绪走向/人声/编曲的预设值都是英文原值 + 中文显示标签（`src/lib/music3Vocabulary.ts` 顶部注释明确「显示层给中文、提示词/存储层保留英文」）。
- 当前 caption 里没有任何「演唱语言」信号，中文演唱完全依赖歌词文本自身携带语言。

# 范围

## 目录结构

### 修改

- `src/lib/music3Workflow.ts` — `buildMusic3Caption` 增加 `language` 参数（联合类型 `'zh' | 'en'`，缺省 `'zh'`），注入独立 `### Vocal Language` 段（正文一行 `Vocal language: Mandarin Chinese` / `Vocal language: English`），位置固定在 `### Global Metadata` 与 `### Vocal Details` 之间；`Music3GenerationOptions` 不变——语言已随 caption 字符串传入工作流。
- `src/lib/music3Vocabulary.ts` — 新增流派英文原值 `Mandopop`、`Chinese traditional`，**同时**加入 `music3Genres`（流派 datalist 选项，`Music3Workspace.tsx:156` 的数据源）与 `music3GenreLabels`（中文标签「华语流行 / 国风·古风」）两个导出，两处缺一即视为未完成。
- `src/components/Music3Workspace.tsx` — `Draft` 增加 `language: 'zh' | 'en'` 联合类型字段（`fresh()` 默认 `'zh'`；localStorage 存储原值 `'zh'`/`'en'`，不存中文显示值；`load()` 的 `{ ...fresh(), ...旧值 }` 合并保证旧草稿无该字段时回退中文）；歌曲设置区新增「演唱语言」选择器（中文 / English）；`musicPresets` 新增 6 个中文向预设，**排列在全部 40 个预设之前（置顶）**；`:89` 的 `buildMusic3Caption` 调用传入 `language: draft.language`（语言经 caption 进 `onGenerate`，`:172` 无需改）。
- `scripts/test-music3-vocabulary.cjs` — 补充 A2 的机器验证：`buildMusic3Caption` 为纯函数，断言 `language: 'zh'` 的 caption 含 `### Vocal Language` 段（`Vocal language: Mandarin Chinese`、位于 Global Metadata 与 Vocal Details 之间）、`'en'` 含 `Vocal language: English`；沿用现有套件（`pnpm test:music3-vocabulary`），不新开测试文件。该套件还需同步吸收新流派原值（现有断言遍历 `music3Genres` 逐一要求有中文标签，`Mandopop`/`Chinese traditional` 加入后自动进入遍历范围，无需特判）。

### 修改（预设防撞约束）

6 个中文向预设的取值必须与既有 34 个预设**不发生 `activePreset` 五字段匹配撞车**（`Music3Workspace.tsx:137` 按 `genre + bpm + key + vocals + arrangement` 精确匹配，不含 metadata）：

- 华语流行用新流派 `Mandopop`、国风·古风用新流派 `Chinese traditional`——新流派值天然唯一，不与任何既有预设撞车；
- 其余 4 个（中文民谣 / 中文说唱 / 中文 R&B / 中文摇滚）复用既有流派（`Folk` / `Hip-hop` / `R&B` / `Rock`），它们的五字段组合必须与同流派的每个既有预设在至少一个被匹配字段上取不同值（BPM、调性、人声、编曲任选其一差异化），Build 时逐一核对，并接受验收核对。

### 明确不建

- 独立 TTS/配音模块 — 本次只做音乐演唱语言，不新增语音合成。
- 完整中文预设库（10+）— 本次只做 6 个，避免维护面扩大。
- 演唱语言自动检测（跟随歌词）— 用户已确认默认中文、手动切换英文，不做自动。

# 非目标

- 不把 caption 整体翻译成中文：保持「显示层中文、提示词层英文」分层，避免损伤生成质量。
- 不替换 Music 3 模型、不新增/下载模型。
- 不改 Ollama 自动建议的语言逻辑（它已按歌词语言匹配）。
- 不做独立 TTS/配音、字幕、朗读。
- 不改歌词字段、段落标签、生成流程（排队/取消/完成分支）的现有行为。
- 暂不支持粤语声线：`zh` 一律按 `Mandarin Chinese`（普通话）咬字演唱，粤语歌词也会被普通话咬字处理，不作为缺陷。

# 验收示例

- A1 打开「长篇音乐」工作区，歌曲设置区出现「演唱语言」选择器，默认「中文」，可切换为「English」；切换后重新进入页面仍保持所选值（localStorage 持久化，存储原值 `'zh'`/`'en'`），「重置歌曲」后回退为默认「中文」。
- A2 语言「中文」时，caption 为独立 `### Vocal Language` 段、正文一行 `Vocal language: Mandarin Chinese`、位于 `### Global Metadata` 与 `### Vocal Details` 之间（`pnpm test:music3-vocabulary` 断言机器可验）；语言「English」时该行为 `Vocal language: English`；两种情况下 lyrics 文本原样保留、不被改写。
- A3 声音预设面板出现 6 个中文向预设（华语流行、国风·古风、中文民谣、中文说唱、中文 R&B、中文摇滚），排列在预设列表最前（置顶）；点击任一预设完整填充流派/BPM/调性/情绪走向/全局风格描述（metadata）/人声/编曲七个字段；点击后高亮（activePreset）指向所点预设本身，不与既有 34 个预设互串；生成时这些字段写进 caption 的仍是英文原值（界面显示中文标签，分层不变）。
- A4 加载不含 `language` 字段的旧 localStorage 草稿不报错，语言回退为「中文」。

# 验证预期

- 交付前按 `AGENTS.md` 运行 `pnpm typecheck && pnpm lint && pnpm test && pnpm build:web`，全部通过。
