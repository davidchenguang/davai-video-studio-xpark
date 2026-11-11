// 预设元组为 [存储值, 显示标签, 提示词描述]：
// 存储值与第三段的描述会进入角色描述 / 声音备注（提示词层），保持英文；
// 第二段的标签只出现在下拉框里，属显示层，译为中文。
export const characterAppearancePresets = [
  ['custom', '自定义外貌', ''],
  ['hero', '电影感主角', 'Adult cinematic lead with balanced facial proportions, expressive eyes, a clear silhouette, natural skin texture, and a fit believable build.'],
  ['character-actor', '特征演员', 'Adult character actor with memorable facial geometry, expressive asymmetry, lived-in skin detail, and a distinctive but believable silhouette.'],
  ['editorial', '时尚硬照模特', 'Adult editorial model with sculptural facial planes, long clean lines, controlled posture, and camera-ready natural skin texture.'],
  ['everyday', '日常自然', 'Adult with approachable everyday features, realistic proportions, subtle facial asymmetry, natural skin texture, and an unforced posture.'],
  ['athletic', '运动型演员', 'Adult athletic performer with functional muscle definition, balanced proportions, grounded posture, and a physically capable silhouette.'],
  ['mature', '成熟戏剧感', 'Mature adult with age-authentic facial structure, fine lines, textured skin, confident posture, and strong dramatic presence.'],
  ['comedian', '夸张喜剧', 'Adult comedy performer with highly readable eyes and brows, flexible facial expression, approachable proportions, and energetic body language.'],
  ['action', '动作主角', 'Adult action protagonist with a resilient athletic build, focused eyes, defined facial planes, grounded balance, and a strong readable silhouette.'],
  ['period', '年代剧', 'Adult period-drama performer with classically composed facial proportions, restrained posture, natural skin texture, and timeless screen presence.'],
] as const

export const characterVisualStylePresets = [
  'cinematic photorealism',
  'naturalistic 35mm film',
  'large-format cinematic realism',
  'prestige television realism',
  'documentary naturalism',
  'editorial fashion photography',
  'commercial beauty photography',
  'neo-noir cinematic realism',
  'warm romantic drama',
  'gritty independent film',
  'retro 1970s film realism',
  'high-key studio realism',
  'stylized graphic realism',
  'premium 3D animation',
  'hand-painted storybook animation',
  'anime-inspired cinematic illustration',
] as const

export const characterVoicePresets = [
  ['custom', '自定义声音', ''],
  ['warm-grounded', '温暖沉稳', 'Warm grounded speaking voice, medium-low register, measured pace, clear diction, subtle breath, and emotionally honest delivery.'],
  ['bright-quick', '明亮轻快', 'Bright agile voice, medium register, quick conversational pace, crisp diction, playful timing, and responsive energy.'],
  ['quiet-intense', '安静克制', 'Quiet controlled voice, low volume, deliberate pace, precise diction, restrained emotion, and strong subtext.'],
  ['authoritative', '冷静威严', 'Calm authoritative voice, steady low register, unhurried pace, concise phrasing, and assured presence without shouting.'],
  ['vulnerable', '私密脆弱', 'Intimate close-mic voice, soft register, natural pauses, audible thought, delicate breath, and emotionally vulnerable restraint.'],
  ['comic', '表现力喜剧', 'Expressive conversational voice, elastic pacing, readable reactions, clean comic timing, and spontaneous but controlled energy.'],
  ['documentary', '自然纪实', 'Unpolished natural voice, conversational pace, regional character preserved, small hesitations, and authentic non-performative delivery.'],
  ['elegant', '优雅精准', 'Elegant composed voice, clear resonance, precise diction, controlled tempo, and understated emotional intelligence.'],
  ['weathered', '沧桑粗粝', 'Weathered textured voice, lower register, economical phrasing, rough warmth, deliberate pauses, and lived-in emotional weight.'],
] as const

export const characterPerformancePresets = [
  ['custom', '自定义表演', ''],
  ['natural', '自然主义', 'Performance baseline: naturalistic, grounded, minimal gestures, responsive eye focus, and emotion carried through small facial changes.'],
  ['restrained', '克制戏剧', 'Performance baseline: restrained dramatic presence, still posture, deliberate movement, held eye contact, and layered subtext.'],
  ['energetic', '活力充沛', 'Performance baseline: energetic and physically expressive, quick reactions, open posture, clear gesture shapes, and lively timing.'],
  ['deadpan', '冷面幽默', 'Performance baseline: dry deadpan delivery, economical movement, steady gaze, minimal facial reaction, and precise comic timing.'],
  ['charismatic', '魅力主角', 'Performance baseline: confident charismatic presence, relaxed posture, direct eye focus, controlled gestures, and easy emotional access.'],
  ['nervous', '紧张紧绷', 'Performance baseline: contained nervous energy, guarded posture, darting eye focus, small self-soothing gestures, and interrupted breath.'],
  ['physical', '肢体表演者', 'Performance baseline: body-led acting, clear weight shifts, readable silhouette, precise spatial awareness, and controlled physical storytelling.'],
  ['voiceover', '声音主导', 'Performance baseline: voice-forward acting with disciplined breath, precise phrasing, controlled facial movement, and restrained body language.'],
] as const

export function appendPreset(current: string, addition: string) {
  if (!addition || current.toLowerCase().includes(addition.toLowerCase())) return current
  return [current.trim().replace(/[.\s]+$/, ''), addition].filter(Boolean).join('. ')
}
