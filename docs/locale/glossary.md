# 术语表（docs/locale/glossary.md）

界面术语的唯一口径来源。`scripts/locale-audit.cjs` 按此表执行术语检查：改表即可改检查规则。
每条一行：`英文 | 中文 | 类别 | 备注`，类别取值：

- `translate` — 译成中文。界面文案中出现其未译英文形式即报错（词边界匹配，大小写不敏感）。
- `keep` — 保留英文。自动豁免漏译检查（英文 token 白名单）；出现时写法必须与本表一致（大小写与连字符敏感）。
- `data` — 不翻译。仅标注用户数据来源，实际判定由 `keep-english.md` 负责。

## 全局排版规则

- 中英混排时，中文与英文、数字之间统一加一个空格（如 `Turbo 8 模式`）。审计检查此条。
- 品牌与型号一律保留英文，不译不注。
- `beat` 一律译作「节拍」，不译作「情节点」。

## 术语

### 核心术语

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| prompt | 提示词 | translate | |
| render | 渲染 | translate | |
| seed | 种子 | translate | |
| scene | 场景 | translate | |
| beat | 节拍 | translate | 不译「情节点」 |
| shot | 镜头 | translate | |
| shot size | 景别 | translate | |
| camera angle | 机位角度 | translate | |
| camera movement | 运镜 | translate | |
| clip | 片段 | translate | |
| continuity | 连贯性 | translate | |
| keyframe | 关键帧 | translate | |
| first frame | 首帧 | translate | |
| last frame | 尾帧 | translate | |
| take | 条 | translate | 拍摄条数 |
| image | 图片 | data | 通用名词；英文形式常见于文件名（`z_image_*.safetensors`）与引擎侧编号（`Image 1–5`），不做漏译判定 |
| latent | 潜空间 | data | LTX 2.5 的放大选项；英文形式常见于文件名（`latent_upscale_models`），不做漏译判定 |
| VRAM | 显存 | translate | 通用硬件名词，不属品牌/型号，不按 keep 处理 |
| identity survey | 身份巡检 | translate | Ref2VA 身份巡检的正式名，与 turntable→巡检、angle survey→角度巡检配套；曾漂成「形象巡检」 |
| isolated | 独立 | translate | 配饰/服装工作室的单品参考图语境，不译「隔离」 |
| workflow sections | 工作流分区 | translate | WorkspaceSectionTabs 的 aria-label（H3 与角色工作区共用），防再译成「工作区」 |

### 摄影枚举取值

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| wide shot | 全景 | translate | |
| medium shot | 中景 | translate | |
| close-up | 近景 | translate | |
| extreme close-up | 特写 | translate | |
| full body | 全身 | translate | |
| full-body | 全身 | translate | 存储值形式 |
| cowboy shot | 七分身 | translate | |
| over-the-shoulder | 过肩 | translate | |
| eye level | 平视 | translate | |
| low angle | 仰拍 | translate | |
| high angle | 俯拍 | translate | |
| overhead | 顶视 | translate | |
| dutch angle | 斜角 | translate | |
| profile | 侧面 | translate | |
| three-quarter | 四分之三侧 | translate | |
| locked-off camera | 固定机位 | translate | |
| slow pan | 慢摇 | translate | |
| tracking shot | 跟拍 | translate | |
| handheld camera | 手持 | translate | |
| racking focus | 变焦对焦 | translate | |
| whip pan | 甩镜 | translate | |
| steadicam | 斯坦尼康 | translate | |
| dolly zoom | 眩晕镜头 | translate | |

### 工作区与应用内定名（批次 1 定，后续批次沿用）

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| location | 地点 | translate | 工作区名用「地点」，避开 scene→场景 |
| scratchpad | 草稿本 | translate | |
| clip master | 片段工坊 | translate | |
| queue | 队列 | translate | |
| video library | 视频库 | translate | |
| movie editor | 影片剪辑 | translate | |
| reference prep | 参考图准备 | translate | |
| characters | 角色 | translate | 侧栏/页签语境 |
| hair | 发型 | translate | 工作区语境 |
| wardrobe | 服装 | translate | 工作区语境 |
| accessories | 配饰 | translate | 工作区语境 |
| create image | 生成图片 | translate | 工作区名「生成图片 · Z-Image」；不写「创建图片」 |

