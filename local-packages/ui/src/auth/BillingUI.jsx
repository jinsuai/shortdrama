import React, { useState } from "react";
import { useSession } from "../SessionContext.jsx";
import AuthDialog from "./AuthDialog.jsx";
import RechargeModal from "./RechargeModal.jsx";
import MembershipPanel from "./MembershipPanel.jsx";
import ProfilePanel from "./ProfilePanel.jsx";
import LogsPanel from "./LogsPanel.jsx";
import "./billing.scss";

// 统一挂载所有计费弹窗（按 SessionContext.ui 开关显隐）+ 轻提示。
export default function BillingUI() {
  const { ui, close } = useSession();
  const [toast, setToast] = useState("");
  const notify = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  return (
    <>
      {ui.auth && <AuthDialog onClose={() => close("auth")} notify={notify} />}
      {ui.recharge && <RechargeModal onClose={() => close("recharge")} notify={notify} />}
      {ui.membership && <MembershipPanel onClose={() => close("membership")} notify={notify} />}
      {ui.profile && <ProfilePanel onClose={() => close("profile")} />}
      {ui.logs && <LogsPanel onClose={() => close("logs")} />}
      {toast && <div className="ds-toast">{toast}</div>}
    </>
  );
}
