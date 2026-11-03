// lib/pipeline/orchestrator.js
//
// 第二优先 · 一键全自动流水线（可选 Agent 模式）—— 编排器。
//
// 设计目标：把九步管线（剧本 → 艺术指导 → 资产 → 分镜 → 动态 → 装配 → 配音 → 混音 → 导出）
// 用合理默认值自动串跑；但每一步允许手动覆盖 / 重跑，保留「分步可控」卖点。
// Agent 模式只做「建议默认值 + 异常兜底」，不剥夺用户控制权（见 agent.js）。
//
// 复用底座（零重复、不碰 React 组件层）：
//   - src/lib/providers  → 文本 / 图片 / 视频 / TTS 模型接入（OpenAI 兼容 + ComfyUI）
//   - src/lib/storyboard → 分镜 LLM 拆解
//   - src/lib/merge      → 多轨合并、混音、字幕、转码、落盘
//   - src/lib/audio-track→ 配音轨批量对齐合成
//
// 与 UI 的契约：
//   - 调用方传入 project 与 onPatch(patch)；每步成功写回后，orchestrator 调用 onPatch 让 UI 持久化。
//   - 写回字段与现有 Studio 步骤完全对齐：
//       assets  → project.materials.{characters,scenes,props}[].imageUrl
//       motion  → project.shots[].videoUrl（可选 imageUrl 预览）
//       assembly→ project.assembledVideo
//       dub     → project.shots[].audioUrl
//       mix     → project.assembledVideo（带声成片）+ project.mixedAudioUrl
//       export  → project.exportUrl（桌面端转码落盘；Web 端触发下载）

import {
  analyzeStoryboard,
  DEFAULT_SHOT_COUNT,
} from '../storyboard.js';
import {
  generateImage, generateVideo, generateTTS,
  isModalityConfigured,
} from '../providers/index.js';
import {
  mergeClips, mixAudio, buildSrt, transcodeVideo, saveToLocal, b64ToObjectUrl,
} from '../merge.js';
import { buildVoiceTrack } from '../audio-track.js';
import { isTauri } from '@dual/ui';
import { suggestDefaults } from './agent.js';

// 九步管线（与 Studio 步骤栏一一对应）。auto=false 的步骤由用户提供输入，
// 编排器只校验是否存在、不代写；auto=true 的步骤可被自动串跑。
export const PIPELINE_STAGES = [
  { key: 'script', label: '剧本', auto: false },
  { key: 'art', label: '艺术指导', auto: false },
  { key: 'assets', label: '资产', auto: true, hint: '基于角色/场景/道具描述生成主图', required: false },
  { key: 'storyboard', label: '分镜', auto: true, required: true },
  { key: 'motion', label: '动态', auto: true, required: true },
  { key: 'assembly', label: '装配', auto: true, required: true },
  { key: 'dub', label: '配音', auto: true, hint: '逐镜生成配音轨', required: false },
  { key: 'mix', label: '混音', auto: true, hint: '视频轨 + 配音轨 + BGM 混音', required: false },
  { key: 'export', label: '导出', auto: true, required: true },
];

