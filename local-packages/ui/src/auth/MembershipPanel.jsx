import React, { useState } from "react";
import { useSession } from "../SessionContext.jsx";
import { billing, MEMBERSHIP_TIERS } from "../dispatch.js";

export default function MembershipPanel({ onClose, notify }) {
  const { user, refresh } = useSession();
  const [busy, setBusy] = useState(null);

  const buy = async (tier) => {
    setBusy(tier);
    try {
      const r = await billing.membership(tier);
      await refresh();
      notify?.(`已开通 ${r.membership_name}，月额度 ${r.monthly_quota} 积分`);
      onClose();
    } catch (e) {
      notify?.(e?.message || "购买失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ds-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ds-modal" style={{ width: 620 }}>
        <div className="ds-modal-head">
          <h3>会员订阅</h3>
          <button className="ds-close" onClick={onClose}>×</button>
        </div>
        <div className="ds-modal-body">
          <div style={{ background: "rgba(109,40,217,0.1)", border: "1px solid rgba(109,40,217,0.2)", borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12, color: "#6d28d9" }}>
            💎 会员折扣可与充值积分叠加使用。当前等级：<b>{user?.membership_level ? ["免费用户", "月卡", "季卡", "年卡"][user.membership_level] : "免费用户"}</b>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {MEMBERSHIP_TIERS.map((m, i) => (
              <div key={m.tier} className={`ds-tier member ${i === 1 ? "featured" : ""}`} style={{ cursor: busy ? "wait" : "pointer", opacity: busy === m.tier ? 0.6 : 1 }} onClick={() => !busy && buy(m.tier)}>
                <div className="price"><span className="cur">¥</span>{m.tier}<span style={{ fontSize: 11, color: "#9aa4bf" }}>/{i === 0 ? "月" : i === 1 ? "季" : "年"}</span></div>
                <div className="credits">{m.name}</div>
                <div className="desc">月额度 {m.quota} 积分</div>
                <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>{Math.round(m.discount * 10)} 折</div>
                <div style={{ fontSize: 10, color: "#9aa4bf", marginTop: 2 }}>
                  {i === 0 ? "优先队列、去水印" : i === 1 ? "月卡全部 + 高清导出" : "季卡全部 + 专属模型"}
                </div>
              </div>
            ))}
          </div>
          {busy && <div className="ds-loading">开通中…</div>}
          <div style={{ marginTop: 14, fontSize: 11, color: "#66708a", textAlign: "center" }}>
            会员折扣在生图/生成视频时自动生效，无需手动操作。
          </div>
        </div>
      </div>
    </div>
  );
}
