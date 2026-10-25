/**
 * LLM 提示词模板集合（复用 Studio 规范）
 */

import { generateText } from './providers/index.js';

// ── 艺术风格推荐（文本模型读剧本推荐 3 种）───────────────────────
export const PROMPT_RECOMMEND_STYLES = `你是一个专业的影视艺术指导顾问。请阅读以下短剧剧本，推荐恰好 3 种适合该剧本的视觉艺术风格。

**输出格式**：
只返回 JSON 对象数组，每个对象包含：
- "style_name_cn"：风格名称（中文，简洁有力，如"水墨古韵""赛博霓虹"）
- "positional_prompt"：英文正向提示词（详细描述画面风格、光影、色调、质感，适合直接用于 AI 生图/生视频）
- "negative_prompt"：英文负向提示词（描述要避免的元素）
- "reason_cn"：中文推荐理由（一句话说明为什么适合这个剧本）

**要求**：
1. 严格推荐恰好 3 种风格，不多不少
2. 禁止提及剧本中的具体人物姓名、地点、情节，只描述视觉风格
3. 风格要有明显差异，覆盖不同审美取向（但差异只在相同维度/调性内的不同美术分支之间，不要通过切换维度或调性来制造差异）
4. positional_prompt 要足够详细（2-3 句），包含时代背景、画面质感、光影氛围、色彩调性
5. negative_prompt 要明确指出要避免的视觉元素
6. 直接返回 JSON，不要任何其他解释文字
7. **【最高优先级】尊重作者显式设定**：剧本开头常含设定行（如「视觉风格：国风3D动画」「剧作基调：幽默轻喜剧」「画风：xxx」「基调：xxx」等）。若检测到此类设定，**必须严格以其为准**，不得擅自变更：
   - 设定写「3D/三维」则 3 种风格全部必须是 3D 渲染路线（禁止推水墨、浮世绘、版画等 2D/平面化风格）；
   - 设定写「2D/二维/动画」则全部走 2D 路线；
   - 设定写「轻喜剧/幽默/搞笑」基调则全部走明快、俏皮、暖色调路线（禁止推暗黑、阴森、恐怖基调）；
   - 设定写「悬疑/暗黑/严肃」基调则可在暗色系内发挥；
   - 3 种风格须是同一维度、同一调性下的不同美术分支（如「明快国风3D / 俏皮志怪3D / 暖色皮影3D」），而不是维度或调性互相冲突。

剧本内容：
{{script_text}}`;

// ── 角色场景提取（用于 AI 分析角色与场景）────────────────────────
/** 通用「只吐合法 JSON」系统提示词：任何要求 LLM 返回结构化数据的场景都可复用 */
export const PROMPT_JSON_ONLY_SYSTEM = `你是结构化信息抽取引擎，只输出严格合法的 JSON。
硬性输出规范：
1. 不得输出任何解释、前言、后记或 Markdown 代码围栏（不要 \`\`\`）。
2. 键与字符串值一律用双引号，不得出现尾随逗号，不得在字符串内换行。`;

/** 实体抽取专用系统提示词：在通用 JSON 约束之上锁死顶层结构，配合低温度使用。 */
export const PROMPT_EXTRACT_ENTITIES_SYSTEM = `${PROMPT_JSON_ONLY_SYSTEM}
3. 顶层结构固定为 {"characters":[], "scenes":[], "props":[]}，三个键必须全部出现（无内容给空数组）。
4. 剧本没写清的信息按语境合理推断补全，但不得编造剧本中不存在的实体。`;

export const PROMPT_EXTRACT_ENTITIES = `请分析以下短剧剧本，提取其中的角色、场景和关键道具，并**直接写出可用于 AI 生图的视觉描述词**（用户后续只会在你的基础上微调，所以描述必须具体、统一、能成图）。

第一步：先判断整部剧本的时代基调（古风 / 现代 / 科幻 / 奇幻 等），所有角色、场景、道具的服饰、建筑、质感、色调都必须与该时代一致，不要混搭。

**输出格式**：JSON 对象，包含三个数组。每个元素都有 name / variant / description 三个字段：
- "characters"：角色数组。🔴 **一个角色只输出一条，绝不按服装/造型/年龄段拆分**。
  · name：角色本名，不要带任何造型、身份后缀（写"顾拾遗"，不要写"顾拾遗（男主）""顾拾遗·戏装扮相"）。
  · variant：**固定给空字符串 ""**。
  · description：一段完整的中文视觉描述（直接当生图提示词用），顺序为：性别与大致年龄 → 脸型五官 → 肤色 → 发型发色 → 体型身高 → 服饰（款式/颜色/材质，符合时代与身份）→ 标志性配饰 → 整体色调与画风。服饰部分只写该角色在剧中的**日常造型**。
- "scenes"：场景数组。variant 一般给空字符串。description 写：时代与地点 → 建筑或自然环境特征 → 光线与时间 → 天气 → 氛围色调 → 构图要点（如空旷宫殿、拥挤街市、幽暗密室）。
- "props"：关键道具/物件数组。variant 一般给空字符串。description 写：材质/形态/颜色/尺寸感 → 在剧情中的作用（如法器、信物、特殊器物），便于生成辨识度高的特写。

🔴 **一人一条规则（characters 专用，最重要）**：
1. 同一角色无论剧中换过几套衣服、是否变装/易容/伪装、是否出现不同年龄段，都**只输出一条**，variant 恒为空字符串。
2. description 里的服饰只写该角色的**日常造型**——按其身份与时代背景，最常见、最常态的那套装扮。
3. 🔴 明确禁止把这些写进 description：变装后的装扮、易容/伪装后的样貌、戏装扮相、礼服/婚服/丧服、战损血污、战斗装束、幼年或老年状态。
   这类特殊造型由后续的「资产」环节单独派生，不属于本次抽取范围。
   若剧本里该角色只有特殊造型（如全程戏装登台），才按剧本那套写，仍然只输出一条。
4. 外貌（脸型、五官、肤色、发型发色、体型身高）按剧本中的实际身份推断，剧本没写清处给出合理且风格统一的具体描写，同一角色只写一份。

**要求**：
1. props 只提取在剧情中具有辨识度或推动作用的关键道具，不要罗列普通杂物
2. 三个数组都允许为空；没有的就不要编造
3. 同一角色在 characters 里只能出现一次，name 必须唯一（下游按 name 匹配，重复会导致同一人分裂成多个）
4. description 一律用中文、画面感强、不出现人名前缀与台词文字，可直接拼进生图 prompt

直接返回 JSON，不要其他文字。

剧本内容：
{{script_text}}`;

