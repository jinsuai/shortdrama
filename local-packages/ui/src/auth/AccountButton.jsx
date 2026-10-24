import React from "react";
import { useSession } from "../SessionContext.jsx";
import { MEMBERSHIP_NAMES } from "../dispatch.js";

function fmtNum(n) {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export default function AccountButton() {
  const { user, open } = useSession();
  if (!user) {
    return (
      <button className="ds-login-btn" onClick={() => open("auth")}>登录 / 注册</button>
    );
  }
  return (
    <div className="ds-account" onClick={() => open("profile")} title="点击查看账户">
      <div className="ds-avatar">{user.username[0]?.toUpperCase()}</div>
      <div className="ds-account-meta">
        <div className="ds-account-name">{user.username}</div>
        <div className="ds-account-sub">{MEMBERSHIP_NAMES[user.membership_level]} · {fmtNum(user.credits)} 分</div>
      </div>
    </div>
  );
}
