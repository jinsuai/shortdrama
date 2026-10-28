// 模型接入配置：开源版不依赖任何后端，所有生成都走用户自备的模型 API。
// 按「模态」存储 { baseUrl, apiKey, model, endpoint?, pollPath? } 到 localStorage。
//
// 设计原则：以 OpenAI 兼容接口为统一抽象（baseUrl + apiKey + model），
// 一套配置即可对接 OpenAI / DeepSeek / 通义千问 / 智谱 / Moonshot / vLLM / Ollama /
// 本地 ComfyUI-OpenAI 节点 等绝大多数服务。视频 / 音乐等非标准模态允许额外 endpoint / pollPath。

const KEY = 'MODEL_SETTINGS';

// 各模态的默认配置与展示元数据。baseUrl 留空表示「使用标准 OpenAI 地址」。
export const MODALITIES = {
  text: {
    label: '文本模型',
    desc: '剧本分析、分镜、提示词润色、翻译等',
    defaultBase: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    defaultEndpoint: '/chat/completions',
    placeholderModel: 'gpt-4o-mini / deepseek-chat / qwen-max',
  },
  image: {
    label: '图片模型',
    desc: '角色图、场景图、分镜关键帧等',
    defaultBase: 'https://api.openai.com/v1',
    defaultModel: 'gpt-image-1',
    defaultEndpoint: '/images/generations',
    placeholderModel: 'gpt-image-1 / flux / 你的 SDXL 服务',
  },
  video: {
    label: '视频模型',
    desc: '图生视频 / 文生视频',
    defaultBase: 'https://api.openai.com/v1',
    defaultModel: '',
    defaultEndpoint: '/video/generations',
    placeholderModel: '需按厂商填写（OpenAI Sora / Runway / Kling 等）',
  },
  tts: {
    label: '配音模型',
    desc: '台词配音',
    defaultBase: 'https://api.openai.com/v1',
    defaultModel: '',
    defaultEndpoint: '/audio/speech',
    placeholderModel: 'gpt-4o-mini-tts / 你的 TTS 服务',
  },
  music: {
    label: '音乐模型',
    desc: '背景音乐生成',
    defaultBase: '',
    defaultModel: '',
    defaultEndpoint: '/audio/generations',
    placeholderModel: '需按厂商填写',
  },
  model3d: {
    label: '3D 模型',
    desc: '图片/文本生成 3D（阿里云百炼 Tripo 等）',
    defaultBase: '',
    defaultModel: 'Tripo/Tripo-H3.1',
    defaultEndpoint: '',
    placeholderModel: 'Tripo/Tripo-H3.1',
  },
};

/**
 * 厂商特征库：只靠 Base URL 域名 / 模型名就能认出服务商，从而自动补齐
 * 鉴权方式、接口路径、轮询路径等「本该自动的东西」。
 *
 * 设计原则（用户 2026-10-27 明确）：设置页只让用户填 Base URL / Key / 模型名，
 * 其余一律自动；推断结果在「高级」里可见可改，改了就以用户为准。
 *
 * kind: 'openai' = OpenAI 兼容协议；'workflow' = 工作流型 API（先提交再轮询）。
 */
export const PROVIDER_HINTS = [
  {
    key: 'openai', name: 'OpenAI', kind: 'openai', authScheme: 'bearer',
    hosts: ['api.openai.com'], models: /^(gpt-|chatgpt|o1|o3|o4|text-|dall-e|sora|tts-|whisper)/i,
    endpoints: {},
  },
  {
    key: 'deepseek', name: 'DeepSeek', kind: 'openai', authScheme: 'bearer',
    hosts: ['api.deepseek.com'], models: /^deepseek/i,
  },
  {
    key: 'qwen', name: '通义千问（DashScope）', kind: 'openai', authScheme: 'bearer',
    hosts: ['dashscope.aliyuncs.com'], models: /^(qwen|wan)/i,
  },
  {
    key: 'zhipu', name: '智谱 GLM', kind: 'openai', authScheme: 'bearer',
    hosts: ['open.bigmodel.cn'], models: /^(glm|chatglm)/i,
  },
  {
    key: 'moonshot', name: 'Moonshot', kind: 'openai', authScheme: 'bearer',
    hosts: ['api.moonshot.cn'], models: /^(moonshot|kimi)/i,
  },
  {
    key: 'agnes', name: 'Agnes AI', kind: 'openai', authScheme: 'bearer',
    hosts: ['api.agnes-ai.cn'], models: /^agnes/i,
    // Agnes 视频不在标准 /video/generations 上；轮询也不带 /v1 前缀（用绝对地址模板）。
    endpoints: { video: '/videos', image: '/images/generations' },
    poll: { video: 'https://api.agnes-ai.cn/agnesapi?video_id={id}' },
  },
  {
    key: 'autodl', name: 'AutoDL（ComfyUI 工作流）', kind: 'workflow', authScheme: 'raw',
    hosts: ['autodl.art'], models: /^$/,
    endpoints: {},
    // 工作流型：提交 / 查询走「工作流 id + 任务 id」两步，路径模板如下（已在 www 域实测通过）。
    workflow: {
      list: '/comfyui/workflows',
      detail: '/comfyui/workflows/{id}',
      submit: '/comfyui/comfyui_workflow/{id}',
      result: '/comfyui/comfyui_workflow/result/{task}',
      listMethod: 'POST',
    },
  },
  {
    key: 'ollama', name: 'Ollama（本地）', kind: 'openai', authScheme: 'bearer',
    hosts: ['localhost:11434', '127.0.0.1:11434'], models: /^(llama|qwen|mistral|gemma)/i,
  },
  {
    key: 'vllm', name: 'vLLM（本地）', kind: 'openai', authScheme: 'bearer',
    hosts: ['localhost:8000', '127.0.0.1:8000'], models: /./,
  },
];

