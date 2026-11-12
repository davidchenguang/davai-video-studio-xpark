# 图片类模型替换调研（面向国内客户 · 中文优先）

日期：2026-11-12 ｜ 调研分支：`image-model-switch`（独立 worktree，未动主线）

## 结论先行

| 需求 | 现状 | 建议 | 关键理由 |
| --- | --- | --- | --- |
| 文生图（Z-Image 主工作区 + 角色/服装/地点/发型/配饰工作室 + 移动端） | Z-Image Turbo（Apache-2.0，8 步） | **换成 Qwen-Image-2.1 Turbo**，Z-Image 保留为后备 | 中文长文渲染与多行排版明显更好（实测评见下），7B 权重只有 6.7 GB |
| 图片编辑（照片编辑工作区，FireRed 1.1） | FireRed-Image-Edit-1.1（Apache-2.0，Turbo 8 步） | **不换。FireRed 的中文编辑不弱反强**（REDEdit CN Text 4.49 领先 2511 的 4.08；实测中文改字/加字三模型全对，见 bench4） | 用户提的三个候选都不适合替换 FireRed（详下） |
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

### 中文渲染结论

- **短文本（≤2 行）**：三者 + Z-Image 都能全对。客户如果只需要标题类海报，Z-Image 够用。
- **长文本（≥3 行信息排版）**：**Qwen-2.1 Turbo 明显最稳**；MOSS 理论分最高（LLTB 96.3）但实测海报场景反而不如 Qwen-2.1 的版式控制；Z-Image 密集文字会崩。
- **编辑后文字保持**：FireRed / Qwen-2.1 / Qwen-Edit-2511 三者都保住了全部中文文字，MOSS（LoRA）未测（未装）。
- **中文文字改写/新增（编辑里最难的两类）**：三模型全对，FireRed 不落下风（REDEdit-Bench 的 CN Text 类目 FireRed 反而领先 2511 +0.41）。

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

### 换 H3-Image 的落点（若选它）

1. **先升级 ComfyUI 到 v0.45.0**（服务器 e6515b16 = v0.44.2，两个本地修改文件需要 stash/恢复）。
2. 下载 21G int8 DiT + 1.17G VAE（编码器复用 H3 视频）。
3. 新 builder 用 `MiniMax H3 Image Conditioning` 节点 + 6 步 PDD 采样（SamplerCustomAdvanced + ManualSigmas 六步表 + BasicGuider）。
4. 许可署名需要在 UI（设置/关于页）和交付文档中体现 "Powered by MiniMax-H3-Image"。

### 换 MOSS 的落点（若选它）

1. T2I builder：`UNETLoader + CLIPLoader(type:'moss_image') + EmptyFlux2LatentImage + SkipLayerGuidanceDiTSimple(layers '22', 0.5) + KSampler(25步, cfg 2.5, er_sde)`。
2. 编辑需要下载 `moss_image_edit_lora_rank_64_bf16.shafetensors` + `TextEncodeMOSSImageEdit`（GPLv3 疑虑）。
3. JSON 布局工作流（`MOSSImageLayoutPrompt` + `MOSSImageControl`）可作为海报专项功能另行立项，不阻塞主替换。

## 四、风险与开放问题