### 提示词预设分类（`src/lib/promptPresets.ts` 的 `promptPresetCategories`）

这一组是**提示词创作分类名**，与上表的通用词义不同，按本表走，不得回改上表：

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| camera | 镜头 | data | 相机类预设 |
| shot | 景别 | data | 该分类下是取景预设，与上表 `shot size` 同义 |
| movement | 表演 | data | 该分类下是人物表演动作（Listening Reaction 等） |
| location | 场景 | data | 该分类写的是提示词段落；工作区名仍用「地点」 |

`data` 行只作口径登记，不参与漏译与术语检查（与「身份参考角色」表同理）。

### 身份参考角色（data：英文为提示词层，显示层用中文）

`src/lib/promptComposer.ts` 的 `identityReferenceRole` 是提示词层英文短语（进入 `Character:` 提示词行），
`identityReferenceRoleLabel` 是对应的界面显示文本。英文形式保持不变，不参与漏译与术语检查。

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| master identity | 主参考 | data | 存储值 `master` |
| face close-up | 面部特写 | data | 存储值 `face` |
| full body | 全身 | data | 存储值 `full-body` |
| three-quarter view | 四分之三侧 | data | 存储值 `three-quarter` |
| profile view | 侧面 | data | 存储值 `profile` |
| back view | 背面 | data | 存储值 `back` |
| identity detail | 特征细节 | data | 存储值 `detail` |
| other angle | 其他角度 | data | 存储值 `other` |

### 采样档位与配置档

同一个英文档位名在不同设置里指的是不同档，逐条对应，不要混用：

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| native quality | 原生画质 | translate | `turbo: 'off'` 的采样档 |
| native sampling | 原生采样 | translate | 渲染方案里的加速项 |
| native model defaults | 模型默认 | translate | Sigma 偏移的「模型默认」选项 |
| quality | 画质 | translate | 原生全画质采样 |
| fast | 极速 | translate | FastVideo FastH3 采样档与文本编码器档；镜头速度档另作「快速」 |
| balanced | 均衡 | translate | Turbo 8 配置档；参考图保真度档 |
| stable | 稳定 | translate | Turbo 8 配置档 |
| motion | 运动 | translate | Turbo 8 配置档 |
| maximum identity | 最大身份保留 | translate | 参考图保真度档 |
| match output | 均衡 | translate | 参考图保真度档（`refImageSize: 'match'`） |
| recommended | 推荐 | translate | 诊断列表与推荐项 |
| draft | 草稿 | translate | 草稿本与未提交的片段草稿 |

