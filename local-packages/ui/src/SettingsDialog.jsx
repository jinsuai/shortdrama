import React, { useState } from "react";
import { pickDownloadDir } from "./download.js";

/**
 * 通用设置对话框（深色工作台风格）。
 */
export function SettingsDialog({ open, onClose, appName, showRag = false, features = [], theme, onThemeChange }) {
  const [agnesKey, setAgnesKey] = useState(localStorage.getItem("AGNES_API_KEY") || "");
  const [ragKey, setRagKey] = useState(localStorage.getItem("SILICONFLOW_API_KEY") || "");
  const [downloadDir, setDownloadDir] = useState(localStorage.getItem("DOWNLOAD_DIR") || "");
  const [autosave, setAutosave] = useState(localStorage.getItem("AUTOSAVE_SEC") || "5");
  const [lang, setLang] = useState(localStorage.getItem("LANG") || "zh-CN");
  const [dispatchUrl, setDispatchUrl] = useState(localStorage.getItem("DISPATCH_BASE_URL") || "http://123.57.243.61");
  const [dispatchUser, setDispatchUser] = useState(localStorage.getItem("DISPATCH_USER") || "");
  const [dispatchPass, setDispatchPass] = useState("");
  const [dispatchLoginStatus, setDispatchLoginStatus] = useState("");
  const [dispatchTokenHint, setDispatchTokenHint] = useState(() => {
    const t = localStorage.getItem("DISPATCH_TOKEN") || "";
    return t ? t.slice(0, 8) + "****" : "";
  });
  const [suppressRecharge, setSuppressRecharge] = useState(localStorage.getItem("SUPPRESS_RECHARGE") === "1");
  // 开发者/运维设置（调度登录 + 高级后端）：默认对普通用户隐藏，标题连点 3 下唤出
  const [showDev, setShowDev] = useState(() => localStorage.getItem("DEV_SETTINGS") === "1");
  const [titleClicks, setTitleClicks] = useState(0);
  const titleTimer = React.useRef(null);
  const onTitleClick = () => {
    const n = titleClicks + 1;
    setTitleClicks(n);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    if (n >= 3) {
      setTitleClicks(0);
      setShowDev((v) => { const nv = !v; localStorage.setItem("DEV_SETTINGS", nv ? "1" : "0"); return nv; });
    } else {
      titleTimer.current = setTimeout(() => setTitleClicks(0), 600);
    }
  };

  // 高级后端（后期接入 Wan2.2-14B / Index-TTS-2.0 / 图生图角色一致性 等）
  const backendKeys = {
    llm: ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"],
    tts: ["TTS_BASE_URL", "TTS_API_KEY", "TTS_MODEL"],
    image: ["IMG_BASE_URL", "IMG_API_KEY", "IMG_MODEL"],
    video: ["VID_BASE_URL", "VID_API_KEY", "VID_MODEL"],
  };
  const [backend, setBackend] = useState(() => {
    const o = {};
    Object.entries(backendKeys).forEach(([k, ks]) => {
      o[k] = {
        baseUrl: localStorage.getItem(ks[0]) || "",
        key: localStorage.getItem(ks[1]) || "",
        model: localStorage.getItem(ks[2]) || "",
      };
    });
    return o;
  });
  const saveBackend = (name) => {
    const ks = backendKeys[name];
    localStorage.setItem(ks[0], (backend[name].baseUrl || "").trim());
    localStorage.setItem(ks[1], (backend[name].key || "").trim());
    localStorage.setItem(ks[2], (backend[name].model || "").trim());
  };
  const setB = (name, field, val) => setBackend((b) => ({ ...b, [name]: { ...b[name], [field]: val } }));

  if (!open) return null;

  const saveAgnes = () => { localStorage.setItem("AGNES_API_KEY", agnesKey.trim()); };
  const saveRag = () => { localStorage.setItem("SILICONFLOW_API_KEY", ragKey.trim()); };
  const chooseDir = async () => {
    const r = await pickDownloadDir();
    if (r.ok) { setDownloadDir(r.dir); localStorage.setItem("DOWNLOAD_DIR", r.dir); }
    else if (r.err && !r.cancelled) alert("选择目录失败：" + r.err);
  };
  const saveAutosave = () => {
    const v = Math.max(1, parseInt(autosave) || 5);
    localStorage.setItem("AUTOSAVE_SEC", String(v));
  };

  const dispatchLogin = async () => {
    const base = (dispatchUrl || "http://123.57.243.61").replace(/\/$/, "");
    try {
      const res = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: dispatchUser.trim(), password: dispatchPass.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDispatchLoginStatus("登录失败：" + (data.detail || data.message || `HTTP ${res.status}`));
        return;
      }
      const token = data.token || (data.data && data.data.token);
      if (!token) {
        setDispatchLoginStatus("登录成功但未返回 token，请联系管理员。");
        return;
      }
      localStorage.setItem("DISPATCH_TOKEN", token);
      localStorage.setItem("DISPATCH_USER", dispatchUser.trim());
      localStorage.setItem("DISPATCH_PASS", dispatchPass.trim()); // 记住密码，供 token 过期时静默续期
      setDispatchTokenHint(token.slice(0, 8) + "****");
      setDispatchLoginStatus("登录成功：" + (data.user?.username || dispatchUser.trim()));
      setDispatchPass("");
    } catch (e) {
      setDispatchLoginStatus("登录异常：" + e.message);
    }
  };

  const dispatchLogout = () => {
    localStorage.removeItem("DISPATCH_TOKEN");
    localStorage.removeItem("DISPATCH_USER");
    localStorage.removeItem("DISPATCH_PASS");
    setDispatchTokenHint("");
    setDispatchLoginStatus("");
    setDispatchPass("");
  };

  const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 };
  const card = {
    width: 540, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto",
    background: "var(--panel, #e9eef7)", border: "1px solid var(--border, rgba(15,23,42,0.224))",
    borderRadius: "var(--radius-lg, 14px)", padding: 24, boxSizing: "border-box",
    color: "var(--text, #334155)", boxShadow: "var(--shadow, 0 8px 32px rgba(0,0,0,0.45))",
  };
  const label = { display: "block", fontSize: 12, color: "var(--text-secondary, #8b95a7)", margin: "12px 0 6px" };
  const input = {
    width: "100%", padding: 9, border: "1px solid var(--border, rgba(15,23,42,0.128))",
    borderRadius: "var(--radius-sm, 6px)", fontSize: 13, boxSizing: "border-box",
    background: "var(--input-bg, #f4f7fa)", color: "var(--text, #334155)",
  };
  const btn = {
    marginTop: 10, padding: "7px 16px", border: "none",
    borderRadius: "var(--radius-sm, 6px)",
    background: "var(--accent-gradient, linear-gradient(135deg, #7c3aed, #2563eb))",
    color: "var(--accent-text, #fff)", cursor: "pointer", fontSize: 13, fontWeight: 600,
  };
  const hint = { fontSize: 12, color: "var(--text-muted, #5d6779)", marginTop: 6, lineHeight: 1.5 };

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, cursor: "pointer", userSelect: "none" }} onClick={onTitleClick} title="开发者设置：标题连点 3 下切换显示">{showDev ? `设置 · ${appName}（开发者）` : `设置 · ${appName}`}</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", lineHeight: 1, color: "var(--text-secondary, #8b95a7)" }}>×</button>
        </div>

        <Section title="AI 密钥设置">
          <label style={label}>Agnes API Key（图像 / 视频 AI：封面 / 分镜图 / 短片）</label>
          <input style={input} type="password" value={agnesKey} placeholder="粘贴你的 Agnes API Key"
            onChange={(e) => setAgnesKey(e.target.value)} />
          <button style={btn} onClick={saveAgnes}>保存 Key</button>
          <p style={hint}>图像 / 视频生成仍走 Agnes。桌面端也可放在本机 ~/.agnes/api_key 自动读取。</p>
          {showDev && (
            <>
          <label style={label}>调度服务器地址（商业化 · 视频/配音/片头走此服务）</label>
          <input style={input} value={dispatchUrl} placeholder="http://123.57.243.61"
            onChange={(e) => { setDispatchUrl(e.target.value); localStorage.setItem("DISPATCH_BASE_URL", e.target.value.trim()); }} />
          <p style={hint}>客户端只对接该调度机，由它再派发到 GPU 工人（Wan2.2-14B / Index-TTS-2.0 / Hyper-Frames）。默认已指向云端调度机 http://123.57.243.61；如需自建可在此改为本机或私有地址。</p>

          <label style={label}>调度账号</label>
          <input style={input} value={dispatchUser} placeholder="用户名"
            onChange={(e) => { setDispatchUser(e.target.value); localStorage.setItem("DISPATCH_USER", e.target.value.trim()); }} />
          <label style={label}>调度密码</label>
          <input style={input} type="password" value={dispatchPass} placeholder="登录密码"
            onChange={(e) => setDispatchPass(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={btn} onClick={dispatchLogin} disabled={!dispatchUser || !dispatchPass}>登录调度机</button>
            {dispatchTokenHint && <button style={{ ...btn, background: "var(--danger, #c0392b)" }} onClick={dispatchLogout}>退出登录</button>}
          </div>
          {dispatchLoginStatus && <p style={{ ...hint, color: dispatchLoginStatus.startsWith("登录成功") ? "var(--success, #2ecc71)" : "var(--danger, #e74c3c)" }}>{dispatchLoginStatus}</p>}
          {dispatchTokenHint && <p style={hint}>当前已登录，Token：{dispatchTokenHint}</p>}
            </>
          )}

          {showRag && (
            <>
              <label style={label}>硅基流动 API Key（RAG 记忆 · bge-m3）</label>
              <input style={input} type="password" value={ragKey} placeholder="sk-...（用于向量检索）"
                onChange={(e) => setRagKey(e.target.value)} />
              <button style={btn} onClick={saveRag}>保存 Key</button>
              <p style={hint}>让 AI 续写时自动参考你已写剧情 / 人设，避免人设跑偏。</p>
            </>
          )}
        </Section>

        <Section title="下载与导出">
          <label style={label}>文件保存目录</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...input, flex: 1 }} value={downloadDir}
              placeholder="桌面端可点击选择；Web 端使用浏览器默认下载目录"
              onChange={(e) => { setDownloadDir(e.target.value); localStorage.setItem("DOWNLOAD_DIR", e.target.value); }} />
            <button style={btn} onClick={chooseDir}>选择目录</button>
          </div>
          <p style={hint}>导出的 TXT / EPUB / 工程 JSON 将保存到该目录（桌面端）；留空则用系统下载目录。</p>
        </Section>

        <Section title="外观与行为">
          <label style={label}>界面主题</label>
          <div style={{ ...input, display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary, #9aa6d4)", cursor: "default" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent-gradient, linear-gradient(135deg,#6D28D9,#0891B2))" }} />
            深色 · 烬序（已锁定）
          </div>
          <p style={hint}>品牌统一深色界面，无需切换；专注写作 / 创作，长时间使用更护眼。</p>
          <label style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={suppressRecharge}
              onChange={(e) => { setSuppressRecharge(e.target.checked); localStorage.setItem("SUPPRESS_RECHARGE", e.target.checked ? "1" : ""); }} />
            余额不足时不再弹出充值提醒（仍会拦截生成，可在账户页手动充值）
          </label>
          <label style={label}>自动保存间隔（秒）</label>
          <input style={input} type="number" min="1" max="120" value={autosave}
            onChange={(e) => setAutosave(e.target.value)} />
          <button style={btn} onClick={saveAutosave}>保存间隔</button>
          <label style={label}>语言</label>
          <select style={input} value={lang}
            onChange={(e) => { setLang(e.target.value); localStorage.setItem("LANG", e.target.value); }}>
            <option value="zh-CN">简体中文</option>
            <option value="en">English（即将支持）</option>
          </select>
        </Section>

        {features.length > 0 && (
          <Section title="功能模块">
            {features.map((f) => (
              <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "8px 0", color: "var(--text, #334155)" }}>
                <input type="checkbox" checked={!!f.checked} onChange={(e) => f.onToggle(e.target.checked)} />
                {f.label}
              </label>
            ))}
            <p style={hint}>关闭后对应模块将从左侧列表隐藏。</p>
          </Section>
        )}

        {showDev && (
        <Section title="高级后端（可选 · 接入自建 / 第三方模型）">
          <p style={hint}>默认走 Agnes。填入下方 Base URL 即切换到自定义 OpenAI 兼容端点，用于后期接入 Wan2.2-14B（视频）、Index-TTS-2.0（语音）、图生图角色一致性等。</p>
          {[
            { name: "llm", title: "文本大模型", ph: "https://your-host/v1" },
            { name: "tts", title: "语音合成 TTS", ph: "https://your-host/v1" },
            { name: "image", title: "图像 / 角色一致性", ph: "https://your-host/v1" },
            { name: "video", title: "视频生成（Wan2.2 等）", ph: "https://your-host/v1" },
          ].map((p) => (
            <div key={p.name} style={{ margin: "10px 0", padding: "10px", border: "1px solid var(--border, rgba(15,23,42,0.128))", borderRadius: "var(--radius-sm, 8px)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text, #334155)" }}>{p.title}</div>
              <label style={label}>Base URL（留空则用 Agnes）</label>
              <input style={input} value={backend[p.name].baseUrl} placeholder={p.ph} onChange={(e) => setB(p.name, "baseUrl", e.target.value)} />
              <label style={label}>API Key</label>
              <input style={input} type="password" value={backend[p.name].key} placeholder="sk-...（留空则用 Agnes Key）" onChange={(e) => setB(p.name, "key", e.target.value)} />
              <label style={label}>模型名（可选）</label>
              <input style={input} value={backend[p.name].model} placeholder="如 Wan2.2-14B / Index-TTS-2.0" onChange={(e) => setB(p.name, "model", e.target.value)} />
              <button style={btn} onClick={() => saveBackend(p.name)}>保存该后端</button>
            </div>
          ))}
        </Section>
        )}

        <p style={{ ...hint, marginTop: 16 }}>所有设置保存在本机（localStorage），不会上传。</p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ borderTop: "1px solid var(--border, rgba(15,23,42,0.128))", paddingTop: 14, marginTop: 14 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 6px", color: "var(--text, #334155)" }}>{title}</h3>
      {children}
    </div>
  );
}