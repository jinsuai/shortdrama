// 统一调度层：读取各模态在「设置 → 模型配置」里填的 key，调用 OpenAI 兼容客户端。
// 这是开源版所有生成的唯一出口（替代原 dispatch-jobs 的调度机依赖）。
//
// 返回结构尽量兼容旧调用方：
//   generateImage → { resultUrl, allUrls, raw }
//   generateVideo → { resultUrl, raw }
//   generateTTS   → { resultUrl }
//   generateMusic → { resultUrl }
//   generateText  → 字符串

import { getModelConfig, isModalityConfigured, getResolvedConfig, writeAdapt, supportsThinkingToggle, reasoningThinkingOffBody } from './settings.js';
import { callChat, callImage, callMedia, callTTS } from './openai.js';
import { runWorkflow, materializeUrl } from './workflow.js';

export { getModelConfig, saveModelConfig, getAllModelConfig, saveAllModelConfig, isModalityConfigured, MODALITIES, PROVIDER_PRESETS, getResolvedConfig, detectProvider, isReasoningModel, reasoningThinkingOffBody, supportsThinkingToggle } from './settings.js';
export { callChat, callImage, callMedia, callTTS, deepFindUrl } from './openai.js';
export {
  listWorkflows, fetchWorkflowRules, getWorkflowRules, runWorkflow,
  describeRules, mapInputs, materializeUrl, DEFAULT_WORKFLOW_PATHS,
} from './workflow.js';

export class ModelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelError';
  }
}

function requireConfig(modality) {
  // 用「最终生效配置」而不是原始存档：自动推断的鉴权方式 / 接口路径 / 轮询路径都在这里。
  const c = getResolvedConfig(modality);
  if (!c.apiKey || !c.apiKey.trim()) {
    throw new ModelError(
      `未配置「${modality}」模型的 API Key。请在「设置 → 模型配置」中填写对应服务的 baseUrl / API Key / 模型名。`
    );
  }
  // 模型名只在确实要发送 model 字段时才强制：工作流型服务（AutoDL 等）不需要 model。
  if (c.sendModel !== false && (!c.model || !c.model.trim())) {
    throw new ModelError(`「${modality}」模型名未填写，请在「设置 → 模型配置」中指定 model。`);
  }
  // 工作流型：光有 Key 不够，还得选一条工作流 —— 否则字段无从映射。
  // 这里提前报，比发出去被平台 400 再回来看日志好定位得多。
  if (c.kind === 'workflow' && !(c.workflowId || '').trim()) {
    throw new ModelError(
      `「${modality}」是工作流型服务，还没选工作流。请在「设置 → 模型配置」里点「选择工作流」挑一条再生成。`
    );
  }
  return c;
}

/**
 * 工作流型服务的统一出口：把标准素材交给 workflow.js 按 input_rules 映射后提交。
 * 与 OpenAI 兼容链路并列，互不影响 —— 只有 kind==='workflow' 才走这里。
 */
async function generateViaWorkflow(modality, c, std, { onProgress, signal, timeoutMs } = {}) {
  const out = await runWorkflow({
    cfg: c,
    modality,
    std,
    extra: c.workflowExtra || {},
    onProgress,
    signal,
    timeoutMs: timeoutMs || 600000,
  });
  const url = c.persistMedia === false ? out.resultUrl : await materializeUrl(out.resultUrl);
  if (modality === 'image') return { resultUrl: url, allUrls: [url], raw: out.raw };
  return { resultUrl: url, raw: out.raw };
}

/** 文本生成（兼容旧 DispatchGlmClient.chat 的 messages 入参） */
export async function generateText(messages, opts = {}) {
  const c = requireConfig('text');
  // 思考模式开关：统一在此生效，所有文本链路（分镜 / 实体抽取 / 提示词润色）自动继承。
  // 用户关闭（useThinking===false）且模型支持开关时，注入关闭思考的请求体片段；
  // 调用方若已显式传了 extra（极少），以调用方为准。
  let extra = opts.extra ?? null;
  if (extra === null && c.useThinking === false && supportsThinkingToggle(c.model)) {
    extra = reasoningThinkingOffBody(c.model);
  }
  return callChat({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
    messages,
    temperature: opts.temperature ?? 0.7,
    maxTokens: opts.maxTokens ?? 1200,
    signal: opts.signal,
    authScheme: c.authScheme,
    sendModel: c.sendModel !== false,
    ...(extra ? { extra } : {}),
  });
}

/**
 * 通用负向词：图片生成默认带上的质量兜底（糊、畸形、水印、构图残缺等常见问题）。
 * 调用方显式传了 negative 时以调用方为准。用户无需在设置里配置。
 */
