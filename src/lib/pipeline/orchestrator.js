// lib/pipeline/orchestrator.js
//
// 第二优先 · 一键全自动流水线（可选 Agent 模式）—— 编排器骨架。
//
// 设计目标：把九步管线（剧本 → 艺术指导 → 资产 → 分镜 → 动态 → 装配 → 配音 → 混音 → 导出）
// 用合理默认值自动串跑；但每一步允许手动覆盖 / 重跑，保留「分步可控」卖点。
// Agent 模式只做「建议默认值 + 异常兜底」，不剥夺用户控制权（后续叠加）。
//
// 复用底座（零重复、不碰 React 组件层）：
//   - src/lib/providers  → 文本 / 图片 / 视频 / TTS / 音乐 模型接入（OpenAI 兼容 + ComfyUI）
//   - src/lib/storyboard → 分镜 LLM 拆解、关键帧生图
//   - src/lib/merge      → 多轨合并、混音、字幕
//   - src/lib/audio-track→ 配音轨批量生成

import {
  analyzeStoryboard,
  generateKeyframeShot,
  DEFAULT_SHOT_COUNT,
} from '../storyboard.js';
import {
  generateVideo,
  generateTTS,
  isModalityConfigured,
} from '../providers/index.js';
import { mergeClips, mixAudio, buildSrt } from '../merge.js';
import { buildVoiceTrack } from '../audio-track.js';

// 九步管线（与 Studio 步骤栏一一对应）。auto=false 的步骤由用户提供输入，
// 编排器只校验是否存在、不代写；auto=true 的步骤可被自动串跑。
export const PIPELINE_STAGES = [
  { key: 'script', label: '剧本', auto: false },
  { key: 'art', label: '艺术指导', auto: false },
  { key: 'assets', label: '资产', auto: true, hint: '基于角色/场景/道具描述生成主图' },
  { key: 'storyboard', label: '分镜', auto: true },
  { key: 'motion', label: '动态', auto: true },
  { key: 'assembly', label: '装配', auto: true },
  { key: 'dub', label: '配音', auto: true },
  { key: 'mix', label: '混音', auto: true },
  { key: 'export', label: '导出', auto: true },
];

// 串行执行管线。
//   onProgress(stageKey, status, info) 回调：status ∈ running|log|skipped|success|error
//   force=true 时忽略已有产物、全部重跑；否则已有产物的步骤自动跳过（保留分步可控）
//   signal 可中断（AbortController）
// 返回 { done, skipped, errors } 报告。
export async function runPipeline(project, { onProgress, force = false, signal } = {}) {
  const report = { done: [], skipped: [], errors: [] };
  for (const stage of PIPELINE_STAGES) {
    if (signal?.aborted) break;
    onProgress?.(stage.key, 'running', { label: stage.label });
    try {
      if (!force && (await hasOutput(project, stage.key))) {
        report.skipped.push(stage.key);
        onProgress?.(stage.key, 'skipped', { label: stage.label });
        continue;
      }
      const patch = await runStage(stage.key, project, { onProgress, signal });
      if (patch) Object.assign(project, patch); // 写回工程（调用方负责持久化）
      report.done.push(stage.key);
      onProgress?.(stage.key, 'success', { label: stage.label });
    } catch (e) {
      const message = e?.message || String(e);
      report.errors.push({ stage: stage.key, message });
      onProgress?.(stage.key, 'error', { label: stage.label, message });
      // 异常兜底：记录但不中断整条管线；分镜是后续所有步的基础，失败即停。
      if (stage.key === 'storyboard') break;
    }
  }
  return report;
}

// 该步产物是否已存在（用于「跳过已生成、保留用户的手动结果」）
async function hasOutput(project, key) {
  const shots = project?.shots || [];
  switch (key) {
    case 'assets': return (project?.materials?.characters?.length || 0) > 0;
    case 'storyboard': return shots.length > 0;
    case 'motion': return shots.some((s) => s.videoUrl);
    case 'assembly': return shots.length > 0 && shots.every((s) => s.videoUrl);
    case 'dub': return shots.some((s) => s.audioUrl);
    case 'mix': return !!project?.mixedAudioUrl;
    case 'export': return !!project?.exportUrl;
    default: return false; // script / art 由用户产出，不做自动跳过判断
  }
}

async function runStage(key, project, ctx) {
  switch (key) {
    case 'assets': return runAssets(project, ctx);
    case 'storyboard': return runStoryboard(project, ctx);
    case 'motion': return runMotion(project, ctx);
    case 'assembly': return runAssembly(project, ctx);
    case 'dub': return runDub(project, ctx);
    case 'mix': return runMix(project, ctx);
    case 'export': return runExport(project, ctx);
    default: return null; // script / art：用户提供，编排器不代写
  }
}

// ── 各步实现（骨架：已有 lib 优先复用；未接入的步先留 TODO，返回 null 不阻断管线）──

// 分镜：LLM 分析剧本 → 每个分镜的动作 / 台词 / 运镜 / 首帧提示词（已完整实现）
async function runStoryboard(project, { onProgress } = {}) {
  if (!isModalityConfigured('text')) throw new Error('未配置文本模型（设置 → 模型配置）');
  if (!project?.script) throw new Error('请先在「剧本」步骤输入剧本内容');
  const list = await analyzeStoryboard({
    script: project.script,
    style: project?.artDirection?.style || '',
    characters: project?.materials?.characters || [],
    scenes: project?.materials?.scenes || [],
    count: project?.shotCount || DEFAULT_SHOT_COUNT,
    onLog: (m) => onProgress?.('storyboard', 'log', { message: m }),
  });
  return { shots: list, storyboardSel: 0 };
}

// 资产：基于角色/场景/道具描述生成主图（TODO：逐条 generateImage 写回 imageUrl）
async function runAssets(project) {
  if (!isModalityConfigured('image')) throw new Error('未配置图像模型');
  // TODO: 遍历 materials.characters/scenes/props，按各自 appearance/desc 调用 generateImage，
  //        写回 item.imageUrl，再返回 { materials: {...} }
  return null;
}

// 动态：先保证每个分镜首帧图，再生成视频（TODO：generateKeyframeShot + generateVideo 写回 s.videoUrl）
async function runMotion(project) {
  if (!isModalityConfigured('video')) throw new Error('未配置视频模型');
  // TODO: 遍历 shots，跑 generateKeyframeShot 后 generateVideo，写回 s.videoUrl
  return null;
}

// 装配：把各镜视频合并成分镜成片（TODO：mergeClips）
async function runAssembly(project) {
  const urls = (project?.shots || []).map((s) => s.videoUrl).filter(Boolean);
  if (!urls.length) return null;
  // TODO: const out = await mergeClips(urls, { burnSubtitles: true }); return { assemblyUrl: out }
  return null;
}

// 配音：逐镜生成配音轨（TODO：buildVoiceTrack 写回 s.audioUrl）
async function runDub(project) {
  if (!isModalityConfigured('tts')) throw new Error('未配置配音模型');
  // TODO: const tracks = await buildVoiceTrack(project.shots, { onStep }); 写回 audioUrl
  return null;
}

// 混音：视频轨 + 配音轨 + BGM 混音（TODO：mixAudio）
async function runMix(project) {
  // TODO: const b64 = await mixAudio(videoB64, voiceB64, bgmB64); return { mixedAudioUrl }
  return null;
}

// 导出：把最终视频 + 混音导出为文件（TODO：saveToLocal / 后端合成）
async function runExport(project) {
  // TODO: 生成字幕 srt（buildSrt）、转码（transcodeVideo）、落盘（saveToLocal）
  return null;
}
