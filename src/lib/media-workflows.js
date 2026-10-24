/**
 * 视频 / 配音 / 音乐 / 后期 适配层（开源版）。
 *
 * 不再依赖面板 / ComfyUI / 调度机。直接调用用户在「设置 → 模型配置」里配的对应模型
 * （OpenAI 兼容接口）。视频 / 配音 / 音乐分别走 video / tts / music 模态；
 * 视频超分（FlashVSR 这类 ComfyUI 专用后期）无标准 API，本版明确降级。
 *
 * 兼容导出：generatePanelVideo / generatePanelTTS / generatePanelMusic / generatePanelUpscale
 */

import {
  generateVideo as pGenerateVideo,
  generateTTS as pGenerateTTS,
  generateMusic as pGenerateMusic,
} from './providers/index.js';

/**
 * 生成视频（文生视频 / 图生视频统一入口）。
 * @param {Object} p
 * @param {string} p.engine   - 保留字段，透传给媒体接口（如厂商需要区分引擎）
 * @param {string} p.mode     - 保留字段，透传
 * @param {string} p.prompt   - 画面描述
 * @param {string} [p.firstFrame] / [p.lastFrame] - 图生视频首/尾帧
 * @param {string[]} [p.images] - 参考图（多图参考取第一张作为首帧）
 * @param {number} [p.duration]
 * @param {string} [p.ratio]
 * @param {Function} [p.onProgress]
 */
export async function generatePanelVideo({
  engine = 'h3', mode = 'i2v', prompt = '', negative = '', images = [],
  firstFrame = '', lastFrame = '', duration = 5, ratio = '9:16', seed,
  audio = '', onProgress = () => {}, signal, timeoutMs,
} = {}) {
  if (!String(prompt || '').trim()) throw new Error('请先填写画面提示词');
  const image = firstFrame || images[0] || lastFrame || '';
  const out = await pGenerateVideo({
    prompt,
    image,
    duration,
    ratio,
    engine,
    mode,
    onProgress,
    signal,
    timeoutMs,
  });
  onProgress(100, '完成');
  return { resultUrl: out.resultUrl, workflowId: 'video' };
}

/**
 * 配音（OpenAI 兼容 TTS）。
 * @param {string} text      - 要说的台词
 * @param {string} [voiceDesc] - 音色描述（作为 voice 参数透传）
 * @param {string} [language]  - Chinese / English
 */
export async function generatePanelTTS({ text, voiceDesc = '', language = 'Chinese', signal } = {}) {
  if (!text || !String(text).trim()) throw new Error('请先填写配音台词');
  const out = await pGenerateTTS({ text, voice: voiceDesc || 'default', language, signal });
  return { resultUrl: out.resultUrl, workflowId: 'tts' };
}

/**
 * 音乐（OpenAI 兼容音频生成，或厂商自定义接口）。
 * @param {string} tags      - 曲风 / 演唱描述
 * @param {string} [lyrics]  - 歌词
 * @param {number} [seconds] - 时长秒
 */
export async function generatePanelMusic({ tags, lyrics = '', seconds = 60, bpm = 95, language = 'zh', signal } = {}) {
  const out = await pGenerateMusic({ tags, lyrics, seconds, bpm, language, signal });
  return { resultUrl: out.resultUrl, workflowId: 'music' };
}

/**
 * 视频超分：原版是 ComfyUI 专用后期（FlashVSR），没有标准模型 API。
 * 开源版暂不提供（请改用视频模型本身的高分辨率能力，或本地 ffmpeg 放大）。
 */
export async function generatePanelUpscale(/* { videoUrl, scale, ratio } */) {
  throw new Error('开源版暂不支持视频超分（FlashVSR 为 ComfyUI 专用后期，无标准 API）。可改用视频模型的高分辨率能力，或用本地 ffmpeg 放大。');
}
