/**
 * 分镜 / 关键帧生图。
 *
 * 设计约定（2026-09-23 用户拍板）：
 *   1. 点「生成分镜」= 用 LLM 分析整篇剧本，产出每个分镜的 动作/台词/运镜/生图提示词；
 *   2. 画面由用户**逐个**点「生成画面」触发，走图生图（参考图编辑），不用宫格；
 *   3. 分镜自带参考图槽位；参考图必须由用户自己选（软件内的角色图/分镜图/资产图，或上传），
 *      🔴 不做任何默认图兜底 —— 没选就报错提示去选，绝不用烤在面板里的默认图。
 *
 * 生图引擎：统一走 `Q22-图生图分镜关键帧-QwenImage2.1多图参考`（f2k）。
 *   B03（Qwen-Image-Edit-2511）与 D18（klein9b 真人剧制造机）已从面板移除（2026-10-20 清），
 *   相关分支、提示词模板与常量一并删除，只保留 f2k 一条路径。
 */

import { DispatchGlmClient } from '@dual/glm-client';
import {
  PROMPT_STORYBOARD_SHOTS, PROMPT_JSON_ONLY_SYSTEM, parseJsonLax,
  normalizeEntityName, entityBaseName,
} from './prompts.js';
import { generateFlux2MultiRefImage } from './image-workflows.js';

/** 分镜默认条数（剧本很长时 AI 会自行增加） */
export const DEFAULT_SHOT_COUNT = 12;

/**
 * 分析剧本 → 分镜数组。
 * @param {Object} p
 * @param {string} p.script
 * @param {string} [p.style]       - 艺术风格（来自艺术指导步骤）
 * @param {Array}  [p.characters]  - 已提取角色
 * @param {Array}  [p.scenes]      - 已提取场景
 * @param {number} [p.count]
 * @param {(m:string)=>void} [p.onLog]
 * @returns {Promise<Array>} shots
 */
export async function analyzeStoryboard({ script, style = '', characters = [], scenes = [], count = DEFAULT_SHOT_COUNT, onLog }) {
  const text = String(script || '').trim();
  if (!text) throw new Error('请先在「剧本」步骤输入剧本内容');

  const desc = (arr) => (arr || [])
    .map((x) => `${x.name || ''}：${x.appearance || x.desc || x.description || ''}`)
    .filter((s) => s.replace(/：/, '').trim())
    .join('；');

  const prompt = PROMPT_STORYBOARD_SHOTS
    .replace('{{style}}', style || '（未指定，按剧本自行判断时代与调性）')
    .replace('{{characters}}', desc(characters) || '（未提取，按剧本自行判断）')
    .replace('{{scenes}}', desc(scenes) || '（未提取，按剧本自行判断）')
    .replace('{{count}}', String(count || DEFAULT_SHOT_COUNT))
    .replace('{{script_text}}', text);

  onLog?.('正在分析剧本，拆解分镜与生图提示词…');
  const client = new DispatchGlmClient();
  // 分镜是 token 最大的一次 JSON 调用（6000、嵌套字段多），最容易输出残缺 JSON。
  // 策略同实体抽取：先按 0.7 正常生成（内容需要创作性），解析失败则降温到 0.2 重试一次并强调格式。
  let parsed = null;
  let lastMsg = '';
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const p = attempt === 0
      ? prompt
      : `${prompt}\n\n【重要】上一次输出无法解析为 JSON（${lastMsg}）。请严格只输出一个 JSON 数组，不要任何解释文字、不要用代码围栏。`;
    try {
      const raw = await client.chat(p, {
        system: PROMPT_JSON_ONLY_SYSTEM,
        llmType: 'storyboard_split',
        maxTokens: 6000,
        temperature: attempt === 0 ? 0.7 : 0.2,
      });
      parsed = parseJsonLax(raw || '');
    } catch (e) {
      lastMsg = e?.message || String(e);
    }
  }
  if (!parsed) throw new Error(`分镜解析失败：${lastMsg}`);
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed.shots || parsed.storyboard || parsed.frames || []);

  const stamp = Date.now();
  const shots = (list || []).map((s, i) => ({
    id: `shot-${stamp}-${i}`,
    index: i + 1,
    sceneDesc: s.action || s.sceneDesc || s.description || '',
    dialogue: s.dialogue || s.line || '',
    duration: Number(s.duration || s.duration_sec || s.durationSec) || null,
    cameraMove: s.camera || s.cameraMove || '',
    shotType: s.shot_type || s.shotType || '',
    lensType: s.lens_type || s.lensType || '',
    characters: Array.isArray(s.characters)
      ? s.characters.filter(Boolean)
      : (Array.isArray(s.roles) ? s.roles.filter(Boolean) : []),
    imagePrompt: s.prompt || s.imagePrompt || '',
    firstFramePrompt: s.firstFramePrompt || s.first_frame_prompt || '',
    videoPrompt: s.videoPrompt || s.video_prompt || '',
    continuity: s.continuity || s.continuity_anchor || null,
    refs: [],


    imageUrl: '',
  })).filter((s) => s.sceneDesc || s.imagePrompt);

  if (!shots.length) throw new Error('AI 未返回有效的分镜数据，请重试');
  return shots;
}

