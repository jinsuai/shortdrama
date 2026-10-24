import React from "react";

/**
 * 顶部栏：左侧 logo/title，中间 tabs，右侧 actions。
 * tabs?: [{ key, label, active, onClick }]
 */
export function TopBar({ title, tabs, actions }) {
  return (
    <div style={styles.bar}>
      <div style={styles.left}>{title}</div>
      {tabs && (
        <div style={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.key}
              style={{ ...styles.tab, ...(t.active ? styles.active : {}) }}
              onClick={t.onClick}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div style={styles.right}>{actions}</div>
    </div>
  );
}

const styles = {
  bar: {
    height: 48,
    minHeight: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    background: "var(--bg-elevated, #eef2f9)",
    borderBottom: "1px solid var(--border, rgba(15,23,42,0.128))",
    boxSizing: "border-box",
    gap: 16,
  },
  left: { display: "flex", alignItems: "center", gap: 10, color: "var(--text, #334155)", fontWeight: 700, fontSize: 15 },
  tabs: { display: "flex", alignItems: "center", gap: 6 },
  tab: {
    padding: "7px 16px",
    border: "1px solid transparent",
    borderRadius: "var(--radius, 10px)",
    background: "transparent",
    color: "var(--text-secondary, #8b95a7)",
    cursor: "pointer",
    fontSize: 13,
    transition: "all .15s ease",
  },
  active: {
    background: "var(--active, rgba(124,58,237,0.18))",
    borderColor: "rgba(124,58,237,0.35)",
    color: "var(--text, #334155)",
  },
  right: { display: "flex", alignItems: "center", gap: 10 },
};
