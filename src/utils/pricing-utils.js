/**
 * 全局价格配置工具函数
 * 价格从调度机 /api/pricing 接口动态获取，存储在 window.APP_PRICING
 */

// 默认价格（当调度机接口不可用时使用）
const DEFAULT_PRICING = {
  // 图片生成
  image_generate: 1.0,
  // 配音生成（按模型+条收费）
  tts_hd_per_line: 0.5,
  tts_turbo_per_line: 0.5,
  tts_min_charge: 0.5,
  // 兼容旧字段（按字符数收费）
  tts_hd_per_100_chars: 0.1,
  tts_turbo_per_100_chars: 0.1,
  // 文字创建音色（成本9.9元=49.5积分）
  voice_design_preview_per_10k_chars: 1.0,
  voice_design_first_use: 10.0,
  voice_design_min_charge: 1.0,
  // LLM文本生成（与调度机 /api/pricing 的 llm 表一致）
  llm_script_analyze: 1.0,
  llm_script_quick_create: 3.0,
  llm_script_one_click: 1.0,
  llm_script_detailed: 5.0,
  llm_storyboard_split: 3.0,
  llm_character_extract: 2.0,
  llm_prompt_refine: 1.0,
  llm_episode_refine: 1.0,
  llm_shot_refine: 1.0,
  llm_scene_extract: 1.0,
  llm_scene_refine: 1.0,
  llm_subtitle_generate: 1.0,
  // 视频生成
  video_t2v_480p: 0.6,
  video_t2v_768p: 0.8,
  video_t2v_1080p: 1.0,
  video_i2v_480p: 0.6,
  video_i2v_768p: 0.8,
  video_i2v_1080p: 1.0,
  video_r2v_480p: 0.6,
  video_r2v_768p: 0.8,
  video_r2v_1080p: 1.0,
  video_ia2v_480p: 0.6,
  video_ia2v_768p: 0.8,
  video_ia2v_1080p: 1.0,
  // 视频渠道价格表（按渠道+分辨率 积分/秒；/api/pricing 返回同结构）
  video: {
    autodl: { "480p": 0.6, "768p": 0.8, "1080p": 1.0 },
    wan22:  { "480p": 1.0, "576p": 1.2, "720p": 1.5, "1080p": 2.0 },
  },
  // 视频渠道元数据（名称/描述）
  video_providers: {
    autodl: { name: "标准", desc: "MiniMax H3 · 实例面板工作流" },
    wan22:  { name: "高级生成", desc: "MiniMax H3 自部署 · 720P=1.5/1080P=2积分/秒" },
  },
  // 3D生成（对齐调度机 /api/pricing 的 threed 表：混元3D 30/35/40，概念图/四视图 3）
  threed_character_four_views: 3.0,
  threed_character_text_to_3d: 30.0,
  threed_character_image_to_3d: 35.0,
  threed_character_3d_model: 30.0,
  threed_scene_concept_image: 3.0,
  threed_scene_3d_model: 40.0,
  // 固定价服务（对齐调度机 SERVICE_CREDIT_PRICES：去水印/去字幕/图片处理=1，音色复制=10，音乐=3）
  watermark: 1.0,
  subtitle: 1.0,
  upscale: 1.0,
  qualityRestore: 1.0,
  styleTransfer: 1.0,
  voiceclone: 10.0,
  music: 3.0,
  // 视频配套
  video_refine: 1.0,   // U00 提示词细化（对齐调度机）
  video_merge: 2.0,    // 服务端 ffmpeg 合并/导出
  intro: 1.0,
  // 充值套餐
  credit_packages: [
    { name: "体验包", price: 6, credits: 30, bonus: 0, desc: "1:5" },
    { name: "基础包", price: 30, credits: 160, bonus: 10, desc: "1:5.3" },
    { name: "创作包", price: 98, credits: 550, bonus: 60, desc: "1:5.6" },
    { name: "工作室包", price: 298, credits: 1800, bonus: 300, desc: "1:6" },
    { name: "企业包", price: 698, credits: 4500, bonus: 1000, desc: "1:6.4" },
  ],
  // 会员套餐（赠送额度对齐调度机 MEMBERSHIP_TIERS：95/345/1288）
  membership_packages: [
    { name: "月卡", price: 29, credits: 95, discount: 0.9, discount_label: "9折", duration_days: 30, benefits: "优先队列、去水印" },
    { name: "季卡", price: 79, credits: 345, discount: 0.85, discount_label: "85折", duration_days: 90, benefits: "月卡全部 + 高清导出" },
    { name: "年卡", price: 268, credits: 1288, discount: 0.8, discount_label: "8折", duration_days: 365, benefits: "季卡全部 + 专属模型、客服优先" },
  ],
  // 汇率
  exchange_rate: 5.0,
  new_user_bonus: 8.0,
};

