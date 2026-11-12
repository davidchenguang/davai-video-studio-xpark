# 图片类模型替换调研（面向国内客户 · 中文优先）

日期：2026-11-12 ｜ 调研分支：`image-model-switch`（独立 worktree，未动主线）

## 结论先行

| 需求 | 现状 | 建议 | 关键理由 |
| --- | --- | --- | --- |
| 文生图（Z-Image 主工作区 + 角色/服装/地点/发型/配饰工作室 + 移动端） | Z-Image Turbo（Apache-2.0，8 步） | **换成 MiniMax-H3-Image（专用 DiT）**，Z-Image 保留为快速草稿 | bench5 实测中文密集排版全对、热跑 12s、4K 直出 84s；与视频同族（客户装了 H3 视频即万事俱备）；许可三项已确认可接受（UI 署名、营收 < $1M、大陆可用）。Qwen-2.1 因研究许可降为备选 |
| 图片编辑（照片编辑工作区，FireRed 1.1） | FireRed-Image-Edit-1.1（Apache-2.0，Turbo 8 步） | **不换。FireRed 的中文编辑不弱反强**（REDEdit CN Text 4.49 领先 2511 的 4.08；实测中文改字/加字三模型全对，见 bench4） | H3-Image 本地编辑实测失败（见 bench5）；用户提的三个候选都不适合替换 FireRed（详下） |
| 抠图（BiRefNet） | BiRefNet | 不换 | 与生图模型无关，保持现状 |

三个候选模型并不是同一个赛道的替代品：

- **Qwen-Image-2.1**：文生图 + 编辑一体（7B，原生 2K、RGBA、最多 10 参考图）——**但商用需向阿里单独申请许可**。
- **MiniMax-H3-Image**：文生图 + 编辑一体（33.1B，16MP 直出、6 步）——但 33.1B DiT 权重 68 GB（int8 21 GB）+ Qwen3-VL-32B 编码器 15-25 GB，且社区许可有地域/营收/署名条款。
- **MOSS-Image**：**纯文生图**（5B），本体不能编辑；编辑靠社区 LoRA（`chinoll/Moss-Image-Edit`，GPLv3），且 LoRA 服务器上未安装。

## 一、三个候选逐一评估

### 1. Qwen-Image-2.1（阿里，2026-09-20 发布）

- **能力**：统一文生图 + 指令编辑；原生 2K；RGBA 透明背景；最多 10 张参考图，支持圈选/涂鸦/蒙版局部编辑；官方 ComfyUI 模板齐全（t2i / turbo t2i / image_edit / turbo image_edit / background_removal）。
- **ComfyUI**：Day-0 原生支持。服务器（v0.44.2）已具备全部所需节点：`TextEncodeQwenImage21`、`QwenImage21Cache`、`ManualSigmas`、`CFGGuider` 等。
- **服务器现状**：`qwen_image_2.1_int8_convrot.safetensors` (6.9G)、`qwen_image_2.1_turbo_int8_convrot.safetensors` (6.9G)、`qwen_image_2.1_turbo_bf16.safetensors` (13.6G)、`qwen3vl_8b_*` 编码器、`qwen_image_2.1_vae_bf16.safetensors`、Turbo LoRA 全部**已装**。装好的文件与官方模板一致，直接可用。
- **许可**：⚠️ **Qwen Research License — 仅限研究/评估，商用需向阿里单独申请**（`model-business@notice.qwencloud.com`）。注意：系列里 2.0/2511/2512 是 Apache-2.0，2.1 特意改成了研究许可，这是相对上一代的关键变化。
- **中文**：海报级中文排版是它的主打能力，官方榜单 Qwen-Image-Bench 60.28 分排开源第一。

### 2. MiniMax-H3-Image（MiniMax，2026-11-10 发布，刚出）

