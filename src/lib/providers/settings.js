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

// 常见厂商预设，用户可在设置里一键填入 baseUrl。
export const PROVIDER_PRESETS = [
  { name: 'OpenAI', base: 'https://api.openai.com/v1' },
  { name: 'DeepSeek', base: 'https://api.deepseek.com/v1' },
  { name: '通义千问（DashScope）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4' },
  { name: 'Moonshot', base: 'https://api.moonshot.cn/v1' },
  { name: 'Ollama（本地）', base: 'http://localhost:11434/v1' },
  { name: 'vLLM（本地）', base: 'http://localhost:8000/v1' },
  { name: '自定义', base: '' },
];

export function getModelConfig(modality) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    const m = MODALITIES[modality] || {};
    return {
      baseUrl: m[modality]?.baseUrl ?? m[modality]?.baseUrl ?? '',
      apiKey: m[modality]?.apiKey ?? '',
      model: m[modality]?.model ?? '',
      endpoint: m[modality]?.endpoint ?? m[modality]?.endpoint ?? '',
      pollPath: m[modality]?.pollPath ?? '',
      ...(m[modality] || {}),
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