// ── 分镜拆解（LLM 分析剧本 → 逐镜头的动作/台词/运镜/生图提示词）───────
// ── 分镜拆解（LLM 分析剧本 → 逐镜头的动作/台词/运镜/生图提示词）───────
export const PROMPT_STORYBOARD_SHOTS = `你是短剧分镜师。请把下面的剧本拆解成可直接用于 AI 生成的「分镜表」。

已知设定（必须沿用，不得自创与之冲突的外观）：
- 艺术风格：{{style}}
- 角色：{{characters}}
- 场景：{{scenes}}

输出格式：JSON 数组，每个元素是一个分镜，包含：
  - "characters"：该分镜出场角色名数组（写剧本给定的角色名，如 ["顾拾遗","苏剪云"]；必须与上面「角色」里的名字一字不差，没出场的角色不要写）
    → 🔴 若该角色有多套造型（名字里带「·造型」），必须写这个镜头实际穿的那套的完整名称，如 "顾拾遗·夜行黑袍"；
      只写本名的话系统会默认取该角色的第一套造型，可能和剧情对不上。
  - "action"：该镜头里发生的动作过程，写清人物做什么、怎么发展（40字内，画面感强）
  - "dialogue"：该镜头的人物台词
  - "duration"：本分镜时长（秒），范围 5-15，按动作复杂度合理估算（用于字幕时间轴与成片节奏，实际生成可微调）
  - "camera"：景别与运镜
  - "shot_type"："远景" / "全景" / "中景" / "近景" / "特写" 之一
  - "lens_type"：镜头类型（标准/广角/长焦/微距/手持防抖/稳定器）
  - "imagePrompt"：分镜图提示词（用来预览这个分镜大概是什么样的，可以是这个分镜中间的精彩瞬间）
    → 按顺序写：时代与画面风格 → 镜头景别与拍摄视角 → 场景环境细节 → 人物位置和动作神态 → 光线与氛围 → 画质要求
  - "firstFramePrompt"：视频首帧提示词（🔴 这张图会直接作为图生视频的第 0 秒输入，画面质量决定成片上限）
    定义：镜头刚开始、动作尚未发生时的静止画面。禁止写任何"正在做"的动作，只能写静止的位置与姿态。
    → 按顺序写，六段缺一不可：
      ① 时代与画面风格（与全局艺术风格严格一致，逐字沿用上面的「艺术风格」）
      ② 镜头景别与拍摄视角（用 shot_type + lens_type 的具体值，如「中景 · 标准镜头 · 平视」）
      ③ 场景环境细节（地点、陈设、材质、背景层次，写足 20 字以上）
      ④ 主体与静止姿态（画面里有几个人、各自站在画面哪个位置、什么站姿/坐姿/手势、什么表情，
         一律用「静止、站定、手垂放身侧、目光看向X」这类静态动词）
      ⑤ 光线与氛围（光源方向、色温、明暗对比、大气效果）
      ⑥ 画质锚点（固定以「电影级质感，超高细节，肤色自然，构图稳定，主体完整入画，无运动模糊，无文字水印」结尾）
    硬性禁止：不得出现"正在""奔跑中""挥手""挥剑""转身""模糊""动态""高速运动"等过程性/动态描述；
             不得出现字幕、文字、logo、水印；不得写多人混战或肢体交叠的混乱构图；
             首帧必须和下文 imagePrompt 是同一场景、同一人物、同一套服装与光影（只是姿态不同）。

  - "videoPrompt"：视频运动提示词（🔴 与 firstFramePrompt 完全不是一回事：firstFramePrompt 是静止起始画面，本字段描述从该首帧开始的「动态过程」）。
    必须包含、缺一不可：
      ① 视频时长（与本镜 duration 一致，单位秒，如「本镜 8 秒」）
      ② 运镜描述（镜头如何运动：推 / 拉 / 摇 / 移 / 跟 / 升降 / 环绕 / 手持晃动，以及运动速度、起止）
      ③ 人物 / 物体动作如何随时间展开（起手 → 发展 → 收束，具体到肢体与位移）
      ④ 特效描述（如有：转场、光效、粒子、慢动作、景深变化、天气/流体模拟等；没有就写"无特殊特效"）
      ⑤ 光影与氛围的时间变化（如从暗到亮、逆光转顺光、烛火摇曳）
    硬性禁止：不得写"静止""站定""起始状态""动作尚未发生"等首帧静态描述——那是 firstFramePrompt 的职责，写在这里会锁死视频不动。

  - "continuity"（可选）：跨镜连续性锚点，用于保证同一场景相邻镜头的人物站位/光照/轴线一致，避免拼接长片时人物漂移。包含：
    · "worldPos"：本镜相对固定地标的世界位置（如"距门框三步、靠左墙"），换机位也不变；
    · "axis"：180°轴线说明（机位在角色连线哪一侧、本镜是否越轴），同一场景连续镜头禁止擅自越轴；
    · "lighting"：本镜光照基线（光源方向、色温、明暗），与上一镜同场景镜头必须一致；
    · "firstFrameHard"：首帧硬描述，把首帧画面展开为零指代的全物理描述（不依赖"同上/照旧"等上下文词），作为图生视频第 0 秒输入。
    → 只有确实需要保证跨镜一致时才填，单镜独立场景可省略。

要求：
1. 每个分镜时长 10-15 秒，按顺序生成不要跳过剧情。
2. 相邻分镜的人物外观、服装、色调、时代感必须一致
3. 所有 prompt（imagePrompt / firstFramePrompt）必须直接使用剧本给定的角色名（如「顾拾遗」「苏剪云」），禁止用「男主」「女主」等泛指指代；人物外貌、服装、发型严格沿用「角色」设定中的描述，不得自行改写或添加未设定的外貌
4. 只返回 JSON 数组，不要任何解释文字
5. 🔴 零指代禁令：所有 prompt 与 continuity 不得出现"同上/继续/照旧/保持原样/和之前一样/仍然"等依赖上下文的词；每镜都写全物理描述，拼接长片时不依赖上一镜。
6. 🔴 跨镜一致性：同一场景的相邻镜头，continuity 里的 worldPos / axis / lighting 必须保持一致（禁止只写"还在原来的位置"）；本镜未指定造型的角色统一取其第一套造型。

剧本内容：
{{script_text}}`;