export const DEFAULT_IMAGE_NEGATIVE = 'low quality, worst quality, blurry, lowres, jpeg artifacts, watermark, text, signature, logo, deformed, bad anatomy, bad proportions, extra limbs, extra fingers, missing fingers, cropped, out of frame';

/**
 * 图片生成。prompt 为最终提示词；size / n 为标准 OpenAI 兼容字段。
 *
 * 支持图生图（参考图）：传入 referenceImage / referenceImages 时，参考图以固定的
 * `image_url` 字段随请求发出（四视图即用主视图作参考）。字段名固定，不暴露给用户配置。
 *   - 纯文生图（不传参考图）：不发该字段；
 *   - 图生图：参考图随请求发出，由所选模型按参考图出图。
 * 负向词走固定字段 `negative_prompt`，内容默认取 DEFAULT_IMAGE_NEGATIVE（通用负向词），
 * 调用方显式传了 negative 时以调用方为准。是否提交由开关决定，见下。
 *
 * 负向词是否提交由「设置 → 图片模型 → 提交负向词」开关决定（默认开）。
 * 关掉后请求体里不再出现 negative_prompt —— 部分服务对未知字段做严格校验，
 * 带负向词会直接报错，此时关掉即可，无需改代码。
 *
 * 需要换接口路径时只改「设置 → 图片模型 → 接口路径」，其余无需代码改动。
 */
/** 参考图字段名的常见取值：用户没指定时按顺序自动试，试通了就记住 */
const REF_FIELD_CANDIDATES = ['image_url', 'image', 'init_image', 'reference_image', 'images'];

/** 判断错误信息是不是「这个字段服务不认」——只有这类错误才值得换字段名重试 */
function isFieldRejected(msg, field) {
  const t = String(msg || '');
  if (field && t.includes(field)) return true;
  return /未知|不支持|禁止字段|不允许|多余|unknown|unrecognized|unexpected|not supported|extra/i.test(t);
}

export async function generateImage(prompt, opts = {}) {
  const c = requireConfig('image');
  // 参考图（图生图）：字段名各厂商不同（image_url / image / init_image / reference_image…）。
  // 用户可以在「高级」里指定；没指定就按常见顺序自动试，试通即写入自愈记忆，下次直接用。
  // 值格式：默认「单图发字符串、多图发数组」；服务声明为数组时自动切成数组（见自愈分支）。
  const asArray = c.imageFieldArray === true || c.imageFieldArray === 'true';
  const refs = (Array.isArray(opts.referenceImages) ? opts.referenceImages : [])
    .filter(Boolean).slice(0, 3);
  const single = opts.referenceImage || refs[0] || '';
  const refList = refs.length ? refs : (single ? [single] : []);
  // 工作流型服务：字段由工作流的 input_rules 决定，不走 OpenAI 那套固定字段名。
  if (c.kind === 'workflow') {
    // 图片链路只给「像素尺寸」（如 864x1536），不给画幅比例；工作流的分辨率字段却是枚举文本
    // （480p竖/768p横…），所以这里从宽高反推方向，否则竖屏项目会被判成横屏。
    const sizeStr = String(opts.size || '');
    const wh = /^(\d+)\s*[x×*]\s*(\d+)$/i.exec(sizeStr);
    let ratio = opts.ratio || '';
    if (!ratio && wh) {
      const w = Number(wh[1]); const h = Number(wh[2]);
      ratio = h > w ? '9:16' : (w > h ? '16:9' : '1:1');
    }
    return generateViaWorkflow('image', c, {
      prompt, negative: opts.negative, images: refList, ratio,
    }, { onProgress: opts.onProgress, signal: opts.signal, timeoutMs: opts.timeoutMs });
  }
  const prefField = (c.imageField || '').trim();
  const fieldOrder = [...new Set([prefField, ...REF_FIELD_CANDIDATES].filter(Boolean))];

  let lastErr = null;
  for (let i = 0; i < fieldOrder.length; i++) {
    const field = fieldOrder[i];
    let useArray = asArray;
    // 同一字段名最多试两次：第二次是「去掉负向词」或「改成数组」的自愈尝试
    for (let attempt = 0; attempt < 3; attempt++) {
      const extra = {};
      if (refList.length) extra[field] = (useArray || refList.length > 1) ? refList : refList[0];
      // 负向词：默认发；服务不认时会被下面自愈关掉并记住。
      const wantNeg = c.sendNegative !== false && c.sendNegative !== 'false';
      if (wantNeg) extra.negative_prompt = (opts.negative || '').trim() || DEFAULT_IMAGE_NEGATIVE;
      try {
        const urls = await callImage({
          baseUrl: c.baseUrl,
          apiKey: c.apiKey,
          model: c.model,
          endpoint: c.endpoint,   // 图片接口路径可配（如 /images/edits 或厂商自定义），留空走默认
          prompt,
          size: opts.size || '1024x1024',
          n: opts.n || 1,
          extra,
          signal: opts.signal,
          authScheme: c.authScheme,
          sendModel: c.sendModel !== false,
        });
        if (!urls.length) throw new ModelError('图片模型未返回任何图片');
        // 成功了：把这次验证可用的写法记下来，下次不用再试
        if (refList.length && field !== prefField) writeAdapt('image', { imageField: field });
        if (useArray !== asArray) writeAdapt('image', { imageFieldArray: useArray });
        return { resultUrl: urls[0], allUrls: urls, raw: { data: urls.map((u) => ({ url: u })) } };
      } catch (e) {
        lastErr = e;
        const msg = e?.message || String(e);
        // 自愈①：负向词被拒 → 关掉负向词再试一次（并记住）
        if (wantNeg && /negative|负向/i.test(msg)) {
          writeAdapt('image', { sendNegative: false });
          c.sendNegative = false;
          continue;
        }
        // 自愈②：单图被当成类型错误 → 改成数组再试
        if (refList.length && !useArray && /数组|array|list|类型|type/i.test(msg)) {
          useArray = true;
          continue;
        }
        // 自愈③：这个字段名服务不认 → 换下一个候选（仅在带参考图时才有意义）
        if (refList.length && isFieldRejected(msg, field) && i < fieldOrder.length - 1) break;
        throw e;   // 鉴权 / 额度 / 限流 之类错误不重试，直接抛给用户看
      }
    }
  }
  throw lastErr || new ModelError('图片生成失败');
}