### 界面短语（多词短语）

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| clip duration | 片段时长 | translate | |
| test connection | 测试连接 | translate | |
| factory reset | 恢复出厂设置 | translate | |
| custom node | 自定义节点 | translate | ComfyUI 插件 |
| production command | 制作指令 | translate | 提示词编辑框的 `//` 指令 |
| character studio | 角色工作室 | translate | 工作区名 |
| scene direction | 场景指令 | translate | |
| picture number | 图片序号 | translate | 帧锚定错误里的序号 |
| placement diagnostic | 放置诊断 | translate | GPU 放置诊断 |
| correctness gate | 正确性校验 | translate | Sol 稀疏注意力校验 |
| frame anchor | 帧锚定 | translate | |
| desktop app | 桌面应用 | translate | |
| local ai | 本地 AI | translate | |
| turntable | 巡检 | translate | Ref2VA 身份 / 角度巡检；与 `App.tsx`、`CharacterStudio` 既有「巡检」口径一致。注意与 `turnaround`（角色全身转面）区分 |
| angle survey | 角度巡检 | translate | Ref2VA 角度巡检选项 |
| dismiss | 忽略 | translate | 建议/提示条的操作按钮；「关闭」留给 close |
| replace | 替换 | translate | 替换已选内容；「更换」留给 change（如 Change source→更换来源） |
| use suggestion | 使用建议 | translate | 本地建议卡的主操作按钮 |
| reference only | 仅参考 | translate | 场景参考的引导模式（SceneComposer 复选框、LibraryView「仅参考 · 重新取景」、MovieEditor「仅参考引导」同名）；复数派生词均以此为定语 |
| character detail references | 角色细节参考图 | translate | 设置开关与角色工作室区块同名（区块 aria/id 为 character-detail-references） |
| chunk | 分块 | translate | LTX Ripple 长视频分块（Chunk length→分块长度）；报错文案曾误作「分段」 |
| refine（提示词润色语境） | 润色 | translate | 本地 LLM 润色提示词/音乐方向；与图像精修动作「精修」区分（refine 行仍指图像精修） |
| generation defaults | 生成默认值 | translate | 设置页区块名 / 侧栏 / App 提示三处统一 |
| browser profile | 浏览器配置文件 | translate | 迁移恢复文案；应用内 profile 统一「配置文件」 |
| runtime capability gate | 运行时能力门槛 | translate | GPU 路由面板；不译「闸口」 |
| opening frame（口语说明语境） | 开场画面 | translate | 「让一张开场画面动起来」等口语语境；报错文案的帧锚定语境仍用「开场帧」 |
| walkthrough | 漫游 | translate | 地点漫游视频；仅自然地形变体另用「勘景」 |
| still frame | 静帧 | translate | 与 `App.tsx` 既有「静帧」一致；「定格」留给 Settle at End 的「结尾定格」 |
| assembly & canonical sources | 保留属性与归属 | translate | SceneComposer 角色属性来源区块，SceneIssues 帮助文案按此名称引用 |
| assigned reference set | 已指派的参考图组 | translate | SceneComposer 参考卡下拉；SceneIssues 提示引用同一名称 |

### 全局排版规则补充（zh-locale-revision 轮定）

- 省略号统一为单字符 `…`，不用全角双写 `……`。
- 建议卡操作按钮统一「忽略 / 使用建议」；替换类按钮统一「替换」，变更类保留「更换」。

### 影片剪辑 / 片段工坊 / 音乐工作区（批次 7 定）

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| media pool | 素材池 | translate | 影片剪辑面板 |
| program monitor | 节目监视器 | translate | 影片剪辑面板，与「检查器」成对 |
| inspector | 检查器 | translate | 影片剪辑面板 |
| playhead | 播放头 | translate | 时间轴 |
| timeline height | 时间轴高度 | translate | 影片剪辑 |
| ripple edit length | Ripple 编辑长度 | translate | LTX Ripple 时长选择器 aria-label |
| preview source | 预览来源 | translate | 实时预览来源选择 |
| tempo presets | 节奏预设 | translate | Music 3 BPM 快捷档 |
| frame timeline | 帧时间线 | translate | 片段工坊 |
| import media | 导入素材 | translate | 影片剪辑 / 片段工坊 |
| export new clip | 导出新片段 | translate | 片段工坊 |
| no clip at playhead | 播放头处没有片段 | translate | 影片剪辑 |
| pipeline ready | 管线就绪 | translate | Music 3 / 视频管线就绪提示 |

### 场景工作区 / 角色工作区（批次 4b 定）

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| reference inputs | 参考输入 | translate | |
| clear shot references | 清空镜头参考 | translate | |
| approved image | 已确认图片 | translate | |
| approved view | 已确认视图 | translate | |
| scene media | 场景媒体 | translate | |
| edit clip | 剪辑片段 | translate | |
| remove from this shot | 从本镜头移除 | translate | |
| edit in inspector | 在检查器中编辑 | translate | |
| preserve from source | 从来源保留 | translate | |
| use recommended | 使用推荐 | translate | |
| advanced reference details | 高级参考详情 | translate | |
| observed source details | 观察到的来源细节 | translate | |
| composition locks | 构图锁定 | translate | |
| use embedded ambience as a reference | 把内置环境声用作参考 | translate | |
| video audio | 视频音频 | translate | |
| audio mapping | 音频映射 | translate | |
| sound characteristics | 声音特征 | translate | |
| continuity & locks | 连贯性与锁定 | translate | |
| require frame 0 anchor | 要求帧 0 锚定 | translate | |
| continuity notes | 连贯性备注 | translate | |
| axis locked | 轴线已锁定 | translate | |
| reference analysis | 参考图分析 | translate | |
| retained details | 保留的细节 | translate | |
| h3 mapping | H3 映射 | translate | |
| ref2va direction | Ref2VA 方向 | translate | |
| frame conditioning | 帧约束 | translate | |
| video role | 视频角色 | translate | |
| ending frame anchor | 尾帧锚定 | translate | |
| timed keyframe anchor | 定时关键帧锚定 | translate | |
| shot action | 镜头动作 | translate | |
| from scene | 取自场景 | translate | |
| opening frame | 开场帧 | translate | |
| video compare | 视频对比 | translate | |
| side by side | 并排查看 | translate | |
| reveal bar | 揭示条 | translate | |
| in point | 入点 | translate | |
| out point | 出点 | translate | |
| reference clip | 参考片段 | translate | |
| primary image | 主图 | translate | |
| confirmed reference image | 已确认参考图 | translate | |
| prompt workspace | 提示词工作区 | translate | |
| delivery (tone) | 语气 | translate | |

