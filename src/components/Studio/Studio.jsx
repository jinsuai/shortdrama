import React, { useState } from 'react';
import { StudioShell } from './StudioShell';
import { WorkspaceView } from './WorkspaceView';
import { SeriesView } from './SeriesView';
import { LibraryView, SettingsView } from './OtherViews';
import { ProjectLayout } from './ProjectLayout';
import { T, defaultModelKey, defaultRatio } from './i18n';
import { generatePanelImage } from '../../lib/image-workflows.js';

// 九步组件
import { ScriptStep, ScriptContext, ArtDirectionStep, ArtContext, AssetsStep, AssetsContext } from './steps1';
import { StoryboardStep, StoryboardContext, MotionStep, MotionContext, AssemblyStep, AssemblyContext } from './steps2';
import { VoiceStep, VoiceContext, FinalMixStep, MixContext, ExportStep, ExportContext } from './steps3';
// 弹窗
import {
  EntityModal, WorkbenchModal, CreateSeriesModal, CreateProjectModal, ImportFileModal,
} from './modals';

/**
 * Studio 总控。
 * 打开软件默认进入「工作区」；打开/新建项目后进入四列流水线。
 */
export function Studio({
  projects = [],
  series = [],
  project,
  update,
  log,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onCreateSeries,
  onCreateEpisode,
  onEditSeries,
  onDeleteSeries,
  onDeleteEpisode,
  onImportFile,
  onSync,
  onRestart,
  onSaveSettings,
  allAssets = [],
}) {
  const [view, setView] = useState('workspace');   // workspace | library | settings | series
  const [seriesView, setSeriesView] = useState(null);  // current series id when viewing a series
  const [inProject, setInProject] = useState(false);
  const [step, setStep] = useState('script');

  // 弹窗
  const [entity, setEntity] = useState(null);
  const [workbench, setWorkbench] = useState(null);
  const [dlg, setDlg] = useState(null);            // 'series' | 'project' | 'import'
  const [generating, setGenerating] = useState(null); // 正在生成的槽位 key

  /**
   * 资产出图：按「设置里的图片模型 + 槽位任务」自动选面板工作流。
   *   master / avatar → 文生图（9:16 / 1:1）
   *   threeViews      → 人物：做剧4视图（T10 图生图，需要主视图当参考图）
   *                     场景/道具：Krea2 文生图（T01）——T10 是人物四视图，场景/道具不适用
   * 具体工作流不对用户展示。
   */
  const handleGenerateImage = async (asset, slot, prompt, negative) => {
    if (generating) return;
    setGenerating(slot);
    const isHuman = asset?.type !== 'scene' && asset?.type !== 'prop';
    const task = slot === 'threeViews' && isHuman ? 'four' : 'text';
    // 场景/道具三视图固定走 T01（Krea2 文生图），不跟随「设置里的图片模型」
    const modelKey = slot === 'threeViews' && !isHuman ? 'krea2' : defaultModelKey('image');
    // 🔴 比例修复：读「设置 → 默认比例」里对应资产的画幅（之前硬编码 9:16 导致设置不生效）；
    //    头像特写固定 1:1（设计稿约定），人物四视图走 T10 固定尺寸不受比例影响
    const ratioKey = asset?.type === 'scene' ? 'scene' : asset?.type === 'prop' ? 'prop' : 'character';
    // 人物四视图 = 一张图里横排四格（面部特写/正面/侧面/背面），对齐 T10 的 1536x1024 横版；
    // 跟着角色画幅走竖屏 9:16 会把四格压变形，所以这里固定横版 3:2。
    const ratio = slot === 'avatar' ? '1:1'
      : (slot === 'threeViews' && isHuman) ? '3:2'
      : defaultRatio(ratioKey);
    // 四视图固定用主视图作参考（图生图），身份由参考图给，提示词只下版式指令。
    // 没有主视图就没有参考图，会退化成纯文生图（四格前后不一致），所以显式提醒而不是静默降级。
    const referenceImage = slot === 'threeViews' && isHuman ? (asset.masterUrl || '') : '';
    if (slot === 'threeViews' && isHuman && !referenceImage) {
      log?.(`⚠️ ${asset.name} 还没有主视图，四视图缺参考图，将按提示词直接生成（人物一致性会下降）`);
    }
    log?.(`正在生成：${asset.name} · ${slot}`);
    try {
      const { resultUrl, workflowId } = await generatePanelImage({
        modelKey, task, prompt, negative, ratio, referenceImage,
      });
      // 写回项目素材（角色 / 场景 / 道具三张表都找一遍）
      const mats = project?.materials || {};
      // master 同时写 imageUrl，作为资产库 / 分镜里的封面
      // 🔴 四视图额外写一份 fourView：视频生成 / 角色管理读的是这个字段，
      //    只写 threeViewsUrl 会导致「明明生成了四视图，视频却静默回退主图」。
      const patch = (arr = []) => arr.map((x) => (x.id === asset.id
        ? {
            ...x,
            [`${slot}Url`]: resultUrl,
            ...(slot === 'master' ? { imageUrl: resultUrl } : {}),
            ...(slot === 'threeViews' && isHuman ? { fourView: resultUrl } : {}),
          }
        : x));
      update?.({
        ...project,
        materials: {
          ...mats,
          characters: patch(mats.characters),
          scenes: patch(mats.scenes),
          props: patch(mats.props),
        },
      });
      // 弹窗里的资产是快照，同步刷新才能立刻看到新图
      setWorkbench({ ...asset, [`${slot}Url`]: resultUrl });
      log?.(`生成完成：${asset.name} · ${slot}（${workflowId}）`);
    } catch (e) {
      log?.(`生成失败：${e?.message || e}`);
    } finally {
      setGenerating(null);
    }
  };

  /**
   * 写回资产字段（当前用于「真音色样本」）。按 id 在 角色/场景/道具 三张表找一遍，
   * 命中后合并 patch 写回 project.materials，并同步刷新弹窗里的资产快照。
   * ⚠️ 音色样本目前以 dataURL 直接存进 project，会增大存档体积；
   *    后续工作流接入 ref_audio 时，应改成上传 COS 返回公网 URL 再落库。
   */
  const handleSaveAsset = (patch) => {
    if (!patch || !patch.id) return;
    update?.((prev) => {
      const mats = prev?.materials || {};
      for (const k of ['characters', 'scenes', 'props']) {
        const arr = mats[k] || [];
        const idx = arr.findIndex((e) => e.id === patch.id);
        if (idx >= 0) {
          return {
            ...prev,
            materials: { ...mats, [k]: arr.map((e, i) => (i === idx ? { ...e, ...patch } : e)) },
          };
        }
      }
      return prev;
    });
    setWorkbench((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const closeDlg = () => setDlg(null);

  const handleNav = (k) => {
    setInProject(false);
    setSeriesView(null);
    setView(k);
  };

  const openSeries = (id) => {
    setSeriesView(id);
    setView('series');
  };

  const backFromSeries = () => {
    setSeriesView(null);
    setView('workspace');
  };

  // 当前打开的系列对象
  const currentSeries = series.find((s) => s.id === seriesView) || null;
  // 该系列下的剧集（项目）
  const seriesEpisodes = seriesView ? projects.filter((p) => p.seriesId === seriesView) : [];

  // ── 项目内：四列布局 ──
  if (inProject && project) {
    const renderStep = () => {
      switch (step) {
        case 'script': return <ScriptStep project={project} update={update} log={log} onOpenEntity={setEntity} />;
        case 'art': return <ArtDirectionStep project={project} update={update} log={log}
          onApply={() => { setStep('assets'); log?.('已应用风格，进入资产步骤'); }} />;
        case 'assets': return <AssetsStep project={project} update={update} log={log} onOpenWorkbench={setWorkbench} />;
        case 'storyboard': return <StoryboardStep project={project} update={update} log={log} />;
        case 'motion': return <MotionStep project={project} update={update} log={log} />;
        case 'assembly': return <AssemblyStep project={project} update={update} log={log} />;
        case 'voice': return <VoiceStep project={project} update={update} log={log} />;
        case 'mix': return <FinalMixStep project={project} update={update} log={log} />;
        case 'export': return <ExportStep project={project} update={update} log={log} />;
        default: return null;
      }
    };

    const renderContext = () => {
      switch (step) {
        case 'script': return <ScriptContext project={project} />;
        case 'art': return <ArtContext project={project} update={update} />;
        case 'assets': return <AssetsContext project={project} update={update} />;
        case 'storyboard': return <StoryboardContext project={project} update={update} log={log} />;
        case 'motion': return <MotionContext project={project} update={update} />;
        case 'assembly': return <AssemblyContext project={project} update={update} log={log} />;
        case 'voice': return <VoiceContext project={project} />;
        case 'mix': return <MixContext project={project} update={update} log={log} />;
        case 'export': return <ExportContext />;
        default: return null;
      }
    };

    // 项目内 = 40px 窄栏(折叠全局导航) + 190px 步骤栏 + 主区 + 260px 上下文栏
    // 注意：不再套 StudioShell 的 168px 全局栏（参考设计用窄栏替代它）
    return (
      <>
        <ProjectLayout
          projectTitle={project.title}
          currentStep={step}
          onStepChange={setStep}
          onBack={() => { setInProject(false); setView('workspace'); }}
          onNav={handleNav}
          context={renderContext()}
        >
          {renderStep()}
        </ProjectLayout>

        {/* 弹窗 */}
        <EntityModal entity={entity} onClose={() => setEntity(null)}
          onSave={(e) => {
            const mats = project.materials || {};
            const key = e.type === 'scene' ? 'scenes' : e.type === 'prop' ? 'props' : 'characters';
            const arr = mats[key] || [];
            // 匹配键：优先用 id；老数据缺 id 时退化为「__n__名称」，避免
            // findIndex(undefined===undefined) 永远命中 index 0 而把描述词写进别的实体
            const matchKey = (it) => it.id || ('__n__' + (it.name || it.title || ''));
            const tKey = matchKey(e);
            const idx = arr.findIndex((it) => matchKey(it) === tKey);
            const stableId = e.id || (idx >= 0 ? arr[idx].id : null) || ('ent_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
            const patch = {
              ...(idx >= 0 ? arr[idx] : { type: e.type, name: e.name }),
              id: stableId,
              appearance: e.desc, desc: e.desc,
              age: e.age, gender: e.gender, clothing: e.clothing, weight: e.weight,
            };
            const nextArr = idx >= 0 ? arr.map((it, i) => (i === idx ? patch : it)) : [...arr, patch];
            update?.({ ...project, materials: { ...mats, [key]: nextArr } });
            log?.('已保存实体配置：' + (e.name || ''));
            setEntity(null);
          }} />
        <WorkbenchModal asset={workbench} onClose={() => setWorkbench(null)} generating={generating}
          onGenerate={handleGenerateImage} onSaveAsset={handleSaveAsset} />
      </>
    );
  }

  // ── 全局：工作区 / 主体库 / 设置 ──
  return (
    <StudioShell view={view} onViewChange={handleNav} onRestart={onRestart}>
      {view === 'workspace' && (
        <WorkspaceView
          projects={projects}
          series={series}
          onNewSeries={() => setDlg('series')}
          onNewProject={() => setDlg('project')}
          onOpenProject={(id) => { onOpenProject?.(id); setStep('script'); setInProject(true); }}
          onOpenSeries={(id) => openSeries(id)}
          onImport={() => setDlg('import')}
          onSync={onSync}
          onDeleteProject={(id) => {
            const t = projects.find((p) => p.id === id)?.title || '';
            if (window.confirm(T.dialog.confirmDeleteProject(t))) onDeleteProject?.(id);
          }}
          onDeleteSeries={(id) => {
            const s = series.find((x) => x.id === id);
            if (window.confirm(T.dialog.confirmDeleteSeries(s?.title || ''))) onDeleteSeries?.(id);
          }}
        />
      )}
      {view === 'series' && currentSeries && (
        <SeriesView
          series={currentSeries}
          episodes={seriesEpisodes}
          onBack={backFromSeries}
          onNewEpisode={(title, file, text) => onCreateEpisode?.(currentSeries.id, title, file, text)}
          onOpenEpisode={(id) => { onOpenProject?.(id); setStep('script'); setInProject(true); }}
          onDeleteEpisode={(id) => {
            const ep = projects.find((p) => p.id === id);
            if (window.confirm(T.dialog.confirmDeleteEpisode(ep?.title || ''))) onDeleteEpisode?.(id);
          }}
          onEditSeries={(patch) => onEditSeries?.(currentSeries.id, patch)}
          onDeleteSeries={() => {
            if (window.confirm(T.dialog.confirmDeleteSeries(currentSeries.title))) onDeleteSeries?.(currentSeries.id);
          }}
        />
      )}
      {view === 'library' && <LibraryView assets={allAssets} />}
      {view === 'settings' && (
        <SettingsView
          onSave={(s) => { onSaveSettings?.(s); log?.('设置已保存'); }}
        />
      )}

      {/* 弹窗 */}
      <CreateSeriesModal open={dlg === 'series'} onClose={closeDlg}
        onCreate={(d) => { onCreateSeries?.(d); log?.(`已创建系列：${d.title}`); }} />
      <CreateProjectModal open={dlg === 'project'} onClose={closeDlg}
        onCreate={async (d) => {
          await onCreateProject?.(d);
          setStep('script'); setInProject(true);
        }} />
      <ImportFileModal open={dlg === 'import'} onClose={closeDlg}
        onImport={(d) => { onImportFile?.(d); log?.(`已导入：${d.title}`); }} />
    </StudioShell>
  );
}
