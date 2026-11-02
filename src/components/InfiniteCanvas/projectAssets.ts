// 项目素材收集：把项目里分散在各处的图/视频汇总成一份「可导入画布」的清单。
//
// 为什么需要它：画布最初只读 project.assets，但项目里真正的图/视频分散在
//   角色（imageUrl / 主图 / 四视图）、场景、道具（imageUrl）、分镜（首帧 imageUrl、videoUrl）、
//   以及素材库（assets，生成后自动存入的图/视频）。
// 只读 assets 时，只要用户没开「自动存入素材库」或者素材是从资产步骤生成的，
// 画布的「从素材库导入」就会是一个空列表 —— 按钮灰掉、点了没反应。
//
// 🔴 角色四视图字段名历史分裂（fourView / threeViewsUrl / fourViews），
//    统一走 utils 里的 characterFourView，避免读不到老存档。

import { characterFourView } from '../../utils.js';

export type CanvasAsset = {
  id: string;
  type: 'image' | 'video' | 'prompt';
  url: string;
  title: string;
  group: string; // 角色 / 场景 / 道具 / 分镜 / 首帧提示词 / 视频提示词 / 素材库
  /** 仅 prompt 类型有：提示词正文 + 来源分类（首帧 / 视频 / 生图） */
  promptText?: string;
  promptKind?: 'firstFrame' | 'video' | 'image';
};

const isVideoUrl = (u: string) => /\.(mp4|webm|mov|m3u8|mkv)(\?|#|$)/i.test(u || '');

export function collectProjectAssets(project: any): CanvasAsset[] {
  if (!project) return [];
  const list: CanvasAsset[] = [];
  const seen = new Set<string>();

  const push = (
    url: string | undefined,
    opts: {
      id?: string;
      type?: 'image' | 'video';
      title?: string;
      group: string;
      /** 传了 promptText 就按提示词条目登记（与图/视频走不同分支、分开去重） */
      promptText?: string;
      promptKind?: 'firstFrame' | 'video' | 'image';
    }
  ) => {
    const u = (url || '').trim();
    // prompt 分支：提示词文本与图/视频分开去重、分开登记
    if (opts.promptText !== undefined) {
      const ptext = (opts.promptText || '').trim();
      if (!ptext) return;
      const key = 'prompt::' + ptext;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({
        id: opts.id || `${opts.group}_${list.length}`,
        type: 'prompt',
        url: '',
        title: opts.title || opts.group,
        group: opts.group,
        promptText: ptext,
        promptKind: opts.promptKind,
      });
      return;
    }
    if (!u || seen.has(u)) return;
    seen.add(u);
    list.push({
      id: opts.id || `${opts.group}_${list.length}`,
      type: opts.type || (isVideoUrl(u) ? 'video' : 'image'),
      url: u,
      title: opts.title || opts.group,
      group: opts.group,
    });
  };

  // 1) 素材库（生成后自动存入的图/视频，最新的排在最前）
  (project.assets || []).forEach((a: any, i: number) => {
    if (!a || a.type === 'audio') return;
    push(a.url || a.imageUrl, {
      id: a.id || `asset_${i}`,
      type: a.type === 'video' ? 'video' : undefined,
      title: a.title || a.name || `素材 ${i + 1}`,
      group: '素材库',
    });
  });

  // 2) 角色（主图优先，没有主图时退回四视图）
  (project.materials?.characters || []).forEach((c: any, i: number) => {
    const name = c?.name || `角色 ${i + 1}`;
    const main = c?.imageUrl || c?.masterUrl || c?.avatarUrl;
    const four = characterFourView(c);
    push(main || four, { id: `char_${c?.id || i}`, title: name, group: '角色' });
    if (main && four) push(four, { id: `char_fv_${c?.id || i}`, title: `${name} · 四视图`, group: '角色' });
  });

  // 3) 场景
  (project.materials?.scenes || []).forEach((s: any, i: number) => {
    push(s?.imageUrl || s?.masterUrl, {
      id: `scene_${s?.id || i}`,
      title: s?.name || `场景 ${i + 1}`,
      group: '场景',
    });
  });

  // 4) 道具
  (project.materials?.props || []).forEach((p: any, i: number) => {
    push(p?.imageUrl || p?.masterUrl, {
      id: `prop_${p?.id || i}`,
      title: p?.name || `道具 ${i + 1}`,
      group: '道具',
    });
  });

  // 5) 分镜（首帧图 + 已生成的视频 + 首帧提示词 + 视频提示词）
  //    🔴 首帧提示词 / 视频提示词原本散落在 shot.firstFramePrompt / shot.videoPrompt，
  //       一并收进导入清单，让画布能直接基于分镜提示词生成关键帧 / 视频。
  (project.shots || []).forEach((s: any, i: number) => {
    const label = s?.title || `分镜 ${i + 1}`;
    push(s?.firstFramePrompt, {
      id: `shot_ff_${s?.id || i}`,
      title: `${label} · 首帧提示词`,
      group: '首帧提示词',
      promptText: s?.firstFramePrompt,
      promptKind: 'firstFrame',
    });
    push(s?.videoPrompt, {
      id: `shot_vp_${s?.id || i}`,
      title: `${label} · 视频提示词`,
      group: '视频提示词',
      promptText: s?.videoPrompt,
      promptKind: 'video',
    });
    push(s?.imageUrl, { id: `shot_img_${s?.id || i}`, type: 'image', title: `${label} · 首帧`, group: '分镜' });
    push(s?.videoUrl, { id: `shot_vid_${s?.id || i}`, type: 'video', title: `${label} · 视频`, group: '分镜' });
  });

  return list;
}
