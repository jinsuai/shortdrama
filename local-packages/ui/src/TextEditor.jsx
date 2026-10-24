import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";

// 富文本编辑器：contentEditable + 工具栏（标题/粗体/斜体/列表/引用/分割线）。
// 深色工作台风格。content 以 HTML 字符串存储。

const TB = [
  { label: "H1", cmd: "formatBlock", arg: "H1", title: "一级标题" },
  { label: "H2", cmd: "formatBlock", arg: "H2", title: "二级标题" },
  { label: "H3", cmd: "formatBlock", arg: "H3", title: "三级标题" },
  { label: "正文", cmd: "formatBlock", arg: "P", title: "正文段落" },
  { label: "B", cmd: "bold", arg: null, title: "加粗", style: { fontWeight: 700 } },
  { label: "I", cmd: "italic", arg: null, title: "斜体", style: { fontStyle: "italic" } },
  { label: "U", cmd: "underline", arg: null, title: "下划线", style: { textDecoration: "underline" } },
  { label: "• 列表", cmd: "insertUnorderedList", arg: null, title: "无序列表" },
  { label: "1. 列表", cmd: "insertOrderedList", arg: null, title: "有序列表" },
  { label: "❝ 引用", cmd: "formatBlock", arg: "BLOCKQUOTE", title: "引用块" },
  { label: "— 线", cmd: "insertHorizontalRule", arg: null, title: "分割线" },
];

export const TextEditor = forwardRef(function TextEditor({ value, onChange, placeholder }, ref) {
  const editorRef = useRef(null);
  const lastHtml = useRef(value || "");

  const normalize = (v) => {
    if (!v) return "";
    if (v.includes("<") && v.includes(">")) return v;
    const paras = v.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paras.length === 0) return "<p><br></p>";
    return paras.map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  };

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const target = normalize(value || "");
    if (target !== el.innerHTML) {
      el.innerHTML = target;
      lastHtml.current = target;
    }
  }, [value]);

  const emit = () => {
    const el = editorRef.current;
    if (el) {
      lastHtml.current = el.innerHTML;
      onChange && onChange(el.innerHTML);
    }
  };

  const exec = (cmd, arg) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try { document.execCommand(cmd, false, arg || null); } catch (e) { /* ignore */ }
    emit();
  };

  // 将外部 ref 直接绑定到内部 editor DOM，使父组件可以 addEventListener / setCaretOffset。
  useEffect(() => {
    if (!ref) return;
    if (typeof ref === "function") ref(editorRef.current);
    else ref.current = editorRef.current;
  }, [ref]);

  return (
    <div style={wrap}>
      <div style={toolbar}>
        {TB.map((b, i) => (
          <button
            key={i}
            type="button"
            title={b.title}
            onMouseDown={(e) => { e.preventDefault(); exec(b.cmd, b.arg); }}
            style={{ ...tbBtn, ...(b.style || {}) }}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        style={editor}
      />
    </div>
  );
});

const wrap = { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 };
const toolbar = {
  display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 12px",
  border: "1px solid var(--border, rgba(15,23,42,0.128))",
  borderBottom: "none",
  borderRadius: "var(--radius, 10px) var(--radius, 10px) 0 0",
  background: "var(--panel-2, #1c2433)",
  position: "sticky", top: 0, zIndex: 2,
};
const tbBtn = {
  minWidth: 34, padding: "5px 8px", border: "1px solid var(--border, rgba(15,23,42,0.128))",
  borderRadius: "var(--radius-sm, 6px)",
  background: "var(--panel, #e9eef7)", cursor: "pointer", fontSize: 12,
  color: "var(--text-secondary, #8b95a7)", transition: "all .12s ease",
};
const editor = {
  flex: 1,
  width: "100%", boxSizing: "border-box",
  border: "1px solid var(--border, rgba(15,23,42,0.128))",
  borderRadius: "0 0 var(--radius, 10px) var(--radius, 10px)",
  padding: 18, lineHeight: 1.9, fontSize: 15, outline: "none", fontFamily: "inherit",
  overflowY: "auto", overflowX: "hidden",
  // 关键：contentEditable 默认不会软换行（遇长串/无空格英文/URL 会溢出），
  // 这里显式保证按容器宽度换行，长单词/长串也能断行。
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowWrap: "break-word",
  background: "var(--input-bg, #f4f7fa)", color: "var(--text, #334155)",
};
