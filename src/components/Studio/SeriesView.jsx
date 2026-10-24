import React, { useState } from 'react';
import { CloudBackground } from './StudioShell';
import { T } from './i18n';
import { Icon, Btn, glassCard, Modal, Field } from './ui';
import { ProjectCard } from './WorkspaceView';
import { CreateSeriesModal } from './modals';

const glass = (hover) => glassCard(hover);

/**
 * 系列详情 —— 点击工作区的系列卡进入。
 * 展示系列标题 / 描述 / 统计，并列出其下的剧集（项目）网格；
 * 支持：新建剧集（归属该系列）、打开剧集（九步流水线）、删除剧集、编辑系列、删除系列。
 */
export function SeriesView({
  series,
  episodes = [],
  onNewEpisode,
  onOpenEpisode,
  onDeleteEpisode,
  onBack,
  onDeleteSeries,
  onEditSeries,
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [newEpTitle, setNewEpTitle] = useState('');
  const [showNewEpDlg, setShowNewEpDlg] = useState(false);
  const [newEpFile, setNewEpFile] = useState(null);
  const [newEpText, setNewEpText] = useState('');
  const [newEpErr, setNewEpErr] = useState('');

  const charCount = episodes.reduce((acc, ep) => acc + ((ep.materials?.characters || []).length), 0);
  const sceneCount = episodes.reduce((acc, ep) => acc + ((ep.materials?.scenes || []).length), 0);

  const handleDeleteSeries = () => {
    if (window.confirm(T.seriesView.confirmDeleteSeries(series.title || ''))) {
      onDeleteSeries?.(series.id);
    }
  };

  const handleNewEpisode = () => {
    setNewEpTitle(`第${episodes.length + 1}集`);
    setNewEpFile(null);
    setNewEpText('');
    setNewEpErr('');
    setShowNewEpDlg(true);
  };

  const handlePickEpFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext !== 'txt' && ext !== 'md' && ext !== 'docx') {
      setNewEpErr('仅支持 .txt / .md / .docx 文件');
      setNewEpFile(null);
      return;
    }
    setNewEpErr('');
    setNewEpFile(f);
    setNewEpText('');
  };

  const handleConfirmNewEpisode = () => {
    if (newEpTitle.trim()) {
      onNewEpisode?.(newEpTitle.trim(), newEpFile || null, newEpText.trim() || null);
      setShowNewEpDlg(false);
      setNewEpTitle('');
      setNewEpFile(null);
      setNewEpText('');
    }
  };

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      <CloudBackground />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏：返回 + 标题 + 操作 */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 28px 14px', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button onClick={onBack} title={T.seriesView.back} style={{
              background: 'rgba(15,23,42,0.064)', border: '1px solid rgba(15,23,42,0.16)',
              color: '#5b6678', cursor: 'pointer', width: 34, height: 34, borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#374151'; e.currentTarget.style.borderColor = 'rgba(109,40,217,.4)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#5b6678'; e.currentTarget.style.borderColor = 'rgba(15,23,42,0.16)'; }}>
              <Icon name="arrowLeft" size={16} />
            </button>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1f2937', letterSpacing: '-.01em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {T.seriesView.title(series.title || '(未命名)')}
              </h1>
              {series.description && (
                <div style={{ fontSize: 11.5, color: '#4b5563', marginTop: 3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {series.description}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Btn onClick={() => setEditOpen(true)}><Icon name="edit" size={14} />{T.seriesView.edit}</Btn>
            <Btn onClick={handleNewEpisode}><Icon name="plus" size={14} />{T.seriesView.newEpisode}</Btn>
            <Btn variant="danger" onClick={handleDeleteSeries}><Icon name="trash" size={14} />{T.seriesView.deleteSeries}</Btn>
          </div>
        </header>

        {/* 统计条 */}
        <div style={{ display: 'flex', gap: 10, padding: '0 28px 14px' }}>
          {[
            { k: T.seriesView.episodes, v: episodes.length },
            { k: T.seriesView.characters, v: charCount },
            { k: T.seriesView.scenes, v: sceneCount },
          ].map((s) => (
            <div key={s.k} style={{
              padding: '7px 14px', borderRadius: 9, background: 'rgba(15,23,42,0.056)',
              border: '1px solid rgba(15,23,42,0.128)', fontSize: 11.5, color: '#5b6678',
            }}>
              <b style={{ color: '#1f2937', fontSize: 14, marginRight: 5 }}>{s.v}</b>{s.k}
            </div>
          ))}
        </div>

        {/* 剧集网格 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 28px 32px' }}>
          {episodes.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '70%', color: '#7c8798', gap: 14,
            }}>
              <Icon name="film" size={40} color="#94a1b3" />
              <div style={{ fontSize: 13 }}>{T.seriesView.empty}</div>
              <Btn onClick={handleNewEpisode}><Icon name="plus" size={14} />{T.seriesView.newEpisode}</Btn>
            </div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))', gap: 14,
            }}>
              {episodes.map((ep) => (
                <ProjectCard key={ep.id} p={ep}
                  onOpen={() => onOpenEpisode?.(ep.id)} onDelete={() => onDeleteEpisode?.(ep.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateSeriesModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{ title: series.title || '', description: series.description || '' }}
        onSubmit={(d) => { onEditSeries?.(series.id, { title: d.title, description: d.description }); setEditOpen(false); }}
        titleOverride={T.seriesView.edit}
      />

      {/* 新建剧集弹窗（支持导入剧本文件 / 粘贴原文） */}
      <Modal
        open={showNewEpDlg}
        onClose={() => setShowNewEpDlg(false)}
        title={T.seriesView.newEpisode}
        width={520}
        footer={
          <Btn variant="primary" onClick={handleConfirmNewEpisode} disabled={!newEpTitle.trim()}>
            <Icon name="check" size={13} />创建
          </Btn>
        }
      >
        <Field
          label="剧集标题"
          value={newEpTitle}
          onChange={setNewEpTitle}
          placeholder="例如：第1集、第一章..."
        />

        {/* 导入剧本文件（.txt / .md / .docx） */}
        <div style={{
          padding: '16px', borderRadius: 9, textAlign: 'center', cursor: 'pointer', margin: '12px 0',
          background: 'rgba(15,23,42,0.048)', border: '1px dashed rgba(15,23,42,0.288)',
        }}
          onClick={() => document.getElementById('series-newep-input')?.click()}>
          <Icon name="upload" size={22} color="#4b5563" />
          <div style={{ fontSize: 12, color: '#5b6678', marginTop: 8 }}>
            {newEpFile ? newEpFile.name : '点击选择剧本文件（可选）'}
          </div>
          <div style={{ fontSize: 10.5, color: '#7c8798', marginTop: 4 }}>支持 .txt / .md / .docx，导入后作为本剧集原文</div>
          <input id="series-newep-input" type="file" accept=".txt,.md,.docx" hidden onChange={handlePickEpFile} />
        </div>

        <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', margin: '2px 0 10px' }}>
          — 或 —
        </div>

        {/* 粘贴原文（可选） */}
        <Field
          label="粘贴原文（可选）"
          value={newEpText}
          onChange={setNewEpText}
          placeholder="也可以直接把剧本/小说原文粘贴到这里…"
          multiline rows={6}
        />

        {newEpErr && (
          <div style={{
            padding: '8px 11px', borderRadius: 7, marginTop: 10, fontSize: 11.5, color: '#f87171',
            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.28)',
          }}>{newEpErr}</div>
        )}
      </Modal>
    </div>
  );
}
