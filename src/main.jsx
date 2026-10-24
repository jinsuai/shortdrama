// TITLE_PROBE: 主入口打点
document.title = "TITLE_PROBE:MAIN_START:" + Date.now();
window.addEventListener("error", (e) => { try { document.title = "TITLE_PROBE:ERR:" + (e.message || "unknown"); } catch(_) {} });
window.addEventListener("unhandledrejection", (e) => { try { document.title = "TITLE_PROBE:REJ:" + String(e.reason); } catch(_) {} });



import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { ErrorBoundary } from "@dual/ui";

// 禁用 F5 刷新（防止误触导致页面重新加载）
window.addEventListener("keydown", (e) => {
  if (e.key === "F5") {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }
});

async function bootstrap() {
  document.title = "TITLE_PROBE:BEFORE_RENDER:" + Date.now();
  // JINSU-0903: 防御 root 挂载点缺失导致的空白窗口
  const mount = document.getElementById("root");
  if (!mount) {
    document.body.innerHTML = '<div style="display:flex;height:100vh;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;">初始化失败，请重启应用</div>';
    return;
  }
  createRoot(mount).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

bootstrap();