/**
 * 获取全局价格配置
 * @returns {Object} 价格配置对象
 */
export function getPricing() {
  return window.APP_PRICING || DEFAULT_PRICING;
}

/**
 * 获取单个价格项（兼容调度机 /api/pricing 返回的两种命名）
 * 优先级：APP_PRICING 直接命中 → 剥离 llm_/tts_/threed_/video_ 前缀后命中 →
 *         嵌套分组(llm/tts/image/threed/voice_design)内命中 → DEFAULT_PRICING → 默认值
 * @param {string} key - 价格项的key（前端习惯带前缀，如 llm_script_analyze）
 * @param {number} defaultValue - 默认值
 * @returns {number} 价格
 */
export function getPrice(key, defaultValue = 0) {
  const pricing = getPricing();
  // 1. 直接命中（前端 DEFAULT_PRICING 平铺 key）
  if (pricing[key] !== undefined) return pricing[key];
  // 2. 兼容调度机 /api/pricing 命名（无 llm_/tts_/threed_/video_ 前缀）
  const strip = key.replace(/^(llm_|tts_|threed_|video_)/, "");
  if (pricing[strip] !== undefined) return pricing[strip];
  // 3. 兼容调度机嵌套分组：llm: {...} / tts: {...} / image: {...} / threed: {...} / voice_design: {...}
  for (const group of ["llm", "tts", "image", "threed", "voice_design", "services"]) {
    const g = pricing[group];
    if (g && typeof g === "object" && g[strip] !== undefined) return g[strip];
  }
  return defaultValue;
}

/**
 * 计算配音生成价格（按模型+条收费）
 * @param {number} lineCount - 配音条数（默认1）
 * @param {string} model - 模型类型："hd" 或 "turbo"
 * @returns {number} 价格（积分）
 */
export function calcTtsPrice(lineCount = 1, model = "hd") {
  const perLine = getPrice(model === "hd" ? "tts_hd_per_line" : "tts_turbo_per_line", 0.5);
  const price = lineCount * perLine;
  return Math.max(getPrice("tts_min_charge", 0.5), price);
}

/**
 * 计算视频生成价格
 * @param {string} mode - 模式："t2v" | "i2v" | "r2v" | "ia2v"
 * @param {string} resolution - 分辨率："480p" | "768p" | "1080p"
 * @param {number} duration - 时长（秒）
 * @returns {number} 价格（积分）
 */
export function calcVideoPrice(mode, resolution, duration, provider = "autodl") {
  const pricing = getPricing();
  const resKey = resolution.includes("1080") ? "1080p" : (resolution.includes("720") ? "720p" : (resolution.includes("576") ? "576p" : (resolution.includes("480") ? "480p" : "768p")));
  // 优先：按渠道 pricing.video[provider][resKey]（/api/pricing 返回结构）
  const videoTable = (pricing && pricing.video) || DEFAULT_PRICING.video;
  const providerTable = (videoTable && videoTable[provider]) || (videoTable && videoTable.autodl);
  if (providerTable && providerTable[resKey] != null) {
    return providerTable[resKey] * duration;
  }
  // 兜底：video_{mode}_{resKey} 旧字段
  const priceKey = `video_${mode}_${resKey}`;
  const perSec = getPrice(priceKey, 2.0);
  return perSec * duration;
}

/**
 * 获取充值套餐列表
 * @returns {Array} 充值套餐列表
 */
export function getCreditPackages() {
  return getPricing().credit_packages || DEFAULT_PRICING.credit_packages;
}

/**
 * 获取会员套餐列表
 * @returns {Array} 会员套餐列表
 */
export function getMembershipPackages() {
  return getPricing().membership_packages || DEFAULT_PRICING.membership_packages;
}
