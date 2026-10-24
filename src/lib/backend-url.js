/**
 * 自建后端服务地址（可选）。
 *
 * 开源版本身不内置、不依赖任何服务端：文本/图片/视频/配音等生成一律直连
 * 用户在「设置 → 模型配置」里填写的模型 API。
 *
 * 只有极少数能力（如服务端抽帧、服务端合并导出）必须有自建后端才能用。
 * 这类能力统一从这里取地址；未配置时调用方应给出明确提示，而不是回退到
 * 任何预设域名。
 */

const STORAGE_KEY = 'BACKEND_BASE_URL';

/** 读取用户配置的自建后端地址；未配置返回空串。 */
export function getBackendBaseUrl() {
  if (typeof localStorage === 'undefined') return '';
  return (localStorage.getItem(STORAGE_KEY) || '').trim().replace(/\/+$/, '');
}

/** 保存自建后端地址。传空串表示清除。 */
export function setBackendBaseUrl(url) {
  if (typeof localStorage === 'undefined') return;
  const v = (url || '').trim();
  if (v) localStorage.setItem(STORAGE_KEY, v);
  else localStorage.removeItem(STORAGE_KEY);
}

/**
 * 取后端地址，未配置时直接抛错（错误信息可直接展示给用户）。
 * @param {string} action 正在执行的操作名，用于提示文案
 */
export function requireBackendBaseUrl(action = '该操作') {
  const base = getBackendBaseUrl();
  if (!base) {
    throw new Error(
      `${action}需要自建后端服务：请先在「设置 → 模型配置」中填写后端服务地址。` +
      `开源版不内置任何服务端，未配置时无法使用该功能。`
    );
  }
  return base;
}