/** 拼生图提示词：直接用 AI 产出的 imagePrompt（首帧提示词），缺失时用画面描述兜底 */
export function fallbackShotPrompt(shot = {}) {
  if (shot.imagePrompt && shot.imagePrompt.trim()) {
    return shot.imagePrompt.trim();
  }
  // 兜底：没有 imagePrompt 时才拼
  const parts = [shot.sceneDesc, shot.shotType]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  return parts.join('，') + '，电影级质感，高细节';
}

/**
 * 拼「首帧」提示词。
 * 🔴 关键：首帧是视频第 0 秒的静止状态，绝不能拿 imagePrompt 兜底 ——
 *    imagePrompt 写的是「这个分镜中间的精彩瞬间」，是动作进行中的画面，
 *    用它当首帧会让视频一开局就在动作中段，和视频提示词描述的"从静止开始"打架。
 *    所以缺 firstFramePrompt 时，用 sceneDesc + 景别 + 显式"静止起始"语义重拼。
 */
export function fallbackFirstFramePrompt(shot = {}) {
  const first = String(shot.firstFramePrompt || '').trim();
  if (first) return first;
  const parts = [shot.sceneDesc, shot.shotType]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  const base = parts.join('，') || String(shot.imagePrompt || '').trim();
  return `${base}，镜头起始静止状态，人物保持初始站姿与位置，动作尚未发生，` +
    '构图稳定干净，主体完整入画，电影级质感，高细节，浅景深';
}
/**
 * @param {string[]} p.refs          - 用户选的参考图（1~3 张）
 * @param {string} [p.ratio]         - 画幅比例（缺省保持参考图比例）
 * @param {(m:string)=>void} [p.onLog]
 * @returns {Promise<{resultUrl:string, workflowId:string, refs:string[]}>}
 */
export async function generateShot({
  shot, refs = [], characters = [], scenes = [], props = [],
  ratio = '', style = '', negative = '', engine = '', onLog,
}) {
  const hits = matchCharacters(shot, characters);
  const charItems = hits
    .map((c) => {
      const url = String(c?.imageRemoteUrl || c?.url || c?.imageUrl || '').trim();
      if (!url) return null;
      const n = String(c?.name || c?.title || '').trim();
      const a = String(c?.appearance || c?.desc || c?.description || '').trim();
      return { url, desc: a ? `角色${n}的定妆照，${a}` : `角色${n}的定妆照` };
    })
    .filter(Boolean);
  // 用户自选的参考图也尽量写出名字与外观，别留「参考画面」让它猜
  const known = new Set(charItems.map((x) => x.url));
  const userItems = [...new Set((refs || []).filter(Boolean))]
    .filter((u) => !known.has(u))
    .map((url) => ({ url, desc: describeRefByUrl(url, characters, scenes, props) }));

  const items = [...charItems, ...userItems].slice(0, 6);
  if (!items.length) {
    throw new Error('请先给这个分镜选参考图（右侧详情里选 1~3 张：角色/场景/道具/已有画面）');
  }

  const instruction = buildShotInstruction(shot, {
    style, story: fallbackShotPrompt(shot), special: F2K_PREVIEW_SPECIAL,
  });
  const fItems = items.slice(0, 3); // Q22 参考图槽取前 3 张
  const finalRefs = fItems.map((x) => x.url);
  onLog?.(`提交图生图（Q22多图参考 · ${finalRefs.length} 张参考图${ratio ? ` · ${ratio}` : ''}）…`);
  const out = await generateFlux2MultiRefImage({
    instruction, items: fItems, ratio: ratio || '9:16',
    negative: [DEFAULT_NEGATIVE, String(negative || '').trim()].filter(Boolean).join('，'),
  });
  return {
    resultUrl: out.resultUrl, allUrls: out.allUrls,
    workflowId: out.workflowId, refs: finalRefs, prompt: instruction,
  };
}

