// 客户端 -> 调度机 SDK。Tauri 不直接连 GPU，所有生成/计费走调度机。
// 配置存 localStorage：DISPATCH_BASE_URL（默认云端调度机 http://123.57.243.61）、DISPATCH_TOKEN。

const LS = { base: "DISPATCH_BASE_URL", token: "DISPATCH_TOKEN" };

export const DEFAULT_DISPATCH_BASE = "http://123.57.243.61";

export function getDispatchBase() {
  return (localStorage.getItem(LS.base) || DEFAULT_DISPATCH_BASE).trim().replace(/\/$/, "");
}
export function setDispatchBase(u) {
  localStorage.setItem(LS.base, (u || "").trim());
}
export function getToken() {
  return localStorage.getItem(LS.token) || "";
}
export function setToken(t) {
  if (t) localStorage.setItem(LS.token, t);
  else localStorage.removeItem(LS.token);
}

// 计费档位（前端展示用，权威值在后端 pricing.RECHARGE_TIERS）
// 汇率：1元 = 5积分（新用户首充额外送20积分）
export const RECHARGE_TIERS = [6, 30, 98, 298, 698]; // 元
export const RECHARGE_CREDITS = { 6: 30, 30: 160, 98: 550, 298: 1800, 698: 4500 }; // 档位 -> 积分（含赠送）
export const MEMBERSHIP_TIERS = [
  { tier: 59, level: 1, name: "月卡", quota: 100, discount: 0.9 },
  { tier: 159, level: 2, name: "季卡", quota: 350, discount: 0.85 },
  { tier: 299, level: 3, name: "年卡", quota: 1500, discount: 0.8 },
];
export const MEMBERSHIP_NAMES = { 0: "免费用户", 1: "月卡", 2: "季卡", 3: "年卡" };

async function api(path, { method = "GET", body, auth = true } = {}) {
  const url = getDispatchBase() + path;
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) headers.Authorization = "Bearer " + getToken();
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const err = new Error((data && (data.detail || data.message)) || `HTTP ${res.status}`);
    err.status = res.status;
    err.needRecharge =
      res.headers.get("X-Need-Recharge") === "1" || !!(data && data.need_recharge);
    throw err;
  }
  return data;
}

export const auth = {
  captcha: () =>
    api("/api/auth/captcha", { method: "GET", auth: false }),
  register: (username, email, password, captchaId, captcha) =>
    api("/api/auth/register", {
      method: "POST",
      body: { username, email, password, captcha_id: captchaId, captcha },
    }),
  login: (username, password) =>
    api("/api/auth/login", { method: "POST", body: { username, password } }),
  me: () => api("/api/auth/me"),
};

export const billing = {
  me: () => api("/api/billing/me"),
  recharge: (tier, channel = "wechat") => api("/api/billing/recharge", { method: "POST", body: { tier, channel } }),
  getOrder: (orderNo) => api("/api/billing/order/" + orderNo),
  confirmOrder: (orderNo) => api("/api/billing/order/" + orderNo + "/confirm", { method: "POST" }),
  membership: (tier) => api("/api/billing/membership", { method: "POST", body: { tier } }),
  transactions: () => api("/api/billing/transactions"),
  consumptions: () => api("/api/billing/consumptions"),
  // 本地生成（桌面端 Hyper-Frames 片头）：只扣费、不建云端任务。余额不足同样返回 402 + X-Need-Recharge。
  consume: (type, params) => api("/api/billing/consume", { method: "POST", body: { type, params } }),
};

export const jobs = {
  precheck: (type, params) =>
    api("/api/jobs/precheck", { method: "POST", body: { type, params } }),
  submit: (type, payload) =>
    api("/api/jobs/submit", { method: "POST", body: { type, payload } }),
  get: (id) => api("/api/jobs/" + id),
  cancel: (id) => api("/api/jobs/" + id + "/cancel", { method: "POST" }),
};

// 用户自定义音色（Voice-Design）云端持久化：列出 / 保存。
export const ttsVoices = {
  list: () => api("/api/tts/voices"),
  save: (name, voice_design) =>
    api("/api/tts/voices", { method: "POST", body: { name, voice_design } }),
};

// 轮询任务直到终态（succeeded/failed/canceled）或超时。
export async function pollJob(jobId, { interval = 1000, timeout = 7200000 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const j = await jobs.get(jobId);
    if (j.status === "succeeded" || j.status === "failed" || j.status === "canceled") return j;
    if (Date.now() - start > timeout) throw new Error("任务轮询超时");
    await new Promise((r) => setTimeout(r, interval));
  }
}

export default { auth, billing, jobs, ttsVoices, getDispatchBase, setDispatchBase, getToken, setToken };
