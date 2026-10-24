// 后端模型配置：默认走 Agnes，可扩展为自定义 OpenAI 兼容端点。
// 用于「后期接入 Wan2.2-14B（视频）、Index-TTS-2.0（语音）、图生图角色一致性」等。
// 所有配置存 localStorage，由 SettingsDialog 写入；这里只负责读取与发起标准调用。

const AGNES = {
  baseUrl: "https://api.agnes-ai.cn/v1",
  key: () => localStorage.getItem("AGNES_API_KEY") || "",
};

export function getBackendConfig() {
  const g = (k, d = "") => (localStorage.getItem(k) || d).trim();
  return {
    llm: {
      baseUrl: g("LLM_BASE_URL", ""),
      key: g("LLM_API_KEY", ""),
      model: g("LLM_MODEL", ""),
    },
    tts: {
      baseUrl: g("TTS_BASE_URL", ""),
      key: g("TTS_API_KEY", ""),
      model: g("TTS_MODEL", ""),
    },
    image: {
      baseUrl: g("IMG_BASE_URL", ""),
      key: g("IMG_API_KEY", ""),
      model: g("IMG_MODEL", ""),
    },
    video: {
      baseUrl: g("VID_BASE_URL", ""),
      key: g("VID_API_KEY", ""),
      model: g("VID_MODEL", ""),
    },
  };
}

// 某个 provider 是否被用户自定义（填了 baseUrl 即视为启用自建端点）
export function providerEnabled(name) {
  const cfg = getBackendConfig();
  const p = cfg[name];
  return !!(p && p.baseUrl);
}

// 解析某 provider 实际使用的 baseUrl / key / model（未自定义时回退 Agnes）
function resolve(name) {
  const cfg = getBackendConfig();
  const p = cfg[name] || {};
  if (p.baseUrl) {
    return { baseUrl: p.baseUrl.replace(/\/$/, ""), key: p.key, model: p.model };
  }
  return { baseUrl: AGNES.baseUrl, key: AGNES.key(), model: p.model || "" };
}

/**
 * 通用 OpenAI 兼容 chat 调用。返回 { ok, text, err }。
 * provider: "llm" | "tts" | "image" | "video"
 */
export async function chatCompletion(provider, messages, opts = {}) {
  const { baseUrl, key, model } = resolve(provider);
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: model || "agnes-2.5-flash",
    messages,
    temperature: opts.temperature ?? 0.8,
    stream: false,
  };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, err: `HTTP ${r.status}` };
    const j = await r.json();
    const text = j?.choices?.[0]?.message?.content || "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, err: String(e && e.message ? e.message : e) };
  }
}

/**
 * 通用 OpenAI 兼容「图片生成 / 图生图」调用。返回 { ok, url, err }。
 * 期望接口返回 data[0].url 或 b64_json。
 */
export async function imageGeneration(provider, payload) {
  const { baseUrl, key, model } = resolve(provider);
  const url = `${baseUrl}/images/generations`;
  const body = { model: model || "agnes-image-2.1-flash", ...payload };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, err: `HTTP ${r.status}` };
    const j = await r.json();
    const item = (j?.data && j.data[0]) || {};
    return { ok: true, url: item.url || null, b64: item.b64_json || null };
  } catch (e) {
    return { ok: false, err: String(e && e.message ? e.message : e) };
  }
}

/**
 * 通用「视频生成」调用（如 Wan2.2-14B 的 OpenAI 兼容视频端点）。
 * 返回 { ok, url, err }。具体轮询逻辑由调用方按需实现。
 */
export async function videoGeneration(provider, payload) {
  const { baseUrl, key, model } = resolve(provider);
  const url = `${baseUrl}/videos/generations`;
  const body = { model: model || "agnes-video-v2.0", ...payload };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, err: `HTTP ${r.status}` };
    const j = await r.json();
    const item = (j?.data && j.data[0]) || {};
    return { ok: true, url: item.url || null, id: item.id || null };
  } catch (e) {
    return { ok: false, err: String(e && e.message ? e.message : e) };
  }
}

// 兼容别名导出：index.js 仍按旧命名 re-export，新增此别名以修复打包时缺失命名导出（不修改上方函数）。
export const callChat = chatCompletion;
export const callImage = imageGeneration;
export const callVideo = videoGeneration;
export const PROVIDERS = ["llm", "tts", "image", "video"];
