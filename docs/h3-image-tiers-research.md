# MiniMax H3-Image 两种生图路线调研

> 调研日期：2026-11-15
> 调研范围：H3-Image 专用模型路线（dedicated）与「H3 视频 DiT + 8 步 Turbo LoRA 出静帧」路线（fl2va），对照 MiniMax 官方、ComfyUI 官方与社区实践。
> 证据口径：下文的事实性结论只来自我实际打开过的页面（官方博客、模型卡、GitHub 仓库/PR/issue、docs.comfy.org、blog.comfy.org、Hugging Face 仓库页）。Reddit 原帖、Reddit AMA 原帖、许可证原文未能直接打开，相关部分统一标注「未回溯到一手来源」。文件体积等由已打开页面的数字直接相加得到的，标注「算术推导」。

---

## 一、结论摘要

1. **MiniMax 确实发布了独立的 H3-Image 专用图像模型。** 2026-11-10/11 发布并开源权重，模型卡名 `MiniMax-H3-Image`，是 H3 家族的图像模型：H3-Base 架构去掉音频分支、换用新的 2D 图像 VAE、通过 PDD 蒸馏为 6 步、无 CFG、无负向提示词，原生输出最高约 16MP（4096×4096 至 6272×2688）。见 [MiniMax 官方博客](https://www.minimax.io/blog/minimax-h3-image)、[HuggingFace 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image)、[官方 GitHub](https://github.com/MiniMax-AI/MiniMax-H3-Image)。
2. **ComfyUI 官方原生支持，且版本门槛与我们此前假设一致。** v0.45.0（2026-11-10）在「New Open-Source Model Support」中新增 MiniMax-H3-Image 及 T2I/Edit 模板；节点为 `MiniMaxH3ImageConditioning`（显示名 `MiniMax H3 Image Conditioning`）；官方模板要求 ComfyUI 0.45.0+ 与模板包 0.11.104+。我们背景里的「int8 约 21GB」「6 步 / CFG 1 / 无负向」「专用图像 VAE」「需要 ComfyUI >= 0.45」均与官方页面一致。见 [ComfyUI Changelog](https://docs.comfy.org/changelog)、[blog.comfy.org 发布文](https://blog.comfy.org/p/minimax-h3-image-is-now-available)、[官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)、[PR #17655](https://github.com/Comfy-Org/ComfyUI/pull/17655)。
3. **fl2va 路线在社区大量存在，但不是 MiniMax 定义的图像生成路线。** H3 官方定位是视频模型（FL2VA / Ref2VA 两种输入模式）；在 H3-Image 发布前，社区就摸索出「生成 5 帧、取第一帧」当文生图/图生图用，MiniMax 在 AMA 中承认了该用法并预告专用图像模型；官方推荐的组合方向是「图像模型出首帧 → 交给 H3 的 I2VA 续成视频」，与 fl2va（视频模型 → 静帧）方向相反。见 [H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)、[ComfyUI issue #15644](https://github.com/Comfy-Org/ComfyUI/issues/15644)、[InfoQ 转述（二手）](https://www.infoq.cn/article/9C3eK9tJqDXbabbBy3aj)。
4. **fl2va 的结构性瓶颈在「视频 VAE 解码单帧」。** H3 视频 VAE 是时空因果 VAE（f16t4d24，时间压缩 4×），单帧解码会出现 banding、条纹、模糊；社区解法包括「5 帧 burst 取中间/最优帧」「T=1 latent + 实验性单帧 VAE」「重新训练 decoder」。Pruna 的 P-H3-Image 是把 H3 视频模型改造成图像模型的最强生态先例，但它重训了 decoder、改了 diffusion schedule、把 50 步蒸馏到 8 步——说明只复用视频 DiT/VAE 不足以达到专用模型的质量。见 [H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)、[H3-Image 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image)、[Pruna 博客](https://www.pruna.ai/blog/oss-p-h3-image-launch)、[ComfyUI issue #15644](https://github.com/Comfy-Org/ComfyUI/issues/15644)。
5. **8 步 Turbo LoRA 不是 MiniMax 官方训练的。** 它由 LightX2V/ModelTC 发布（FL2VA/T2VA 视频蒸馏，12/3 video/audio shifts），被 MiniMax 官方维护的 awesome 索引收录、被 Comfy-Org 官方 repack 直接分发、被 ComfyUI 官方 H3 模板用作 `turbo_mode`（默认 8 步、`turbo_model_strength` 1.0）。H3-Image 的 6 步才是 MiniMax 官方的 PDD 蒸馏。社区把该 LoRA 用于静帧时，配方更常见的是 20–50 步、或把 Turbo 强度降到约 0.38。见 [LightX2V 发布说明](https://huggingface.co/lightx2v/Minimax-h3-Turbo/discussions/57)、[Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)、[H3 官方教程](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native)、[Fizgig README](https://github.com/shootthesound/ComfyUI-Fizgig-H3-Still)。
6. **「fl2va 零新增下载」成立，但差距是 14–22GB 量级，不是「一整套模型 vs 零」。** H3-Image 复用 H3 的 Qwen3-VL-32B 文本编码器，官方明确「如果你已经装了 MiniMax-H3，它不会被重复下载」。因此已部署 H3 视频栈时，dedicated 的边际下载约为：INT8 DiT 21GB + 图像 VAE 1.17GB ≈ 22GB；W4A8 则约 12.5GB + 1.17GB ≈ 13.7GB（算术推导）。见 [H3-Image 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image)、[官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)、[Comfy-Org 文件列表](https://huggingface.co/Comfy-Org/MiniMax-H3-Image/tree/main/diffusion_models)。

---

## 二、H3 / H3-Image 官方发布事实

### 2.1 时间线

| 日期 | 事件 | 来源 |
| --- | --- | --- |
| 2025-02-15 / 2025-02-28 | MiniMax Image-01 发布，官方首个文生图模型，走 API，未开源权重 | [MiniMax 官方新闻](https://www.minimax.io/news/image-01)、[MiniMax 发布说明](https://platform.minimax.io/docs/release-notes/models) |
| 2026-08-03 | MiniMax H3 开源（Hailuo 01/02 之后的第三代视频模型，原生立体声、最高 2K、最长 15 秒）；ComfyUI day-0 支持，要求 0.30.0 | [ComfyUI Day-0 博客](https://blog.comfy.org/p/minimax-h3-day-0-support-in-comfyui)、[H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3) |
| 2026-08-07 / 08-11 | LightX2V/ModelTC 发布 MiniMax-H3 Turbo LoRA v0.1（4 步）与 v1.0（8 步 / 4 步 768p） | [LightX2V HF 讨论](https://huggingface.co/lightx2v/Minimax-h3-Turbo/discussions/57)（本条主要是 v1.0 之后的更新说明）、[ComfyUI Wiki 时间线（二手交叉核对）](https://comfyui-wiki.com/en/news/2026-08-11-minimax-h3-turbo-lightx2v-v1) |
| 2026-08-15 | 社区在 ComfyUI 提 issue，讨论把 H3 当单图编辑模型、`t=1` latent 限制 | [ComfyUI issue #15644](https://github.com/Comfy-Org/ComfyUI/issues/15644) |
| 2026-08 中旬 | MiniMax H3 团队在 Reddit AMA 确认「正在从 H3 谱系共同祖先派生专用图像模型」；官方建议「图像模型出首帧 → H3 I2VA」 | [InfoQ 中文报道（二手，未回溯 Reddit 原帖）](https://www.infoq.cn/article/9C3eK9tJqDXbabbBy3aj) |
| 2026-10-20 | LightX2V 更新 FL2V 4-step v1.3 / 8-step v1.1、Ref2V 4/8-step，建议 FL2V 视频 flow shift = 6 | [LightX2V HF 讨论 #57](https://huggingface.co/lightx2v/Minimax-h3-Turbo/discussions/57) |
| 2026-11-03 | Pruna AI 发布 P-H3-Image（基于 H3 视频模型的 8 步图像模型），ComfyUI v0.44.0 原生支持 | [Pruna 博客](https://www.pruna.ai/blog/oss-p-h3-image-launch)、[ComfyUI Changelog v0.44.0](https://docs.comfy.org/changelog)、[ComfyUI P-H3-Image 教程](https://docs.comfy.org/tutorials/image/pruna/p-h3-image) |
| 2026-11-10 | MiniMax-H3-Image 发布（官方博客/HF 权重）；ComfyUI v0.45.0 原生支持；同日 v0.45.1 Partner Node 更新 | [MiniMax 博客](https://www.minimax.io/blog/minimax-h3-image)、[ComfyUI Changelog](https://docs.comfy.org/changelog) |
| 2026-11-12 | ComfyUI v0.45.2（bugfix） | [ComfyUI Changelog](https://docs.comfy.org/changelog) |

### 2.2 H3-Image 是什么（官方架构与规格）

官方模型卡与官方 GitHub README 对架构的描述一致：

- **定位**：开源图像生成与编辑模型，文生图与多图参考编辑共用同一个 checkpoint；最多 16 张参考图。
- **DiT**：33.1B 参数、50 层、hidden size 5376、56 个注意力头、FFN 14336、3D 多模态 RoPE，单流 dense transformer；采用 H3-Base 设计但去掉音频分支；权重 BF16（embedding、timestep、output 层 FP32）。
- **文本编码器**：完整 Qwen3-VL-32B，与 H3 相同、不改动，DiT 读取其第 50 层 hidden states。
- **图像 VAE**：CNN encoder + 24 层 2D ViT decoder，16× 空间下采样、24 个 latent 通道；DiT 再做 2×2 patchify，因此每个 transformer token 覆盖 32×32 像素。（对照：H3 视频 VAE 是 `f16t4d24`，时间压缩 4×，时序因果。）
- **蒸馏**：checkpoint 蒸馏为 6 个采样步（6 NFEs），无 classifier-free guidance；`pdd_fused_heads.safetensors` + `pdd_config.json`（12MB）承载每一步的输出头与采样 schedule。
- **输出尺寸**：原生约 16MP，1:1 为 4096×4096，4:3 为 4736×3552，3:2 为 5024×3360，16:9 为 5472×3072，21:9 为 6272×2688，也提供竖版；有效工作范围约 4–20MP，官方称 16MP 附近效果最好。
- **官方 Model Zoo**：BF16 68.65GB（transformer 66.28GB + VAE FP32 2.34GB + 12MB heads + tokenizer/processor 23MB）；文本编码器不在该 repo，从 `MiniMaxAI/MiniMax-H3` 的 `text_encoder/` 加载（66.7GB BF16）；可选 prompt expander `MiniMax-H3-Image-PE` 为 NVFP4 17.9GB。
- **官方 API 参数是「强制」的**：`num_inference_steps` 只能省略或为 6，`guidance_scale` 只能省略或为 1，其他值返回 HTTP 400；`negative_prompt` 直接拒绝。

来源：[HuggingFace 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image)、[官方 GitHub README](https://github.com/MiniMax-AI/MiniMax-H3-Image)、[H3 模型卡（视频 VAE 对照）](https://huggingface.co/MiniMaxAI/MiniMax-H3)。

### 2.3 采样参数与推荐配方

ComfyUI 官方教程给出的模板配方：

| 设置 | 值 |
| --- | --- |
| Sampler | euler |
| Scheduler | simple |
| Steps | 6 |
| Guidance (CFG) | 1 |
| Denoise | 1 |

官方博客的原话是：模型是 CFG-distilled，6 步、guidance 1，「这些值由 checkpoint 固定，没有可调项，也没有负向提示词可写」。ComfyUI 模板用 `ConditioningZeroOut` 占位负向条件。来源：[官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)、[blog.comfy.org](https://blog.comfy.org/p/minimax-h3-image-is-now-available)。

### 2.4 量化版本与文件体积

| 文件角色 | 官方 / Comfy-Org 版本 | 体积 | 来源 |
| --- | --- | --- | --- |
| 专用 DiT（原始） | BF16 | 66.28GB（transformer） | [模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image) |
| 专用 DiT（ComfyUI repack） | pruned BF16 | 40.2GB | [Comfy-Org 文件列表](https://huggingface.co/Comfy-Org/MiniMax-H3-Image/tree/main/diffusion_models) |
| 专用 DiT（ComfyUI repack） | pruned INT8 ConvRot | 21GB | [官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)、[Comfy-Org 文件列表](https://huggingface.co/Comfy-Org/MiniMax-H3-Image/tree/main/diffusion_models) |
| 专用 DiT（ComfyUI repack） | pruned W4A8 | 12.5GB | [Comfy-Org 文件列表](https://huggingface.co/Comfy-Org/MiniMax-H3-Image/tree/main/diffusion_models) |
| 图像 VAE | FP16（ComfyUI） | 1.17GB | [官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image) |
| 文本编码器 | Qwen3-VL-32B INT8 | 25.28GB | [官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image) |
| 文本编码器（替代） | Qwen3-VL-32B NVFP4 AWQ | 文件存在（体积见我未直接打开的页面） | [Comfy-Org/MiniMax-H3 文件列表](https://huggingface.co/Comfy-Org/MiniMax-H3) |
| Prompt expander（可选） | Qwen3.5 9B W4A8 | 7.34GB | [官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image) |

**需要修正一个常见说法**：`nvfp4` 出现在 H3-Image 的文本编码器（`qwen3vl_32b_*_nvfp4_awq`）上；专用 DiT 的 ComfyUI 量化选项是 `int8_convrot` 与 `w4a8`，官方原始权重只有 BF16。社区另有 GGUF（Q2–Q8）、MLX、stable-diffusion.cpp 等转换，见 [MiniMax 官方 awesome 索引](https://github.com/MiniMax-AI/awesome-minimax-h3-integration) 与 [AtomicChat GGUF 卡](https://huggingface.co/AtomicChat/MiniMax-H3-Image-GGUF)（后者为社区量化，仅作存在性佐证）。

### 2.5 许可证

- 权重采用 **MiniMax-H3-Image Community License Agreement**，与 H3 视频的许可证不同。
- Comfy-Org 的 repack 页面明确提示：若你或关联方年化收入超过 100 万美元，或向第三方提供托管服务，需要先取得 MiniMax 的书面授权。
- 我**没有逐条阅读许可证原文**；具体地域限制、商用条款以许可证正文为准。

来源：[HuggingFace 模型卡 License 段](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image)、[Comfy-Org/MiniMax-H3-Image](https://huggingface.co/Comfy-Org/MiniMax-H3-Image)。

### 2.6 官方对「用视频模型出图」的定位

- **H3 官方是视频模型**：模型卡把 H3 定义为 omni-modal 生成系统，输出 4–15 秒、24FPS、32kHz 立体声视频；两个输入变体是 `H3-Base-FL2VA`（0/1/2 张首尾帧）与 `H3-Base-Ref2VA`（最多 9 图 + 3 视频 + 3 音频）。来源：[H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)、[MiniMax 官方 awesome 索引](https://github.com/MiniMax-AI/awesome-minimax-h3-integration)。
- **官方承认社区的「5 帧取首帧」技巧，但把它视为过渡方案**：中文二手报道转述 Reddit AMA 称，MiniMax 团队表示正在从 H3 谱系的共同祖先派生专用图像模型，沿用 H3 VAE encoder（通过权重切片得到 2D encoder）并设计专用图像 decoder；官方建议的工作流是「先用图像模型生成首帧，再交给 H3 的 I2VA 模式生成视频」。**该 AMA 原帖我未能直接打开，此条为二手转述。** 来源：[InfoQ](https://www.infoq.cn/article/9C3eK9tJqDXbabbBy3aj)、[玉米小站转述](https://www.yumiok.com/archives/6614.html)。
- **Pruna 的一手表述可作为旁证**：Pruna 在官方博客中写「Out of the box, H3 can already produce single images, but they come out soft and blurry」（H3 开箱即可出单图，但偏软、模糊），并为此重训 decoder、改 schedule、蒸馏到 8 步。来源：[Pruna 博客](https://www.pruna.ai/blog/oss-p-h3-image-launch)。

---

## 三、ComfyUI 支持事实

### 3.1 版本与原生节点

- **H3 视频**：2026-08-03 day-0 支持，官方博客要求更新到 **0.30.0**；通过 AdaLN 权重剪枝（约 40% 参数替换为查表）+ int8 convrot 量化，把全精度 123.6GB 压到最小变体 42.5GB，可在 RTX 3060 级别运行。来源：[ComfyUI Day-0 博客](https://blog.comfy.org/p/minimax-h3-day-0-support-in-comfyui)。
- **H3-Image**：**v0.45.0（2026-11-10）** 在「New Open-Source Model Support」中列出「MiniMax-H3-Image: MiniMax image model with text to image and image edit templates」；v0.45.1 同日增加 Partner Node。来源：[ComfyUI Changelog](https://docs.comfy.org/changelog)。
- **节点**：专用图像路线的核心节点是 `MiniMaxH3ImageConditioning`（显示名 `MiniMax H3 Image Conditioning`，分类 `model/conditioning/minimax`）。输入为 clip、可选 VAE、prompt、width/height、`image_1..image_N` 自动增长槽位；输出 positive conditioning 与图像 latent。width/height 为 0 时，无图默认 2048×2048，有图则跟随 `image_1` 缩放后的尺寸。来源：ComfyUI H3 节点源码（本次通过 GitHub raw 页面读取；文件名在检索输出中被遮蔽）、[PR #17655](https://github.com/Comfy-Org/ComfyUI/pull/17655)、[commit](https://github.com/Comfy-Org/ComfyUI/commit/ede4e5fe8d15445c6fcd6828d70b202c22f9502c)、[blog.comfy.org](https://blog.comfy.org/p/minimax-h3-image-is-now-available)。
- **同一源码文件中的 H3 视频节点**（用于理解 fl2va 路线的基础）：`EmptyMiniMaxH3LatentAV`、`MiniMaxH3ImageToVideo`、`MiniMaxH3AddGuide`、`MiniMaxH3ReferenceToVideo`、`MiniMaxH3SigmaShift`、`MiniMaxH3FunControlNetApply`、`MiniMaxH3LatentUpscaleWithModel`、`MiniMaxH3ImageConditioning`、`PH3ImageConditioning`。其中 `MiniMaxH3ImageToVideo` 的注释明确写「t2va and fl2va: prompt (+ optional first/last keyframes) -> conditioning + AV latent」。来源：同上源码。
- **PR #17655 / commit `ede4e5f`**：作者 kijai，2026-11-10，新增 6 个 PDD fused 输出头、图像变体检测（以缺失 audio projection 与 PDD metadata 为键）、新图像 VAE（H3 CNN encoder + 2D ViT decoder）、`MiniMaxH3ImageConditioning` 节点；共 10 个文件、+386/−136。来源：[PR #17655](https://github.com/Comfy-Org/ComfyUI/pull/17655)、[commit](https://github.com/Comfy-Org/ComfyUI/commit/ede4e5fe8d15445c6fcd6828d70b202c22f9502c)。

### 3.2 官方模板与模型文件

- 模板库内置两个模板：**MiniMax-H3-Image: Text to Image** 与 **MiniMax-H3-Image: Image Edit**；文档要求 **ComfyUI 0.45.0+ 且模板包 0.11.104+**。
- T2I 模板默认打开在 **4MP 方形画布**，官方解释是「刻意低于模型原生分辨率，避免低显存机器 OOM」；有空间时可用分辨率选择器提高。
- 参考图无需预处理：模板把源图对齐到 32px 倍数，ComfyUI 内部按 1024px 短边（vision 侧）与 1024–2048px 短边（VAE 侧）缩放。
- 模板前面的 prompt expander 在 T2I 模板中默认关闭，在 Edit 模板中默认开启；官方提供的 expander 是 `MiniMax-H3-Image-PE`（Qwen3.8-27B FP4），而模板使用更轻的 Qwen3.5 9B W4A8（7.34GB）。
- 需要下载四个文件：专用 DiT（INT8 21GB）、Qwen3-VL INT8 文本编码器（25.28GB）、prompt expander（可选，7.34GB）、图像 VAE（1.17GB）。来源：[官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)。

### 3.3 H3 视频侧的官方支持（fl2va 的基础）

- 官方 H3 视频 T2V/I2V 模板与模型文件包括：`fl2va_pruned_int8_convrot` DiT、`qwen3vl_32b_nvfp4_awq` 文本编码器、`video_vae_int8_convrot` 与 `audio_vae_fp32` 两个 VAE，以及 8 步 Turbo LoRA `fl2v_turbo_8step_v1.0_comfyui_bf16`。
- 官方教程写明：默认 20 步；开启 `turbo_mode` 后改用 8 步 Lightning LoRA（`turbo_steps` 默认 8、`turbo_model_strength` 默认 1.0），「更快，但运动/音频会略软」。来源：[H3 官方教程](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native)。
- Comfy-Org/MiniMax-H3 的 repack 明确列出 FL2VA/Ref2VA 的 BF16、FP8、INT8 ConvRot、W6A8 等版本，以及 `fl2v_turbo_8step` / `fl2v_turbo_4step` / `ref2v_turbo_4step` LoRA；其 README 的 upstream 列表包含 `lightx2v/Minimax-h3-Turbo`。来源：[Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)。
- **AV latent 拆分节点**：`LTXVSeparateAVLatent` 是 ComfyUI 内置节点，文档明确写「works with any audio-visual model, such as LTXV or MiniMax H3」，把 AV latent 沿第一维拆成 video latent 与 audio latent；配套还有 `LTXVConcatAVLatent`。来源：[LTXVSeparateAVLatent 文档](https://docs.comfy.org/built-in-nodes/LTXVSeparateAVLatent)、[LTXVConcatAVLatent 文档](https://docs.comfy.org/built-in-nodes/LTXVConcatAVLatent)。
- **H3 原生实现直接复用了这两个 LTXV 节点**：PR #15224（H3 支持，CORE-375）写明「Reuses the LTXV AV latent concat/separate nodes (display names generalized)」。来源：[PR #15224](https://github.com/Comfy-Org/ComfyUI/pull/15224)。

### 3.4 一条与本地实现直接相关的维护者表态

ComfyUI issue #15644（2026-08-15，社区请求支持 H3 单图编辑/t=1）中：

- **comfyanonymous（ComfyUI 作者）回复**：「You can use a regular "Empty Latent Image" node with minimax H3 and it should work.」——即用普通 Empty Latent Image 节点配合 H3 是可行的。这为我们 fl2va 路线「在普通图像 latent 上采样」提供了维护者层面的支持。
- 同 issue 中社区开发者 Bambushu 的反馈：「rendering 5 frames and keeping frame 0 is not a substitute: the single-image VAE puts grid artifacts on it, and the video VAE gives blurry stills」——5 帧渲染取第 0 帧不能替代真单帧；单图 VAE 会有网格伪影，视频 VAE 会糊。

来源：[ComfyUI issue #15644](https://github.com/Comfy-Org/ComfyUI/issues/15644)。

> 说明：上述维护者表态只确认「普通 Empty Latent Image 可用」，并未确认任意 latent 形状/通道数与 H3 视频 DiT 的匹配细节。我们 fl2va 图的具体形状是否与 ComfyUI 当前实现完全一致，属于运行验证范围，本次调研未执行。

---

## 四、「视频模型出静帧」的社区实践与评价

### 4.1 H3 上的社区做法（H3-Image 发布前已大量存在）

社区围绕 H3 视频模型发展出至少三类「出静帧」方案：

1. **5 帧 burst，再选一帧**：H3 的原生 latent 最短是 5 帧（视频 latent `T=2`，对应 17k+5 的帧网格；见 ComfyUI H3 节点源码（本次通过 GitHub raw 读取，文件名在检索输出中被遮蔽）中 `video_latent_t()` / `_empty_av_latent()`，或交叉核对 [PR #15224](https://github.com/Comfy-Org/ComfyUI/pull/15224)），因此直接生成 5 帧、解码后取第一帧/中间帧/评分最优帧。
   - `astropuzzo/ComfyUI-MiniMax-H3-Image-Studio`：早期版本（Reddit 发布时）明确避免「强行单帧」，改为生成 5/20 帧时间包再选最优帧，作者称「Instead of forcing a single frame—which produces poor results」；当前 README 已改为「sample one latent frame + 视频 VAE 解码」，并注明 decoder 只针对单帧 banding，仍不保证无伪影。
   - `vrgamegirl19` 的 `MiniMax H3 Select Still Frame` 节点：默认取 5 帧中的中间帧（帧索引 2），理由是首尾帧只有单侧时间上下文、更容易带 start/end 伪影；也支持 `first` / `last` / `index`。
2. **T=1 真单帧 latent**：绕过 5 帧下限，直接构造 `latent_t=1`，再配专用解码。
   - `rockerBOO` 的 H3 单帧节点：`MiniMaxH3EmptyLatentImage` / `MiniMaxH3TextToImage`，README 明确警告「a 1-token latent is a valid *shape*, not a documented *mode*」。
   - `tori29umai0123/ComfyUI-MiniMaxH3-SingleFrame`：`MiniMax H3 Single Frame Edit` 节点 `frame_count` 默认 1，另提供 temporal RoPE patch 让输出更接近静帧。
   - `shootthesound/ComfyUI-Fizgig-H3-Still`：`Fizgig H3 Still Latent` 生成真一帧 latent，`Fizgig H3 Still Decode` 干净解码；README 称 stock H3 latent 至少 5 帧，「a "still" is really the first frame of a short clip」，且「Decoding a lone frame with the stock VAE Decode gives banded, streaky images」。
   - `cicalooo/ComfyUI-MM-1Frame`：提供三档 profile——Quality/Balanced 用原生 5 帧（`T=2`）+ 视频 VAE，Low VRAM 用实验性 `T=1` + 专用单帧 VAE。
3. **视频模型改造（重训 decoder / schedule / 蒸馏）**：`PrunaAI/P-H3-Image` 直接在 H3 视频 transformer 上做 LoRA/微调，配 4B 文本编码器、新 VAE、新 schedule，8 步出 8MP 图；ComfyUI v0.44.0 原生支持，且提供「已有 H3 时只加载 2GB LoRA」的工作流。来源：[Pruna 博客](https://www.pruna.ai/blog/oss-p-h3-image-launch)、[PrunaAI/P-H3-Image-Comfy](https://huggingface.co/PrunaAI/P-H3-Image-Comfy)、[ComfyUI P-H3-Image 教程](https://docs.comfy.org/tutorials/image/pruna/p-h3-image)。

来源（节点包）：[astropuzzo](https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio)、[Fizgig](https://github.com/shootthesound/ComfyUI-Fizgig-H3-Still)、[cicalooo](https://github.com/cicalooo/ComfyUI-MM-1Frame)、[tori29umai0123](https://github.com/tori29umai0123/ComfyUI-MiniMaxH3-SingleFrame)、rockerBOO 的 H3 单帧节点（GitHub 仓库名在检索输出中被遮蔽）、[vrgamegirl19 Select Still Frame（comfy.icu 节点页）](https://comfy.icu/node/VRGDG_MiniMaxH3SelectStillFrame)。

### 4.2 质量评价（社区一手/近一手）

- **单帧是结构性短板**：H3 视频 VAE 把帧按 1、4、4、4、4 的包处理，不存在「只生成一个独立帧」的操作；扩展侧只能把请求帧数向上取整到最小包（例如要 20 帧实际算 22 帧），再把不要的帧丢掉。这是 [note.com 实测文章](https://note.com/ai_driven/n/n326309423198?hl=en)（二手但细节透明）的解释，与 [H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3) 的 `f16t4d24` 时空因果 VAE 描述一致。
- **典型伪影**：softness、blockiness（块状）、banding（色带）、grid artifacts（网格）是社区反复提到的词。来源：[astropuzzo Reddit 帖快照（未直接打开 Reddit 原帖）](https://reddit.sentinel-team.org/posts/1veh31j/snapshots/2026-08-06T23%3A10%3A08.193186Z)、[note.com](https://note.com/ai_driven/n/n326309423198?hl=en)、[Fizgig README](https://github.com/shootthesound/ComfyUI-Fizgig-H3-Still)、[issue #15644](https://github.com/Comfy-Org/ComfyUI/issues/15644)。
- **5 帧 vs 1 帧**：社区用户反馈「one frame 的质量明显差于 5 frames（标准 VAE）」「5 frames 是 img2img 的稳定最优」；也有用户称「第一帧总是最好的帧」。见 [Reddit 快照](https://reddit.sentinel-team.org/posts/1vqka28/snapshots/2026-08-21T23%3A11%3A42.158136Z)（未直接打开 Reddit 原帖）。
- **专用单帧 VAE 的取舍**：Fizgig 称官方 H3 单帧 VAE（`t1_image_vae_step1597_int8_convrot`）更慢、更软、皮肤细节更少；cicalooo 则把它作为低显存档。两者都是社区实测口径，结论不一致，说明该路径依赖具体权重与配方。
- **语义强、像素弱**：社区普遍认为 H3 出图在构图、参考一致性、指令理解上很强，但在远景小脸、细纹理、密集文字、最终像素打磨上偏弱。来源：[Reddit 快照](https://reddit.sentinel-team.org/posts/1veh31j/snapshots/2026-08-06T23%3A10%3A08.193186Z)、[virse.ai 评测综述（二手）](https://www.virse.ai/blog/minimax-h3-image-generation-editing)、[Pruna 博客](https://www.pruna.ai/blog/oss-p-h3-image-launch)。
- **与专用/其他图像模型的对比**：Reddit 快照中的用户称「For editorial high-end photo generations, krea2 turbo with a good lora seems to beat h3 in both time and fidelity」；另一条 RTX 3060 12GB 上的 H3-Image 本地测试（二手汇总）称 8.5MP 细节不错，但画面偏灰、对比度低、偶尔忽略具体指令，Krea 2 Turbo 画质仍更强、Z-Image 在指令遵循与构图上是有力挑战者。见 [Reddit 快照](https://reddit.sentinel-team.org/posts/1veh31j/snapshots/2026-08-06T23%3A10%3A08.193186Z)、[AGI Hunt 汇总（二手，转述 Reddit）](https://agihunt.info/en/p/1a1d39cdec62132a72017581d36)。

### 4.3 速度与显存（社区实测，仅作量级参考）

- note.com 的 H3 单帧扩展实测（5 帧 vs 20 帧、20 步、res_multistep/simple）：1.99MP 27.8s vs 50.1s；3.96MP 38.9s vs 138.6s；8.02MP 84.0s vs 401.8s（约 4.8×）。来源：[note.com](https://note.com/ai_driven/n/n326309423198?hl=en)。
- Fizgig 称真单帧「renders far faster than the old 5-frame workaround」，最佳结果从 3MP 起；其最大质量配方是不加 Turbo LoRA、50 步、`er_sde`。来源：[Fizgig README](https://github.com/shootthesound/ComfyUI-Fizgig-H3-Still)。
- 专用 H3-Image 的社区实测（二手）：RTX 4090 24GB、W4A8 DiT、ComfyUI 0.45.0，4096² 约 25–29s；首次运行需加载约 27GB 文本编码器（约 160s）。见 [blog.byMAR.CO](https://blog.bymar.co/posts/minimax-h3-image-16mp-2026/)（二手）。
- 专用 H3-Image 的显存门槛（二手汇总）：24GB 是舒适档；16GB 需 offload；8–12GB 有社区工作流但更慢。官方教程只说模板默认 4MP 以避免 OOM，未承诺最低显卡。来源：[官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)、[openclawdc 汇总（二手）](https://openclawdc.com/blog/minimax-h3-image-vram/)。
- 需要澄清一个常见误算：Comfy-Org 的「最小完整集合约 21GB」说法只覆盖了 W4A8 DiT + 一个 7.3GB 的 Qwen3.5 prompt expander + VAE；而模型实际需要的 Qwen3-VL-32B 文本编码器（INT8 25.28GB 或 NVFP4 15.7GB）并未计入。按官方教程列出的 INT8 DiT 21GB + INT8 编码器 25.28GB + VAE 1.17GB 计算，完整集合约 **47.5GB**；用 W4A8 DiT + NVFP4 编码器 + VAE 则约 **29.4GB**（算术推导；NVFP4 体积来自二手页面，见上一条 openclawdc 链接）。

### 4.4 其他视频模型的先例

- **Wan 2.1**：据 GenVidKit 对官方脚本的分析（二手），Wan 2.1 的脚本原生提供 `t2i-14B` 任务，用 T2V 模型加 `--frame_num 1` 输出 PNG；**Wan 2.2 没有官方 T2I 工作流**，社区把 14B T2V 模板的 `duration` 设为 0（帧数 = 1），再用 Save Image 输出单帧。来源：[GenVidKit](https://www.genvidkit.com/blog/wan-2-2-text-to-image)（二手，但明确标注其读的是模板 JSON 与 ComfyUI 源码）、[Stable Diffusion Art](https://stable-diffusion-art.com/wan-2-2-text-to-image/)、[Civitai 社区工作流](https://civitai.com/models/1861555/wan-22-simple-text-to-image-gguf-txt2img-workflow)。
- **LTX-Video**：官方文档与节点围绕 I2V / 首尾帧 / 多关键帧控制展开，即「图像 → 视频」；我在本轮检索中**没有找到** LTX 官方或明确的社区「用视频模型出静帧」工作流。见 [ComfyUI LTX-Video 教程](https://docs.comfy.org/tutorials/video/ltxv)、[LTX 官方 ComfyUI 节点文档](https://docs.ltx.io/open-source-model/integration-tools/ltx-comfy-ui-nodes)。
- 结论：**「视频模型出静帧」是模型相关的实践**——Wan 有官方脚本先例、H3 有大量社区先例；LTX 目前未见同类文档化做法。

### 4.5 中文社区

- 中文一手/近一手内容主要是对 H3（视频）本地部署与 AMA 的报道：知乎「8G 显存跑 H3」教程、InfoQ/玉米小站/ChooseAI 对 AMA 的转述、36kr 对 H3-Image 的评测式介绍。见 [知乎](https://zhuanlan.zhihu.com/p/2070799408728367658)、[InfoQ](https://www.infoq.cn/article/9C3eK9tJqDXbabbBy3aj)、[玉米小站](https://www.yumiok.com/archives/6614.html)、[36kr](https://eu.36kr.com/en/p/4065447413306505)。
- 本轮用 Bing/DuckDuckGo 检索 `site:linux.do`、知乎等，**没有找到**直接比较「H3-Image 专用模型 vs H3 视频模型出图」的中文讨论帖。此结论仅代表本轮检索范围，不代表社区不存在此类讨论。

### 4.6 社区讨论的证据边界

- Reddit 原帖（r/StableDiffusion、r/comfyui）无法直接打开（exa 返回 `SOURCE_NOT_AVAILABLE`），我引用的是 `reddit.sentinel-team.org` 的快照与媒体转述。这些快照保留了原帖文字，但**未回溯到 Reddit 原帖**。
- 因此第 4 节中所有标注「Reddit 快照」的用户评价只能作为**社区舆情线索**，不宜当作可复现的评测结论。

---

## 五、对双 tier 设计的启示（只列外部事实支持的判断，不做产品决策）

### 5.1 两条路线的外部事实对照

| 维度 | dedicated（MiniMax-H3-Image） | fl2va（H3 视频 DiT + 8 步 Turbo） | 依据 |
| --- | --- | --- | --- |
| 官方身份 | MiniMax 官方开源图像模型 | MiniMax 官方视频模型（FL2VA 变体）+ 第三方视频蒸馏 LoRA | [MiniMax 博客](https://www.minimax.io/blog/minimax-h3-image)、[H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)、[LightX2V](https://huggingface.co/lightx2v/Minimax-h3-Turbo/discussions/57) |
| 权重 | 33.1B 无音频分支 DiT；BF16 68.65GB；Comfy-Org pruned INT8 21GB / W4A8 12.5GB | H3-Base FL2VA 33B 全模态 DiT；Comfy-Org 提供 BF16/FP8/INT8/W6A8 | [模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image)、[Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3) |
| 文本编码器 | Qwen3-VL-32B，与 H3 共用；已装 H3 不重复下载 | 同左 | [模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image) |
| VAE | 新 2D 图像 VAE（CNN encoder + 2D ViT decoder，16×，24ch），FP16 1.17GB | H3 视频 VAE（f16t4d24，时空因果）+ 音频 VAE | [模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image)、[H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3) |
| 采样配方 | 官方固定 6 步、guidance 1、无 CFG、无负向；euler/simple；PDD fused heads | 官方视频配方默认 20 步；`turbo_mode` 8 步 / strength 1.0；社区静帧配方常为 20–50 步或 Turbo strength ≈0.38 | [官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)、[H3 教程](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native)、[Fizgig](https://github.com/shootthesound/ComfyUI-Fizgig-H3-Still) |
| 输出尺寸 | 原生 4–20MP，最佳约 16MP | 视频原生 768p，2K 靠再生成；静帧社区建议 3MP 起，分辨率不必然带来更多细节 | [模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image)、[H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)、[Fizgig](https://github.com/shootthesound/ComfyUI-Fizgig-H3-Still) |
| ComfyUI 最低版本 | 0.45.0（模板需 0.45.0+ / 模板包 0.11.104+） | H3 原生支持自 0.30.0；`LTXVSeparateAVLatent` 为内置节点 | [Changelog](https://docs.comfy.org/changelog)、[官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)、[Day-0 博客](https://blog.comfy.org/p/minimax-h3-day-0-support-in-comfyui) |
| 边际下载（已装 H3 视频） | ≈22GB（INT8 DiT 21GB + 图像 VAE 1.17GB）；W4A8 ≈13.7GB（算术推导） | 0（复用已有 FL2VA DiT、文本编码器、视频 VAE）；Turbo LoRA 若未装需另下 | [模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image)、[官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)、[Comfy-Org 文件列表](https://huggingface.co/Comfy-Org/MiniMax-H3-Image/tree/main/diffusion_models) |
| 已知质量风险 | 提示词敏感（需长而具体的英文描述）；手、远景小主体、密集文字不稳定；低于 8MP/4MP 更明显 | 单帧解码偏软、banding、块状、网格；5 帧 burst 更稳但更慢；不同配方差异大 | [官方教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)、[Pruna](https://www.pruna.ai/blog/oss-p-h3-image-launch)、[issue #15644](https://github.com/Comfy-Org/ComfyUI/issues/15644)、[Fizgig](https://github.com/shootthesound/ComfyUI-Fizgig-H3-Still) |
| 官方推荐用途 | 静帧 / 首帧（再交 H3 I2VA 生成视频） | 视频 + 音频（H3 本体） | [H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)、[AMA 转述（二手）](https://www.infoq.cn/article/9C3eK9tJqDXbabbBy3aj) |

### 5.2 外部事实支持的判断

1. **dedicated 是唯一「官方定义 + 官方节点 + 官方模板」的出图路线。** 它的 6 步、CFG 1、无负向是 checkpoint 固定值：官方 API 对偏差值返回 400，ComfyUI 官方模板给出的配方同样是 6 步 / CFG 1，文档称「nothing to tune」。这意味着把它当作普通 SD 类模型、以「步数/CFG/负向提示词」为主要控制项的界面，会与官方配方冲突（这是事实描述，不是产品决策）。
2. **fl2va 是「有大量社区先例、但官方从未定义为出图路线」的技巧。** 它复用的 FL2VA DiT、视频 VAE、Turbo LoRA 都是官方/官方生态文件；「用普通 Empty Latent Image 采样」也得到 ComfyUI 维护者确认。但官方对「H3 出静帧」的定位是过渡方案，且 Pruna 的实践证明要达到专用模型质量需要重训 decoder/schedule。
3. **fl2va 的短板在解码，不在 DiT 本身。** 视频 VAE 的时空因果结构与单帧解码天然不匹配；社区的三类解法（5 帧 burst、T=1 + 单帧 VAE、重训 decoder）都指向同一结论。外部证据支持「fl2va 的产出质量对解码方案高度敏感」。
4. **8 步 Turbo 是视频蒸馏配方，不是静帧最优配方。** 官方 H3 模板把它作为视频 `turbo_mode`（8 步、strength 1.0，官方注明「运动/音频略软」）；社区用于静帧时常见 20–50 步、或把 Turbo 强度降到约 0.38、或完全不加 Turbo。外部证据不支持「8 步 Turbo 1.0 = 静帧最佳质量」。
5. **「零新增下载」是 fl2va 的真实优势，但幅度被高估。** 文本编码器与 H3 共用，dedicated 的边际成本是 14–22GB（取决于量化档），不是整套 68GB+；fl2va 若用户未装 Turbo LoRA，仍需下载该 LoRA（体积我未核验）。
6. **版本门槛是 fl2va 的另一个现实优势。** dedicated 需要 ComfyUI 0.45.0+；fl2va 依赖的 H3 原生支持自 0.30.0 起，拆分节点是内置节点，因此对旧版 ComfyUI 用户更友好。
7. **两条路线都不使用负向提示词/CFG。** 官方 H3-Image 配方固定 guidance 1 且拒绝 negative prompt；社区 H3 视频节点普遍使用 `BasicGuider`（无负向分支）。外部事实层面，负向提示词对两条路线都不是有效控制项。
8. **许可证需要单独确认。** H3-Image 的许可证与 H3 视频许可证不同；Comfy-Org 明确提示年收入超过 100 万美元或对外托管需另行书面授权。具体适用性需法务核对许可证原文（我未逐条阅读）。

---

## 六、未核实事项与证据边界

1. **Reddit 原帖未直接打开**：r/StableDiffusion、r/comfyui 的相关帖通过 `reddit.sentinel-team.org` 快照与媒体转述引用；原帖链接见快照页面，但我未能直接访问 reddit.com。
2. **MiniMax H3 Reddit AMA 原帖未直接打开**：关于「专用图像模型在研 / 官方推荐图像模型出首帧」的表述来自 InfoQ、玉米小站、ChooseAI 的中文转述，属二手。
3. **许可证原文未逐条阅读**：仅依据 HF 模型卡 License 段与 Comfy-Org 的提示。
4. **「Hailuo-image」系列名称未核验**：我核实了 MiniMax Image-01（2025-02，官方 API 文生图模型）；未核实是否存在名为「Hailuo-image」的独立模型线。
5. **LTX-Video 的静帧工作流未找到**：本轮检索未发现 LTX 官方/明确的社区「视频模型出静帧」文档；不能据此断言不存在。
6. **FL2VA 视频 DiT 与 Turbo LoRA 的具体体积未核验**：我核验了文件名与存在性（Comfy-Org/MiniMax-H3 文件列表），未核验字节数。
7. **本地 fl2va 图的运行正确性未验证**：本次只做外部调研，未启动 ComfyUI 实测；`EmptyLatentImage` 与 H3 视频 DiT 的形状/通道匹配细节属于运行验证范围。
8. **社区实测数据均为单机/单次口径**：note.com、Fizgig、cicalooo、Reddit 快照的耗时与质量结论不可直接横向比较。

---

## 七、来源清单

### 7.1 MiniMax 官方一手

- MiniMax H3-Image 发布博客：https://www.minimax.io/blog/minimax-h3-image
- MiniMax H3 模型卡（视频）：https://huggingface.co/MiniMaxAI/MiniMax-H3
- MiniMax H3-Image 模型卡：https://huggingface.co/MiniMaxAI/MiniMax-H3-Image
- MiniMax H3-Image 官方 GitHub：https://github.com/MiniMax-AI/MiniMax-H3-Image
- MiniMax 官方 awesome 索引：https://github.com/MiniMax-AI/awesome-minimax-h3-integration
- MiniMax Image-01 官方新闻：https://www.minimax.io/news/image-01
- MiniMax 平台发布说明：https://platform.minimax.io/docs/release-notes/models

### 7.2 ComfyUI 官方一手

- ComfyUI Changelog：https://docs.comfy.org/changelog
- H3-Image 发布文：https://blog.comfy.org/p/minimax-h3-image-is-now-available
- H3 Day-0 发布文：https://blog.comfy.org/p/minimax-h3-day-0-support-in-comfyui
- H3-Image 官方教程：https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image
- H3 视频官方教程：https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native
- H3-Image 产品页：https://www.comfy.org/minimax-h3-image/
- `LTXVSeparateAVLatent` 内置节点文档：https://docs.comfy.org/built-in-nodes/LTXVSeparateAVLatent
- `LTXVConcatAVLatent` 内置节点文档：https://docs.comfy.org/built-in-nodes/LTXVConcatAVLatent
- ComfyUI PR #17655：https://github.com/Comfy-Org/ComfyUI/pull/17655
- ComfyUI commit `ede4e5f`：https://github.com/Comfy-Org/ComfyUI/commit/ede4e5fe8d15445c6fcd6828d70b202c22f9502c
- ComfyUI issue #15644：https://github.com/Comfy-Org/ComfyUI/issues/15644
- ComfyUI H3 支持 PR #15224：https://github.com/Comfy-Org/ComfyUI/pull/15224
- H3 节点源码：本次通过 GitHub raw 页面读取，文件名在检索输出中被遮蔽；节点定义可交叉核对 PR #17655 / #15224。

### 7.3 权重与量化

- Comfy-Org/MiniMax-H3-Image：https://huggingface.co/Comfy-Org/MiniMax-H3-Image
- Comfy-Org/MiniMax-H3：https://huggingface.co/Comfy-Org/MiniMax-H3
- Comfy-Org/MiniMax-H3-Image 文件列表：https://huggingface.co/Comfy-Org/MiniMax-H3-Image/tree/main/diffusion_models
- AtomicChat/MiniMax-H3-Image-GGUF（社区量化）：https://huggingface.co/AtomicChat/MiniMax-H3-Image-GGUF

### 7.4 Turbo / 蒸馏 LoRA

- LightX2V MiniMax-H3 Turbo 模型页：https://huggingface.co/lightx2v/Minimax-h3-Turbo
- LightX2V 发布说明（4/8 step、shift 6）：https://huggingface.co/lightx2v/Minimax-h3-Turbo/discussions/57
- Halpak 的 ComfyUI 转换说明（8-step 使用建议）：https://huggingface.co/Halpak/MiniMax-H3-Turbo-Lora-ComfyUI
- ComfyUI Wiki 对 v1.0 的整理（二手交叉核对）：https://comfyui-wiki.com/en/news/2026-08-11-minimax-h3-turbo-lightx2v-v1

### 7.5 社区节点与工作流（一手 README）

- Fizgig H3 Still：https://github.com/shootthesound/ComfyUI-Fizgig-H3-Still
- ComfyUI-MM-1Frame：https://github.com/cicalooo/ComfyUI-MM-1Frame
- astropuzzo MiniMax-H3-Image-Studio：https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio
- rockerBOO H3 单帧节点：GitHub 仓库（仓库名在检索输出中被遮蔽；README 标题为 “MiniMax H3 Image”）
- tori29umai0123/ComfyUI-MiniMaxH3-SingleFrame：https://github.com/tori29umai0123/ComfyUI-MiniMaxH3-SingleFrame
- VRGameDevGirl Select Still Frame（comfy.icu 节点页）：https://comfy.icu/node/VRGDG_MiniMaxH3SelectStillFrame
- Mamad8 单帧 VAE（issue 中引用）：https://huggingface.co/Mamad8/MiniMax-H3-Image-VAE

### 7.6 「视频模型出静帧」的其他模型先例

- GenVidKit：Wan 2.2 单帧静帧（含 Wan 2.1 官方 `t2i-14B` 任务说明，二手）：https://www.genvidkit.com/blog/wan-2-2-text-to-image
- Stable Diffusion Art：Wan 2.2 text-to-image：https://stable-diffusion-art.com/wan-2-2-text-to-image/
- Civitai Wan 2.2 txt2img 工作流：https://civitai.com/models/1861555/wan-22-simple-text-to-image-gguf-txt2img-workflow
- ComfyUI LTX-Video 教程（I2V/首尾帧方向）：https://docs.comfy.org/tutorials/video/ltxv
- LTX 官方 ComfyUI 节点文档：https://docs.ltx.io/open-source-model/integration-tools/ltx-comfy-ui-nodes

### 7.7 二手转述与社区舆情（仅作线索，未回溯一手）

- InfoQ 对 H3 AMA 的报道（专用图像模型在研、推荐图像模型出首帧）：https://www.infoq.cn/article/9C3eK9tJqDXbabbBy3aj
- 玉米小站对 AMA 的转述：https://www.yumiok.com/archives/6614.html
- ChooseAI 对 AMA 的转述：https://www.chooseai.net/news/5616/
- Reddit 快照（astropuzzo 帖）：https://reddit.sentinel-team.org/posts/1veh31j/snapshots/2026-08-06T23%3A10%3A08.193186Z
- Reddit 快照（H3 单图工作流帖）：https://reddit.sentinel-team.org/posts/1vqka28/snapshots/2026-08-21T23%3A11%3A42.158136Z
- note.com 对 H3 单帧扩展的实测（日文）：https://note.com/ai_driven/n/n326309423198?hl=en
- AGI Hunt 对 Reddit H3-Image 本地测试的汇总：https://agihunt.info/en/p/1a1d39cdec62132a72017581d36
- 知乎 H3 8G 显存部署教程：https://zhuanlan.zhihu.com/p/2070799408728367658
- 36kr 对 H3-Image 的评测式介绍：https://eu.36kr.com/en/p/4065447413306505
- blog.byMAR.CO 的 H3-Image 实测：https://blog.bymar.co/posts/minimax-h3-image-16mp-2026/
- openclawdc 的 H3-Image 显存汇总：https://openclawdc.com/blog/minimax-h3-image-vram/
- vyrekai 的 8/12/16GB ComfyUI 工作流说明：https://huggingface.co/vyrekai/minimax-h3-image-comfyui-workflows
- yilives 的 H3-Image 双版本部署指南：https://github.com/yilives/minimax-h3-v100-guide