// 常见厂商预设，用户可在设置里一键填入 baseUrl。
export const PROVIDER_PRESETS = [
  { name: 'OpenAI', base: 'https://api.openai.com/v1' },
  { name: 'DeepSeek', base: 'https://api.deepseek.com/v1' },
  { name: '通义千问（DashScope）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4' },
  { name: 'Moonshot', base: 'https://api.moonshot.cn/v1' },
  { name: 'Agnes AI', base: 'https://api.agnes-ai.cn/v1' },
  { name: 'AutoDL（ComfyUI 工作流）', base: 'https://www.autodl.art/api/v1' },
  { name: 'Ollama（本地）', base: 'http://localhost:11434/v1' },
  { name: 'vLLM（本地）', base: 'http://localhost:8000/v1' },
  { name: '自定义', base: '' },
];

/** 按 Base URL 域名（优先）或模型名认出服务商；认不出返回 null，走通用 OpenAI 兼容逻辑。 */
export function detectProvider(baseUrl, model) {
  const host = String(baseUrl || '').toLowerCase();
  const mdl = String(model || '').trim();
  let byModel = null;
  for (const p of PROVIDER_HINTS) {
    if (p.hosts.some((h) => host.includes(h))) return p;
    if (!byModel && p.models && p.models.test(mdl)) byModel = p;
  }
  return byModel;
}

/** 各模态的标准 OpenAI 兼容路径（未识别出厂商时的兜底） */
const STANDARD_ENDPOINT = {
  text: '/chat/completions',
  image: '/images/generations',
  video: '/video/generations',
  tts: '/audio/speech',
  music: '/audio/generations',
  model3d: '',
};

/** 自动推断接口路径：用户填的 > 厂商特征库的 > 该模态的标准路径 */
export function autoEndpoint(modality, cfg, provider) {
  const saved = String(cfg?.endpoint || '').trim();
  if (saved) return saved;
  const fromProvider = provider?.endpoints?.[modality];
  if (fromProvider) return fromProvider;
  return STANDARD_ENDPOINT[modality] || '';
}

/**
 * 「自愈记忆」：某次调用发现某个字段名这个服务不认，换一个候选后成功了，
 * 就把能用的记下来，下次直接用，不再让用户手填。存 localStorage，按模态隔离。
 */
const ADAPT_KEY = 'MODEL_ADAPT';

export function readAdapt(modality) {
  try {
    const all = JSON.parse(localStorage.getItem(ADAPT_KEY) || '{}');
    return all[modality] || {};
  } catch {
    return {};
  }
}

export function writeAdapt(modality, patch) {
  try {
    const all = JSON.parse(localStorage.getItem(ADAPT_KEY) || '{}');
    all[modality] = { ...(all[modality] || {}), ...patch };
    localStorage.setItem(ADAPT_KEY, JSON.stringify(all));
  } catch { /* 存储不可用时忽略，不影响主流程 */ }
}

/**
 * 最终生效配置 = 用户填的 + 自动推断的 + 自愈记忆的（优先级依次降低）。
 * 所有生成链路统一读它，保证「只填三样也能跑」。
 */
/** 读 localStorage 里该模态的原始存档（不含任何默认值兜底）——用于判断「用户到底有没有填过」 */
function getRawSaved(modality) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    return all[modality] || {};
  } catch {
    return {};
  }
}

