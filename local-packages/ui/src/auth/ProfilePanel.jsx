import React from "react";
import { useSession } from "../SessionContext.jsx";
import { MEMBERSHIP_NAMES } from "../dispatch.js";

function fmt(d) {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime?.() ?? NaN)) return String(d);
  return dt.toLocaleString("zh-CN", { hour12: false });
}
function fmtNum(n) {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export default function ProfilePanel({ onClose }) {
  const { user, open, logout } = useSession();
  if (!user) return null;
  const monthlyRemaining = Math.max(0, Number(user.monthly_quota) - Number(user.monthly_used));

  return (
    <div className="ds-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ds-modal">
        <div className="ds-modal-head">
          <h3>我的账户</h3>
          <button className="ds-close" onClick={onClose}>×</button>
        </div>
        <div className="ds-modal-body">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div className="ds-avatar" style={{ width: 44, height: 44, fontSize: 18 }}>
              {user.username[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ color: "#334155", fontWeight: 700, fontSize: 16 }}>{user.username}</div>
              <span className={`ds-badge lv${user.membership_level}`}>{MEMBERSHIP_NAMES[user.membership_level]}</span>
            </div>
          </div>

          <div className="ds-profile-grid">
            <div className="ds-stat">
              <div className="k">剩余积分</div>
              <div className="v">{fmtNum(user.credits)}</div>
            </div>
            <div className="ds-stat">
              <div className="k">当月额度剩余</div>
              <div className="v">{fmtNum(monthlyRemaining)}</div>
            </div>
            <div className="ds-stat">
              <div className="k">会员到期</div>
              <div className="v small">{fmt(user.membership_expiry)}</div>
            </div>
            <div className="ds-stat">
              <div className="k">月额度重置</div>
              <div className="v small">{fmt(user.quota_reset_at)}</div>
            </div>
          </div>

          <div className="ds-actions">
            <button className="ds-submit" style={{ width: "auto", background: "#5b8cff" }} onClick={() => open("recharge")}>充值积分</button>
            <button className="ds-submit" style={{ width: "auto", background: "#ff7a59" }} onClick={() => open("membership")}>购买会员</button>
            <button className="ds-submit" style={{ width: "auto", background: "rgba(15,23,42,0.128)" }} onClick={() => open("logs")}>消费记录</button>
            <button className="ds-submit" style={{ width: "auto", background: "rgba(239,68,68,0.15)", color: "#ef4444" }} onClick={() => { logout(); onClose(); }}>退出登录</button>
          </div>
        </div>
      </div>
    </div>
  );
}