/**
 * 把 LLM 写进分镜指令里的「英文剧集风格段」拆出来丢掉。
 *
 * B03 是中文指令跟随型编辑模型，我们已在指令里补了中文画质段（look），
 * LLM 自带的英文风格 tag（cinematic, 8k, photorealistic, movie still…）既冗余
 * 又会让中文指令变脏、干扰 VL 编码，统一清除，只留中文画面内容。
 *
 * 做法：① 命中风格词表（整词）就删；② 再清掉「整段纯英文 tag 串」
 *      （连续拉丁字母/数字/标点、不含任何中文的片段，如 "cinematic, 8k, photorealistic"）；
 *      ③ 收尾清理多余标点。中英混排的内容词（含中文的片段）一律保留，避免吃掉道具名等。
 */
const EN_STYLE_TOKENS = [
  'cinematic', 'film', 'movie', 'still', 'photorealistic', 'photographic', 'realistic',
  'realism', 'photography', '8k', '4k', '2k', 'uhd', 'hd', 'ultra', 'detailed', 'detail',
  'high', 'quality', 'masterpiece', 'best', 'sharp', 'focus', 'octane', 'render', 'unreal',
  'engine', 'cgi', '3d', 'volumetric', 'lighting', 'dramatic', 'bokeh', 'depth', 'field',
  'soft', 'studio', 'hyperrealistic', 'hyperrealism', 'lifelike', 'vivid', 'vibrant',
  'professional', 'award', 'winning', 'trending', 'artstation', 'deviantart', 'hq', 'raw',
  'photo', 'real', 'reallife', 'ultrarealistic', 'ultrarealistic', 'highly', 'resolution',
  'image', 'beautiful', 'perfect', 'elegant', 'smooth', 'real life', 'ultra realistic',
];
function stripEnglishStyle(text = '') {
  let s = String(text);
  // ① 命中风格词（整词，大小写不敏感）就删掉，连同周围逗号/空格
  const alt = EN_STYLE_TOKENS
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  s = s.replace(new RegExp(`\\b(?:${alt})\\b`, 'gi'), ' ');
  // ② 删掉「整段纯西文 tag 串」：不含中文、由拉丁字母/数字/标点/空格组成的片段。
  //    🔴 只删**含拉丁字母**的片段，纯数字片段必须原样保留 ——
  //      否则「5岁男孩 / 35岁男人 / 3个人 / 2把椅子」里的数字会被吞掉，
  //      变成「岁男孩 / 岁男人 / 个人 / 把椅子」，画面描述直接残缺（2026-10-04 修）。
  s = s.replace(/[，,；;、\s]*[A-Za-z0-9][A-Za-z0-9\s,.;:!'"()\[\]\-/]*/g, (m) => {
    if (/[一-鿿]/.test(m)) return m;   // 含中文 → 是中英混排的内容词，保留
    if (!/[A-Za-z]/.test(m)) return m; // 纯数字（年龄 / 数量 / 年份）→ 保留
    return '';                         // 纯西文 tag 串 → 删
  });
  // ③ 清理多余标点/空格
  s = s.replace(/[，,；;、]+\s*/g, '，').replace(/\s+/g, ' ');
  s = s.replace(/^[\s，,；;、]+|[\s，,；;、]+$/g, '');
  s = s.replace(/，+/g, '，');
  return s.trim();
}

/**
 * 拼分镜 / 关键帧的生图指令（喂给 Q22 多图参考）。
 *
 * Q22 是**参考生成**型工作流：先点名每张参考图是什么（见 buildFlux2MultiRefPrompt），
 * 再由本函数给出画面内容、构图、风格、约束。这里只负责把这几段按顺序说清楚，
 * 不需要喂给任何重写 LLM 的模板。
 */
