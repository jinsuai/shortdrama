import React from "react";

// 兜底错误边界：任何子组件渲染抛错时显示错误文字，而不是整页白屏。
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#b00" }}>
          <h3>页面渲染出错（已捕获）</h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "#fff0f0", padding: 12, borderRadius: 8 }}>
            {String(this.state.error && this.state.error.stack || this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
