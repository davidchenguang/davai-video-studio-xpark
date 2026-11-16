---
generated_from_state_version: 14
---

# 验证

## 当前结果

- 结果: **已归档**
- 验证情况: **已完成检查，验证结果已确认**
- 目标周期: 1
- 迭代: 2
- 验证器尝试次数: 1
- 完成时间: 2026-11-16T00:30:13.222Z
- 摘要: 第 2 轮独立只读验收：候选 ec651ab 的 A1-A4 全部通过，且本轮新增的 prompt-parity 重新钉住经我独立取证确认是真实捕获而非二次手工打补丁。我用自写 CDP 脚本（/tmp/verifier-m3zh-r2/walkthrough-r2.cjs）在真实 Electron 渲染进程（Vite 127.0.0.1:5199，CDP 9333）上跑了 46 项断言，全部 PASS，全程 Log.entryAdded error 0 条、Runtime.exceptionThrown 0 条：A1 选择器/默认值/选项/持久化原值 en/刷新保持/重置回退 zh 全部实测通过；A2 zh 与 en 两态 caption 的独立 '### Vocal Language' 段与段位置实测正确、caption 零中文、歌词 65 字符逐字节不变且不出现在 caption；A3 40 预设前 6 位为 6 个中文预设、逐个点击填满 7 字段且高亮唯一指向自身、界面中文标签而 caption 为英文原值、新流派双导出齐备；A4 无 language 的旧草稿载入回退 zh 且无报错。我另用 TypeScript AST 独立重算防撞：40×40 的 5 字段键碰撞 0、find() 误配 0，同流派复核每例至少一个被匹配字段不同。重新钉住核验：fixture _meta.baseline = 6a600eb625d530f5d4694f766e5d2c6c0e8d4956、cleanTreeVerified true，test-prompt-parity.cjs:50 与 capture-prompt-parity.cjs:20 的钉住值一致，git diff --quiet 6a600eb -- src electron 为空（src/electron 零改动），fixture 的 music3Caption 含 '### Vocal Language'；最关键的是我用 git archive 抽出 6a600eb 的原始树到 /tmp 独立跑 harness capture()，结果与 ec651ab 提交的 fixture 逐字节一致（canonical 与 raw JSON.stringify 双通过），证明第 1 轮指出的『手工编辑 fixture 却保留旧 _meta』这一出处缺陷已被按流程真正修复。定向检查我自己重跑：pnpm typecheck exit 0、pnpm lint exit 0、pnpm test exit 0（29 套全 PASS，含 test:music3-vocabulary 与 test:prompt-parity）、pnpm test:prompt-parity PASS（16 段逐字节一致）。按约束未运行 build:web / build:electron，改以读取 Runtime 的 6 条检查日志并逐一核对 sha256（全部与记录的 logSha256 一致）作为凭据，6 项 status=passed、exitCode=0、inputBefore==inputAfter 无漂移。结论：verdict pass，无阻塞项；遗留风险仅为未做真实端到端生成听辨（超出 A1-A4 范围）等条目，已在 risks 中如实登记。

## 验收