/**
 * 旧 H3 语义 → 通用语义的模式别名表（单一真相来源，供 generateVideo 与 dispatch-jobs 共用）。
 * 🔴 必须放在通用层而不是适配层：调用方有两条路径——runDispatchJob（走 normalizeVideoPayload）
 *    和 generatePanelVideo（直接调 generateVideo，不经过适配层）。若只在适配层翻译，
 *    第二条路径会把 'i2v' 原样发出去，而通用视频接口认的是 text|keyframe|reference 之类标准取值。
 * 仅当命中已知别名时替换，其余值原样透传（避免误伤以 i2v 为合法取值的厂商）。
 */
export const VIDEO_MODE_ALIAS = { t2v: 'text', i2v: 'keyframe', s2v: 'reference' };

/**
 * 视频生成（纯 OpenAI 兼容语义，不绑定任何厂商，可对接 Agnes / Kling / Runway / Sora / 万相 / 清影…）。
 * 入参为标准视频参数：
 *   prompt, seconds(字符串"4"-"12"), aspect_ratio, size, mode(text|keyframe|reference),
 *   first_frame(首帧图生视频), images[](参考图), audios[](参考音频), n, engine
 * 同时兼容旧别名 duration / ratio / image，避免老调用方回归。
 * 各家差异（创建路径 / 轮询路径 / 任务 id 字段名）一律交给「设置面板配置 + callMedia 通用提取」，
 * 不在此处写任何厂商特例 —— 因此换个模型只改配置，不改代码。
 */
