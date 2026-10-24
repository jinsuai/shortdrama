import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "../SessionContext.jsx";
import * as dispatch from "../dispatch.js";

export default function AuthDialog({ onClose, notify }) {
  const { login, register } = useSession();
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // 图形验证码
  const [captchaId, setCaptchaId] = useState("");
  const [captchaImg, setCaptchaImg] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const r = await dispatch.auth.captcha();
      setCaptchaId(r.captcha_id);
      setCaptchaImg(r.image);
      setCaptchaInput("");
    } catch {
      /* 失败不阻塞，提交时会因缺验证码被后端拒绝 */
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  // 切到注册页时拉取验证码
  useEffect(() => {
    if (tab === "register") loadCaptcha();
  }, [tab, loadCaptcha]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (tab === "login") {
        await login(username.trim(), password);
      } else {
        if (!captchaId || !captchaInput.trim()) {
          setError("请先填写图形验证码");
          setBusy(false);
          return;
        }
        await register(
          username.trim(),
          email.trim(),
          password,
          captchaId,
          captchaInput.trim()
        );
      }
      notify?.(tab === "login" ? "登录成功" : "注册成功，已送你一个新账号");
      onClose();
    } catch (err) {
      setError(err?.message || "操作失败");
      // 验证码错误时刷新一张
      if (tab === "register") loadCaptcha();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ds-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ds-modal">
        <div className="ds-modal-head">
          <h3>{tab === "login" ? "登录 DualStudio" : "注册新账号"}</h3>
          <button className="ds-close" onClick={onClose}>×</button>
        </div>
        <div className="ds-modal-body">
          <div className="ds-tabs">
            <button className={`ds-tab ${tab === "login" ? "active" : ""}`} onClick={() => setTab("login")}>登录</button>
            <button className={`ds-tab ${tab === "register" ? "active" : ""}`} onClick={() => setTab("register")}>注册</button>
          </div>
          <form onSubmit={submit}>
            <div className="ds-field">
              <label>用户名</label>
              <input className="ds-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3-64 字符" autoFocus />
            </div>
            {tab === "register" && (
              <div className="ds-field">
                <label>邮箱</label>
                <input className="ds-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
            )}
            <div className="ds-field">
              <label>密码</label>
              <input className="ds-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" />
            </div>
            {tab === "register" && (
              <div className="ds-field">
                <label>图形验证码</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div
                    onClick={loadCaptcha}
                    title="点击刷新验证码"
                    style={{
                      width: 124, height: 46, border: "1px solid #e2e6ee", borderRadius: 6,
                      overflow: "hidden", cursor: "pointer", background: "#f2f4f8", flex: "0 0 auto",
                    }}
                    dangerouslySetInnerHTML={{ __html: captchaLoading ? "加载中…" : (captchaImg ? `<img src="${captchaImg}" alt="captcha" style="width:100%;height:100%;display:block"/>` : "点击刷新") }}
                  />
                  <input
                    className="ds-input"
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    placeholder="输入右侧字符"
                    maxLength={6}
                    style={{ flex: 1 }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "#8b95a7", marginTop: 4 }}>看不清？点击图片换一张</div>
              </div>
            )}
            {error && <div className="ds-error">{error}</div>}
            <button className="ds-submit" disabled={busy || !username || !password}>{busy ? "处理中…" : tab === "login" ? "登录" : "注册并登录"}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
