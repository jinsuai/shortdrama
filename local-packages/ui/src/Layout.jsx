import React from "react";

// 通用三栏布局：左侧列表 / 中间主工作区（自适应） / 右侧参数面板
// 参考图比例：中间编辑区占主体，两侧尽量窄。
export function ThreePane({ left, center, right, leftWidth = 200, rightWidth = 280 }) {
  return (
    <div style={styles.root}>
      <div style={{ ...styles.pane, ...styles.left, width: leftWidth, minWidth: leftWidth }}>{left}</div>
      <div style={{ ...styles.pane, ...styles.center }}>{center}</div>
      {right != null && right !== false && (
        <div style={{ ...styles.pane, ...styles.right, width: rightWidth, minWidth: rightWidth }}>{right}</div>
      )}
    </div>
  );
}

const styles = {
  root: {
    display: "flex",
    height: "100%",
    width: "100%",
    fontFamily: "var(--font, system-ui, -apple-system, 'PingFang SC', sans-serif)",
    color: "var(--text, #334155)",
    background: "var(--bg, #f7f9fc)",
  },
  pane: { overflow: "hidden", boxSizing: "border-box", display: "flex", flexDirection: "column" },
  left: { background: "var(--bg-elevated, #eef2f9)", borderRight: "1px solid var(--border, rgba(15,23,42,0.128))" },
  center: { flex: 1, minWidth: 0, background: "var(--panel, #e9eef7)", borderRight: "1px solid var(--border, rgba(15,23,42,0.128))" },
  right: { background: "var(--bg, #f7f9fc)", padding: 0, borderLeft: "1px solid var(--border, rgba(15,23,42,0.128))" },
};