// ── 分集拆解（LLM 将剧本拆成集数）───────────────────────────────
export const PROMPT_SPLIT_EPISODES = `请将以下短剧剧本按集拆分，每集包含独立的剧情线。

**输出格式**：JSON 数组，每集包含：
- "episode_number"：集数（从1开始）
- "title"：集标题
- "scenes"：该集场景列表，每项包含 scene_name 和 brief_description

直接返回 JSON。`;

// ── 反馈润色（用于优化生图/生视频提示词）─────────────────────────
export const PROMPT_WITH_FEEDBACK = `你是一个专业的 AI 绘画/视频提示词优化师。

当前提示词：{prompt}
用户反馈：{feedback}

请根据反馈优化提示词，保持原有风格但改进不足的地方。直接返回优化后的提示词。`;

// ── 视频提示词润色内置默认（设置里「图生视频/参考视频提示词润色」留空时启用）──
// 核心诉求（2026-09-23 用户反馈）：生成的视频没运镜 → 润色必须产出显式运镜与动态描述
const VIDEO_POLISH_COMMON = `你是影视级 AI 视频提示词润色师。把用户的原始提示词扩写成一段可直接用于 AI 视频生成模型的中文提示词。

**润色硬性要求**：
1. 【镜头以用户为准】景别与运镜**严格沿用用户原始提示词中已有的描述**：用户写了运镜就展开写清起止（如「镜头缓缓推进」），用户没写运镜则只写「固定机位，画面平稳」，**禁止自创**推、拉、摇、移、跟、升降、环绕、手持晃动等用户未提供的运镜。
2. 【动作与时间线】只对用户提示词中已有的动作做连贯、合理的展开，按时间顺序写；**禁止添加用户未描述的人物动作、情节或事件**。
3. 【人物表情与情绪】表情与情绪只在用户提示词语义范围内合理细化（如用户写了「抬眼」，可写「抬眼，目光沉静」）；**禁止添加用户未写明的情绪爆发或表情变化**。
4. 【氛围与光照】**严格沿用用户提示词中已有的光源、色调、氛围**；用户没写光影则只写中性自然光，**禁止自创**用户未提及的色温、光源方向、雾气、光斑、尘埃等大气效果。
5. 【一致性】严格保持用户提示词与所给参考信息中的人物外貌、服装、场景风格、时代感，不得自创冲突设定。
6. 【画质】结尾补影视级画质词（电影级质感、高细节、浅景深、动态模糊自然等）。
7. 不出现字幕/文字/水印/logo。
8. 只返回润色后的提示词正文，不要任何解释、前缀或引号。`;
export const PROMPT_VIDEO_POLISH_I2V = `${VIDEO_POLISH_COMMON}

本条视频为「首帧驱动」：生成以用户提供的首帧图为起点（可能含尾帧图约束画面结束状态）。描述必须从首帧画面自然起始，运镜与动作要与首帧内容衔接，不得凭空换场景。

用户输入信息：
{{user_input}}`;

export const PROMPT_VIDEO_POLISH_REF = `${VIDEO_POLISH_COMMON}

本条视频为「角色驱动」：以用户提供的参考图（角色三视图/场景/道具）约束人物与场景外貌。描述中的人物动作必须与参考图中的角色形象一致，场景与参考图相符。
参考写法（借鉴 H3 I2VA/FL2VA 范式）：以参考图作为视频起点，先描述参考图中的静止起始状态，再展开动作；若有尾帧约束则收尾状态须与尾帧一致；中间只给连接首尾的运动路径，不要重复描述两张静态图。

用户输入信息：
{{user_input}}`;

/**
 * 视频提示词润色系统提示词：优先取设置里用户自定义的
 * （APP_SETTINGS.defaultPrompts.i2v / .ref），留空则用内置默认。
 */
export function videoPolishSystemPrompt(mode) {
  let custom = '';
  try {
    const s = JSON.parse(localStorage.getItem('APP_SETTINGS') || '{}');
    custom = String((s.defaultPrompts || {})[mode === 'r2v' ? 'ref' : 'i2v'] || '').trim();
  } catch {}
  return custom || (mode === 'r2v' ? PROMPT_VIDEO_POLISH_REF : PROMPT_VIDEO_POLISH_I2V);
}

