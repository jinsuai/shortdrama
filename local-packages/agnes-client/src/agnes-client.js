/**
 * Agnes Client — 统一多模态 SDK (JavaScript / Node + 浏览器)
 * 覆盖: 文本(agnes-2.5-flash) / 图像(agnes-image-2.1-flash) / 视频(agnes-video-v2.0)
 *
 * 浏览器: key 从 localStorage['AGNES_API_KEY'] 读取（切勿硬编码暴露）
 * Node:   key 从 process.env.AGNES_API_KEY 或 ~/.agnes/api_key 读取
 *
 * 用法:
 *   import { AgnesClient } from "./agnes-client.js";
 *   const c = new AgnesClient();
 *   await c.chat("你好");
 *   await c.image("prompt");
 *   await c.video("prompt", { numFrames: 121 });
 */

const BASE_URL = "https://api.agnes-ai.cn/v1";
const VALID_VIDEO_FRAMES = [81, 121, 161, 201, 241, 281, 321, 361, 401, 441];

export class AgnesClient {
  constructor({ apiKey, baseUrl = BASE_URL, maxRetries = 3 } = {}) {
    this.apiKey = apiKey || AgnesClient.resolveKey();
    if (!this.apiKey) throw new Error("未找到 Agnes API Key");
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.maxRetries = maxRetries;
  }

  static resolveKey() {
    // 浏览器 / 桌面端渲染进程(WebView)：从 localStorage 读取（key 由设置面板或 Rust 后端注入）
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem("AGNES_API_KEY"))
        return localStorage.getItem("AGNES_API_KEY").trim();
    } catch (_) {}
    // Node 独立脚本环境：从环境变量读取（注意：浏览器打包不能 require('fs')，否则整包加载崩溃）
    try {
      if (typeof process !== "undefined" && process.env && process.env.AGNES_API_KEY)
        return process.env.AGNES_API_KEY.trim();
    } catch (_) {}
    return null;
  }

  _headers() {
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  async _post(path, payload, timeoutMs = 120000) {
    let lastErr;
    for (let i = 0; i < this.maxRetries; i++) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const r = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: this._headers(),
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (r.status === 429) { await new Promise(s => setTimeout(s, 1000 * 2 ** i)); continue; }
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
        return await r.json();
      } catch (e) {
        lastErr = e;
        await new Promise(s => setTimeout(s, 1000 * 2 ** i));
      }
    }
    throw new Error(`Agnes 请求失败(${path}): ${lastErr}`);
  }

  /** 文本生成（支持流式回调） */
  async chat(prompt, { system = "你是一个专业的写作助手。", model = "agnes-2.5-flash",
    temperature = 0.8, maxTokens = 2000, onToken = null } = {}) {
    const payload = {
      model, temperature, max_tokens: maxTokens, stream: !!onToken,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    };
    if (!onToken) {
      const data = await this._post("/chat/completions", payload, 180000);
      return data.choices[0].message.content;
    }
    // 流式
    const r = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST", headers: this._headers(), body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const chunk = line.slice(5).trim();
        if (chunk === "[DONE]") break;
        try {
          const obj = JSON.parse(chunk);
          const delta = obj.choices?.[0]?.delta?.content || "";
          if (delta) { full += delta; onToken(delta); }
        } catch (_) {}
      }
    }
    return full;
  }

  /** 文生图 / 图生图 / 参考图身份锁定
   *  - imageUrl: 图生图（img2img，输出 i2i/）
   *  - referenceImages: 文生图时附带身份参考图（输出 t2i/），仅锁定长相，不把参考图场景复现
   */
  async image(prompt, { model = "agnes-image-2.1-flash", size = "1024x1024",
    imageUrl = null, referenceImages = null, responseFormat = "url" } = {}) {
    const payload = { model, prompt, size };
    if (imageUrl) {
      payload.extra_body = { image: [imageUrl] };
      if (responseFormat === "b64_json") payload.extra_body.response_format = "b64_json";
    } else if (referenceImages && referenceImages.length) {
      payload.extra_body = { reference_images: referenceImages.filter(Boolean) };
    }
    const data = await this._post("/images/generations", payload, 180000);
    const first = (data.data && data.data[0]) || {};
    return { url: first.url, b64_json: first.b64_json, revised_prompt: first.revised_prompt };
  }

  /** 视频：异步 提交 -> 轮询 -> 返回 url */
  async video(prompt, { model = "agnes-video-v2.0", width = 1152, height = 768,
    numFrames = 121, frameRate = 24, imageUrl = null,
    pollInterval = 3000, maxWait = 600000 } = {}) {
    if (!VALID_VIDEO_FRAMES.includes(numFrames))
      numFrames = VALID_VIDEO_FRAMES.reduce((a, b) => Math.abs(b - numFrames) < Math.abs(a - numFrames) ? b : a);
    const payload = { model, prompt, width, height, num_frames: numFrames, frame_rate: frameRate };
    if (imageUrl) payload.image = imageUrl;

    const submit = await this._post("/videos", payload, 60000);
    const videoId = submit.video_id || submit.task_id || submit.id;
    if (!videoId) throw new Error("视频提交未返回 id: " + JSON.stringify(submit));
    const result = await this._pollVideo(videoId, pollInterval, maxWait);

    let rawUrl = result.url || result.video_url || (result.data && result.data.url);
    if (rawUrl && !rawUrl.endsWith(".mp4")) rawUrl += ".mp4";
    return {
      url: rawUrl, videoId,
      durationSeconds: Math.round((numFrames / frameRate) * 100) / 100,
      resolution: `${width}x${height}`, frames: numFrames, frameRate,
      status: result.status,
    };
  }

  async _pollVideo(videoId, pollInterval, maxWait) {
    const pollUrl = `${this.baseUrl.replace("/v1", "")}/agnesapi?video_id=${videoId}`;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      try {
        const r = await fetch(pollUrl, { headers: { Authorization: `Bearer ${this.apiKey}` } });
        const data = await r.json();
        const status = data.status || "unknown";
        if (status === "completed") return data;
        if (status === "failed") throw new Error("视频生成失败: " + (data.error || "未知"));
      } catch (e) { console.warn("[agnes] 轮询异常:", e.message); }
      await new Promise(s => setTimeout(s, pollInterval));
    }
    throw new Error(`视频生成超时(${maxWait}ms): ${videoId}`);
  }
}

export default AgnesClient;
