/**
 * 烬序 JINSU 统一品牌浅色主题系统。
 * 注入 CSS 变量到 :root，所有 UI 组件通过 var(--xxx) 读取。
 * 仅保留浅色主题（品牌锁定），不再提供深色 / 跟随系统 / 彩色写作变体，
 * 以保证「妙笔小说」「AI 视频短剧」两个端视觉一致、界面不乱。
 *
 * 品牌基调：
 *   云白底（#f4f7fc → #ffffff）
 *   深电光紫 #6D28D9（主色 / accent）
 *   深数据青 #0891B2（副色 / accent-2）
 *   主色 → 副色渐变（accent-gradient）
 */

const BRAND_LIGHT = {
  // 背景层级（云白，由浅到白）
  "--bg": "#f4f7fc",
  "--bg-elevated": "#ffffff",
  "--panel": "#ffffff",
  "--panel-2": "#eef3fa",
  // 描边（中性深灰，弱→强）
  "--border": "rgba(15,23,42,0.12)",
  "--border-strong": "rgba(15,23,42,0.24)",
  // 文字
  "--text": "#16203a",
  "--text-secondary": "#52607d",
  "--text-muted": "#8794ad",
  // 品牌主色 / 副色（浅底上加深以保证对比度）
  "--accent": "#6D28D9",          // 深电光紫（主）
  "--accent-2": "#0891B2",        // 深数据青（副）
  "--accent-gradient": "linear-gradient(135deg, #6D28D9 0%, #0891B2 100%)",
  "--accent-gradient-hover": "linear-gradient(135deg, #5b21b6 0%, #0e7490 100%)",
  "--accent-text": "#ffffff",
  // 语义色（在浅底上重新校准，保证可读）
  "--danger": "#dc2626",
  "--success": "#059669",
  "--warning": "#d97706",
  // 玻璃拟态 / 阴影（浅调）
  "--glass": "rgba(255,255,255,0.82)",
  "--glass-border": "rgba(15,23,42,0.10)",
  "--shadow": "0 8px 24px rgba(15,23,42,0.10)",
  // 输入 / 交互态
  "--input-bg": "#ffffff",
  "--hover": "rgba(109,40,217,0.06)",
  "--active": "rgba(109,40,217,0.12)",
  // 圆角 / 字体
  "--radius-sm": "6px",
  "--radius": "10px",
  "--radius-lg": "14px",
  "--font": "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
};

export const THEME_VARS = {
  light: BRAND_LIGHT,
};

export const THEME_LABELS = {
  light: "浅色 · 烬序",
};

/**
 * 应用主题。品牌锁定为浅色：任何传入值（含历史存储的 dark/system/eye 等）
 * 都会回退到 light，确保已发布版本升级后不会出现深色界面。
 */
export function applyTheme(themeName) {
  const root = document.documentElement;
  const resolved = THEME_VARS[themeName] ? themeName : "light";
  root.dataset.theme = resolved;
  const vars = THEME_VARS[resolved];
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  }
  injectBaseStyles();
  return resolved;
}

/** 注入统一的浅色滚动条样式，覆盖所有 WebKit 滚动条。 */
function injectBaseStyles() {
  const id = "jinsu-base-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    html, body { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: var(--bg, #f4f7fc); color: var(--text, #16203a); }
    #root { width: 100%; height: 100%; }
    *, *::before, *::after { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; border-radius: 6px; }
    ::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, rgba(109,40,217,0.45), rgba(8,145,178,0.32));
      border-radius: 6px;
      border: 2px solid var(--bg, #f4f7fc);
    }
    ::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(109,40,217,0.7), rgba(8,145,178,0.5)); }
    ::-webkit-scrollbar-corner { background: transparent; }
    html, body, * { scrollbar-width: thin; scrollbar-color: rgba(109,40,217,0.45) transparent; }
  `;
  document.head.appendChild(style);
}

/** 品牌锁定浅色，恒为 false。保留签名以兼容既有调用（如 MenuBar）。 */
export function isDark() {
  return false;
}
