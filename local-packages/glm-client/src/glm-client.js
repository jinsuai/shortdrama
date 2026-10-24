/**
 * DispatchGlmClient — 开源版文本生成客户端。
 *
 * 不再依赖任何后端 / 登录 / 计费。直接调用用户在「设置 → 模型配置」里配的文本模型
 * （OpenAI 兼容接口）。接口签名与旧版保持一致（chat(prompt, {system, maxTokens, ...})），
 * 因此 storyboard.js / prompts.js / steps1 / steps2 / ArtDirection 等所有调用方无需改动。
 */

// 跨包引用统一的模型接入层（项目根 src/lib/providers）。
import { generateText, getModelConfig } from '../../../src/lib/providers/index.js';

export class DispatchGlmClient {
  constructor({ baseUrl = null, token = null } = {}) {
    // 兼容旧构造参数（忽略，全部改由设置读取）
    this._config = getModelConfig('text');
  }

  _messages(prompt, system) {
    return [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ];
  }

  /**
   * 文本生成（接口兼容旧 chat）。调用用户自备的文本模型。
   * @param {string} prompt
   * @param {object} opts { system, model, temperature, maxTokens, onToken }
   */
  async chat(
    prompt,
    { system = '你是一个专业的写作助手。', model, temperature = 0.8, maxTokens = 2000, onToken = null } = {}
  ) {
    const cfg = getModelConfig('text');
    if (!cfg.apiKey || !cfg.apiKey.trim()) {
      throw new Error('未配置文本模型 API Key，请在「设置 → 模型配置」中填写。');
    }
    const text = await generateText(this._messages(prompt, system), {
      temperature,
      maxTokens,
    });
    if (onToken) {
      const step = 4; // 模拟流式：按 4 字片段回调，保留打字效果
      for (let i = 0; i < text.length; i += step) {
        onToken(text.slice(i, i + step));
        await new Promise((r) => setTimeout(r, 6));
      }
    }
    return text;
  }
}

export default DispatchGlmClient;