### 运行时与设置文案（批次 9 定）

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| LAN companion | 局域网伴侣 | translate | 手机端入口文案 |
| Reference workspace | 参考工作区 | translate | |
| Character library | 角色库 | translate | 与「角色工作室」区分 |
| refine | 精修 | translate | 图像精修动作 |
| shot timing | 镜头时序 | translate | |
| audio pass | 声音处理 | translate | 音频处理轮次 |
| insert template | 插入模板 | translate | 提示词插入模板 |
| clothing intent | 服装意图 | translate | |
| reference fidelity | 参考图保真度 | translate | 与采样档 `balanced`/`maximum identity` 同指一档但词面不同 |
| assigned wardrobe | 指定服装 | translate | 提示词层的「assigned wardrobe is mandatory…」保持英文 |
| underwear | 内衣 | translate | 服装清单条目 |
| unrestricted | 不受限 | translate | 内容限制档位 |
| render quality | 渲染画质 | translate | |
| duration | 时长 | translate | 片段 / 音频时长 |
| save & refresh | 保存并刷新 | translate | 设置页主按钮（批次 8b） |
| apply to create | 应用到创作 | translate | 生成默认值 → 创作工作区（批次 8b） |
| rescan | 重新扫描 | translate | 与「测试连接」同组按钮（批次 8b） |
| intent | 意图 | translate | Ref2VA 渲染意图（批次 8b） |
| resolved | 解析为 | translate | GPU 路由行「解析为：ComfyUI 默认」（批次 8b） |

### 续接工作区（批次 5 定）

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| continuation | 续接 | translate | 工作区语境；`Continue workspace` 作「续接工作区」 |
| original clip | 原始片段 | translate | 续接来源横幅与时间线 |
| hard cut | 硬切 | translate | 节拍间切换 |
| frame continuity | 帧连贯性 | translate | 来源横幅、导入卡片 |
| motion context | 运动上下文 | translate | 高级连贯性、来源卡片 |
| chosen frame | 所选帧 | translate | 高级连贯性 |
| source frame | 来源帧 | translate | 高级连贯性 |
| seam blend | 接缝混合 | translate | 高级连贯性 |
| cut between beats | 节拍间切换 | translate | 节拍编辑器 |
| cut inside this beat | 节拍内切换 | translate | 节拍编辑器 |
| incoming source | 传入来源 | translate | 节拍编辑器 |
| sequence queue | 序列队列 | translate | 续接工作区 |
| sequence player | 序列播放器 | translate | 续接工作区 |
| sequence and continuity | 序列与连贯性 | translate | 续接工作区 |
| carry audio across joins | 跨衔接保留音频 | translate | 高级连贯性 |
| shot design | 镜头设计 | translate | 节拍编辑器 |
| camera detail | 机位细节 | translate | 节拍编辑器 |
| additional direction | 补充指令 | translate | 节拍编辑器 |
| reference changes | 参考图替换 | translate | 高级连贯性 |
| inherit | 继承 | translate | 景别／机位／运镜下拉 |
| untitled render | 未命名渲染 | translate | 来源选择器，与 `src/lib/jobPresentation.ts` 口径一致 |
| finished render | 已完成的渲染 | translate | 来源选择器 |
| resume sequence | 继续生成全部 | translate | 序列队列条 |
| generate remaining | 生成剩余节拍 | translate | 序列队列条 |
| incoming clip | 传入来源 | translate | 节拍编辑器 |
| outgoing clip | 下一片段 | translate | 节拍编辑器 |
| replacement role | 替换角色 | translate | 参考图替换；具体角色（角色／服装／地点／道具）见 `replacementRoleLabels` |

