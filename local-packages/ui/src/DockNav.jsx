import React from "react";

/**
 * 左侧垂直图标导航。可按「创作阶段」分组，避免功能堆砌杂乱。
 *
 * items: [{ key, icon, label, active?, onClick?, group?, divider? }]
 *   - group: 分组标题（如「创作」「管理」）。与前一项 group 不同则在其上方渲染分组小标题。
 *   - divider: 兼容旧写法，在该项上方渲染一条分隔线。
 * logo?: ReactNode
 * footer?: ReactNode
 */
export function DockNav({ items, logo, footer, textOnly = false }) {
  let lastGroup = null;
  return (
    <div style={{ ...styles.nav, ...(textOnly ? styles.navTextOnly : {}) }}>
      {logo && <div style={styles.logo}>{logo}</div>}
      <div style={{ ...styles.items, ...(textOnly ? styles.itemsTextOnly : {}) }}>
        {items.map((it) => {
          const showGroup = !!it.group && it.group !== lastGroup;
          if (it.group) lastGroup = it.group;
          return (
            <React.Fragment key={it.key}>
              {showGroup && <div style={{ ...styles.group, ...(textOnly ? styles.groupTextOnly : {}) }}>{it.group}</div>}
              {it.divider && <div style={styles.divider} />}
              <button
                title={it.label}
                onClick={it.onClick}
                style={{ ...styles.item, ...(textOnly ? styles.itemTextOnly : {}), ...(it.active ? (textOnly ? styles.activeTextOnly : styles.active) : {}) }}
              >
                {!textOnly && <span style={styles.icon}>{it.icon}</span>}
                <span style={{ ...styles.label, ...(textOnly ? styles.labelTextOnly : {}) }}>{it.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
      {footer && <div style={styles.footer}>{footer}</div>}
    </div>
  );
}

const styles = {
  nav: {
    display: "flex",
    flexDirection: "column",
    width: 76,
    minWidth: 76,
    height: "100%",
    background: "var(--bg-elevated, #141a38)",
    borderRight: "1px solid var(--border, rgba(109,40,217,0.16))",
    boxSizing: "border-box",
  },
  navTextOnly: { width: 110, minWidth: 110 },
  logo: {
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderBottom: "1px solid var(--border, rgba(109,40,217,0.16))",
    color: "var(--text, #1e293b)",
    fontWeight: 700,
    fontSize: 14,
  },
  items: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 8px",
    overflowY: "auto",
  },
  itemsTextOnly: { padding: "8px 6px", gap: 3 },
  group: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    color: "var(--text-muted, #646e9c)",
    padding: "12px 6px 4px",
    textTransform: "uppercase",
  },
  groupTextOnly: { fontSize: 10, padding: "10px 4px 3px" },
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: "100%",
    padding: "9px 4px",
    border: "1px solid transparent",
    borderRadius: "var(--radius, 10px)",
    background: "transparent",
    color: "var(--text-secondary, #9aa6d4)",
    cursor: "pointer",
    transition: "all .15s ease",
    fontSize: 11,
    lineHeight: 1.1,
  },
  itemTextOnly: {
    flexDirection: "row",
    justifyContent: "flex-start",
    padding: "7px 8px",
    fontSize: 12,
    lineHeight: 1.3,
    minHeight: 32,
    textAlign: "left",
  },
  active: {
    background: "var(--active, rgba(109,40,217,0.18))",
    borderColor: "rgba(109,40,217,0.38)",
    color: "var(--text, #1e293b)",
    boxShadow: "0 0 14px rgba(109,40,217,0.22)",
  },
  activeTextOnly: {
    background: "var(--active, rgba(109,40,217,0.18))",
    borderColor: "rgba(109,40,217,0.38)",
    color: "var(--text, #1e293b)",
    boxShadow: "none",
  },
  icon: { fontSize: 18, lineHeight: 1 },
  label: { fontSize: 11 },
  labelTextOnly: { fontSize: 12 },
  divider: { width: "60%", height: 1, background: "var(--border, rgba(109,40,217,0.16))", margin: "6px auto" },
  footer: { padding: 8, borderTop: "1px solid var(--border, rgba(109,40,217,0.16))" },
};
