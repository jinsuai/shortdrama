import React, { useState, useEffect } from "react";
import { billing } from "../dispatch.js";

function fmt(d) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("zh-CN", { hour12: false });
}

export default function LogsPanel({ onClose }) {
  const [tab, setTab] = useState("consume");
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    const load = tab === "consume" ? billing.consumptions() : billing.transactions();
    load.then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [tab]);

  return (
    <div className="ds-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ds-modal ds-modal--wide">
        <div className="ds-modal-head">
          <h3>记录</h3>
          <button className="ds-close" onClick={onClose}>×</button>
        </div>
        <div className="ds-modal-body">
          <div className="ds-tabs">
            <button className={`ds-tab ${tab === "consume" ? "active" : ""}`} onClick={() => setTab("consume")}>扣费记录</button>
            <button className={`ds-tab ${tab === "transactions" ? "active" : ""}`} onClick={() => setTab("transactions")}>充值 / 会员</button>
          </div>
          {rows === null && <div className="ds-loading">加载中…</div>}
          {rows !== null && rows.length === 0 && <div className="ds-empty">暂无记录</div>}
          {rows !== null && rows.map((r) => (
            <div className="ds-log" key={r.id}>
              <div className="left">
                <div className="t">
                  {tab === "consume"
                    ? ({ video: "视频生成", tts: "TTS 配音", intro: "片头特效" }[r.kind] || r.kind)
                    : (r.kind === "recharge" ? "充值" : `会员 ${r.membership_level || ""}`)}
                </div>
                <div className="s">{fmt(r.created_at)}</div>
              </div>
              <div className="right">
                <div className={`amt ${tab === "consume" ? "minus" : "plus"}`}>
                  {tab === "consume" ? `-${Number(r.credits)}` : `+${Number(r.credits_added)}`}
                </div>
                <div className="s">{tab === "transactions" ? `¥${r.yuan}` : `余 ${Number(r.balance_after)}`}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