### 分辨率与画幅（代码内直接给出中文标签，无英文原文）

`src/lib/ltx25Resolutions.ts` 的 `ltx25ResolutionLabel` 按像素数分档，直接返回中文，不对应任何英文原文：

| 像素区间 | 中文 |
| --- | --- |
| ≥ 2.0 MP | 最高画质 |
| ≥ 1.5 MP | 高画质 |
| ≥ 1.0 MP | 均衡画质 |
| 其余 | 标准画质 |
| 1056×608 / 1216×512 | 推荐 · 兼顾画质与速度 |

画幅方向（`LTX25_RESOLUTIONS` 的键）是存储值，界面显示中文。视频画幅方向在全应用统一用一套词：

| 存储值 | 中文 | 用在哪 |
| --- | --- | --- |
| landscape | 横屏 | H3 分辨率下拉（`src/lib/videoResolutions.ts`、App.tsx 的 optgroup）、`RenderSize.tsx` 与 `Ltx25Workspace.tsx` 的方向下拉 |
| ultrawide | 超宽 | 同上 |
| portrait | 竖屏 | 同上 |
| square | 方形 | 同上 |

Z-Image 的**图片**画幅是另一套词表（`RenderSize.tsx` 的 `imageRatioLabel`），因为它描述的是相片比例而不是视频方向：
宽屏 · 16:9 / 照片横向 · 3:2 / 传统横向 · 4:3 / 方形 · 1:1 / 竖幅 · 4:5 / 传统竖幅 · 3:4 / 照片竖幅 · 2:3 / 竖屏 · 9:16。

### 音乐术语（音乐引擎显示层）

Music 3 的流派、调性、情绪走向、关键词与风格描述预设既是界面上的可选项，也是写进提示词的英文原值。
按「显示 / 提示词分层」规则：提示词层保留英文（`src/lib/music3Vocabulary.ts` 里的 `music3*` 值列表），
显示层给中文（同一模块里的 `music3*Labels` 映射表）。`scripts/test-music3-vocabulary.cjs` 校验两侧一一对应。

调性 / 音阶的显示写法：`C major` → `C 大调`、`C# minor` → `C# 小调`、`D Dorian` → `D 多利亚`、
`E Phrygian` → `E 弗里吉亚`、`G Mixolydian` → `G 混合利底亚`。

ACE-Step 的调性下拉使用同一写法：`src/components/AceStepWorkspace.tsx` 的 `keys` 是
`[英文原值, 中文标签]` 元组表（24 个大 / 小调，是 Music 3 调性表的子集），`<option>` 以
`value` 写回英文原值、以标签文本显示中文；「正在播放」卡片与 Music 3 预设卡片的调性同走
`music3KeyLabels` 显示映射。

以下流派在显示层一律用中文（提示词层仍是英文原值）：