| 编号 | 结果 | 来源 | 验收项 | 原因 |
| --- | --- | --- | --- | --- |
| A1 | passed | brief.md | A1 打开「长篇音乐」工作区，歌曲设置区出现「演唱语言」选择器，默认「中文」，可切换为「English」；切换后重新进入页面仍保持所选值（localStorage 持久化，存储原值 `'zh'`/`'en'`），「重置歌曲」后回退为默认「中文」。 | 源码 src/components/Music3Workspace.tsx:9 `type Music3Language = 'zh' \| 'en'`；:10 Draft 增加 language 字段；:12 fresh() -> language:'zh'；:13 load() = { ...fresh(), ...stored, language: stored.language === 'en' ? 'en' : 'zh' }（缺省/未知值均归一化为 'zh'）；:102 useEffect 写 localStorage（键 'minimax.music3-workspace'）；:170 <select id="music3-language">，option 恰为 {value:'zh',text:'中文'} 与 {value:'en',text:'English'}；:184 「重置歌曲」-> setDraft(fresh())。实机 CDP（Electron + Vite 127.0.0.1:5199，我的独立脚本 /tmp/verifier-m3zh-r2/walkthrough-r2.cjs，非复用 Builder 脚本）：进入「音乐 · Music 3」后 select 位于 .music3-song-setup（歌曲设置）区块内、label 文本为「演唱语言」、初值 'zh'；切到 'en' 后 localStorage 原文写入 "language":"en"（未写入中文显示值）；location.reload() 并重新进入工作区后 select 仍为 'en'；点击「重置歌曲」后回到 'zh' 且存储为 "language":"zh"。截图 /tmp/oyama-cdp/music3-zh-selector.png 可见歌曲设置区的「演唱语言」下拉默认显示「中文」。切换语言不影响其它草稿字段。 |
| A2 | passed | brief.md | A2 语言「中文」时，caption 为独立 `### Vocal Language` 段、正文一行 `Vocal language: Mandarin Chinese`、位于 `### Global Metadata` 与 `### Vocal Details` 之间（`pnpm test:music3-vocabulary` 断言机器可验）；语言「English」时该行为 `Vocal language: English`；两种情况下 lyrics 文本原样保留、不被改写。 | 源码 src/lib/music3Workflow.ts:29 MUSIC3_LANGUAGE_LINES = { zh: 'Vocal language: Mandarin Chinese', en: 'Vocal language: English' }；:31-38 buildMusic3Caption 返回 4 段（以 '\n\n' 连接），顺序固定 Global Metadata -> Vocal Language -> Vocal Details -> Arrangement，语言取 sections.language ?? 'zh'；:19 lyrics 与 caption 是 MiniMaxMusic3TextEncode 的两个独立输入。机器验证（我自己重跑）：pnpm test:music3-vocabulary PASS，断言段数=4、sections[1] 以 '### Vocal Language\nVocal language: ' 开头、zh 段为 '### Vocal Language\nVocal language: Mandarin Chinese\n\n### Vocal Details'（位置在 Global Metadata 与 Vocal Details 之间）、en 段为 'Vocal language: English'、缺省回退 zh、且 caption 提示词层无中文字符。实机 DOM：caption 预览 pre（与 onGenerate 传入的 caption 同变量）在 zh 下含 '### Vocal Language\nVocal language: Mandarin Chinese\n\n### Vocal Details'，切 en 后含 'Vocal language: English'，两态 caption 均零中文字符。lyrics 原样保留：向歌词框写入 65 字符含中英混合与 [Verse]/[Chorus] 标签的歌词后，zh 与 en 两态下 textarea 值逐字节相同（equal=true），且歌词文本与段落标签均不出现在 caption 中（lyrics-not-in-caption）。 |
| A3 | passed | brief.md | A3 声音预设面板出现 6 个中文向预设（华语流行、国风·古风、中文民谣、中文说唱、中文 R&B、中文摇滚），排列在预设列表最前（置顶）；点击任一预设完整填充流派/BPM/调性/情绪走向/全局风格描述（metadata）/人声/编曲七个字段；点击后高亮（activePreset）指向所点预设本身，不与既有 34 个预设互串；生成时这些字段写进 caption 的仍是英文原值（界面显示中文标签，分层不变）。 | 置顶与计数：源码 src/components/Music3Workspace.tsx:22-27 的 6 个中文预设就是 musicPresets 数组前 6 个元素，其后 :28-61 为既有 34 个；实机 DOM .music3-preset-grid 恰含 40 个按钮、面板标题「40 个预设」、前 6 张卡依次为 华语流行/国风·古风/中文民谣/中文说唱/中文 R&B/中文摇滚（截图 /tmp/oyama-cdp/music3-zh-presets.png）。防撞（我独立重算，未采信 Builder 结论）：用 TypeScript AST 从 TSX 重新提取 musicPresets 字面量得 40 条，按 :147 activePreset 实际使用的 5 字段键（genre+bpm+key+vocals+arrangement）两两比对，40x40 碰撞数 0；模拟 .find() 对每个预设求值，误配 0（每个预设 find 到自身）；重复 title 0；全部 40 条预设的 7 个字段（genre/bpm/key/progression/metadata/vocals/arrangement）齐全。同流派审计：Mandopop/Chinese traditional/Folk/Hip-hop 与既有预设无共享；中文 R&B 与「午夜 R&B」在 bpm(72/76)/key(E♭ major/F# minor)/vocals/arrangement 上均不同；中文摇滚 与「竞技场摇滚」在 vocals('bright tenor lead, wide octave doubles' vs 'raspy baritone, wide octave doubles') 与 arrangement 上不同 —— 每例至少一个被匹配字段取值不同，满足 brief 防撞约束。实机逐个点击 6 个中文预设：每次都完整填入 7 个英文原值（如 华语流行 -> genre 'Mandopop'、bpm 100、key 'C major'、progression 'verse intimacy, pre-chorus expansion, anthemic chorus, stripped bridge'、metadata 'radio-ready modern master, heartfelt vocal-forward mix, warm polished low end'、vocals 'warm alto lead, stacked chorus harmonies'、arrangement 'piano-led verses, wide string swells, side-chained bass pulse'），且 .music3-preset-grid button.selected 恒为且仅为所点那一个（6 次分别为 ['华语流行']、['国风·古风']、['中文民谣']、['中文说唱']、['中文 R&B']、['中文摇滚']），不与既有 34 个互串。分层不变：caption 始终携带英文原值（Mandopop / Chinese traditional / Folk / Hip-hop / R&B / Rock 与英文调性）且零中文字符，界面则显示中文标签（now-playing 分别为 华语流行/国风·古风/民谣/嘻哈/节奏布鲁斯/摇滚）；全部 40 个预设 x 提示词层字段扫描 CJK 命中 0。新流派双导出齐备：music3Genres 含 'Mandopop' 与 'Chinese traditional'，music3GenreLabels 映射为 华语流行 / 国风·古风，datalist #music3-genres 确实包含两者且 label 为中文（DOM 实测）。点击预设不改动歌词（6 次 lyricsUnchanged=true）。 |
| A4 | passed | brief.md | A4 加载不含 `language` 字段的旧 localStorage 草稿不报错，语言回退为「中文」。 | 源码 src/components/Music3Workspace.tsx:13 load() = { ...fresh(), ...stored, language: stored.language === 'en' ? 'en' : 'zh' }：旧草稿缺 language 键时取 fresh().language='zh'，任何未知存储值也归一化为 'zh'，无需迁移脚本、不新增存储键。实机 CDP：向 localStorage 键 'minimax.music3-workspace' 写入一份不含 language 字段的旧式草稿（含 metadata/vocals/arrangement/lyrics '旧草稿歌词'/duration/seed/tiledDecode/autoSuggest/genre 'Pop'/bpm 120/key 'C major'/progression），location.reload() 后重新进入 Music 3 工作区——工作区正常挂载无报错，select 存在且值为 'zh'（显示「中文」），草稿被回写为含 "language":"zh"，既有字段完整（lyrics 逐字节等于 '旧草稿歌词'），caption 走 zh 语言段（'Vocal language: Mandarin Chinese'）。异常审计：整个会话我开启 CDP Runtime.enable + Log.enable 并持续监听 Log.entryAdded（level=error）与 Runtime.exceptionThrown，包括载入旧草稿那次 reload —— console error 0 条、runtime 未捕获异常 0 条。 |

## 检查

| 检查 | 命令 | 工作目录 | 状态 | 退出码 | 耗时 |
| --- | --- | --- | --- | ---: | ---: |
| TypeScript 类型检查（src/ + electron tsconfig） | -c PATH=/Users/dawo/.local/share/nodejs/node-v26.12.1-darwin-arm64/bin:$PATH pnpm typecheck | . | passed | 0 | 5051 ms |
| ESLint 检查（--max-warnings 0） | -c PATH=/Users/dawo/.local/share/nodejs/node-v26.12.1-darwin-arm64/bin:$PATH pnpm lint | . | passed | 0 | 2022 ms |
| 单元与集成测试链（含 Music 3 语言段断言与提示词 parity） | -c PATH=/Users/dawo/.local/share/nodejs/node-v26.12.1-darwin-arm64/bin:$PATH pnpm test | . | passed | 0 | 7277 ms |
| 渲染进程构建（vite build） | -c PATH=/Users/dawo/.local/share/nodejs/node-v26.12.1-darwin-arm64/bin:$PATH pnpm build:web | . | passed | 0 | 1503 ms |
| Electron 主进程构建（tsc -p tsconfig.electron.json） | -c PATH=/Users/dawo/.local/share/nodejs/node-v26.12.1-darwin-arm64/bin:$PATH pnpm build:electron | . | passed | 0 | 634 ms |
| Music 3 双语层与演唱语言段断言 | -c PATH=/Users/dawo/.local/share/nodejs/node-v26.12.1-darwin-arm64/bin:$PATH pnpm test:music3-vocabulary | . | passed | 0 | 262 ms |

### Builder 报告的证据

以下为 Builder 报告，不等同于 Runtime 检查凭据或独立验收结果。

- pnpm test:prompt-parity: passed — 16 个捕获段与新基线 6a600eb625d530f5d4694f766e5d2c6c0e8d4956 逐字节一致（PASS: prompt parity — 16 capture sections byte-identical to baseline 6a600eb...）
- pnpm test:locale: passed — locale audit 0 处问题；扫描 4292 条界面文案、755 条提示词/存储位
- scripts/capture-prompt-parity.cjs --force --baseline 6a600eb...: passed — 从 6a600eb 重新生成 fixture，脚本内 clean-tree 守卫通过（cleanTreeVerified: true）；产物相对上一版仅 _meta.baseline 一行变化，capture 段内容未变
- 实机 CDP 走查（17 项，本候选 ec651ab 重跑）: passed — /tmp/oyama-cdp/music3-zh-5199.cjs：进入 Music 3 工作区、A1 四项、A2 两项、A3 十项、A4 一项全部 PASS
- git diff 6a600eb -- src electron: passed — 输出为空：本轮只动 scripts/ 下的基线与钉住守卫，src/ 与 electron/ 未变，A1-A4 实现不受影响
- 已知限制: 未做真实生成验证：本次只验证到 caption 文本与工作区交互层，未向 GB10 的 ComfyUI 提交一次实际 Music 3 生成来听辨中文咬字（需用户授权提交探针工作流，且会占用 GPU）
- 已知限制: zh 一律按 'Mandarin Chinese'（普通话）咬字，粤语歌词也会被普通话处理——按已确认 Shape 登记为非目标，不作为缺陷
- 已知限制: 提示词层仍为英文（显示层中文、提示词层英文的分层未变），故本次未新增中文提示词词表
- 已知限制: prompt-parity 基线现钉在 6a600eb（即 Music 3 中文支持那次提交）。此后任何改动 Music 3 caption 的提交都会让该基线失配，需按 57bfc0a 的方式再做一次有意的 re-pin——这是该门禁的既有设计，不是本次引入的负担

## 阻塞项

_无。_

## 风险与跳过的工作

- 未做真实生成验证：只验证到 caption 字符串契约与工作区交互层，未向 GB10 上真实运行的 ComfyUI 提交一次 MiniMax Music 3 生成来听辨中文咬字（需用户授权提交探针并占用 GPU）。'Vocal language: Mandarin Chinese' 对实际演唱发音的最终效果未经验证。这在 A1-A4 验收范围之外，但用户确认时应知悉。
- src/lib/music3Workflow.ts:34 的 MUSIC3_LANGUAGE_LINES[sections.language ?? 'zh'] 对联合类型之外的值没有兜底：若将来有调用方绕过 TS 类型传入非法值，caption 会写入字面量 'undefined'。当前不可达——唯一调用点 Music3Workspace.tsx:99 传入 draft.language，而它在读取时（:13）与选择时（:170）均已归一化。
- activePreset（Music3Workspace.tsx:147）只按 5 字段匹配、忽略 metadata/progression；若用户手工把这两项改成另一预设的值，高亮可能移动。当前无实际影响（已证明 40 个预设的 5 字段键两两互异，两个预设不会共享高亮），但手工编辑仍可能把高亮带到无关预设上。
- 提交 6a600eb 在 Music 3 功能之外同时修改了 .gitignore（新增 Comet 管理的 runtime 路径如 **/comet/changes/*/runtime 与 .comet-state.lock），把工作流工具状态混入了产品功能提交。超出 A1-A4 范围，但归档前值得知悉。
- 本轮重新钉住的 prompt-parity 基线在出处上已是真实捕获（我已用 git archive 抽出 6a600eb 原始树独立跑 capture() 证明与 fixture 逐字节一致），但基线本身因此前移到了 6a600eb：它包含本次有意变更的 music3Caption 语言段。因此该 fixture 从此只能发现比本次更晚的 prompt 回归，不能再用于回溯证明 6a600eb 之前的 prompt 输出。
- docs/comet/changes/ 目前在 git 中仍是未跟踪状态（live change 产物未入库）。若项目约定要求归档时把产物提交，需要在归档步骤处理；本轮为只读会话，未做任何提交。

## 之前的迭代

| 目标周期 | 迭代 | 尝试 | 结果 | 未解决项 | 摘要 | 完成时间 |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 1 | 1 | pass | — | 四项验收项全部独立取证通过。A1：「演唱语言」select 位于「歌曲设置」/music3-structure-controls 区块内，默认中文，以原始值 'zh'/'en' 持久化到 localStorage 键 'minimax.music3-workspace'，刷新后保持，「重置歌曲」回到中文。A2：buildMusic3Caption 输出独立的 '### Vocal Language' 段，固定在 '### Global Metadata' 与 '### Vocal Details' 之间，zh 为 'Mandarin Chinese'、en 为 'English'、缺省 zh；lyrics 走独立通道，从不作为 buildMusic3Caption 的参数，字段内容逐字节不变且不出现在 caption 中。A3：6 个中文预设确为 40 个预设的前 6 位，逐个点击都填入 7 个英文原值字段，高亮精确指向被点中的预设 —— 我独立重算全部 40 个预设的 5 字段键，碰撞数 0、误配 0；caption 始终携带英文原值、无中文，新流派同时存在于 music3Genres 与 music3GenreLabels，且 music3Genres 确为 datalist 数据源。A4：不含 language 键的旧草稿正常载入并回退中文，无 console 错误、无 runtime 异常。我另行独立确认候选 6a600eb（工作树干净）上 pnpm typecheck、pnpm lint、pnpm test:music3-vocabulary、pnpm test:prompt-parity、pnpm test:locale 均通过；按协调方约束未重跑任何构建，并确认 dist/ 近 6 小时内 0 个文件被改动，Runtime 的构建收据未漂移。唯一值得处理的缺陷在 A1-A4 之外：prompt-parity fixture 被手工编辑却仍保留钉在旧 ref 的 _meta，应改为按流程重新钉住。 | 2026-11-16T00:07:10.370Z |
| 1 | 1 | 1 | recovery | — | The user rejected the Skill-coordinated Verifier pass. | 2026-11-16T00:11:41.150Z |
| 1 | 2 | 1 | pass | — | 第 2 轮独立只读验收：候选 ec651ab 的 A1-A4 全部通过，且本轮新增的 prompt-parity 重新钉住经我独立取证确认是真实捕获而非二次手工打补丁。我用自写 CDP 脚本（/tmp/verifier-m3zh-r2/walkthrough-r2.cjs）在真实 Electron 渲染进程（Vite 127.0.0.1:5199，CDP 9333）上跑了 46 项断言，全部 PASS，全程 Log.entryAdded error 0 条、Runtime.exceptionThrown 0 条：A1 选择器/默认值/选项/持久化原值 en/刷新保持/重置回退 zh 全部实测通过；A2 zh 与 en 两态 caption 的独立 '### Vocal Language' 段与段位置实测正确、caption 零中文、歌词 65 字符逐字节不变且不出现在 caption；A3 40 预设前 6 位为 6 个中文预设、逐个点击填满 7 字段且高亮唯一指向自身、界面中文标签而 caption 为英文原值、新流派双导出齐备；A4 无 language 的旧草稿载入回退 zh 且无报错。我另用 TypeScript AST 独立重算防撞：40×40 的 5 字段键碰撞 0、find() 误配 0，同流派复核每例至少一个被匹配字段不同。重新钉住核验：fixture _meta.baseline = 6a600eb625d530f5d4694f766e5d2c6c0e8d4956、cleanTreeVerified true，test-prompt-parity.cjs:50 与 capture-prompt-parity.cjs:20 的钉住值一致，git diff --quiet 6a600eb -- src electron 为空（src/electron 零改动），fixture 的 music3Caption 含 '### Vocal Language'；最关键的是我用 git archive 抽出 6a600eb 的原始树到 /tmp 独立跑 harness capture()，结果与 ec651ab 提交的 fixture 逐字节一致（canonical 与 raw JSON.stringify 双通过），证明第 1 轮指出的『手工编辑 fixture 却保留旧 _meta』这一出处缺陷已被按流程真正修复。定向检查我自己重跑：pnpm typecheck exit 0、pnpm lint exit 0、pnpm test exit 0（29 套全 PASS，含 test:music3-vocabulary 与 test:prompt-parity）、pnpm test:prompt-parity PASS（16 段逐字节一致）。按约束未运行 build:web / build:electron，改以读取 Runtime 的 6 条检查日志并逐一核对 sha256（全部与记录的 logSha256 一致）作为凭据，6 项 status=passed、exitCode=0、inputBefore==inputAfter 无漂移。结论：verdict pass，无阻塞项；遗留风险仅为未做真实端到端生成听辨（超出 A1-A4 范围）等条目，已在 risks 中如实登记。 | 2026-11-16T00:30:13.222Z |



## 结论

第 2 轮独立只读验收：候选 ec651ab 的 A1-A4 全部通过，且本轮新增的 prompt-parity 重新钉住经我独立取证确认是真实捕获而非二次手工打补丁。我用自写 CDP 脚本（/tmp/verifier-m3zh-r2/walkthrough-r2.cjs）在真实 Electron 渲染进程（Vite 127.0.0.1:5199，CDP 9333）上跑了 46 项断言，全部 PASS，全程 Log.entryAdded error 0 条、Runtime.exceptionThrown 0 条：A1 选择器/默认值/选项/持久化原值 en/刷新保持/重置回退 zh 全部实测通过；A2 zh 与 en 两态 caption 的独立 '### Vocal Language' 段与段位置实测正确、caption 零中文、歌词 65 字符逐字节不变且不出现在 caption；A3 40 预设前 6 位为 6 个中文预设、逐个点击填满 7 字段且高亮唯一指向自身、界面中文标签而 caption 为英文原值、新流派双导出齐备；A4 无 language 的旧草稿载入回退 zh 且无报错。我另用 TypeScript AST 独立重算防撞：40×40 的 5 字段键碰撞 0、find() 误配 0，同流派复核每例至少一个被匹配字段不同。重新钉住核验：fixture _meta.baseline = 6a600eb625d530f5d4694f766e5d2c6c0e8d4956、cleanTreeVerified true，test-prompt-parity.cjs:50 与 capture-prompt-parity.cjs:20 的钉住值一致，git diff --quiet 6a600eb -- src electron 为空（src/electron 零改动），fixture 的 music3Caption 含 '### Vocal Language'；最关键的是我用 git archive 抽出 6a600eb 的原始树到 /tmp 独立跑 harness capture()，结果与 ec651ab 提交的 fixture 逐字节一致（canonical 与 raw JSON.stringify 双通过），证明第 1 轮指出的『手工编辑 fixture 却保留旧 _meta』这一出处缺陷已被按流程真正修复。定向检查我自己重跑：pnpm typecheck exit 0、pnpm lint exit 0、pnpm test exit 0（29 套全 PASS，含 test:music3-vocabulary 与 test:prompt-parity）、pnpm test:prompt-parity PASS（16 段逐字节一致）。按约束未运行 build:web / build:electron，改以读取 Runtime 的 6 条检查日志并逐一核对 sha256（全部与记录的 logSha256 一致）作为凭据，6 项 status=passed、exitCode=0、inputBefore==inputAfter 无漂移。结论：verdict pass，无阻塞项；遗留风险仅为未做真实端到端生成听辨（超出 A1-A4 范围）等条目，已在 risks 中如实登记。