- **能力**：统一文生图 + 编辑；33.1B；原生 16MP（4096×4096）直出；6 步蒸馏无 CFG；最多 16 张参考图。质量上限最高。
- **ComfyUI**：v0.45.0 原生支持（服务器目前是 **v0.44.2，需升级**）。节点名 `MiniMax H3 Image Conditioning` 等。官方模板（`image_minimax_h3_image_t2i/edit`）在服务器模板包里已就位。
- **服务器现状**：`minimax_h3_image_pruned_int8_convrot.safetensors` (21G)、`minimax_h3_image_vae_fp16.safetensors` (1.17G) **未下载**；但 **文本编码器 `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` (15G) 与 int8 (25.9G) 已装**（H3 视频模型在用），节省 15-26 GB 下载。另需 `qwen3.5_9b_w4a8_gptq.safetensors`（已装，提示词扩展器用）。
- **许可**：⚠️ **H3-Image Community License**（2026-11-10 版，独立于视频版 H3 许可）：
  - 排除地域：**欧盟、英国、韩国、美国**（中国大陆不在排除名单内，可用）；
  - 年营收 > **100 万美元** 或提供托管服务需另行书面授权；
  - 商业产品界面需显著展示 "MiniMax-H3-Image"；
  - 输出可用其训练其他模型禁止；发布模型需带 NOTICE 文件。
  - 对国内客户（营收不确定、应用本身不是托管服务）大体可用，但给客户的交付物里要加署名，且应收入口咽下这个约束。
  - **与视频版 H3 许可的对照**（视频版 2026-08-02 生效）：结构同构——同样排除 EU/UK/韩/美、同样 §IV.2 强制 UI 署名、同样禁蒸馏。**关键差异是营收门槛：视频版 2000 万美元，图片版只有 100 万美元**。App 已在用视频版（视同已接受署名/地域义务），换图片版的净增义务 = 更严的营收门槛 + 署名字样从 "MiniMax H3" 扩为 "MiniMax-H3-Image"。若客户年营收在 100 万–2000 万美元区间，视频可用而图片需另行书面授权——这是"同族统一"方案最容易被忽略的坑。
- **中文**：官方宣传中文文字生成效果不错；B 站测评有专项对比。但 33.1B 的显存压力在 GB10（128G 统一内存）上可行，单张 16MP 生成 10-20 秒。

### 3. MOSS-Image（OpenMOSS/复旦，2026-10-16 发布）

- **能力**：**纯文生图**（官方明确"无法直接接收参考图或执行原生图像编辑"）。主打中英文长文本渲染（LLTB 96.3 分开源新高）+ JSON 结构化布局（bbox 指哪打哪）+ 4K token 提示词。
- **ComfyUI**：原生节点 `MOSSImageLayoutPrompt`、`MOSSImageControl`、`TextEncodeMOSSImageEdit` 等服务器都有。
- **服务器现状**：`moss_image_sft_int8_convrot.safetensors` (5.2G) 已装；**编辑 LoRA `moss_image_edit_lora_rank_64_bf16.safetensors` 未装**（T2I 可跑，编辑不行）。
- **编辑**：靠社区 LoRA `chinoll/Moss-Image-Edit`（**GPLv3**）。GPLv3 对桌面应用分发的传染性需要法务确认，作为产品内建编辑通道不干净。
- **许可**：Base/SFT **Apache-2.0**（三个里唯一完全干净的）。中文渲染强，但长文渲染实测中（下）排版反而输给 Qwen-2.1。
- **额外价值**：MOSS-Image 的 **JSON 布局能力对海报类需求是独一份**（`MOSSImageLayoutPrompt` 节点直接给元素定 bbox），如果客户做版式固定的宣传物料可以作为一个专项工作流补充，而不是整体替换。

## 二、GB10 实测（1024×1024，seed=20261112，服务器空闲时跑）

### T2I 简单海报（标题+副标题+地址，要求"水墨风格"）