/**
 * U00 · 调度机视频提示词细化端点（Qwen3.8-27B，中文六段结构化输出）。
 *
 * 与上面的通用 LLM 润色（videoPolishSystemPrompt + /api/llm/chat）的区别：
 *   ┌ 通用 LLM：普通 chat，输出自由文本，靠系统提示词约束格式，不吃参考图；
 *   └ U00：视频模型**专属细化模型**，按「主体/动作/场景/运镜/光影/风格」六段结构化输出，
 *          且能吃参考图（reference_images），产出的提示词更贴 i2v / r2v 工作流。
 *
 * 实现：面板工作流 `U00-minimax_h3提示词QWEN3.8群主版`（经调度机 /api/generic/generate 提交，
 *   与其他面板工作流一样由调度机统一计费 + 开机派发）。工作流结构：
 *     LoadImage 1~9（9 张参考图）→ ZealmanLLM_ModelLoader 14（Qwen3.8-27B-Q4_K_M + mmproj）
 *     → ZealmanLLM_Generate 15（系统提示词烤死在此节点）→ ShowText 13（输出文本）
 *   所以调用方只喂「1~9:image」和「15:提示词」，系统提示词不覆盖。
 *
 * @param {object}   p.shot            - 分镜（sceneDesc / dialogue / cameraMove / imagePrompt）
 * @param {string}   p.mode            - 'i2v' | 'r2v'
 * @param {number}   p.duration        - 视频时长（秒）
 * @param {string}   p.camera          - 分镜标注的景别与运镜（可空，空则由 U00 自行规划）
 * @param {string}   p.style           - 美术风格（可空，拼进提示词让 U00 按该风格写）
 * @param {string[]} p.referenceImages - 参考图 URL（i2v 传首尾帧，r2v 传角色/场景参考图，上限 9 张）
 * @returns {Promise<string>} 细化后的提示词正文
 */
export async function refineVideoPromptU00({
  shot = {}, mode = 'i2v', duration = 5, camera = '', style = '', referenceImages = [],
} = {}) {
  const rules = [
    mode === 'i2v'
      ? '【驱动模式】首帧驱动：画面必须从参考的首帧图起始，人物外貌、服装、场景陈设与首帧图保持一致；有尾帧时收尾状态须与尾帧图一致'
      : '【驱动模式】角色驱动：人物外貌、服装、发型必须与参考图完全一致，场景与参考图相符',
    `【时长】视频总时长 ${duration} 秒，动作节奏按此时长规划，不要出现超出时长的复杂动作`,
    '【镜头语言】每个镜头写全：景别与机位、构图、运镜（具体到镜头距离/运动速度/主体位置关系）、光影方案；禁止「平稳跟随」「镜头缓缓」这类模糊描述',
    '【约束】画面中只出现描述里明确提及的人物与物件，不得凭空增加任何人、道具或装饰',
    '【输出】中文六段结构化描述，可直接作为视频生成提示词使用，不要输出解释性文字或 markdown 代码块',
  ].join('\n');

  const shotInfo = [
    `分镜标题：${shot.title || shot.sceneDesc || '未命名分镜'}`,
    `时长：${duration}秒`,
    `分镜描述（动作）：${shot.sceneDesc || ''}`,
    `对话内容：${shot.dialogue || ''}`,
    `画面参考描述（首帧 / 静止起始）：${shot.firstFramePrompt || shot.imagePrompt || ''}`,
    camera ? `用户指定运镜：${camera}` : '用户未指定运镜，请按镜头语言规则自行规划',
    style ? `美术风格：${style}` : '',
  ].filter(Boolean).join('\n');

  // 🔴 只喂服务端能取到的图：asset:// / blob: / file: 这类本地协议调度机读不到，
  //    传过去只会让 U00 报错或忽略，直接滤掉（没图时 U00 退化成纯文本细化）。
  const refs = (referenceImages || []).filter(
    (u) => typeof u === 'string' && /^https?:\/\//i.test(u)
  ).slice(0, 9);

  // 9 个 LoadImage 槽（节点 1~9）：没图的填空串（与 Q22 一致，面板接受空槽）
  const inputValues = {};
  for (let i = 1; i <= 9; i += 1) inputValues[`${i}:image`] = refs[i - 1] || '';
  // 节点 15 ZealmanLLM_Generate：提示词字段（系统提示词烤死在工作流里，不覆盖）
  inputValues['15:提示词'] = `${shotInfo}\n\n${rules}`;

  const text = await generateText(
    [
      { role: 'system', content: '你是专业的分镜提示词细化助手，请按用户要求输出中文六段结构化视频生成提示词。' },
      { role: 'user', content: `${shotInfo}\n\n${rules}` },
    ],
    { maxTokens: 2000, temperature: 0.7 }
  );
  return String(text || '').trim();
}

/**
 * 包装 LLM 调用，支持 feedback 模式
 */
export async function withFeedback(client, basePrompt, feedback, maxTokens = 1000, temperature = 0.7) {
  const prompt = PROMPT_WITH_FEEDBACK
    .replace("{prompt}", basePrompt)
    .replace("{feedback}", feedback);
  return await client.chat(prompt, { llmType: 'prompt_refine', maxTokens, temperature });
}

/**
 * 解析 LLM 返回的 JSON（容错处理）
 *
 * 旧实现用贪婪正则 `(\[.*\]|\{.*\})`，遇到「顶层是对象、内部有数组」或
 * 「数组出现在对象之前」的返回会截出非法片段，且失败即放弃。现改为：
 *   ① 直接 parse（含代码围栏剥离）
 *   ② 括号配对扫描（字符串感知）收集所有候选片段，从外到内
 *   ③ 每个候选再试几种修复：尾随逗号 / 行注释 / 单引号 / 截断补齐
 *   ④ 仍失败则做「最长有效前缀」回退：被 max_tokens 截断的 JSON 从尾部逐字回退，
 *      取最后一个能完整解析的前缀（抢救出截断前已生成的那部分实体）
 *
 * 已合并旧 utils.js `repairAndParse()` 的能力（2026-10-20），全项目 JSON 容错只留这一套。
 */
