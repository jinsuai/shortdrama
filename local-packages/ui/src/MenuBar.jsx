import React, { useState, useRef, useEffect, useCallback } from "react";
import { isDark } from "./theme.js";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 通用桌面菜单栏（深色工作台风格）。同时作为无边框窗口的标题栏（拖拽区）。actions 为右侧插槽。 */
export function MenuBar({ menus, actions }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  const dark = isDark();
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const bar = {
    display: "flex", alignItems: "center", height: 36, flex: "0 0 36px",
    padding: "0 10px", boxSizing: "border-box",
    background: "var(--bg-elevated, #eef2f9)",
    borderBottom: "1px solid var(--border, rgba(15,23,42,0.128))",
    color: "var(--text, #334155)", userSelect: "none",
    WebkitAppRegion: "drag",
  };
  const item = (active) => ({
    border: "none",
    background: active ? "var(--active, rgba(124,58,237,0.18))" : "transparent",
    color: active ? "var(--text, #334155)" : "var(--text-secondary, #8b95a7)",
    padding: "5px 12px", cursor: "pointer", fontSize: 12, borderRadius: "var(--radius-sm, 6px)", marginRight: 2,
    WebkitAppRegion: "no-drag",
  });
  const dropdown = {
    position: "absolute", top: 30, left: 0, minWidth: 200, zIndex: 1000,
    background: "var(--panel, #e9eef7)",
    color: "var(--text, #334155)",
    border: "1px solid var(--border, rgba(15,23,42,0.128))",
    borderRadius: "var(--radius, 10px)",
    boxShadow: "var(--shadow, 0 8px 32px rgba(0,0,0,0.45))", padding: 6,
    WebkitAppRegion: "no-drag",
  };
  const dropItem = (disabled) => ({
    display: "flex", justifyContent: "space-between", width: "100%",
    border: "none", background: "transparent", textAlign: "left",
    color: disabled ? "var(--text-muted, #5d6779)" : "var(--text, #334155)",
    padding: "7px 10px", cursor: disabled ? "default" : "pointer", fontSize: 13,
    borderRadius: "var(--radius-sm, 6px)",
    WebkitAppRegion: "no-drag",
  });

  return (
    <div ref={ref} style={bar} data-tauri-drag-region>
      {menus.map((m, i) => (
        <div key={i} data-tauri-drag-region="no-drag" style={{ position: "relative", WebkitAppRegion: "no-drag" }}>
          <button type="button" style={item(open === i)} onClick={() => setOpen(open === i ? null : i)}>
            {m.label}
          </button>
          {open === i && (
            <div style={dropdown}>
              {m.items.map((it, j) => {
                if (it.type === "separator" || it.label === "-") {
                  return <div key={j} style={{ height: 1, background: "var(--border, rgba(15,23,42,0.128))", margin: "4px 6px" }} />;
                }
                return (
                  <button type="button" key={j} disabled={it.disabled} style={dropItem(it.disabled)}
                    onClick={() => { setOpen(null); it.onClick && it.onClick(); }}>
                    <span>{it.label}</span>
                    {it.shortcut && <span style={{ color: "var(--text-muted, #5d6779)", marginLeft: 16, fontSize: 12 }}>{it.shortcut}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      <div style={{ flex: 1, WebkitAppRegion: "drag" }} data-tauri-drag-region />
      {/* 右侧 actions + 窗口控制必须整体声明为 no-drag，避免被标题栏拖拽区吞掉点击 */}
      <div data-tauri-drag-region="no-drag" style={{ display: "flex", alignItems: "center", WebkitAppRegion: "no-drag" }}>
        {actions}
        {isTauri && <WindowControls />}
      </div>
    </div>
  );
}

// 无边框窗口的原生控制按钮（仅在 Tauri 运行时显示；浏览器/开发模式下不渲染）
// 深色化融入烬序主题：默认透明融入标题栏，悬停时最小化/最大化显电光紫、关闭显警示红。
function WindowControls() {
  // 用 ref 持有窗口对象，避免每次渲染重新获取；同时兼容 getCurrentWindow 异常。
  const winRef = useRef(null);
  useEffect(() => {
    try { winRef.current = getCurrentWindow(); } catch (_) {}
  }, []);

  const call = useCallback((method) => {
    const w = winRef.current;
    if (!w || !w[method]) return;
    try {
      const r = w[method]();
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch (_) {}
  }, []);

  const base = {
    width: 42, height: 36, border: "none", background: "transparent",
    color: "var(--text-secondary, #8b95a7)", cursor: "pointer", fontSize: 14,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: 6, transition: "background .12s ease, color .12s ease",
    WebkitAppRegion: "no-drag",
  };
  const hoverPurple = (e) => { e.currentTarget.style.background = "rgba(109,40,217,0.30)"; e.currentTarget.style.color = "#cdbcff"; };
  const leavePurple = (e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary, #8b95a7)"; };
  return (
    <div data-tauri-drag-region="no-drag" style={{ display: "flex", marginLeft: 6 }}>
      <button type="button" data-tauri-drag-region="no-drag" style={base} title="最小化"
        onMouseEnter={hoverPurple} onMouseLeave={leavePurple}
        onClick={() => call("minimize")}>—</button>
      <button type="button" data-tauri-drag-region="no-drag" style={base} title="最大化 / 还原"
        onMouseEnter={hoverPurple} onMouseLeave={leavePurple}
        onClick={() => call("toggleMaximize")}>□</button>
      <button type="button" data-tauri-drag-region="no-drag" style={{ ...base, fontSize: 15 }} title="关闭"
        onMouseEnter={(e) => { e.currentTarget.style.background = "#e81123"; e.currentTarget.style.color = "#fff"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary, #8b95a7)"; }}
        onClick={() => call("close")}>✕</button>
    </div>
  );
}