1. **Qwen-2.1 商用许可**是最大的落地门槛。如果客户场景确定商用，三条路：a) 向阿里申请商用授权（无公开价格）；b) 用 Apache-2.0 的 Qwen-Image-2512（文生图）+ Qwen-Image-Edit-2511（编辑）组合替代；c) 走官方 API（按量付费自带商用权，但违背本项目 local-first 卖点）。
2. **H3-Image 的 "Powered by" 署名义务**：如果客户产品界面不愿显示模型名，H3-Image 排除。
3. **H3-Image 需要升级 ComfyUI 0.44.2 → 0.45.0**。服务器 ComfyUI 有两个本地改动（model_patcher.py、gemma4.py）需要先处理。GB10 内存 128G，33.1B int8 21G DiT + 25.9G 编码器可以装下，但和其他 H3 视频模型并存时要靠 ComfyUI 内存管理。
4. Z-Image 不是必须下架：它 4s 热缓存出图、Apache-2.0、无许可风险，作为"快速草稿"模式保留成本低。**建议 Qwen-2.1 为默认，Z-Image 降级为快速模式**，两者共存（就像 Z-Image 工作区已有的 turbo/base 双模式）。
5. 实测样本量小（每个场景 1-2 张、单一 seed）。推荐在正式立项前，把三类场景（海报长文、RGBA 透明、参考图编辑）各跑 5 seed 对比，再冻结选型。

## 五、推荐组合（最终建议）

- **默认文生图：Qwen-Image-2.1 Turbo**（若商用许可谈不拢 → 降级方案：Qwen-Image-2512，Apache-2.0，能力略弱）
- **快速草稿模式：保留 Z-Image Turbo**（4 秒热图 + Apache-2.0 无风险）
- **图片编辑：FireRed 1.1 维持现状**（Apache-2.0，实测编辑质量不低于 Qwen-2.1 编辑路径，且已有完整工作区+测试）
3. **海报专项（可选后续）：MOSS-Image JSON 布局工作流**（Apache-2.0，版式可控，作为独立工作流补充）

这个组合把许可风险控制在零（Apache-2.0 为主）、把中文长文渲染能力提到最高（Qwen-2.1），且改动面集中在 `src/lib/` + 8 个调用点，FireRed/BiRefNet/Ripple 链路零改动。

## 附：实测产物与可复现脚本

- 服务器：`dawo@192.168.20.80:~/bench-image-models/bench.py|bench2.py|bench3.py|bench4.py`
- 服务器输出：`~/comfyui/output/bench/`（zimage_turbo / moss / qwen21_simple / moss_long / zimage_long / firered_edit / qwen21_edit / qwen_edit_2511 共 8 组，另有 bench4 的 fr_textedit / qw21_textedit / qw2511_textedit / fr_textadd / qw21_textadd / qw2511_textadd 共 6 张）
- 本地镜像：本 worktree `bench-results/` 目录（14 张 PNG）
- 图表节点 schema 快照：`/tmp/oi.json`（服务器 `/object_info`，2026-11-12 10:30 左右）

### 来源（主要外部资料）

- [Qwen-Image-2.1 GitHub](https://github.com/QwenLM/Qwen-Image-2.1) / [ComfyUI 官方教程](https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1) / [Comfy-Org 重打包](https://huggingface.co/Comfy-Org/Qwen-Image-2.1)
- [Qwen-2.1 研究许可分析（CocoLoop）](https://news.cocoloop.cn/2026/09/qwen-image-21-research-license) / [ai345 商用指南](https://www.ai345.info/ai-guide/qwen-image-2-1-commercial-license) / [Qwen-Image 2511 Apache 确认](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)
- [MiniMax-H3-Image ComfyUI 教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image) / [ComfyUI Wiki 模型页](https://comfyui-wiki.com/en/models/minimax/minimax-h3-image) / [H3-Image 许可原文](https://raw.githubusercontent.com/MiniMax-AI/MiniMax-H3-Image/main/LICENSE) / [Comfy 商业许可页](https://comfy.org/minimax/license)
- [MOSS-Image 发布报道（搜狐）](https://www.sohu.com/a/1094326219_121850782) / [量子位](https://zhuanlan.zhihu.com/p/2096936048530138595) / [MOSS 编辑 LoRA（GPLv3）](https://huggingface.co/chinoll/Moss-Image-Edit) / [ComfyUI MOSS 教程](https://docs.comfy.org/tutorials/image/moss-image/moss-image)
- [Z-Image Apache-2.0 确认](https://huggingface.co/Tongyi-MAI/Z-Image)
