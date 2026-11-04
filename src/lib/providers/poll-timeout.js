/**
 * 生成类任务「提交后轮询」的超时统一收敛到这里。
 *
 * 以前 600000（10 分钟）这个魔数散落在 workflow.js / openai.js / index.js /
 * dispatch-jobs.js 等 6 处，而 Studio 分镜链路不传 timeoutMs，长视频或排队
 * 稍久的任务就会在 10 分钟被误判成「工作流轮询超时」。现在：
 *   1) 全局默认 30 分钟；
 *   2) 每个模态可在「设置 → 模型配置 → 高级 → 轮询超时(分钟)」单独覆盖；
 *   3) 调用方显式传的 timeoutMs 仍最优先（如 VideoGenBoard 的 2h/4h 长任务）。
 */
export const DEFAULT_POLL_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_POLL_TIMEOUT_MINUTES = 30;

/**
 * explicit > 用户在设置里填的分钟数 > 全局默认。
 * cfg 是 getResolvedConfig() 的返回值（含 pollTimeoutMinutes）。
 * 设置值小于 1000 时按「分钟」解释，否则按「毫秒」，兼容两种填法。
 */
export function pollTimeoutMs(explicit, cfg) {
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const raw = Number(cfg?.pollTimeoutMinutes ?? cfg?.pollTimeoutMs);
  if (Number.isFinite(raw) && raw > 0) {
    return raw < 1000 ? raw * 60 * 1000 : raw;
  }
  return DEFAULT_POLL_TIMEOUT_MS;
}

/** 用于报错文案，告诉用户到底等了多久 */
export function timeoutMinutes(ms) {
  return Math.max(1, Math.round(ms / 60000));
}