| 模型 | 步数 | 冷启动 | 热缓存 | 文字正确性 | 评价 |
| --- | --- | --- | --- | --- | --- |
| Z-Image Turbo int8 | 8 | 156s（冷） | **4s** | 全部正确 | 干净、留白大、字体略呆 |
| Qwen-2.1 Turbo int8 | 8 | 92s | 92s（未热） | 全部正确 | 版式最讲究：分隔线、水墨山水元素、色彩最协调 |
| MOSS SFT int8 | 25 | 88s | 4s | 基本正确 | 书法感最强，但右上角装饰印章区出现乱纹错字 |

### T2I 密集长文本（音乐节海报：标题+两行信息+三行日程+票价，约 100+ 字）

| 模型 | 步数 | 耗时 | 结果 |
| --- | --- | --- | --- |
| Z-Image Turbo | 8 | 56s | ❌ 底部日程/票价区文字混乱乱序、串行（如"学生凭有效领件半价"），密集排版崩 |
| Qwen-2.1 Turbo | 8 | 92s | ⚠️ 三行日程全部正确，仅右下票价一处错字（"证件"→"领件"）；整体版式正确 |
| MOSS SFT | 25 | 36s | ⚠️ 日程三行正确，但票价块粘连串行、"元"字丢失；LLTB 高分没有完全兑现到海报场景 |

### 编辑（"把盘子里的菜换成北京烤鸭，保持盘子、构图、背景与所有文字不变"）

| 模型 | 步数 | 耗时 | 结果 |
| --- | --- | --- | --- |
| FireRed 1.1 Turbo（现状） | 8 步 | 168s | ✅ 烤鸭替换完成、构图保持、**所有文字完整正确**（含小字地址） |
| Qwen-2.1 (base, 25 步) | 25 步 | 168s | ✅ 同样优秀，文字完整正确，烤鸭更饱满 |
| Qwen-Edit-2511 Lightning 4 步 | 4 步 | 330s | ✅ 文字完整正确，烤鸭+切片装盘更自然（4 步 LoRA 在 v0.44.2 上可跑） |
| MOSS Edit LoRA | - | - | ❌ 服务器未装 LoRA，无法测 |

> 备注1：Qwen-Edit-2511 的 330s 是因为同批其他大模型挤占 128G 统一内存导致模型交换；纯加载后 4 步应远快于此。2511 编辑质量稳定，且 **Apache-2.0**。
> 备注2：服务器已装 2511 的 Lightning 4 步 / 8 步两版 LoRA（各 810MB），替换 FireRed 时优先用 8 步版本对照现状。

### 编辑专项：中文文字改写与新增（bench4，正面回答"FireRed 中文编辑是否更弱"）

用 Z-Image 生成的「山泉食府」海报（含标题+副标题+地址三段中文）为源图，三模型各跑两个最考验中文编辑的任务：

- **文字改写**：「把顶部大标题「山泉食府」改成「山泉酒府」，副标题、地址、画面与其他所有内容保持不变」
- **文字新增**：「保持画面构图和所有文字不变，在底部地址下方加一行居中的小字「营业时间 10:00-22:00」」

| 模型（配置同上表） | 文字改写 | 文字新增 | 耗时（改写/新增，含模型换载） |
| --- | --- | --- | --- |
| FireRed 1.1 Turbo 8 步 | ✅ 「食→酒」改对，其余文字/构图全保留 | ✅ 「营业时间 10:00-22:00」正确加在地址下方，原有文字全保留 | 437s（冷）/ 144s |
| Qwen-2.1 base 25 步 | ✅ 同样全对 | ✅ 同样全对 | 216s / 124s |
| Qwen-Edit-2511 Lightning 8 步 | ✅ 同样全对 | ✅ 同样全对 | 112s / 116s |

**结论：FireRed 的中文编辑不弱——在这两个最能暴露中文短板的任务上，它与两个 Qwen 编辑模型打平，全部通过。** 耗时差异主要是模型换载（每个任务切换一次 7B/39GB 级模型），热缓存后同为个位数秒级。

榜单佐证（FireRed 官方技术报告，REDEdit-Bench 1673 对中英双语编辑对、15 类指令）：

