import React, { useState } from 'react';
import { CloudBackground } from './StudioShell';
import { T, MODELS, RATIOS, defaultModelKey } from './i18n';
import { Icon, Btn, Pill, Seg, Empty, Field, Modal, glassCard } from './ui';
import { ApiSettings } from './ApiSettings';
/* ══════════ 主体库 ══════════ */
export function LibraryView({ assets = [], onSearch }) {
  const [tab, setTab] = useState('characters');
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [preview, setPreview] = useState(null);

  // 按项目分组
  const groups = {};
  (assets || []).forEach((a) => {
    const k = a.projectTitle || a.source || '未分组';
    (groups[k] = groups[k] || []).push(a);
  });
  const filtered = Object.entries(groups).map(([k, list]) => [
    k,
    list.filter((a) => (a.type || 'character') === tab)
      .filter((a) => !q.trim() || (a.name || a.title || '').toLowerCase().includes(q.toLowerCase())),
  ]);
  const total = filtered.reduce((n, [, l]) => n + l.length, 0);

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      <CloudBackground />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <header style={{
          padding: '20px 28px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1f2937' }}>{T.library.title}</h1>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={14} color="#4b5563" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.library.search}
              style={{
                paddingLeft: 30, width: 200, background: 'rgba(15,23,42,0.064)',
                border: '1px solid rgba(15,23,42,0.16)', borderRadius: 7, padding: '7px 10px 7px 30px',
                color: '#374151', fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }} />
          </div>
        </header>

        <div style={{
          padding: '0 28px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(15,23,42,0.096)',
        }}>
          <Seg options={[
            { key: 'characters', label: T.library.tabs.characters },
            { key: 'scenes', label: T.library.tabs.scenes },
            { key: 'props', label: T.library.tabs.props },
          ]} value={tab} onChange={setTab} />
          <span style={{ fontSize: 11.5, color: '#4b5563' }}>{T.library.count(total)}</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 32px' }}>
          {total === 0
            ? <Empty icon="library" text={T.library.emptyType} />
            : filtered.map(([gname, list]) => list.length === 0 ? null : (
              <div key={gname} style={{ marginBottom: 22 }}>
                <div onClick={() => setCollapsed({ ...collapsed, [gname]: !collapsed[gname] })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                    fontSize: 12.5, color: '#374151', marginBottom: 11, fontWeight: 500,
                  }}>
                  <span style={{
                    transform: collapsed[gname] ? 'rotate(-90deg)' : 'none',
                    transition: 'transform .15s', display: 'inline-block',
                  }}>▾</span>
                  {gname}
                  <span style={{ fontSize: 10.5, color: '#4b5563', fontWeight: 400 }}>· {list.length}</span>
                </div>
                {!collapsed[gname] && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                    {list.map((a) => <LibCard key={a.id} asset={a} onClick={() => setPreview(a)} />)}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* 资产预览（整卡点击即可打开） */}
      <Modal open={!!preview} onClose={() => setPreview(null)} width={460}
        title={preview?.name || preview?.title || '未命名'}
        subtitle={preview?.projectTitle || preview?.source || ''}>
        {preview && (
          <div>
            <div style={{
              aspectRatio: '3/4', maxHeight: 420, borderRadius: 10, overflow: 'hidden',
              background: 'rgba(15,23,42,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(15,23,42,0.128)',
            }}>
              {preview.url || preview.imageUrl
                ? <img src={preview.url || preview.imageUrl} alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <Icon name={preview.type === 'scene' ? 'image' : 'users'} size={40} color="#94a1b3" />}
            </div>
            {(preview.appearance || preview.desc) && (
              <div style={{
                marginTop: 12, fontSize: 12, color: '#5b6678', lineHeight: 1.7,
                background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.112)',
                borderRadius: 8, padding: '10px 12px',
              }}>{preview.appearance || preview.desc}</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function LibCard({ asset, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ overflow: 'hidden', cursor: 'pointer', ...glassCard(hover, 10) }}>
      <div style={{
        aspectRatio: '3/4', background: 'rgba(15,23,42,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {asset.url || asset.imageUrl
          ? <img src={asset.url || asset.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Icon name={asset.type === 'scene' ? 'image' : 'users'} size={26} color="#7c8798" />}
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          fontSize: 12.5, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{asset.name || asset.title || '未命名'}</div>
        <div style={{
          fontSize: 10.5, color: '#4b5563', marginTop: 3, lineHeight: 1.45,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{asset.appearance || asset.desc || ''}</div>
      </div>
    </div>
  );
}

/* ══════════ 设置（三块）═════════ */
export function SettingsView({ onSave }) {
  // 各分类默认模型（打开时从设置回显，否则取列表第一项）
  const categories = ['image', 'video', 'tts', 'music', 'post'];
  const [models, setModels] = useState(() => {
    const init = {};
    categories.forEach((c) => { init[c] = defaultModelKey(c); });
    return init;
  });
  const [ratios, setRatios] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('APP_SETTINGS') || '{}');
      const def = { character: '9:16', scene: '16:9', prop: '1:1', shot: '16:9', video: '9:16' };
      return { ...def, ...(s.defaultRatios || {}) };
    } catch { return { character: '9:16', scene: '16:9', prop: '1:1', shot: '16:9', video: '9:16' }; }
  });
  const [prompts, setPrompts] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('APP_SETTINGS') || '{}');
      return s.defaultPrompts || { storyboard: '', i2v: '', ref: '' };
    } catch { return { storyboard: '', i2v: '', ref: '' }; }
  });

  const setModel = (cat, key) => setModels((m) => ({ ...m, [cat]: key }));
  const saveAll = () => onSave?.({ models, ratios, prompts });

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      <CloudBackground />
      <div style={{
        position: 'relative', zIndex: 1, height: '100%', overflowY: 'auto',
        padding: '20px 28px 40px',
      }}>
        <h1 style={{ margin: '0 0 18px', fontSize: 17, fontWeight: 600, color: '#1f2937' }}>
          {T.settings.title}
        </h1>

        <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ① 模型配置（API Key）—— 开源版核心设置，置于最前 */}
          <ApiSettings />

          {/* ② 默认模型设置 */}
          <Card icon="sparkle" title={T.settings.model.title} desc={T.settings.model.desc} tone="purple">
            <ModelSelect label={T.settings.model.image} value={models.image} onChange={(v) => setModel('image', v)} options={MODELS.image} />
            <RatioRow label={T.settings.model.ratioCharacter} value={ratios.character}
              onChange={(v) => setRatios({ ...ratios, character: v })} />
            <RatioRow label={T.settings.model.ratioScene} value={ratios.scene}
              onChange={(v) => setRatios({ ...ratios, scene: v })} />
            <RatioRow label={T.settings.model.ratioProp} value={ratios.prop}
              onChange={(v) => setRatios({ ...ratios, prop: v })} />
            <RatioRow label={T.settings.model.ratioShot} value={ratios.shot}
              onChange={(v) => setRatios({ ...ratios, shot: v })} />

            <div style={{ height: 1, background: 'rgba(15,23,42,0.112)', margin: '12px 0' }} />
            <ModelSelect label={T.settings.model.video} value={models.video} onChange={(v) => setModel('video', v)} options={MODELS.video} />
            <RatioRow label={T.settings.model.ratioVideo} value={ratios.video}
              onChange={(v) => setRatios({ ...ratios, video: v })} />

            <div style={{ height: 1, background: 'rgba(15,23,42,0.112)', margin: '12px 0' }} />
            <ModelSelect label={T.settings.model.tts} value={models.tts} onChange={(v) => setModel('tts', v)} options={MODELS.tts} />

            <div style={{ height: 1, background: 'rgba(15,23,42,0.112)', margin: '12px 0' }} />
            <ModelSelect label={T.settings.model.music} value={models.music} onChange={(v) => setModel('music', v)} options={MODELS.music} />

            <div style={{ height: 1, background: 'rgba(15,23,42,0.112)', margin: '12px 0' }} />
            <ModelSelect label={T.settings.model.post} value={models.post} onChange={(v) => setModel('post', v)} options={MODELS.post} />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Btn variant="primary" onClick={saveAll}>
                <Icon name="save" size={13} />{T.settings.model.save}
              </Btn>
            </div>
          </Card>

          {/* ③ 默认提示词配置 */}
          <Card icon="file" title={T.settings.prompt.title} desc={T.settings.prompt.desc} tone="default">
            <Field label={T.settings.prompt.storyboard} value={prompts.storyboard}
              onChange={(v) => setPrompts({ ...prompts, storyboard: v })}
              multiline rows={2} hint={T.settings.prompt.storyboardDesc} />
            <Field label={T.settings.prompt.i2v} value={prompts.i2v}
              onChange={(v) => setPrompts({ ...prompts, i2v: v })}
              multiline rows={2} hint={T.settings.prompt.i2vDesc} />
            <Field label={T.settings.prompt.ref} value={prompts.ref}
              onChange={(v) => setPrompts({ ...prompts, ref: v })}
              multiline rows={2} hint={T.settings.prompt.refDesc} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Btn variant="primary" onClick={saveAll}>
                <Icon name="save" size={13} />{T.settings.prompt.save}
              </Btn>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}


