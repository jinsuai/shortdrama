/**
 * 图片生成适配层（开源版）。
 *
 * 不再依赖任何面板 / ComfyUI / 调度机。直接调用用户在「设置 → 模型配置」里配的图片模型
 * （OpenAI 兼容接口）。保留 generatePanelImage 的调用形态，便于 steps1 / Studio 无缝迁移。
 *
 * 兼容导出：generatePanelImage
 */

import { generateImage as pGenerateImage, generateText as pGenerateText } from './providers/index.js';
import { getAppSetting } from '../utils/app-settings.js';

const _translateCache = new Map();

function hasChinese(s) {
  return /[\u4e00-\u9fff]/.test(s || '');
}

/**
 * 可选的「中文 → 英文」翻译：仅当设置在「设置 → 常用设置」开启 translateImagePrompt 且
 * 提示词含中文时生效。翻译由用户自备的文本模型完成；任何失败都退回原文，绝不阻断生图。
 */
async function translateIfNeeded(prompt) {
  const enabled = getAppSetting('translateImagePrompt', false);
  if (!enabled || !hasChinese(prompt)) return prompt;
  const cacheKey = prompt;
  if (_translateCache.has(cacheKey)) return _translateCache.get(cacheKey);
  try {
    const en = await pGenerateText(
      [
        { role: 'system', content: 'You are a professional image-prompt translator. Translate the user\'s description into a detailed English image-generation prompt. Keep all visual details (subject, clothing, age, gender, hairstyle, background, lighting, style). Output only the English prompt.' },
        { role: 'user', content: prompt },
      ],
      { maxTokens: 800, temperature: 0.3 }
    );
    const cleaned = (en || '').trim();
    if (cleaned && !hasChinese(cleaned)) {
      _translateCache.set(cacheKey, cleaned);
      return cleaned;
    }
  } catch (e) {
    console.warn('[image-workflows] 提示词翻译失败，退回原文：', e?.message || e);
  }
  return prompt;
}

/**
 * 生成图片（文生图 / 参考图生图统一入口）。
 * @param {Object} p
 * @param {string} p.prompt      - 最终提示词（已由调用方组装好）
 * @param {string} [p.negative]  - 负向词（仅对支持的服务生效，作为透传）
 * @param {string} [p.ratio]     - 画幅（影响默认尺寸）
 * @param {string} [p.referenceImage] - 参考图 URL（图生图）
 * @param {number} [p.seed]
 * @param {string} [p.workflowId] - 仅用于回传标识，不再决定后端工作流
 * @returns {Promise<{resultUrl:string, allUrls:string[], workflowId:string, raw:object}>}
 */
export async function generatePanelImage({ prompt, negative = '', ratio = '9:16', referenceImage = '', referenceImages = [], seed, workflowId = 'image', size, signal } = {}) {
  if (!prompt || !String(prompt).trim()) throw new Error('请先填写图片提示词');
  const finalPrompt = await translateIfNeeded(prompt);
  const px = RATIO_PX[ratio] || RATIO_PX['9:16'];
  const refs = (Array.isArray(referenceImages) ? referenceImages : []).filter(Boolean).slice(0, 3);
  const singleRef = referenceImage || refs[0] || '';
  const out = await pGenerateImage(finalPrompt, {
    size: size || `${px.width}x${px.height}`,
    negative: negative || '',
    // 参考图交给 providers 透传：固定以 image_url 字段随请求发出（图生图）。
    // 四视图即走这条（参考图 = 主视图）。纯文生图接口遇到该字段会报错，请改用支持图生图的模型。
    referenceImage: singleRef,
    referenceImages: refs.length ? refs : (singleRef ? [singleRef] : []),
    signal,
  });
  return { resultUrl: out.resultUrl, allUrls: out.allUrls, workflowId, raw: out.raw };
}

/**
 * 多图参考生图（分镜「Q22 多图参考」入口：最多 3 张参考图 + 分镜指令）。
 *
 * 开源版直连模型 API，不再走调度机面板：以分镜指令为提示词，参考图经 providers 透传给图片模型。
 * 若所配图片模型不支持参考图（多数纯文生图接口），参考图会被忽略、退化为按指令文生图；
 * 需要真正的图生图效果，请在「设置 → 模型配置 → 图片」选择支持参考图的模型。
 *
 * @returns {Promise<{resultUrl:string, allUrls:string[], workflowId:string, raw:object}>}
 */
export async function generateFlux2MultiRefImage({ instruction, items = [], ratio = '9:16', negative = '', size, signal } = {}) {
  const refs = (Array.isArray(items) ? items : []).map((x) => x?.url).filter(Boolean).slice(0, 3);
  return generatePanelImage({
    prompt: instruction,
    ratio: ratio || '9:16',
    negative,
    referenceImage: refs[0] || '',
    referenceImages: refs,
    workflowId: 'flux2-multiref',
    size,
    signal,
  });
}

const RATIO_PX = {
  '9:16': { width: 864, height: 1536 },
  '16:9': { width: 1536, height: 864 },
  '1:1': { width: 1024, height: 1024 },
  '3:4': { width: 864, height: 1152 },
  '4:3': { width: 1152, height: 864 },
  // 横版 3:2 —— 四格角色表专用：与本地 T10 四视图工作流的 1536x1024 一致。
  // 四视图是「一张图里横排四格」，用竖屏会把四格压变形。
  '3:2': { width: 1536, height: 1024 },
};