export function getResolvedConfig(modality) {
  const saved = getModelConfig(modality);
  const raw = getRawSaved(modality);
  const prov = detectProvider(saved.baseUrl, saved.model);
  const adapt = readAdapt(modality);
  const meta = MODALITIES[modality] || {};
  return {
    ...saved,
    providerKey: prov?.key || '',
    providerName: prov?.name || '',
    // 接入类型：默认按厂商自动识别；认不出来（或识别错）时用户可在「高级」里手动指定，
    // 这样 AutoDL 之外的同类平台（RunningHub、自建 ComfyUI-on-API）也能走工作流那条路。
    kind: saved.kind || prov?.kind || 'openai',
    authScheme: saved.authScheme || prov?.authScheme || 'bearer',
    // 🔴 必须看「用户原始存档」而不是 getModelConfig 的结果：后者会用 meta.defaultEndpoint
    //    （如 /video/generations）兜底，会把 Agnes 的 /videos 这类厂商路径永远盖掉。
    endpoint: autoEndpoint(modality, raw, prov),
    pollPath: saved.pollPath || prov?.poll?.[modality] || '',
    // 参考图字段名：用户指定 > 自愈记忆 > 空（调用方按候选列表自动试）
    imageField: saved.imageField || adapt.imageField || '',
    imageFieldArray: saved.imageFieldArray ?? adapt.imageFieldArray ?? false,
    // 负向词：默认发，若服务不认会被自愈机制自动关掉并记住
    sendNegative: saved.sendNegative ?? adapt.sendNegative ?? true,
    videoSendNegative: saved.videoSendNegative ?? adapt.videoSendNegative ?? true,
    // model 字段：工作流型服务不需要 model，其余默认发
    sendModel: saved.sendModel ?? (prov?.kind === 'workflow' ? false : true),
    // 工作流型：选中的工作流 id 与路径模板（用户覆盖 > 厂商预设 > 通用默认）
    workflowId: saved.workflowId || '',
    workflowName: saved.workflowName || '',
    workflowExtra: saved.workflowExtra || {},
    workflowPaths: {
      list: '/comfyui/workflows',
      detail: '/comfyui/workflows/{id}',
      submit: '/comfyui/comfyui_workflow/{id}',
      result: '/comfyui/comfyui_workflow/result/{task}',
      listMethod: 'POST',
      ...(prov?.workflow || {}),
      ...(saved.workflowPaths || {}),
    },
    // 工作流型结果 URL 有效期很短，默认转存本机
    persistMedia: saved.persistMedia ?? true,
    // 供 UI 显示「自动推断结果」
    autoEndpoint: !raw.endpoint ? autoEndpoint(modality, raw, prov) : '',
    meta,
  };
}

export function getModelConfig(modality) {
  try {
    // all 是 localStorage 里「按模态存的实际配置」，meta 只是默认值/展示元数据。
    // 🔴 这里曾经把两者搞混（写成 MODALITIES[modality][modality]），导致 apiKey 恒为 ''，
    //    所有生成链路都会被 requireConfig 判成「未配置」。任何改动请保留 saved 为主、meta 仅兜底。
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    const saved = all[modality] || {};
    const meta = MODALITIES[modality] || {};
    return {
      ...saved,
      baseUrl: saved.baseUrl || '',
      apiKey: saved.apiKey || '',
      model: saved.model || '',
      endpoint: saved.endpoint || meta.defaultEndpoint || '',
      pollPath: saved.pollPath || '',
    };
  } catch {
    return {};
  }
}

export function saveModelConfig(modality, cfg) {
  const all = getAllModelConfig();
  all[modality] = { ...(all[modality] || {}), ...cfg };
  localStorage.setItem(KEY, JSON.stringify(all));
  return all[modality];
}

/**
 * 判断是否「思考型」模型（reasoning model）。
 *
 * 🔴 为什么重要：思考模型会把**思考过程的 token 也算进 max_tokens 额度**。
 *    像分镜这种需要吐一整段大 JSON 的调用，思考把额度吃光后真正的 JSON 被截断，
 *    解析兜底只能拿到第 1 个完整对象 → 表现就是「只生成了 1 个分镜」。
 *    因此分镜 / 实体抽取这类大 JSON 调用，遇到思考模型必须大幅抬高 max_tokens，
 *    并在支持的服务上关闭思考（见 reasoningThinkingOffBody）。
 *
 * 靠模型名识别（这是 OpenAI 兼容接口里唯一稳定可拿到的信号）。
 */
export function isReasoningModel(model = '') {
  const m = String(model || '').toLowerCase();
  if (!m) return false;
  return /r1\b|reasoner|reasoning|-think\b|thinking|qwq|\bz1\b|o1\b|o3\b|o4\b|deepseek-reasoner|deepseek-r1|glm-.*z[0-9]|qwen.*(qwq|thinking)|doubao.*think|step.*think|hunyuan.*t1|abab.*think/i.test(m);
}

/**
 * 给思考模型构造「关闭思考」的请求体片段（仅对已知支持的服务生效，避免误传导致 400）。
 * 返回 null 表示该模型/平台没有可靠的关闭开关（如 DeepSeek-R1 无法关闭思考，只能靠抬高 token 上限）。
 *   - 智谱 GLM-Z1 / thinking 系列：chat_template_kwargs.enable_thinking=false
 *   - 通义 Qwen QwQ / Qwen3-Thinking：enable_thinking=false（写进 extra_body 透传）
 */
export function reasoningThinkingOffBody(model = '') {
  const m = String(model || '').toLowerCase();
  if (/glm-.*(z[0-9]|thinking|reason)/.test(m)) {
    return { chat_template_kwargs: { enable_thinking: false } };
  }
  if (/qwq|qwen.*thinking/.test(m)) {
    return { enable_thinking: false };
  }
  return null;
}

export function getAllModelConfig() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveAllModelConfig(all) {
  localStorage.setItem(KEY, JSON.stringify(all));
}

/** 是否至少配置了某个模态的 key（用于 UI 提示） */
export function isModalityConfigured(modality) {
  const c = getModelConfig(modality);
  return !!(c.apiKey && c.apiKey.trim());
}