// 串行执行管线。
//   onProgress(stageKey, status, info) 回调：status ∈ running|log|skipped|success|error
//   onPatch(patch) 回调：每步写回后调用，让 UI 持久化（patch 与 project 浅合并）
//   force=true 时忽略已有产物、全部重跑；否则已有产物的步骤自动跳过（保留分步可控）
//   signal 可中断（AbortController）
//   agent=true 时启用 Agent 默认值建议 + 可选步缺失模型时静默跳过（而非报错中止）
// 返回 { done, skipped, errors, agent } 报告。
export async function runPipeline(project, {
  onProgress, onPatch, force = false, signal, agent = false,
} = {}) {
  const report = { done: [], skipped: [], errors: [], agent: !!agent };
  // working 副本：各步在此累积写回，保证后续步骤读到前序步骤的最新产物。
  const working = { ...project };

  const defaults = agent ? suggestDefaults(project) : null;
  if (agent && defaults) {
    const lines = Object.entries(defaults)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${v}`).join('，');
    onProgress?.('*', 'log', { message: `Agent 建议默认值：${lines}` });
  }

  for (const stage of PIPELINE_STAGES) {
    if (signal?.aborted) { report.errors.push({ stage: stage.key, message: '用户中止' }); break; }
    onProgress?.(stage.key, 'running', { label: stage.label });
    try {
      if (!force && (await hasOutput(working, stage.key))) {
        report.skipped.push(stage.key);
        onProgress?.(stage.key, 'skipped', { label: stage.label });
        continue;
      }
      const patch = await runStage(stage.key, working, { onProgress, signal, agent, defaults });
      if (patch) {
        Object.assign(working, patch);
        onPatch?.(patch);
      }
      report.done.push(stage.key);
      onProgress?.(stage.key, 'success', { label: stage.label });
    } catch (e) {
      const message = e?.message || String(e);
      report.errors.push({ stage: stage.key, message });
      onProgress?.(stage.key, 'error', { label: stage.label, message });
      // 异常兜底：required 步骤失败即停；可选步骤只记录、继续（Agent 模式下更宽容）。
      if (stage.required) break;
    }
  }
  return report;
}

// 该步产物是否已存在（用于「跳过已生成、保留用户的手动结果」）
async function hasOutput(project, key) {
  const shots = project?.shots || [];
  switch (key) {
    case 'assets': return (project?.materials?.characters?.length || 0) > 0
      && (project.materials.characters.some((c) => c.imageUrl) || project.materials.scenes?.some((s) => s.imageUrl));
    case 'storyboard': return shots.length > 0;
    case 'motion': return shots.length > 0 && shots.every((s) => s.videoUrl);
    case 'assembly': return !!project?.assembledVideo && shots.every((s) => s.videoUrl);
    case 'dub': return shots.length > 0 && shots.some((s) => s.audioUrl);
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

// ── 各步实现（全部走 lib 复用层；可选步缺模型时按 agent 开关决定报错或静默跳过）──

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

// 资产：基于角色/场景/道具描述，逐条走 OpenAI 兼容文生图写回 imageUrl。
//   缺图像模型 → 可选步，agent 下静默跳过，否则抛错。
async function runAssets(project, { onProgress, agent } = {}) {
  if (!isModalityConfigured('image')) {
    if (agent) { onProgress?.('assets', 'log', { message: '未配置图像模型，跳过资产出图（可手动在资产步骤生成）' }); return null; }
    throw new Error('未配置图像模型（设置 → 模型配置）');
  }
  const mats = project?.materials || {};
  const sizeFor = (type) => (type === 'scene' ? '1280x720' : type === 'prop' ? '1024x1024' : '864x1536');
  const gen = async (arr = [], type) => {
    const next = [];
    for (const it of arr) {
      const prompt = [it.appearance || it.desc || it.description, it.name]
        .filter(Boolean).join('，');
      if (!prompt) { next.push(it); continue; }
      try {
        onProgress?.('assets', 'log', { message: `生成${type}图：${it.name || '(未命名)'}` });
        const { resultUrl } = await generateImage(prompt, { size: sizeFor(type), n: 1 });
        next.push({ ...it, imageUrl: resultUrl });
      } catch (e) {
        next.push(it);
        onProgress?.('assets', 'log', { message: `「${it.name || ''}」出图失败：${e?.message || e}` });
      }
    }
    return next;
  };
  const characters = await gen(mats.characters, '角色');
  const scenes = await gen(mats.scenes, '场景');
  const props = await gen(mats.props, '道具');
  return { materials: { ...mats, characters, scenes, props } };
}

// 动态：逐镜生成视频（纯文生视频最通用，用 videoPrompt/firstFramePrompt/imagePrompt 兜底）。
//   Agent 模式下若本镜角色有图，也一并作为参考提升一致性（仅当视频模型支持参考图时由 generateVideo 自动分桶）。
//   缺视频模型 → required，必报错中止。
async function runMotion(project, { onProgress, signal, agent, defaults } = {}) {
  if (!isModalityConfigured('video')) throw new Error('未配置视频模型（设置 → 模型配置）');
  const shots = project?.shots || [];
  if (!shots.length) throw new Error('还没有分镜，无法生成动态');
  const chars = project?.materials?.characters || [];
  const ratio = defaults?.ratio || '9:16';
  const seconds = String(defaults?.durationSec || 5);

  const next = [...shots];
  for (let i = 0; i < next.length; i += 1) {
    if (signal?.aborted) throw new Error('用户中止');
    const s = next[i];
    if (s.videoUrl) continue; // 已有则跳过（除非 force）
    const prompt = s.videoPrompt || s.firstFramePrompt || s.imagePrompt
      || s.sceneDesc || '一段电影感短视频';
    // 参考图：本镜出现的角色主视图（提升人物一致性）
    const refs = (agent && chars.length)
      ? matchShotCharImages(s, chars)
      : [];
    const mode = refs.length ? 'reference' : 'text';
    try {
      onProgress?.('motion', 'log', { message: `生成视频 ${i + 1}/${next.length}：${(prompt || '').slice(0, 20)}…` });
      const { resultUrl } = await generateVideo({
        prompt, seconds, aspect_ratio: ratio, mode,
        images: refs, signal,
      });
      next[i] = { ...s, videoUrl: resultUrl };
    } catch (e) {
      onProgress?.('motion', 'log', { message: `第 ${i + 1} 镜视频失败：${e?.message || e}` });
      throw e; // 动态是后续装配/导出基础，单镜失败即停
    }
  }
  return { shots: next };
}

// 装配：把各镜视频合并成分镜成片（带逐镜字幕）。
async function runAssembly(project, { onProgress } = {}) {
  const shots = project?.shots || [];
  const urls = shots.map((s) => s.videoUrl).filter(Boolean);
  if (urls.length < 1) throw new Error('没有可合并的视频片段（请先完成动态生成）');
  onProgress?.('assembly', 'log', { message: `合并 ${urls.length} 段视频…` });
  const clips = shots
    .filter((s) => s.videoUrl)
    .map((s) => ({ url: s.videoUrl, subtitle: s.dialogue || '', duration: s.duration || 5 }));
  const b64 = await mergeClips(clips, { burnSubtitles: true });
  const url = b64ToObjectUrl(b64);
  return { assembledVideo: url };
}

// 配音：逐镜生成配音轨（OpenAI 兼容 TTS），写回 shot.audioUrl。
async function runDub(project, { onProgress, signal, agent } = {}) {
  if (!isModalityConfigured('tts')) {
    if (agent) { onProgress?.('dub', 'log', { message: '未配置配音模型，跳过配音（将输出无声成片）' }); return null; }
    throw new Error('未配置配音模型（设置 → 模型配置）');
  }
  const shots = project?.shots || [];
  const chars = project?.materials?.characters || [];
  const lines = shots.filter((s) => s.dialogue && !s.audioUrl);
  if (!lines.length) { onProgress?.('dub', 'log', { message: '没有需要配音的台词' }); return null; }
  const next = [...shots];
  for (const s of lines) {
    if (signal?.aborted) throw new Error('用户中止');
    const c = chars.find((x) => x.name === s.characters?.[0]);
    const voice = c?.voiceDesc || c?.voice || '';
    try {
      onProgress?.('dub', 'log', { message: `配音 ${next.indexOf(s) + 1}/${shots.length}：${(s.dialogue || '').slice(0, 16)}…` });
      const { resultUrl } = await generateTTS({ text: s.dialogue, voice, signal });
      const idx = next.indexOf(s);
      next[idx] = { ...s, audioUrl: resultUrl };
    } catch (e) {
      onProgress?.('dub', 'log', { message: `第 ${next.indexOf(s) + 1} 镜配音失败：${e?.message || e}` });
      throw e;
    }
  }
  return { shots: next };
}

// 混音：配音整轨 + BGM 混进成片视频，覆盖 assembledVideo 为带声成片。
async function runMix(project, { onProgress, agent, defaults } = {}) {
  const src = project?.assembledVideo;
  if (!src) { onProgress?.('mix', 'log', { message: '还没有成片，跳过混音' }); return null; }
  if (!isTauri()) {
    // Web 端 ffmpeg.wasm 暂只做视频拼接，混音需桌面端；agent 下静默跳过，保留无声成片。
    if (agent) { onProgress?.('mix', 'log', { message: 'Web 端暂不支持混音（需桌面端内置 ffmpeg），保留无声成片' }); return null; }
    onProgress?.('mix', 'log', { message: 'Web 端混音需桌面端；可在桌面端打开项目完成混音' });
    return null;
  }
  onProgress?.('mix', 'log', { message: '构建配音整轨…' });
  const voice = await buildVoiceTrack(project.shots, { onStep: (m) => onProgress?.('mix', 'log', { message: m }) });
  let bgmB64 = '';
  if (project?.bgmUrl) {
    onProgress?.('mix', 'log', { message: '读取背景音乐…' });
    bgmB64 = await (await (await fetch(project.bgmUrl)).blob()).arrayBuffer()
      .then((ab) => { let bin = ''; const CH = 0x8000; const b = new Uint8Array(ab); for (let i = 0; i < b.length; i += CH) bin += String.fromCharCode.apply(null, b.subarray(i, i + CH)); return btoa(bin); });
  }
  const voiceVol = defaults?.voiceVolume ?? 1.0;
  const bgmVol = defaults?.bgmVolume ?? 0.2;
  onProgress?.('mix', 'log', { message: '执行混音…' });
  const outB64 = await mixAudio(src, voice?.base64 || '', bgmB64, voiceVol, bgmVol);
  const url = b64ToObjectUrl(outB64);
  return { assembledVideo: url, mixedAudioUrl: url };
}

// 导出：生成 SRT 字幕，桌面端转码落盘，Web 端触发浏览器下载。
async function runExport(project, { onProgress } = {}) {
  const src = project?.assembledVideo;
  if (!src) throw new Error('还没有成片，无法导出');
  const srt = buildSrt(project.shots);
  if (isTauri()) {
    onProgress?.('export', 'log', { message: '转码导出（1080p MP4，烧录字幕）…' });
    const { video } = await transcodeVideo(src, { resolution: '1080p', format: 'MP4', subtitle: 'burnIn', srtText: srt });
    const name = `${(project?.title || '短剧').replace(/[\\/:*?"<>|]/g, '_')}_${Date.now()}.mp4`;
    const path = await saveBase64(video, name);
    onProgress?.('export', 'log', { message: `已导出：${path}` });
    return { exportUrl: b64ToObjectUrl(video) };
  }
  // Web 端：触发浏览器下载（无需桌面权限）
  onProgress?.('export', 'log', { message: 'Web 端触发浏览器下载成片…' });
  await saveToLocal(src, `${(project?.title || '短剧').replace(/[\\/:*?"<>|]/g, '_')}.mp4`);
  return { exportUrl: src };
}

// 取本镜出现角色的主视图 URL（用于视频参考图，提升一致性）
function matchShotCharImages(shot = {}, characters = []) {
  const named = (Array.isArray(shot.characters) ? shot.characters : []).map((x) => String(x ?? '').trim()).filter(Boolean);
  const hay = `${shot.sceneDesc || ''} ${shot.dialogue || ''}`;
  const out = [];
  for (const c of characters) {
    const n = String(c?.name || c?.title || '').trim();
    if (!n) continue;
    const mentioned = named.some((x) => x === n || x.includes(n) || n.includes(x)) || hay.includes(n);
    if (!mentioned) continue;
    const url = String(c?.imageRemoteUrl || c?.url || c?.imageUrl || '').trim();
    if (url) out.push(url);
  }
  return out.slice(0, 3);
}