- **中文文字编辑（CN Text）类目：FireRed 4.49 vs Qwen-Image-Edit-2511 4.08**——+0.41，是全榜单分差最大的类目之一，且是对中文编辑最相关的类目；
- GEdit-Bench 中文子集：FireRed 7.887 vs 2511 7.819，FireRed 仍领先；
- 英文侧两者接近（FireRed 的设计重心本来就是中文场景）。

> 即"FireRed 中文编辑弱"这个假设在榜单和实测两个方向上都站不住：它是当前开源模型里中文编辑的最强档，实测中也无短板。

### H3-Image 实测（bench5，ComfyUI 升级 v0.45.2 后）

服务器升级 + 模型下载（21G int8 DiT + 1.17G VAE）完成后，同一 seed、同一提示词对 H3-Image 两条本地图路径实测：

**路径 A：FL2VA 视频 DiT + turbo 8 步 LoRA 直接出图**（官方 `image_minimax_h3_t2i` 模板子图；文件全部与视频管线共用，**零新增下载**）

| 任务 | 耗时 | 结果 |
| --- | --- | --- |
| A_simple（水墨海报） | 360s 冷启 | ✅ 标题/副标题全对；地址疑 1 错字（杭州→杭山，判读模型两次独立读出，建议肉眼复核） |
| A_long（音乐节密集长文） | 68s 热 | ✅ **全部文字正确**（标题/日期/地址/三行日程/票价行，零错字） |

**路径 B：专用 H3-Image DiT（`minimax_h3_image_pruned_int8_convrot` + `minimax_h3_image_vae_fp16`）**，本地图 = `UNETLoader + CLIPLoader(qwen3vl_32b, type:minimax) + VAELoader + MiniMaxH3ImageConditioning + ConditioningZeroOut + KSampler(6步, cfg=1, euler/simple) + VAEDecode`

| 任务 | 耗时 | 结果 |
| --- | --- | --- |
| B_simple | 120s 冷启 | ✅ **全对**（含「杭州市」地址，无路径 A 的错字） |
| B_long | **12s 热** | ✅ **全部文字正确**（含票价行，零错字） |
| B_4k（4096×4096 直出） | 84s | ✅ 三段中文全对，16MP 印刷级独有卖点 |
| B_edit（中文改字，6 步与 30 步均试） | 12s | ❌ **编辑失败**：输出为白页乱码排版，标题改对但正文全是幻觉乱字；带图与不带图输出同形态（接线已验证正确——单链接写法会直接报张量错误），即图片条件未能绑定。本地忠实编辑仍需 FL2VA + `p-h3-image` LoRA 路线（官方仅此编辑模板）或云端 API |

**运维发现（重要）：**

1. **`MinimaxH3ImageNode`（及 `MinimaxHailuo*` 系列）是 `comfy_api_nodes` 云端 API 节点**，走 Comfy 官方云服务需 API key，不能驱动本地 21G DiT——集成时必须用上面的显式本地图，别被节点名骗了。
2. **`comfy kitchen attention` 后端在本台 0.45.2 服务器有 bug**：`rms_rope` 权重落 CPU，抛 `weight is on cpu, different from other tensors on cuda:0`，且两次把 ComfyUI 打崩重启。官方 t2i 模板默认带此节点，路径 A 已去除；**App 的 H3 视频工作流若配了 kitchen attention 同样会崩，升级后必须回归**。
3. ComfyUI 重启会清空内存队列；跑长基准务必 nohup 挂服务器端。
4. `/prompt` POST 无干跑模式——"验证图结构"本身就会入队执行，别拿生产提示词当校验用。

### 中文渲染结论