/**
 * 硬约束里最容易和 LLM 画面描述撞车的关键词（用于逐句去重，见 buildShotInstruction）。
 * 只有「这句里出现的关键词，story 里全都有」时才判定为重复并丢弃整句。
 */
const DUP_CONSTRAINT_KEYS = [
  '无运动模糊', '动作尚未发生', '静止起始状态', '保持初始站位',
  '只出现明确提及', '不得增加', '不得添加', '人物数量', '站位必须',
];

export function buildShotInstruction(shot = {}, opt = {}) {
  const seg = [];

  const rawStory = String(opt.story || '').trim()
    || String(shot.imagePrompt || '').trim()
    || String(shot.firstFramePrompt || '').trim()
    || String(shot.sceneDesc || '').trim();
  // 🔴 剥离 LLM 自带的英文风格段，只留中文画面内容（见 stripEnglishStyle）
  const story = stripEnglishStyle(rawStory);
  if (story) seg.push(story);

  // 🔴 构图去重：LLM 的画面描述里通常已经写了「中景 · 标准镜头 · 平视」，
  //    这里再原样拼一遍就成了「中景，标准镜头，中景，平视，固定镜头」——同一件事说三遍，
  //    重复指令会摊薄模型注意力，所以①先按 token 去重、②再剔除 story 里已经说过的词。
  const compTokens = [];
  [shot.shotType, shot.lensType, shot.cameraMove]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .forEach((s) => String(s).split(/[，,、·\s]+/).forEach((t) => { if (t) compTokens.push(t); }));
  const comp = [...new Set(compTokens)]
    .filter((t) => !story.includes(t))
    .join('，');
  if (comp) seg.push(`画面构图：${comp}`);

  // 风格段同样去重：LLM 的画面描述开头常常已经写了艺术风格，这里再拼一遍就是重复。
  const styleTxt = stripEnglishStyle(String(opt.style || '').trim());
  const look = [styleTxt && !story.includes(styleTxt) ? styleTxt : '',
    '电影剧照质感，8K超高清，人物面部清晰锐利，光影层次丰富']
    .filter(Boolean).join('，');
  if (look) seg.push(look);

  // 🔴 硬约束去重：special 里的「无运动模糊 / 动作尚未发生 / 只出现明确提及的人物…」
  //    常常 LLM 在画面描述里已经写过了，整句再说一次就是重复指令。
  //    逐句判断：这句提到的关键短语 story 里**全都**出现过 → 判定为重复，丢掉这句。
  const specialRaw = String(opt.special || '').trim();
  const special = specialRaw
    .split(/[；;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const hit = DUP_CONSTRAINT_KEYS.filter((k) => s.includes(k));
      return !(hit.length && hit.every((k) => story.includes(k)));
    })
    .join('；');
  if (special) seg.push(special);

  // ⚠️ 负向词**不**拼进指令：B03 有专门的负向槽（220/247/279:prompt），
  //    把"坏手/崩脸"这类词写进正向指令反而会把概念带进画面。
  return seg.join('。');
}





/** 默认负向词（喂给内置 LLM 的【负面提示词优化】，由它写进 Negative 段） */
const DEFAULT_NEGATIVE =
  '坏手，漏趾，畸形肢体，缺失肢体，额外肢体，多余的手，连体人，三个头，模糊，低画质，' +
  '过曝，水印，文字，logo，卡通感，塑料感，人物面部崩坏';

/**
 * 🔴 关键帧（视频首帧）专用硬约束 —— Q22 是**从噪声生成**，
 *    不点名就会自动生成动作中的画面，喂给 i2v 会让视频开局就在动作中段。
 *    所以关键帧这里补一句极短的静止约束（20 来个字，不至于让提示词臃肿到理解不了）。
 */
const F2K_KEYFRAME_SPECIAL =
  '画面为视频第一帧的静止起始状态，无运动模糊，动作尚未发生；' +
  '画面中只出现明确提及的人物与物件，不得增加任何人、任何道具、任何装饰；' +
  '人物数量、性别、发型、服装、站位必须与描述完全一致';
const F2K_PREVIEW_SPECIAL =
  '画面中只出现明确提及的人物与物件，不得增加任何人、任何道具；' +
  '人物数量、性别、发型、服装必须与描述完全一致';