export function parseJsonLax(text) {
  if (!text) throw new Error("AI 未返回结果");
  const raw = String(text).trim();
  try { return JSON.parse(raw); } catch (_) {}

  const s = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const candidates = [s];

  // 括号配对扫描：从每个 { / [ 出发，收集最外层完整片段
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== "{" && ch !== "[") continue;
    const end = _matchBracket(s, i);
    if (end > 0) {
      candidates.push(s.slice(i, end + 1));
      i = end; // 已收下最外层，跳过其内部
    } else {
      // 未闭合 → 多半被 max_tokens 截断，尝试补齐后收为候选
      const closed = _closeUnterminated(s.slice(i));
      if (closed) candidates.push(closed);
      break;
    }
  }

  // 所有候选都试一遍再择优：优先「对象」而非「数组」（返回体里常有被引用的小数组，
  // 先扫到它会误把它当成结果），同类型取更长的那个（信息更全）。
  const hits = [];
  for (const c of candidates) {
    for (const fixed of _jsonRepairs(c)) {
      const v = _tryParse(fixed);
      if (v !== undefined) hits.push({ v, score: (Array.isArray(v) ? 0 : 1e6) + fixed.length });
    }
  }
  if (hits.length) {
    hits.sort((a, b) => b.score - a.score);
    return hits[0].v;
  }

  // ④ 最后一招：所有候选都修不好（典型的 max_tokens 截断），从尾部逐字回退，
  //    找出最后一个能完整解析的前缀——宁可少几个实体，也比整次抽取失败强。
  const salvaged = [];
  for (const c of candidates) {
    for (const fixed of _jsonRepairs(c)) {
      const v = _longestValidPrefix(fixed);
      if (v !== undefined) salvaged.push({ v, score: (Array.isArray(v) ? 0 : 1e6) + fixed.length });
    }
  }
  if (salvaged.length) {
    salvaged.sort((a, b) => b.score - a.score);
    return salvaged[0].v;
  }
  throw new Error("无法解析 AI 返回的内容");
}

/** 解析成功返回对象/数组，失败返回 undefined（区分「解析出 null/false」与「没解析出来」） */
function _tryParse(s) {
  try {
    const v = JSON.parse(s);
    return v !== null && typeof v === "object" ? v : undefined;
  } catch (_) {
    return undefined;
  }
}

/**
 * 最长有效前缀：从尾部逐字符回退，取第一个能完整解析的前缀。
 * 只在回退到 `}`/`]`/末尾引号 时才试（其他位置截出来的必是残缺字面量，白试）。
 * 副作用：截断前的完整条目会被保留，残缺的最后一条被丢弃。
 */
function _longestValidPrefix(s) {
  if (!s) return undefined;
  // 先把未闭合的括号补上（balanceBrackets），否则整个串永远解析不了
  const closed = _closeUnterminated(s.replace(/[,，]\s*$/, "")) || s;
  const src = closed.length > s.length ? closed : s;
  for (let i = src.length; i > 1; i--) {
    const ch = src[i - 1];
    if (ch !== "}" && ch !== "]" && ch !== '"') continue;
    const v = _tryParse(src.slice(0, i));
    if (v !== undefined) return v;
  }
  return undefined;
}

/** 字符串感知的括号配对：从 open（必须是 { 或 [）返回闭括号下标；未闭合返回 -1 */
function _matchBracket(s, open) {
  const openCh = s[open];
  const closeCh = openCh === "{" ? "}" : "]";
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { // 跳过整个字符串字面量（含转义）
      i++;
      while (i < s.length) {
        if (s[i] === "\\") { i += 2; continue; }
        if (s[i] === '"') break;
        i++;
      }
      continue;
    }
    if (c === openCh) depth++;
    else if (c === closeCh && --depth === 0) return i;
  }
  return -1;
}

/** 给被截断的 JSON 补上缺失的闭括号/闭合字符串 */
function _closeUnterminated(src) {
  let s = src.replace(/[,，]\s*$/, "");
  let inStr = false;
  let esc = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  if (inStr) s += '"';
  if (!stack.length) return null;
  return s + stack.reverse().join("");
}

/** 常见 JSON 毛病的修复变体（按尝试顺序：越靠前越保守） */
function _jsonRepairs(src) {
  const out = [src];

  // ① 去行注释。注意不能简单 `/\/\/.*$/gm` —— 那会把值里的 `https://…` 一起吃掉。
  //    只认「行首或空白之后的 //」。
  const noComment = src.replace(/(^|\s)\/\/.*$/gm, "$1");
  if (noComment !== src) out.push(noComment);

  // ② 去尾随逗号（{…,} / […,]）
  const base = noComment !== src ? noComment : src;
  const noTrailing = base.replace(/,(\s*[}\]])/g, "$1");
  if (noTrailing !== base && !out.includes(noTrailing)) out.push(noTrailing);

  // ③ 补未闭合的括号/字符串（被 max_tokens 截断）
  const closed = _closeUnterminated(noTrailing);
  if (closed && closed !== noTrailing) out.push(closed);

  // ④ 单引号键/值：先做精准替换（只动 'key': 和 : 'value' 形态）
  const singlePrecise = noTrailing
    .replace(/([{,]\s*)'([^'\n]+)'(\s*:)/g, '$1"$2"$3')
    .replace(/:\s*'([^'\n]*)'/g, ': "$1"');
  if (singlePrecise !== noTrailing) out.push(singlePrecise);

  // ⑤ 兜底：粗暴把所有单引号换成双引号。会破坏 "it's" 这类正确写法，故放最后。
  const singleBrutal = noTrailing.replace(/'/g, '"');
  if (singleBrutal !== noTrailing && !out.includes(singleBrutal)) out.push(singleBrutal);

  return out;
}

