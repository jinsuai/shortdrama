// 全局会话上下文：登录态、用户档案、余额门禁、各计费弹窗开关。
// 真正的弹窗 UI 在 auth/BillingUI.jsx（消费本 context），避免循环依赖。
import React, {
  createContext, useContext, useState, useCallback, useEffect,
} from "react";
import * as dispatch from "./dispatch";

const SessionCtx = createContext(null);

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession 必须在 <SessionProvider> 内使用");
  return c;
}

export function SessionProvider({ children }) {
  const [token, setTokenState] = useState(() => dispatch.getToken());
  const [user, setUser] = useState(null);
  const [ui, setUi] = useState({
    auth: false, recharge: false, membership: false, profile: false, logs: false,
  });
  const [loading, setLoading] = useState(false);

  const setToken = useCallback((t) => {
    dispatch.setToken(t);
    setTokenState(t);
  }, []);

  const refresh = useCallback(async () => {
    if (!dispatch.getToken()) {
      setUser(null);
      return;
    }
    try {
      const u = await dispatch.auth.me();
      setUser(u);
    } catch {
      setToken("");
      setUser(null);
    }
  }, [setToken]);

  useEffect(() => {
    refresh();
  }, [refresh, token]);

  const login = useCallback(async (username, password) => {
    const r = await dispatch.auth.login(username, password);
    setToken(r.token);
    setUser(r.user);
    setUi((u) => ({ ...u, auth: false }));
    return r.user;
  }, [setToken]);

  const register = useCallback(async (username, email, password, captchaId, captcha) => {
    const r = await dispatch.auth.register(username, email, password, captchaId, captcha);
    setToken(r.token);
    setUser(r.user);
    setUi((u) => ({ ...u, auth: false }));
    return r.user;
  }, [setToken]);

  const logout = useCallback(() => {
    setToken("");
    setUser(null);
  }, [setToken]);

  const open = useCallback((k) => setUi((u) => ({ ...u, [k]: true })), []);
  const close = useCallback((k) => setUi((u) => ({ ...u, [k]: false })), []);

  // 余额门禁：返回 precheck 结果；不足则弹充值弹窗（可被「不再提醒」开关关闭）；未登录则弹登录。
  const suppressRecharge = () => localStorage.getItem("SUPPRESS_RECHARGE") === "1";
  const maybeRecharge = useCallback(() => { if (!suppressRecharge()) open("recharge"); }, [open]);

  const guardGenerate = useCallback(async (type, params) => {
    if (!token) {
      open("auth");
      return null;
    }
    try {
      const pc = await dispatch.jobs.precheck(type, params);
      if (!pc.sufficient) {
        maybeRecharge();
        return null;
      }
      return pc;
    } catch (e) {
      if (e && e.status === 401) {
        open("auth");
      } else if (e && e.needRecharge) {
        maybeRecharge();
      }
      return null;
    }
  }, [token, open, maybeRecharge]);

  const submitJob = useCallback(async (type, payload) => {
    try {
      return await dispatch.jobs.submit(type, payload);
    } catch (e) {
      if (e && e.needRecharge) maybeRecharge();
      throw e;
    }
  }, [open, maybeRecharge]);

  const value = {
    token, user, loading, setUser, login, register, logout, refresh,
    precheck: dispatch.jobs.precheck, submitJob, open, close, ui, guardGenerate,
  };

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
