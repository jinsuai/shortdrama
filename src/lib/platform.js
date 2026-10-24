// 平台检测：区分 桌面端（win/mac Tauri） / Android APP（Tauri WebView） / 浏览器
// Android 上没有本地 ffmpeg 与系统「下载」目录，合并/导出/保存走服务端或系统浏览器。

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const IS_ANDROID =
  IS_TAURI &&
  typeof navigator !== "undefined" &&
  /Android/i.test(navigator.userAgent);

export const IS_DESKTOP = IS_TAURI && !IS_ANDROID;