/**
 * 实体名归一化：用于去重与下游「按名匹配参考图」。
 * 吃掉空白、全半角差异、括号后缀（顾拾遗（男主）→ 顾拾遗）、间隔号与大小写，
 * 避免同一个实体被抽成多条、或分镜里对不上。
 */
export function normalizeEntityName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[·・．.]/g, "")
    .toLowerCase();
}

/**
 * 实体的「本名」：去掉造型标签与身份后缀。
 * `顾拾遗·夜行黑袍` → `顾拾遗`；`顾拾遗（男主）` → `顾拾遗`。
 * 同一个人物的多套造型本名相同，下游靠它判断「这是同一个人的两套衣服」。
 */
export function entityBaseName(e) {
  const raw = e && typeof e === "object" ? e.baseName || e.name || e.title || "" : String(e ?? "");
  return String(raw)
    .replace(/[（(][^）)]*[）)]/g, "")   // 身份后缀：顾拾遗（男主）
    .split(/[·・]/)[0]                    // 造型标签：顾拾遗·夜行黑袍
    .trim();
}

/**
 * 造型变体的显示名：`顾拾遗` + `夜行黑袍` → `顾拾遗·夜行黑袍`。
 * 存进 materials.name，列表与分镜提示词都直接显示它，用户能一眼分清两套造型。
 */
export function entityDisplayName(name, variant) {
  const n = String(name ?? "").trim();
  const v = String(variant ?? "").trim();
  if (!v) return n;
  if (!n || n === v || n.endsWith(`·${v}`)) return n;   // LLM 已把造型写进 name 时不重复拼
  return `${n}·${v}`;
}

/**
 * 实体去重键：本名 + 造型标签。
 * 同名不同造型 = 两个键（变装前 / 变装后各成一条）；同名同造型 = 一个键。
 * 老数据没有 variant / baseName，键为「本名|」，语义等同于「唯一造型」，不会重复追加。
 */
export function entityKey(e) {
  const variant = e && typeof e === "object" ? e.variant ?? "" : "";
  return normalizeEntityName(entityBaseName(e)) + "|" + normalizeEntityName(variant);
}

/**
 * 工作台生图提示词（主视图 / 四视图 / 头像），按资产类型区分。
 * 抽出成共享函数，供「角色工作台」(modals.jsx) 与「派生造型直接出图」(steps1.jsx)
 * 复用，避免两处各写一份导致漂移。
 * 注意：人物才能用 Standing pose / neutral expression 这类拟人后缀，否则动物会被画成直立、
 * 场景会被画成白底角色设计图。
 */
export const WB_PROMPTS = {
  master: {
    character: (n, d) => `Single human character, full body standing pose, centered in frame, neutral expression, looking at viewer. ${n}. ${d}. Clean white background, isolated, no other objects, no scenery, simple background, high quality, masterpiece.`,
    scene: (n, d) => `Cinematic establishing shot of ${n}. ${d}. Wide angle view of the environment, no people, no characters, atmospheric lighting, highly detailed background art, cohesive composition, high quality, masterpiece.`,
    prop: (n, d) => `Single prop design of ${n}. ${d}. One object centered on a clean white background, isolated, no other objects, no scenery, high quality, masterpiece.`,
  },
  threeViews: {
    character: (n, d) => `Three-view character design sheet. Front view, Side view, Back view — same character appearance, face, hairstyle, and clothing across all three views. Standing pose, neutral expression, consistent details, clean white background, simple background, high quality, masterpiece.`,
    scene: (n, d) => `Three-angle concept views of the scene ${n}. ${d}. The same environment shown from three different angles, no people, consistent lighting, architecture and style across all views, wide shot, high quality, masterpiece.`,
    prop: (n, d) => `Three-angle concept views of the prop ${n}. ${d}. The same single prop shown from three different angles (front, side, back), clean white background, consistent shape and details across all views, high quality, masterpiece.`,
  },
  avatar: {
    character: (n, d) => `Close-up portrait of a single human. ${n}. ${d}. Zoom in on face and shoulders, detailed facial features, neutral expression, facing the camera, clean white background, isolated, high quality, masterpiece.`,
    scene: (n, d) => `Close-up detail shot inside the scene ${n}. ${d}. Rich material and texture details, atmospheric lighting, no people, high quality, masterpiece.`,
    prop: (n, d) => `Close-up detail shot of the prop ${n}. ${d}. Fine surface texture details, clean simple background, high quality, masterpiece.`,
  },
};

/** 按槽位 + 资产类型构造工作台生图提示词（与 WB_SLOTS 完全一致） */
export function buildWorkbenchPrompt(slot, name, desc, type) {
  const group = WB_PROMPTS[slot] || WB_PROMPTS.master;
  const fn = group[type] || group.character;
  return fn(name, desc);
}

/**
 * 把「外观描述」切成两半：锁身份的「外貌/画风」与可替换的「服饰/配饰」。
 *
 * 🔴 为什么需要它：派生造型时如果整段继承父角色的描述，服装那几句（日常夹克/牛仔裤）
 *    会跟着一起进提示词，生成结果自然还是原来那套造型。派生只该继承「脸 + 发型 + 体型 + 画风」，
 *    服装必须由用户为新造型单独填写。
 *
 * 抽取提示词里 description 是固定顺序（性别年龄 → 脸型五官 → 肤色 → 发型发色 → 体型身高 →
 * 服饰 → 配饰 → 整体色调画风），所以按句找第一句「带服饰特征词」的位置切一刀即可。
 * 切点之后若还有「整体色调/画风」这类总结句，仍归回外貌侧（造型换了，画风不变）。
 *
 * @returns {{looks: string, outfit: string}} looks=锁身份部分，outfit=服饰部分
 */
