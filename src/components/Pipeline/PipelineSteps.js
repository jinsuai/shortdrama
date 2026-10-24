import React from 'react';

export const PIPELINE_STEPS = [
  { id: 'script', label: '剧本', icon: '📝', description: 'LLM分集、剧情结构' },
  { id: 'art_direction', label: '艺术指导', icon: '🎨', description: '风格分析、参考图' },
  { id: 'assets', label: '资产管理', icon: '🖼️', description: '角色三视图、全身图' },
  { id: 'storyboard', label: '分镜制作', icon: '📋', description: '画面构图、镜头设计' },
  { id: 'motion', label: '动态生成', icon: '🎬', description: '图生视频、运镜控制' },
  { id: 'assembly', label: '视频组装', icon: '✂️', description: '剪辑合并、时间轴' },
  { id: 'voice', label: '配音', icon: '🎙️', description: 'TTS语音合成' },
  { id: 'final_mix', label: '混音', icon: '🎚️', description: '音频混合、音效' },
  { id: 'export', label: '导出', icon: '📤', description: '成片输出' },
];

export function isStepDone(project, stepId) {
  switch (stepId) {
    case 'script': return !!(project.script && project.script.length > 0);
    case 'art_direction': return !!(project.artDirection && project.artDirection.styleKey);
    case 'assets': return !!(project.characters && project.characters.length > 0);
    case 'storyboard': return !!(project.shots && project.shots.length > 0);
    case 'motion': return !!(project.shots && project.shots.some(s => s.videoUrl));
    case 'assembly': return !!(project.assembledVideo);
    default: return false;
  }
}

export function getUnlockedSteps(project) {
  const done = new Set(['script']);
  PIPELINE_STEPS.forEach((step, idx) => {
    if (isStepDone(project, step.id)) {
      // 当前步及之后的都解锁
      for (let i = idx; i < PIPELINE_STEPS.length; i++) {
        done.add(PIPELINE_STEPS[i].id);
      }
    }
  });
  // 始终解锁下一步
  const currentIdx = PIPELINE_STEPS.findIndex(s => done.has(s.id) && !isStepDone(project, s.id));
  if (currentIdx >= 0 && currentIdx + 1 < PIPELINE_STEPS.length) {
    done.add(PIPELINE_STEPS[currentIdx + 1].id);
  }
  return done;
}

export function getPipelineProgress(project) {
  const done = PIPELINE_STEPS.filter(s => isStepDone(project, s.id)).length;
  return Math.round((done / PIPELINE_STEPS.length) * 100);
}