function Card({ icon, title, desc, tone = 'default', children }) {
  const tc = tone === 'orange' ? '#f59e0b' : tone === 'purple' ? '#6d28d9' : '#5b6678';
  const bg = tone === 'orange' ? 'rgba(245,158,11,.1)' : tone === 'purple' ? 'rgba(109,40,217,.13)' : 'rgba(15,23,42,0.096)';
  return (
    <div style={{
      padding: 18, borderRadius: 11,
      background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.128)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name={icon} size={15} color={tc} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1f2937' }}>{title}</div>
          {desc && <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2, lineHeight: 1.55 }}>{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function ModelSelect({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, color: '#5b6678', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => (
          <button key={o.key} onClick={() => onChange(o.key)} title={o.desc}
            style={{
              padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 11.5,
              fontFamily: 'inherit', border: '1px solid',
              borderColor: value === o.key ? '#8b5cf6' : 'rgba(15,23,42,0.192)',
              background: value === o.key ? 'rgba(109,40,217,.22)' : 'rgba(15,23,42,0.048)',
              color: value === o.key ? '#6d28d9' : '#5b6678',
              fontWeight: value === o.key ? 600 : 400, transition: 'all .15s',
            }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RatioRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
      <span style={{ fontSize: 11, color: '#4b5563' }}>{label}</span>
      <Seg options={RATIOS.map((r) => ({ key: r, label: r }))} value={value} onChange={onChange} />
    </div>
  );
}
