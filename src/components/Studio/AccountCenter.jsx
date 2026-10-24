import React from 'react';

/**
 * 开源版头像组件。
 *
 * 原 AccountCenter 承载「账号 / 充值 / 会员」整套私有计费体系，开源版已整体移除
 * （见 README / 提交说明）。这里仅保留纯展示用的 Avatar，供设置页等界面复用，
 * 不再有任何登录态、积分、会员或支付逻辑。
 */

const AVATAR_GRAD = 'linear-gradient(135deg, #7c3aed 0%, #7c5cf6 48%, #2563eb 100%)';

function initials(name) {
  const s = String(name || '').trim();
  if (!s) return '烬';
  // 中文取首字；英文/数字取首字母
  return /[\u4e00-\u9fa5]/.test(s[0]) ? s[0] : s[0].toUpperCase();
}

/** 头像方块（纯展示，无账号语义） */
export function Avatar({ name, size = 28, vip }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.32, flexShrink: 0,
      background: vip ? 'linear-gradient(135deg, #f59e0b, #ea580c)' : AVATAR_GRAD,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.44, fontWeight: 700, lineHeight: 1,
      boxShadow: vip ? '0 2px 10px rgba(245,158,11,.4)' : '0 2px 10px rgba(109,40,217,.4)',
      fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
    }}>{initials(name)}</div>
  );
}