- **短文本（≤2 行）**：所有测过的模型（含 H3-Image 两条路径）都能全对。客户如果只需要标题类海报，Z-Image 够用。
- **长文本（≥3 行信息排版）**：**H3-Image 专用 DiT 与 FL2VA 同款路径在 bench5 中全部零错字**（含 4K），超过 Qwen-2.1 的 1 错字；Qwen-2.1 仍明显稳于 MOSS/Z-Image。
- **中文文字改写/新增（编辑里最难的两类）**：FireRed / Qwen-2.1 / Qwen-Edit-2511 全对（bench4）；**H3-Image 本地图编辑失败**（bench5，白页乱码），编辑继续归 FireRed。

## 三、与代码库的对照（替换成本）

图像管线目前的结构（`docs/app-module-map.md`）：

- **文生图**：`buildZImage` (`src/lib/zimage.ts`) 被 8 处调用：ZImageWorkspace / CharacterStudio / WardrobeStudio / LocationStudio / HairStudio / AccessoryStudio / SettingsView / MobileApp。全部走 `UNETLoader + CLIPLoader(type:lumina2) + VAELoader(ae.safetensors)`。
- **图片编辑**：`buildFireRedEditWorkflow` (`src/lib/fireRedEditWorkflow.ts`) 只被 PhotoEditWorkspace 用；`inferFireRedSelection` 按 `firered[-_ ]image[-_ ]edit` 正则从 object_info 自选模型。
按 `inferFireRedSelection` 的模式，加 `inferQwen21Selection` 的成本很低。
- **抠图**：`buildBiRefNetWorkflow` 独立于生图模型，不受影响。

### 换 Qwen-2.1 Turbo 做 T2I 的落点

1. `src/lib/qwenImage21.ts`：`buildQwenImage21(prompt, w, h, seed, model, encoder, vae, ...)` — `UNETLoader → QwenImage21Cache → CFGGuider(cfg=1, positive=negative=same) → ManualSigmas(8步 turbo 表) → KSamplerSelect(euler) → SamplerCustomAdvanced → VAEDecode`（服务器节点齐全，官方 turbo t2i 模板已核对）。
2. 8 个调用点改造：优先复用 `RenderSize` 的 zimage provider 或新增 `qwen21` provider。SettingsView 的自检工作流同步更新。
3. `preferredModel` 正则改为 `/qwen[_ ]image[_ ]2\.1/i`；Turbo/Base 双模式保留（turbo 8 步 ManualSigmas；base 25-40 步 euler，支持负向提示词）。
4. MobileApp 走同一 builder，无额外 IPC。
5. FireRed photo-edit 不动。

### 换 H3-Image 的落点（已按此执行，2026-11-12）

1. ~~升级 ComfyUI 到 v0.45.0~~ ✅ 服务器已到 **v0.45.2**（两个本地改动文件完好）；21G int8 DiT + 1.17G VAE 已下载，编码器与视频共享。
2. 新 builder（`src/lib/h3Image.ts`）：`UNETLoader(minimax_h3_image_pruned_int8_convrot) + CLIPLoader(qwen3vl_32b_minimax_h3_nvfp4_awq, type:'minimax') + VAELoader(minimax_h3_image_vae_fp16) + MiniMaxH3ImageConditioning(clip, prompt, width, height, vae[, images=[[loadImage,0]]]) + ConditioningZeroOut + KSampler(6步, cfg=1, euler, simple) + VAEDecode`。**不要用 `MinimaxH3ImageNode`（云端 API 节点）**；4K 档把 conditioning 的 width/height 提到 4096 即可（84s）。
3. 8 个 `buildZImage` 调用点改造同前（复用 RenderSize provider 模式，新增 `h3image` provider；`preferredModel` 正则 `/minimax_h3_image/i`）。
4. UI 署名：设置/关于页加 "Powered by MiniMax-H3-Image"（§IV.2 强制项），交付文档带 NOTICE 说明。
5. 视频回归：升级后必须验证 H3 视频全流程——**尤其 `comfy kitchen attention` 配置会触发 rope 设备错位崩溃**（见 bench5 运维发现 2）。
6. 可选双模式：Turbo 6 步默认；若上 30-50 步 base 档注意耗时；4K 作为"印刷质量"选项而非默认。

