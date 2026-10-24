/**
 * 开源版 · 账户 / 计费（已移除）。
 *
 * 开源版不依赖任何后端、不做登录 / 会员 / 充值 / 积分。本文件保留原函数名并改为无害 stub，
 * 使大量旧组件（VideoGenBoard / StoryboardBoard / NewScriptModule / CharacterManager /
 * DubbingBoard / DirectorPanel / App 等）无需改动即可编译运行：
 *   - isLoggedIn() 永远返回 true（本地模式，无需登录）
 *   - precheckCredits() 永远 sufficient（不扣费）
 *   - deductCredits() / refundCredits() 永远成功
 *   真实生成走 src/lib/providers，费用由用户自己的模型服务商账户承担。
 */

// 应用设置工具函数
const SETTINGS_KEY = 'APP_SETTINGS';

export function getAccessToken() {
  return null;
}

export function getCurrentUser() {
  return null;
}

export function clearAuthData() {
  /* 开源版无登录态，无需清理 */
}

export function isLoggedIn() {
  return true;
}

export async function request(/* path, options */) {
  throw new Error('开源版无后端请求');
}

export async function register(/* phone, password, nickname */) {
  throw new Error('开源版不支持云端注册');
}

export async function login(/* phone, password */) {
  throw new Error('开源版无需登录');
}

export async function logout() {
  /* no-op */
}

export async function changePassword(/* oldPassword, newPassword */) {
  throw new Error('开源版不支持修改密码');
}

export async function fetchMe() {
  return { credits: 0, balance: 0, membership_level: 0 };
}

export function pushBalance(/* credits */) {
  /* no-op */
}

export async function getCreditBalance() {
  return { balance: 0, credits: 0 };
}

export async function precheckCredits(amount = 0, /* type, description */) {
  return { sufficient: true, balance: 0, required: Number(amount) || 0 };
}

export async function deductCredits(/* amount, type, description, referenceId */) {
  return { success: true, amount: 0, type: '', description: '', reference_id: '', balance_after: 0 };
}

export async function refundCredits(/* amount, reason, referenceId */) {
  return { success: true, amount: 0, reason: '', reference_id: '', note: '开源版无计费' };
}

export async function getMembershipStatus() {
  return { is_vip: false, level: 0, expired_at: null, monthly_quota: 0, monthly_used: 0 };
}

export default {
  register,
  login,
  logout,
  isLoggedIn,
  getAccessToken,
  getCurrentUser,
  clearAuthData,
  fetchMe,
  changePassword,
  getCreditBalance,
  precheckCredits,
  deductCredits,
  refundCredits,
  getMembershipStatus,
};