/**
 * 给一张参考图写说明：在素材库里按 URL 反查它是哪个角色/场景/道具。
 * 🔴 工作流剧本铁律：「Character X 只能描述 Reference Image X 的人物，绝对不能张冠李戴」，
 *    参考图说明写得越具体，它越不会把人物和场景搞串；写「参考画面」等于让它自己猜。
 */
function describeRefByUrl(url, characters = [], scenes = [], props = []) {
  const u = String(url || '').trim();
  if (!u) return '';
  const hit = (arr, kind) => {
    for (const it of arr || []) {
      if (!it) continue;
      const cand = [it.imageUrl, it.url, it.imageRemoteUrl]
        .map((x) => String(x || '').trim()).filter(Boolean);
      if (!cand.some((c) => c === u)) continue;
      const n = String(it.name || it.title || '').trim();
      const a = String(it.appearance || it.desc || it.description || '').trim();
      if (!n && !a) return '';
      return a ? `${kind}${n}，${a}` : `${kind}${n}`;
    }
    return '';
  };
  return hit(characters, '角色') || hit(scenes, '场景') || hit(props, '道具') || '';
}

/**
 * 从分镜文本里找出提到的角色（shot.characters 优先，缺失时从描述/台词里回退匹配）。
 *
 * 🔴 造型变体引入后的关键约束：同一人物的多套造型**最多只能命中一套**。
 *    旧逻辑用 `n.includes(x) || x.includes(n)` 双向包含，分镜只写「顾拾遗」时
 *    「顾拾遗·素衣」和「顾拾遗·夜行黑袍」会同时命中，两套衣服的参考图一起喂给模型，
 *    模型只能精神分裂。现改为两轮：
 *      ① 精确命中：分镜明确写了带造型的全名（顾拾遗·夜行黑袍）→ 直接用这一套；
 *      ② 本名兜底：分镜只写本名 → 同一本名只取一条（取最先出现那套，见抽取提示词的排序要求）。
 */
function matchCharacters(shot = {}, characters = []) {
  if (!characters.length) return [];
  const named = (Array.isArray(shot.characters) ? shot.characters : []).map((x) => String(x ?? '').trim()).filter(Boolean);
  const hay = `${shot.sceneDesc || ''} ${shot.dialogue || ''} ${shot.title || ''}`;

  const fullName = (c) => String(c?.name || c?.title || '').trim();

  // ① 先标出分镜「明确指定造型」的条目（写了带造型的全名，如 顾拾遗·夜行黑袍）
  const explicit = new Set();
  for (const c of characters) {
    const n = fullName(c);
    if (!n) continue;
    if (named.some((x) => x === n || normalizeEntityName(x) === normalizeEntityName(n))) explicit.add(c);
  }
  const explicitBases = new Set([...explicit].map((c) => entityBaseName(c)));

  // ② 按 materials 原顺序遍历输出（顺序 = 参考图槽位优先级，不该被匹配逻辑打乱）：
  //    显式指定的直接收；其余按本名命中，同一本名最多收一套。
  const out = [];
  const usedBase = new Set();
  for (const c of characters) {
    const n = fullName(c);
    if (!n) continue;
    const b = entityBaseName(c);

    if (explicit.has(c)) { out.push(c); usedBase.add(b); continue; }
    if (explicitBases.has(b) || usedBase.has(b)) continue;   // 同一人已定了一套造型，不再叠第二套

    const mentioned = named.some((x) => x.includes(n) || n.includes(x) || x === b || x.includes(b))
      || hay.includes(n) || hay.includes(b);                // 描述/台词里也可能只写本名
    if (!mentioned) continue;
    usedBase.add(b);
    out.push(c);
  }
  return out;
}