const OUTFIT_HINT_RE = /(身穿|穿着|身着|上身|下身|外套|夹克|衬衫|T恤|卫衣|毛衣|西装|制服|长裙|短裙|长袍|蟒袍|袍子|戏服|铠甲|盔甲|披风|大衣|风衣|棉袄|马甲|背心|长裤|短裤|牛仔|靴|布鞋|皮鞋|腰带|围巾|领带|圆领|高领|斗笠|衣料|配饰|裙|鞋|裤)/;
const STYLE_TAIL_RE = /(画风|风格|色调|质感|氛围)/;

export function splitAppearance(desc) {
  const s = String(desc || "").trim();
  if (!s) return { looks: "", outfit: "" };
  // lookbehind 保留句末标点，拼接回去不丢标点
  const parts = s.split(/(?<=[。；;！!])/).map((x) => x.trim()).filter(Boolean);
  const idx = parts.findIndex((p) => OUTFIT_HINT_RE.test(p));
  if (idx < 0) return { looks: s, outfit: "" };          // 描述里没写服饰：全归外貌

  // 服饰段之后连续出现的「整体画风」整句仍算外貌（造型变、画风不变）
  let end = parts.length;
  const styleSentences = [];
  for (let i = parts.length - 1; i > idx; i--) {
    if (STYLE_TAIL_RE.test(parts[i])) { styleSentences.unshift(parts[i]); end = i; } else break;
  }

  // 服饰段自身常是逗号连写：「…，衣料有磨损感，整体色调灰暗低调，都市写实画风。」
  // 画风尾巴要跟着外貌走，否则换装后连画风锚点都被当成服装一起改掉
  const outfitSentences = parts.slice(idx, end).map((x) => x.trim());
  const lastIdx = outfitSentences.length - 1;
  const subClauses = outfitSentences[lastIdx].split(/(?<=[，,])/);
  const cutIdx = subClauses.findIndex((t) => STYLE_TAIL_RE.test(t));
  if (cutIdx > 0) {
    styleSentences.unshift(subClauses.slice(cutIdx).join("").trim());
    outfitSentences[lastIdx] = subClauses.slice(0, cutIdx).join("").trim();
  }

  const stripTail = (t) => t.replace(/[，,、\s]+$/, "");
  return {
    looks: [...parts.slice(0, idx), ...styleSentences].join("").trim(),
    outfit: stripTail(outfitSentences.join("").trim()),
  };
}

/**
 * 派生造型的「图生图」提示词：基于人物原图改服装/年龄，但**锁死身份**。
 * 关键约束前置：相同的人物、相同的脸/发型/身材比例/画风，只换造型。
 * @param {string} variant 造型标签（如「夜行黑袍」「少年时期」）
 * @param {string} extra   这套造型的具体服装/妆造描述（务必传！空串时只能按标签盲换装）
 */
export function buildVariantImg2ImgPrompt(variant, extra) {
  const v = String(variant || "").trim();
  const x = String(extra || "").trim();
  // 服装描述优先、标签兜底：标签往往只有 2-4 个字，单靠它换装几乎等于没换
  const change = [x, v].filter(Boolean).join("，");
  return `Maintain the EXACT same character — identical face, hairstyle, body shape, proportions, and art style. Do NOT alter the person's identity. Only change the outfit / appearance to: ${change || "a different costume"}. Full body standing pose, neutral expression, looking at viewer, clean white background, isolated, high quality, masterpiece.`;
}

/* ══════════════ 从剧本反查某一套造型的服装 ══════════════ */

/**
 * 服装 / 妆造类关键词。用来在剧本里定位「换装那一段」的候选段落。
 * 只做召回，不做判断——真正的取舍交给 LLM。
 */
const COSTUME_TERMS = [
  "戏装", "戏服", "扮相", "行头", "行套", "油彩", "脸谱", "盔头", "夫子盔", "雉翎",
  "盔甲", "甲胄", "铠甲", "战袍", "披甲", "戎装", "军装", "制服", "校服", "囚服", "号衣",
  "婚服", "喜服", "嫁衣", "凤冠", "霞帔", "丧服", "孝服", "寿衣", "素服",
  "官服", "朝服", "龙袍", "蟒袍", "补服", "道袍", "袈裟", "僧衣", "法衣",
  "夜行衣", "夜行装", "黑衣", "黑袍", "劲装", "玄衣", "斗篷", "披风",
  "礼服", "长袍", "旗袍", "西装", "燕尾服", "晚礼服", "古装", "华服",
  "便服", "常服", "打扮", "换上", "换了一身", "打扮成", "乔装", "易容",
];

/** 造型标签切词：整串 + 2 字滑窗（中文检索靠它召回「戏装扮相」这类词） */
function variantTokens(variant) {
  const v = String(variant || "").replace(/[\s·・,，、/\\()（）[\]【】]/g, "");
  const set = new Set();
  if (v) set.add(v);
  for (let i = 0; i + 2 <= v.length; i++) set.add(v.slice(i, i + 2));
  return [...set];
}

/**
 * 从剧本里挑出「最可能是这套造型描述」的段落，拼成给 LLM 的摘录。
 * 命中规则：段落含造型标签片段，或含服装类关键词；命中段前后各带一段上下文。
 * 含角色本名的段落排前面（同名段更可能是这个人的换装）。
 * 一条都没命中时返回空串——调用方据此改走「按身份与时代补全」。
 *
 * @param {string} script  全文剧本
 * @param {string} name    角色本名
 * @param {string} variant 造型标签（如「戏装扮相」）
 * @param {number} maxLen  摘录字数上限
 */
