// lib/pipeline/agent.js
//
// 第二优先 · 一键全自动流水线 的「Agent 大脑」——只做建议默认值 + 异常兜底，
// 绝不剥夺用户对每一步的手动控制权（用户手动结果永远优先，编排器跳过已生成步骤）。
//
// 设计原则：
//   - 默认值尽量从工程已有信息推导（风格、角色音色、已有画幅设置），推导不出才用行业安全值；
//   - 所有默认值都是「可覆盖」的：用户在任何一步手动改了，编排器尊重手动结果；
//   - Agent 模式开启时，可选步（资产/配音/混音）缺模型不报错，静默跳过并提示，
//     保证「一键」不会因为没配某个可选模型就半途崩掉。

import { DEFAULT_SHOT_COUNT } from '../storyboard.js';

/** 从工程推导 Agent 默认参数；返回可被编排器直接消费的默认值对象 */
export function suggestDefaults(project = {}) {
  const mats = project?.materials || {};
  const chars = mats.characters || [];

  // 画幅：优先用「设置 → 默认比例」在项目里的残留，否则竖屏短剧默认 9:16
  const ratio = project?.defaultRatio || '9:16';
  // 单镜时长：分镜里若多数写过 duration 则取众数，否则 5 秒
  const shots = project?.shots || [];
  const durVotes = {};
  shots.forEach((s) => { if (s.duration) durVotes[s.duration] = (durVotes[s.duration] || 0) + 1; });
  const durationSec = Object.keys(durVotes).sort((a, b) => durVotes[b] - durVotes[a])[0]
    || project?.defaultDuration || 5;

  // 角色数 → 建议分镜数（不足下限用默认）
  const shotCount = project?.shotCount
    || Math.max(DEFAULT_SHOT_COUNT, Math.min(24, (chars.length || 1) * 4));

  // 配音：若有角色写了 voiceDesc，默认开启配音；否则仍建议开（无声短剧也完整）
  const hasVoiceDesc = chars.some((c) => c.voiceDesc || c.voice);
  const dub = true;
  const voiceVolume = 1.0;
  const bgmVolume = 0.2; // 背景乐默认压到 20%，不抢对白

  // 转码分辨率：竖屏短剧 1080p 足够
  const resolution = '1080p';

  return {
    ratio,
    durationSec,
    shotCount,
    dub,
    hasVoiceDesc,
    voiceVolume,
    bgmVolume,
    resolution,
  };
}

/**
 * 异常兜底包装：把单步错误转成「可继续」的友好提示。
 * 仅用于 optional 步骤——required 步骤（分镜/动态/装配/导出）不被兜底，必须成功。
 * @returns {{ recoverable: boolean, message: string }}
 */
export function classifyError(stageKey, err) {
  const message = err?.message || String(err);
  // 模型鉴权 / 额度 / 网络类错误：明确告诉用户去检查设置，但不阻塞其它步
  const recoverable = /未配置|API Key|401|403|额度|quota|网络|network|timeout|超时|离线/i.test(message);
  return { recoverable, message };
}
