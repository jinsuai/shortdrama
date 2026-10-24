import React from "react";

/**
 * 底部状态栏。left/right 为 ReactNode 数组或单个节点。
 */
export function StatusBar({ left, right }) {
  return (
    <div style={styles.bar}>
      <div style={styles.side}>{left}</div>
      <div style={styles.side}>{right}</div>
    </div>
  );
}

const styles = {
  bar: {
    height: 30,
    minHeight: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 14px",
    background: "var(--bg-elevated, #eef2f9)",
    borderTop: "1px solid var(--border, rgba(15,23,42,0.128))",
    color: "var(--text-muted, #5d6779)",
    fontSize: 12,
    boxSizing: "border-box",
    gap: 16,
  },
  side: { display: "flex", alignItems: "center", gap: 14, overflow: "hidden", whiteSpace: "nowrap" },
};