export async function generateVideo({ prompt, seconds, duration, aspect_ratio, ratio, size, mode, first_frame, last_frame, image, images, audios, negative, n, engine, onProgress, signal, timeoutMs } = {}) {
  const c = requireConfig('video');
  const payload = { prompt };
  const sec = seconds ?? duration;
  if (sec != null) payload.seconds = String(sec);
  payload.aspect_ratio = aspect_ratio ?? ratio ?? '16:9';
  if (size) payload.size = size;
  if (c.size) payload.size = c.size;                        // 尺寸随厂商配置，不写死
  // 负向词开关（与图片一致：默认开，但只发送你填写的负向词，不自动补内置通用词——
  // 避免不支持该字段的服务直接 400）。字段名可配置（negativeField）。
  if (c.videoSendNegative !== false && c.videoSendNegative !== 'false') {
    const negText = String(negative || '').trim();
    if (negText) payload[c.negativeField || 'negative_prompt'] = negText;
  }
  // —— 素材收集（先算清有哪些素材，再按模式分桶，杜绝互斥字段误发）——
  const ff = first_frame ?? image;
  const hasFirstLast = !!(ff || last_frame);
  const imgs = (Array.isArray(images) ? images : []).filter(Boolean);
  const aus = (Array.isArray(audios) ? audios : []).filter(Boolean);
  const hasRefMedia = imgs.length > 0 || aus.length > 0;

  // 工作流型服务：由工作流的 input_rules 决定发哪些字段（参考图槽位/首尾帧/时长/分辨率各不相同），
  // 不套 OpenAI 那套固定字段名。放在这里（素材收集之后）是因为映射需要全部素材齐了才好分桶。
  if (c.kind === 'workflow') {
    return generateViaWorkflow('video', c, {
      prompt, negative, images: imgs, audios: aus,
      first_frame: ff, last_frame,
      seconds: sec, ratio: aspect_ratio ?? ratio,
    }, { onProgress, signal, timeoutMs });
  }

  // —— 解析生成模式：显式优先，否则按素材自动推断 ——
  // 行业通用三模式语义：text(纯文生) / keyframe(首尾帧) / reference(参考图·音频)。
  // 显式值可为标准名或旧别名(i2v→keyframe / s2v→reference / t2v→text)；
  // 未显式指定时按本次提交自动判定（有首/尾帧→keyframe，有参考图/音频→reference，都没有→text）。
  const rawMode = c.videoMode || mode;
  const explicit = VIDEO_MODE_ALIAS[rawMode] || (['text', 'keyframe', 'reference'].includes(rawMode) ? rawMode : '');
  const stdMode = explicit || (hasFirstLast ? 'keyframe' : (hasRefMedia ? 'reference' : 'text'));
  payload.mode = stdMode;

    // —— 按标准三模式分桶发送对应素材，互斥字段绝不发 ——
    // 视频生成的通用抽象（Kling / Runway / 通义 / Agnes 等主流服务均遵循），非为某家写死：
    //   text      → 纯文生，不发明任何媒体字段；
    //   keyframe  → 只发首/尾帧，不发明参考图/音频；
    //   reference → 只发参考图/音频，不发明首/尾帧。
    if (stdMode === 'keyframe') {
      if (ff) payload.first_frame = ff;
      if (last_frame) payload.last_frame = last_frame;
    } else if (stdMode === 'reference') {
      if (imgs.length) payload.images = imgs;
      if (aus.length) payload.audios = aus;
    }
    // text 模式不发明任何媒体字段（上方未赋值，天然满足）
  if (n) payload.n = n;
  // engine 属于厂商自定义字段：默认不发送（调用方传的 'h3' 是商业版渠道遗留，
  // 对直连用户自有模型的开源版没有意义）；若所用服务确实需要，在设置里填「附加字段 engine」。
  if (c.engine) payload.engine = c.engine;
  const out = await callMedia({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
    endpoint: c.endpoint,
    pollPath: c.pollPath,
    payload,
    timeoutMs: timeoutMs || 600000,
    onProgress,
    signal,
    authScheme: c.authScheme,
    sendModel: c.sendModel !== false,
  });
  if (!out.resultUrl) throw new ModelError('视频模型未返回视频地址');
  return { resultUrl: out.resultUrl, raw: out.raw };
}

/** 配音。input 为台词文本 */
export async function generateTTS({ text, voice = 'default', language, signal, onProgress, timeoutMs } = {}) {
  const c = requireConfig('tts');
  // 工作流型 TTS（如 AutoDL 的 indextts2）：把台词文本映射到工作流的提示词字段。
  // 这类工作流通常还要求一段「参考音色音频」—— 没有的话 workflow.js 会明确报缺什么，
  // 而不是发一个必然失败的请求。
  if (c.kind === 'workflow') {
    return generateViaWorkflow('tts', c, { text, voice, language }, { onProgress, signal, timeoutMs });
  }
  const extra = {};
  if (language) extra.language = language;
  const url = await callTTS({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
    input: text,
    voice,
    extra,
    signal,
    authScheme: c.authScheme,
    sendModel: c.sendModel !== false,
  });
  return { resultUrl: url };
}

/** 音乐生成。tags / lyrics 透传 */
export async function generateMusic({ tags, lyrics, seconds, bpm, language, onProgress, signal } = {}) {
  const c = requireConfig('music');
  const payload = {};
  if (tags) payload.tags = tags;
  if (lyrics) payload.lyrics = lyrics;
  if (seconds) payload.duration_seconds = seconds;
  if (bpm) payload.bpm = bpm;
  if (language) payload.language = language;
  const out = await callMedia({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
    endpoint: c.endpoint,
    pollPath: c.pollPath,
    payload,
    timeoutMs: 600000,
    onProgress,
    signal,
    authScheme: c.authScheme,
    sendModel: c.sendModel !== false,
  });
  if (!out.resultUrl) throw new ModelError('音乐模型未返回音频地址');
  return { resultUrl: out.resultUrl, raw: out.raw };
}

export const providersReady = isModalityConfigured;