/**
 * 生成关键帧图（视频首帧 / 相邻镜的尾帧用）。
 *
 * 🔴 与分镜图的区别（2026-09-25 用户拍板：分镜图 ≠ 首帧）：
 *   - 分镜图（imageUrl）：这个分镜「中间精彩瞬间」的预览图，可能带动作、带动态模糊；
 *   - 关键帧图（keyframeUrl）：视频第 0 秒的静止起始状态，是喂给 i2v 工作流的首帧。
 *
 * 「生成内容和描述对不上」的三条对策（2026-09-26）：
 *   1. 提示词走 firstFramePrompt（静止语义），并追加硬约束后缀，禁止凭空加人加物；
 *   2. 🔴 参考图**不再默认带本镜分镜图** —— 分镜图画的是「动作进行中」，喂给 VL 模型
 *      等于告诉它"我要这个动作状态"，和首帧的「静止起始」直接打架，是内容跑偏的元凶之一。
 *      需要时用 includeOwnFrame 显式打开；
 *   3. 自动带上本镜出现角色的角色图 —— 描述里写"林晚站在门口"但没给长相，模型只能凭空编人。
 *      从 project.materials.characters 里按名字匹配，把角色主视图塞进参考图，人物才能长得对。
 *
 * @param {Object}   p.shot
 * @param {string[]} p.refs        - 用户选的参考图
 * @param {Array}    [p.characters]- 素材库角色 [{name, url|imageUrl, appearance|desc}]，自动匹配本镜出现的角色
 * @param {string}   [p.ratio]     - 视频画幅（9:16 / 16:9 / 1:1）
 * @param {boolean}  [p.includeOwnFrame] - 是否把本镜分镜图也当参考图（默认否）
 * @param {(m:string)=>void} [p.onLog]
 */
export async function generateKeyframeShot({
  shot, refs = [], characters = [], scenes = [], props = [], ratio = '',
  includeOwnFrame = false, style = '', negative = '', onLog,
}) {
  const userRefs = [...new Set((refs || []).filter(Boolean))];

  // ① 本镜出现的角色 → 角色主视图（优先级最高，决定"人长得对不对"）
  const hits = matchCharacters(shot, characters);
  const charItems = hits
    .map((c) => {
      const url = String(c?.imageRemoteUrl || c?.url || c?.imageUrl || '').trim();
      if (!url) return null;
      const n = String(c?.name || c?.title || '').trim();
      const a = String(c?.appearance || c?.desc || c?.description || '').trim();
      return { url, desc: a ? `角色${n}的定妆照，${a}` : `角色${n}的定妆照` };
    })
    .filter(Boolean);

  // ② 用户自己选的参考图：在素材库里反查名字与外观，实在查不到才写「参考画面」
  const known = new Set(charItems.map((x) => x.url));
  const userItems = userRefs
    .filter((u) => !known.has(u))
    .map((url) => ({ url, desc: describeRefByUrl(url, characters, scenes, props) }));

  // ③ 本镜分镜图（默认不带，见上面第 2 条）
  const ownFrame = includeOwnFrame
    ? String(shot?.imageRemoteUrl || shot?.imageUrl || '').trim()
    : '';
  const ownItem = ownFrame
    ? [{ url: ownFrame, desc: '本镜的分镜画面，仅参考其场景、光影与人物造型' }]
    : [];

  const items = [...charItems, ...userItems, ...ownItem].slice(0, 6);
  const finalRefs = items.map((x) => x.url);
  if (!finalRefs.length) {
    throw new Error('请先给这个分镜选参考图，或在「资产」里给本镜出现的角色生成一张角色图');
  }

  const instruction = buildShotInstruction(shot, {
    style,
    negative,
    story: fallbackFirstFramePrompt(shot),
    special: F2K_KEYFRAME_SPECIAL,
  });
  const fItems = items.slice(0, 3);
  const fRefs = fItems.map((x) => x.url);
  if (!fRefs.length) {
    throw new Error('请先给这个分镜选参考图，或在「资产」里给本镜出现的角色生成一张角色图');
  }
  onLog?.('提交关键帧图生成（Q22多图参考 · ' + fRefs.length + ' 张参考图'
    + (charItems.length ? ` · ${charItems.length} 张角色图` : '')
    + (ownFrame ? ' · 含本镜分镜图' : '') + (ratio ? ' · ' + ratio : '') + '）…');
  const out = await generateFlux2MultiRefImage({
    instruction, items: fItems, ratio: ratio || '9:16',
    negative: [DEFAULT_NEGATIVE, String(negative || '').trim()].filter(Boolean).join('，'),
  });
  return {
    resultUrl: out.resultUrl, allUrls: out.allUrls,
    workflowId: out.workflowId, refs: fRefs, prompt: instruction,
  };
}
