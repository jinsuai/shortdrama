// 浏览器环境垫片：替代 @tauri-apps 的原生能力，使同一份代码既能跑桌面端也能纯 Web 运行。
// 所有函数都是「无害降级」：桌面端才有的落盘 / 系统对话框 / 外部打开 / 窗口控制，在 Web 端不存在。
//
// 用法：在 vite.config.js 里把 @tauri-apps/* 整个正则别名到本文件，于是 src 与 @dual/ui
// 里的 `import ... from "@tauri-apps/..."` 全部透明切换到此垫片，无需逐个改文件，也不依赖
// 任何 @tauri-apps 包安装。本文件导出所有被引用到的符号。

/** 桌面端 Rust 命令调用。Web 端无对应能力，返回 null（调用方需自行降级到浏览器行为）。 */
export async function invoke(cmd, args = {}) {
  console.warn('[tauri-shim] Web 端不支持 invoke:', cmd, args);
  return null;
}

/** 桌面端把本地绝对路径转成可显示的 file:// 桥接地址。Web 端直接透传（本地文件请用 object URL）。 */
export function convertFileSrc(path) {
  return path;
}

/** 桌面端用系统浏览器打开外部链接。Web 端直接用 window.open。 */
export async function openUrl(url) {
  try {
    if (typeof window !== 'undefined' && window.open) window.open(url, '_blank', 'noopener');
  } catch (e) {
    console.warn('[tauri-shim] openUrl 失败:', url, e);
  }
}

/** 桌面端目录选择器。Web 端无系统目录选择，返回 null（调用方应改用文本框输入）。 */
export async function pickDir() {
  return null;
}

/** 桌面端系统文件/目录对话框（@tauri-apps/plugin-dialog 的 open）。Web 端无此能力，返回 null。 */
export async function open(options) {
  console.warn('[tauri-shim] Web 端不支持系统对话框 open:', options);
  return null;
}

/** 桌面端当前窗口句柄（@tauri-apps/api/window 的 getCurrentWindow）。Web 端返回一个无害空壳，调用方已用 isTauri() 守卫，不会真正使用。 */
export function getCurrentWindow() {
  return {
    minimize: () => {},
    maximize: () => {},
    toggleMaximize: () => {},
    unmaximize: () => {},
    close: () => {},
    setFullscreen: () => {},
    isFullscreen: () => false,
    setSize: () => {},
    setPosition: () => {},
    setTitle: () => {},
  };
}

/** 兼容部分代码对默认导出的假设（如有）。 */
export default {
  invoke,
  convertFileSrc,
  openUrl,
  open,
  pickDir,
  getCurrentWindow,
};