### 第一阶段已落地（2026-11-12，`image-model-switch` 分支）

按"先不改其他模块"的约定，H3-Image 以**独立工作区**的形式上线，Z-Image 保持原样：

- **新增 builder** `src/lib/h3Image.ts`：两个档位共用同一入口。
  - `dedicated`（默认）：专用图像 DiT + 图像 VAE，`MiniMaxH3ImageConditioning` → `ConditioningZeroOut` → `KSampler(6 步, cfg=1, euler/simple)`；需要 ComfyUI ≥ 0.45 的 `MiniMaxH3ImageConditioning` 节点，缺节点时前端直接禁用并提示升级。
  - `fl2va`（零新增下载）：H3 视频 DiT + Turbo 8 LoRA，`EmptyLatentImage` → `SamplerCustomAdvanced(res_multistep)` → `LTXVSeparateAVLatent` → `VAEDecode`；已装 H3 视频的客户不需要再下模型。
  - 两个档位都**不挂 `ModelAttentionBackend`**（0.45.2 上 kitchen attention 会打崩引擎）。
- **新增工作区** `src/components/H3ImageWorkspace.tsx`：档位选择、画幅（16:9 / 1:1 / 9:16，最高 4096×4096）、仅步数（无 CFG、无反向提示词）、模型组件下拉、实时预览、本地提示词润色、取消与错误提示。
- **导航与交接**：左侧导航「H3 图片」置于「H3 视频」之上；生成结果可「发送到 MiniMax I2V」或「发送到 LTX 2.5」。静帧进视频前用 `snapResolutionString` 归一到 H3 合法分辨率档位（同时修掉 Z-Image 旧交接会塞入 `1536x864` 等非法尺寸的问题）。
- **自检与设置**：设置新增「图片模型 · H3-Image」分区，列出两个档位所需文件、许可与署名说明、安装文档链接。
- **许可署名**：工作区页头常驻显示 "由 MiniMax-H3-Image 生成"（§IV.2 强制项）。
- **测试**：`scripts/test-h3-image.cjs`（图结构、档位检测、模型自检、分辨率归一），已接入 `pnpm test`。
- **未做（第二阶段待定）**：Z-Image 是否降级为"快速草稿"、草稿本的「生成静帧」是否改指 H3 图片、H3-Image 本地编辑路线（bench5 实测专用 DiT 编辑失败）。

### 换 MOSS 的落点（若选它）

1. T2I builder：`UNETLoader + CLIPLoader(type:'moss_image') + EmptyFlux2LatentImage + SkipLayerGuidanceDiTSimple(layers '22', 0.5) + KSampler(25步, cfg 2.5, er_sde)`。
2. 编辑需要下载 `moss_image_edit_lora_rank_64_bf16.shafetensors` + `TextEncodeMOSSImageEdit`（GPLv3 疑虑）。
3. JSON 布局工作流（`MOSSImageLayoutPrompt` + `MOSSImageControl`）可作为海报专项功能另行立项，不阻塞主替换。

## 四、风险与开放问题

1. **Qwen-2.1 商用许可**：已因 H3-Image 胜出而降级为备选，此项仅在切换回 Qwen 时重新评估（研究许可，商用需向阿里申请）。
2. **H3-Image 许可义务（已接受，落地时别漏）**：商业产品 UI 需显著展示 "MiniMax-H3-Image"；年营收 > $1M 或托管服务需另行书面授权；禁用输出训练其他模型。
3. **kitchen attention 崩溃 bug**：0.45.2 + 本机配置下 `comfy kitchen attention` 触发 rope 权重 CPU/CUDA 设备错位并两次打崩 ComfyUI——H3 视频回归的重点项；H3-Image 图不要带 `ModelAttentionBackend(kitchen)` 节点（官方 t2i 模板默认带，需删）。
4. Z-Image 不是必须下架：它 4s 热缓存出图、Apache-2.0、无许可风险，作为"快速草稿"模式保留成本低。
5. 实测样本量小（每场景 1 张、单一 seed）。正式立项前建议三场景各 5 seed 复测；首帧→视频同族衔接的 A/B（H3-Image 首帧 vs Z-Image 首帧喂 H3 视频）值得专项验证。
6. H3-Image 本地编辑失败（bench5）：若未来要"生图+编辑同模型"，需评估 FL2VA + `p-h3-image` LoRA 路线（需另下 `p-h3-image_lora_bf16` 等文件）或云端 API——当前编辑仍归 FireRed。