| 英文原值 | 中文显示 | 英文原值 | 中文显示 |
| --- | --- | --- | --- |
| Pop | 流行 | Garage | 车库 |
| Synth-pop | 合成器流行 | UK garage | 英国车库 |
| Dream pop | 梦流行 | Breakbeat | 碎拍 |
| Electropop | 电子流行 | Downtempo | 慢节奏 |
| Hyperpop | 超级流行 | Hip-hop | 嘻哈 |
| Electronic | 电子 | Boom bap | 复古律动说唱 |
| House | 浩室 | Trap | 陷阱说唱 |
| Deep house | 深浩室 | Drill | 重低音说唱 |
| Future house | 未来浩室 | Cloud rap | 云说唱 |
| Progressive house | 渐进浩室 | R&B | 节奏布鲁斯 |
| Disco | 迪斯科 | Neo-soul | 新灵魂 |
| Nu-disco | 新迪斯科 | Soul | 灵魂乐 |
| Techno | 科技舞曲 | Funk | 放克 |
| Ambient techno | 环境科技舞曲 | Gospel | 福音 |
| Drum & bass | 鼓与贝斯 | Rock | 摇滚 |
| Liquid D&B | 液态鼓与贝斯 | Alternative rock | 另类摇滚 |
| Indie rock | 独立摇滚 | Punk rock | 朋克摇滚 |
| Indie folk | 独立民谣 | Folk | 民谣 |
| Country | 乡村 | Americana | 美式根源 |
| Jazz | 爵士 | Neo-jazz | 新爵士 |
| Lo-fi | 低保真 | Orchestral | 管弦乐 |
| Ambient | 环境音乐 | Cinematic score | 电影配乐 |
| World | 世界音乐 | Latin | 拉丁 |
| Reggaeton | 雷鬼动 | Salsa | 萨尔萨 |
| Afrobeats | 非洲节拍 | Amapiano | 阿玛皮亚诺 |
| K-pop | 韩流 | J-pop | 日式流行 |
| Reggae | 雷鬼 | Dancehall | 舞厅雷鬼 |
| Blues | 布鲁斯 | Metal | 金属 |
| Post-rock | 后摇滚 | | |

声音预设卡片的标题（如「午夜 R&B」「经典 Boom Bap」「Lo-fi 学习音乐」）是创作名，不是功能标签，
按作品名保留英文流派写法；卡片的调性半区走显示映射（如 `C major` → `C 大调`）。

### 品牌与型号（keep）

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- |---|
| Oyama AI Video Studio | Oyama AI Video Studio | keep | 品牌名，`<title>` 与 manifest name 保留 |
| H3 | H3 | keep | |
| MiniMax | MiniMax | keep | |
| Ref2VA | Ref2VA | keep | |
| FL2VA | FL2VA | keep | |
| Turbo 4 | Turbo 4 | keep | |
| Turbo 8 | Turbo 8 | keep | |
| LoRA | LoRA | keep | |
| ComfyUI | ComfyUI | keep | |
| ACE-Step | ACE-Step | keep | |
| Music 3 | Music 3 | keep | |
| LTX 2.5 | LTX 2.5 | keep | |
| LTX Ripple | LTX Ripple | keep | |
| Z-Image | Z-Image | keep | |
| FireRed | FireRed | keep | |
| BiRefNet | BiRefNet | keep | |
| SageAttention | SageAttention | keep | |
| Kitchen INT8 | Kitchen INT8 | keep | |
| Sol-Attn | Sol-Attn | keep | |
| VAE | VAE | keep | |
| SDXL | SDXL | keep | |
| Qwen | Qwen | keep | |
| Ollama | Ollama | keep | |
| LM Studio | LM Studio | keep | |
| NSFW | NSFW | keep | |
| GPU | GPU | keep | |
| API | API | keep | |
| JSON | JSON | keep | |

### 常用界面动词

| 英文 | 中文 | 类别 | 备注 |
| --- | --- | --- | --- |
| Generate | 生成 | translate | |
| Save | 保存 | translate | |
| Cancel | 取消 | translate | |
| Delete | 删除 | translate | |
| Close | 关闭 | translate | |
| Apply | 应用 | translate | |
| Reset | 重置 | translate | |
| Load | 加载 | translate | |
| Export | 导出 | translate | |
| Import | 导入 | translate | |
| Add | 添加 | translate | |
| Remove | 移除 | translate | |
| Edit | 编辑 | translate | |
| Copy | 复制 | translate | |
| Retry | 重试 | translate | |
| Start | 开始 | translate | |
| Stop | 停止 | translate | |
| Pause | 暂停 | translate | |
| Preview | 预览 | translate | |
| Download | 下载 | translate | |
| Open | 打开 | translate | |
| Browse | 浏览 | translate | |
| Select | 选择 | translate | |
| Confirm | 确认 | translate | |
| Warning | 警告 | translate | |
| Error | 错误 | translate | |
| Success | 成功 | translate | |
| Loading | 加载中 | translate | |
| Connected | 已连接 | translate | |
| Offline | 离线 | translate | |
