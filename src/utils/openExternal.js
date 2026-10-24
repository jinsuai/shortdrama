/**
 * 打开外部链接（纯 Web 版：直接 window.open）。
 *
 * 开源版不再有桌面壳，也去掉了「购买页 / 会员」入口；原先的 openPurchasePage
 * 已随计费系统一并移除。本文件只保留浏览器打开外链的能力。
 */

/** 用浏览器新标签页打开外部链接。 */
export async function openExternalUrl(url) {
  try {
    if (typeof window !== "undefined" && window.open) {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    }
  } catch (e) {
    console.error("打开外部链接失败:", e);
  }
  // 极端兜底：直接跳转
  if (typeof window !== "undefined" && url) window.location.href = url;
  return false;
}