## 五、推荐组合（终版，2026-11-12 bench5 后）

- **默认文生图：MiniMax-H3-Image 专用 DiT**（中文密集排版零错字、热跑 12s、4K 直出 84s、与 H3 视频同族同引擎；许可三项已确认：大陆可用、营收 < $1M、UI 署名可接受）
- **快速草稿模式：保留 Z-Image Turbo**（4 秒热图 + Apache-2.0 无风险）
- **图片编辑：FireRed 1.1 维持现状**（Apache-2.0，中文编辑开源最强，bench4 全对；H3-Image 本地编辑实测失败，见 bench5）
- **备选 T2I：Qwen-Image-2.1 Turbo**（质量同级但研究许可需商用授权，仅在 H3-Image 出问题时启用）
- **海报专项（可选后续）：MOSS-Image JSON 布局工作流**（Apache-2.0，版式可控，作为独立工作流补充）

这个组合：生图/视频统一 MiniMax H3 家族（编码器、引擎、署名、许可口径全一致），Z-Image 留作零风险快速档，编辑链路（FireRed/BiRefNet/Ripple）零改动；改动面集中在一个新 builder + 8 个 `buildZImage` 调用点。

## 附：实测产物与可复现脚本

- 服务器：`dawo@192.168.20.80:~/bench-image-models/bench.py|bench2.py|bench3.py|bench4.py|bench5.py|bench5_edit30.py`
- 服务器输出：`~/comfyui/output/bench/`（bench1-3 共 8 组 + bench4 中文改字/加字 6 张 + bench5：h3a_simple / h3a_long / h3b_simple / h3b_long / h3b_edit / h3b_edit30 / h3b_edit_noimg / h3b_4k）
- 本地镜像：本 worktree `bench-results/` 目录（bench5 后共 22 张 PNG）
- 图表节点 schema 快照：`/tmp/oi.json`（服务器 `/object_info`，2026-11-12 10:30 左右）

### 来源（主要外部资料）

- [Qwen-Image-2.1 GitHub](https://github.com/QwenLM/Qwen-Image-2.1) / [ComfyUI 官方教程](https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1) / [Comfy-Org 重打包](https://huggingface.co/Comfy-Org/Qwen-Image-2.1)
- [Qwen-2.1 研究许可分析（CocoLoop）](https://news.cocoloop.cn/2026/09/qwen-image-21-research-license) / [ai345 商用指南](https://www.ai345.info/ai-guide/qwen-image-2-1-commercial-license) / [Qwen-Image 2511 Apache 确认](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)
- [MiniMax-H3-Image ComfyUI 教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image) / [ComfyUI Wiki 模型页](https://comfyui-wiki.com/en/models/minimax/minimax-h3-image) / [H3-Image 许可原文](https://raw.githubusercontent.com/MiniMax-AI/MiniMax-H3-Image/main/LICENSE) / [Comfy 商业许可页](https://comfy.org/minimax/license)
- [MOSS-Image 发布报道（搜狐）](https://www.sohu.com/a/1094326219_121850782) / [量子位](https://zhuanlan.zhihu.com/p/2096936048530138595) / [MOSS 编辑 LoRA（GPLv3）](https://huggingface.co/chinoll/Moss-Image-Edit) / [ComfyUI MOSS 教程](https://docs.comfy.org/tutorials/image/moss-image/moss-image)
- [Z-Image Apache-2.0 确认](https://huggingface.co/Tongyi-MAI/Z-Image)
