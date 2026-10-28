import React, { useState } from "react";
import qr from "../../docs/wechat-qr.png";

// 左下角「加微信」悬浮按钮：点开放大二维码，方便手机扫码
export function QrContactButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="扫码加微信：遇到问题、提意见都欢迎"
        style={{
          position: "fixed",
          left: 16,
          bottom: 44,
          zIndex: 90,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "9px 14px 9px 11px",
          border: "none",
          borderRadius: 999,
          background: "#07C160",
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 600,
          lineHeight: 1,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(7,193,96,0.38)",
          userSelect: "none",
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M9.5 4C5.36 4 2 6.79 2 10.2c0 1.98 1.13 3.74 2.9 4.92L4.2 17.6l2.63-1.37c.9.25 1.86.39 2.67.39.24 0 .47-.01.7-.03a5.7 5.7 0 0 1-.3-1.82c0-3.32 3.24-6.01 7.23-6.01.27 0 .53.01.79.04C17.5 6.16 13.86 4 9.5 4Zm-2.4 3.05a1.06 1.06 0 1 1 0 2.12 1.06 1.06 0 0 1 0-2.12Zm4.8 0a1.06 1.06 0 1 1 0 2.12 1.06 1.06 0 0 1 0-2.12Z" />
          <path d="M22 14.55c0-2.94-2.86-5.32-6.38-5.32-3.56 0-6.44 2.38-6.44 5.32 0 2.95 2.88 5.33 6.44 5.33.74 0 1.46-.1 2.13-.3l2.07 1.08-.56-1.92a4.6 4.6 0 0 0 2.74-4.19Zm-8.52-1.32a.84.84 0 1 1 0 1.68.84.84 0 0 1 0-1.68Zm4.28 0a.84.84 0 1 1 0 1.68.84.84 0 0 1 0-1.68Z" />
        </svg>
        加微信
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg, #fff)",
              color: "var(--text, #1f2937)",
              borderRadius: 14,
              padding: "24px 24px 20px",
              width: 340,
              maxWidth: "92vw",
              boxShadow: "0 16px 50px rgba(0,0,0,0.3)",
              textAlign: "center",
              position: "relative",
            }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="关闭"
              style={{
                position: "absolute",
                top: 10,
                right: 12,
                border: "none",
                background: "transparent",
                fontSize: 20,
                lineHeight: 1,
                color: "var(--text-muted, #9ca3af)",
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
              扫码加微信
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted, #6b7280)", marginBottom: 16, lineHeight: 1.7 }}>
              配置问题、想提意见、想加功能，都欢迎<br />微信里能直接发截图
            </div>

            <img
              src={qr}
              alt="微信二维码"
              style={{
                width: 280,
                height: 280,
                objectFit: "contain",
                borderRadius: 8,
                background: "#fff",
                border: "1px solid #eee",
              }}
            />

            <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-muted, #9ca3af)" }}>
              长按或扫一扫，添加微信
            </div>
          </div>
        </div>
      )}
    </>
  );
}
