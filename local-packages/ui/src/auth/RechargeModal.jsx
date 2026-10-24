import React, { useState, useEffect, useRef } from "react";
import { useSession } from "../SessionContext.jsx";
import { RECHARGE_TIERS, RECHARGE_CREDITS } from "../dispatch.js";

const CHANNELS = [
  { key: "wechat", name: "微信支付", color: "#07C160", tip: "请用微信扫一扫" },
  { key: "alipay", name: "支付宝", color: "#1677FF", tip: "请用支付宝扫一扫" },
];

export default function RechargeModal({ onClose, notify }) {
  const { refresh } = useSession();
  const [step, setStep] = useState("select");
  const [tier, setTier] = useState(RECHARGE_TIERS[1]); // 默认选基础包
  const [channel, setChannel] = useState("wechat");
  const [order, setOrder] = useState(null);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    setQr(order && order.qr_data_url ? order.qr_data_url : "");
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [order]);

  useEffect(() => {
    if (step !== "pay" || !order) return;
    const tick = async () => {
      try {
        const o = await (await import("../dispatch.js")).billing.getOrder(order.order_id);
        if (o.status === "paid") {
          if (pollRef.current) clearInterval(pollRef.current);
          await refresh();
          notify?.(`充值成功，+${o.credits} 积分`);
          onClose();
        }
      } catch { /* ignore */ }
    };
    pollRef.current = setInterval(tick, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, order, refresh, notify, onClose]);

  const startPay = async () => {
    setBusy(true); setErr("");
    try {
      const r = await (await import("../dispatch.js")).billing.recharge(tier, channel);
      setOrder({
        order_id: r.order_id, qr_content: r.qr_content, qr_data_url: r.qr_data_url,
        yuan: r.yuan, credits: r.credits, mock: r.mock, status: "pending",
      });
      setStep("pay");
    } catch (e) {
      setErr(e?.message || "创建订单失败");
    } finally {
      setBusy(false);
    }
  };

  const mockConfirm = async () => {
    setBusy(true);
    try {
      await (await import("../dispatch.js")).billing.confirmOrder(order.order_id);
      await refresh();
      notify?.(`充值成功（演示），+${order.credits} 积分`);
      onClose();
    } catch (e) {
      setErr(e?.message || "确认失败");
    } finally {
      setBusy(false);
    }
  };

  const tierStyle = (t) => ({
    flex: 1, minWidth: 100, padding: 14, borderRadius: 10, cursor: "pointer",
    border: t === tier ? "2px solid #6D28D9" : "1px solid rgba(15,23,42,0.192)",
    background: t === tier ? "rgba(109,40,217,0.14)" : "transparent",
    textAlign: "center", transition: "all .12s",
    position: "relative",
  });

  return (
    <div className="ds-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ds-modal" style={{ width: 680 }}>
        <div className="ds-modal-head">
          <h3>充值积分</h3>
          <button className="ds-close" onClick={onClose}>×</button>
        </div>
        <div className="ds-modal-body">
          {step === "select" && (
            <>
              <div style={{ background: "rgba(109,40,217,0.12)", border: "1px solid rgba(109,40,217,0.3)", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: "#6d28d9" }}>
                💡 新用户首充额外赠送 20 积分！汇率：1 元 = 5 积分
              </div>
              <p style={{ color: "#9aa4bf", fontSize: 13, marginTop: 0, marginBottom: 12 }}>
                选择金额与支付方式，扫码即到账。
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {RECHARGE_TIERS.map((t) => {
                  const credits = RECHARGE_CREDITS[t];
                  const gift = credits - t * 5;
                  const rate = (credits / t).toFixed(1);
                  return (
                    <div key={t} style={tierStyle(t)} onClick={() => setTier(t)}>
                      {t === 6 && <span style={{ position: "absolute", top: -8, right: 8, fontSize: 10, background: "#f59e0b", color: "#000", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>体验</span>}
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#334155" }}>
                        <span style={{ fontSize: 12 }}>¥</span>{t}
                      </div>
                      <div style={{ color: "#6D28D9", fontWeight: 700, fontSize: 13, marginTop: 4 }}>
                        +{credits} 积分
                      </div>
                      {gift > 0 && <div style={{ color: "#22c55e", fontSize: 10, marginTop: 2 }}>送{gift}积分</div>}
                      <div style={{ color: "#9aa4bf", fontSize: 10, marginTop: 4 }}>汇率 1:{rate}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 16, fontSize: 13, color: "#9aa4bf" }}>支付方式</div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                {CHANNELS.map((c) => (
                  <button key={c.key} onClick={() => setChannel(c.key)} style={{
                    flex: 1, padding: "10px 0", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600,
                    border: channel === c.key ? `2px solid ${c.color}` : "1px solid rgba(15,23,42,0.224)",
                    background: channel === c.key ? `${c.color}22` : "transparent", color: "#334155",
                  }}>
                    {c.name}
                  </button>
                ))}
              </div>

              {err && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 10 }}>{err}</div>}
              <button className="ds-submit" style={{ width: "100%", marginTop: 14 }}
                disabled={busy} onClick={startPay}>
                {busy ? "创建订单中…" : `去支付 ¥${tier}`}
              </button>
            </>
          )}

          {step === "pay" && order && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#334155" }}>
                  ¥{order.yuan} · +{order.credits} 积分
                </div>
                {order.mock && (
                  <span style={{ fontSize: 11, color: "#f59e0b", border: "1px solid #f59e0b", borderRadius: 4, padding: "1px 6px" }}>
                    演示模式
                  </span>
                )}
              </div>
              <div style={{ textAlign: "center", marginTop: 16 }}>
                {qr ? (
                  <img src={qr} alt="扫码支付" style={{ width: 220, height: 220, background: "#fff", borderRadius: 8, padding: 8, boxSizing: "border-box" }} />
                ) : (
                  <div style={{ width: 220, minHeight: 220, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: 8, color: "#333", fontSize: 12, padding: 12, boxSizing: "border-box", wordBreak: "break-all" }}>
                    <div style={{ color: "#888", marginBottom: 6 }}>请复制以下支付串到对应 App 付款</div>
                    <code style={{ userSelect: "all" }}>{order.qr_content}</code>
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 13, color: "#9aa4bf" }}>
                  {CHANNELS.find((c) => c.key === channel)?.tip}
                </div>
              </div>
              {order.mock && (
                <button className="ds-submit" style={{ width: "100%", marginTop: 12, background: "#f59e0b" }}
                  disabled={busy} onClick={mockConfirm}>
                  {busy ? "确认中…" : "模拟支付成功（演示）"}
                </button>
              )}
              <button className="ds-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => { setStep("select"); setOrder(null); setQr(""); }}>
                换金额 / 支付方式
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