export function pickCostumeExcerpt(script, name, variant, maxLen = 9000) {
  const text = String(script || "");
  if (!text.trim()) return "";
  // 短剧本直接整篇交给模型：它的定位能力远强于关键词召回，没必要先筛一道
  if (text.length <= maxLen) return text;
  const paras = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!paras.length) return "";
  const nm = String(name || "").trim();
  const shortNm = nm.length >= 3 ? nm.slice(-2) : "";        // 顾拾遗 → 拾遗，减少误命中
  const toks = variantTokens(variant).filter((t) => t.length >= 2);

  const anchors = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const byVariant = toks.some((t) => p.includes(t));
    const byTerm = COSTUME_TERMS.some((t) => p.includes(t));
    const byName = (nm && p.includes(nm)) || (shortNm && p.includes(shortNm));
    // 只含服装词但剧本里到处都有「换上」这种泛词时，靠名字过滤掉无关段落
    if (byVariant || (byTerm && (byName || !nm))) anchors.push(i);
    else if (byTerm && paras.length <= 40) anchors.push(i);   // 短剧本：宁多勿漏
  }
  if (!anchors.length) return "";

  const seen = new Set();
  const picked = [];
  const push = (i) => {
    if (i < 0 || i >= paras.length || seen.has(i)) return;
    seen.add(i);
    picked.push([i, paras[i]]);
  };
  for (const i of anchors) { push(i - 1); push(i); push(i + 1); }

  // 含本名的段落优先级更高（LLM 上下文有限，先喂最相关的）
  picked.sort((a, b) => {
    const an = nm && a[1].includes(nm) ? 0 : 1;
    const bn = nm && b[1].includes(nm) ? 0 : 1;
    return an - bn || a[0] - b[0];
  });

  let out = "";
  for (const [, p] of picked) {
    if (out.length + p.length > maxLen) break;
    out += (out ? "\n" : "") + p;
  }
  return out;
}

/** 清洗 LLM 返回的服装描述：去代码围栏、去「以下是」类前缀、去引号、只取一段 */
export function cleanOutfitText(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "").trim();
  s = s.replace(/^(以下是|这是|下面|如上|描述|服装描述|造型描述|答案|输出)[^\n：:]{0,20}[：:]\s*/, "");
  s = s.replace(/^["'“”「『]|["'“”」』]$/g, "").trim();
  const line = s.split(/\n+/).map((x) => x.trim()).filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || "";
  return line.replace(/[。；;，,\s]+$/, "").trim();
}

/**
 * 让 LLM 为「某角色的某套造型」写出可喂生图的服装/妆造描述。
 * 优先依据剧本摘录；摘录为空（或没写到）时按角色身份与时代背景补全，
 * 这样用户不必手动敲——派生弹窗里点一下就带出来了。
 */
export const PROMPT_COSTUME_FROM_SCRIPT = `你是影视剧组的服装指导。请为角色「{{name}}」的「{{variant}}」造型，写出一段**只描述服装与妆造**的中文生图提示词。

【角色身份与既有造型参考】
{{identity}}

【剧本相关摘录】
{{script_text}}

规则：
1. 只写服装款式、颜色、面料、结构、配饰、发型与妆面、鞋靴。
   **不要写脸型、五官、肤色、身高体型、气质、画风**——这些由原角色图继承，写了会让人物变样。
2. 要具体到能成图：写清颜色、材质、结构与佩戴位置（例：朱红底绣金蟒纹戏袍，腰系玉带，头戴黑色夫子盔，脚踩厚底靴）。
3. 摘录里有该造型的直接描写就以剧本为准；摘录没写到，就依据角色身份与时代背景补全一套合理、统一、具体的造型。
4. 必须与该角色原有的日常造型有明显区别，一眼能看出是换了装。
5. 60～140 字，中文，短语之间用逗号分隔；不写人名、不写台词、不加解释。
6. 只输出这段描述本身：不要标题、不要引号、不要「以下是」之类的前缀、不要 JSON。

即使摘录看起来与该造型无关，也必须按规则 3 给出造型，不要回答「剧本未提及」。`;

/**
 * 按字数切分长文本（优先在段落边界断开），用于长剧本分段抽取。
 * @param {number} maxLen 单段最大字符数
 */
export function splitTextByLength(text, maxLen = 12000) {
  const s = String(text || "");
  if (!s) return [];
  if (s.length <= maxLen) return [s];
  const parts = [];
  let buf = "";
  const flush = () => { if (buf) { parts.push(buf); buf = ""; } };
  for (const para of s.split(/\n+/)) {
    if (buf && buf.length + para.length + 1 > maxLen) flush();
    buf = buf ? buf + "\n" + para : para;
    while (buf.length > maxLen) {
      parts.push(buf.slice(0, maxLen));
      buf = buf.slice(maxLen);
    }
  }
  flush();
  return parts.filter(Boolean);
}

// ── 音乐生成提示词 ────────────────────────────────────────────────
export const PROMPT_MUSIC_DESCRIPTION = `请为以下短剧场景描述一段背景音乐。

**场景描述**：{description}
**时长**：{duration}秒
**情绪**：{mood}

请输出：
- "prompt_en"：英文音乐提示词（适合 Suno/MusicLM 等音乐生成模型，包含乐器、节奏、情绪、风格描述，50-100词）
- "prompt_cn"：中文音乐描述（简洁说明音乐特点）
- "mood_tags"：情绪标签数组（如 ["dramatic", "tense", "emotional"]）`;



