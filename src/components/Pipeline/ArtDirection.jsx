import React, { useState } from 'react';
import { DispatchGlmClient } from '@dual/glm-client';
import { PROMPT_RECOMMEND_STYLES, parseJsonLax } from '../../lib/prompts.js';

// 注：模型由调度机服务端配置决定（客户端传 model 无效），这里不再保留本地默认模型常量。

export const QUICK_STYLES = [
  { key: 'real', label: '写实电影', icon: '🎬', desc: '电影级写实风格', prompt_en: 'cinematic, film grain, natural lighting, realistic skin texture, anamorphic lens' },
  { key: 'anime', label: '动漫', icon: '✨', desc: '日式动漫风格', prompt_en: 'anime style, vibrant colors, cel shading, Japanese animation aesthetic, detailed eyes' },
  { key: 'semireal', label: '半写实', icon: '🎭', desc: '半写实半卡通', prompt_en: 'semi-realistic, hybrid style, soft lighting, slightly stylized features, digital painting' },
  { key: 'watercolor', label: '水墨', icon: '🖌️', desc: '中国传统水墨', prompt_en: 'watercolor painting, soft edges, traditional Chinese ink style, ethereal atmosphere, brush strokes visible' },
];

export function ArtDirection({ project, update, log }) {
  const ad = project.artDirection || {};
  const [styles, setStyles] = useState(ad.custom_styles || []);
  const [selectedId, setSelectedId] = useState(ad.style || '');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builder, setBuilder] = useState({ name: '', prompt_en: '', prompt_cn: '', negative: '' });

  const selected = styles.find(s => s.id === selectedId) || null;

  // 兼容：script 既可能是字符串（当前模型），也可能是 { text } 对象（历史数据）
  const scriptText = typeof project?.script === 'string'
    ? project.script
    : (project?.script?.text || '');

  const recommendStyles = async () => {
    if (!scriptText.trim()) {
      alert('请先上传或撰写剧本');
      return;
    }
    setBusy(true);
    setLoading(true);
    try {
      const client = new DispatchGlmClient();
      const prompt = PROMPT_RECOMMEND_STYLES.replace('{{script_text}}', scriptText.substring(0, 3000));
      // llm_type 决定服务端扣费档；服务端不接受 model（模型由服务端配置写死）
      const res = await client.chat(prompt, {
        llmType: 'script_analyze',
        maxTokens: 2500,
        temperature: 0.7,
      });
      let parsed = parseJsonLax(typeof res === 'string' ? res : (res?.content || res?.text || ''));
      if (!Array.isArray(parsed)) parsed = [parsed];
      const custom_styles = parsed.map((s, i) => ({
        id: 'rec_' + Date.now() + '_' + i,
        name: s.style_name_cn || s.styleName || ('风格 ' + (i + 1)),
        prompt_en: s.positional_prompt || s.positive || '',
        prompt_cn: s.style_description_cn || s.description || '',
        negative: s.negative_prompt || '',
        reason: s.reason_cn || s.reason || '',
        source: 'ai',
        usage_count: 0,
      }));
      setStyles(prev => [...prev, ...custom_styles]);
      log(`✅ AI 推荐了 ${custom_styles.length} 种艺术风格`);
    } catch (e) {
      log(`❌ 推荐失败：${e.message}`);
      alert('推荐失败：' + e.message);
    } finally {
      setBusy(false);
      setLoading(false);
    }
  };

  const addCustomStyle = () => {
    if (!builder.name.trim()) { alert('请填写风格名称'); return; }
    const newStyle = {
      id: 'custom_' + Date.now(),
      name: builder.name.trim(),
      prompt_en: builder.prompt_en.trim(),
      prompt_cn: builder.prompt_cn.trim(),
      negative: builder.negative.trim(),
      source: 'user',
      usage_count: 0,
    };
    setStyles(prev => [...prev, newStyle]);
    setBuilder({ name: '', prompt_en: '', prompt_cn: '', negative: '' });
    setShowBuilder(false);
    log(`✅ 已添加自定义风格：${newStyle.name}`);
  };

  const applyStyle = (id) => {
    const newStyleId = selectedId === id ? null : id;
    // 更新 usage_count
    const updatedStyles = styles.map(s =>
      s.id === id ? { ...s, usage_count: (s.usage_count || 0) + 1 } : s
    );
    setStyles(updatedStyles);
    setSelectedId(newStyleId);
    const newAd = { ...ad, style: newStyleId, custom_styles: updatedStyles };
    update({ ...project, artDirection: newAd });
    if (newStyleId) {
      const s = updatedStyles.find(x => x.id === newStyleId);
      log(`🎨 艺术风格已设为: ${s?.name || '自定义'}`);
    } else {
      log('🎨 已取消风格选择');
    }
  };

  const deleteStyle = (id, e) => {
    e.stopPropagation();
    const newStyles = styles.filter(s => s.id !== id);
    setStyles(newStyles);
    if (selectedId === id) setSelectedId(null);
    const newAd = { ...ad, custom_styles: newStyles, style: selectedId === id ? null : ad.style };
    update({ ...project, artDirection: newAd });
    log('🗑️ 已删除风格');
  };

  return (
    <div style={{ padding: 24, color: '#fff', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>🎨 艺术指导</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>
          选择整体视觉风格，将影响后续所有生图和生视频任务
        </p>
      </div>

      {/* 推荐按钮 */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={recommendStyles}
          disabled={busy || loading}
          style={{
            padding: '10px 20px',
            background: loading ? 'rgba(124,58,237,0.5)' : 'linear-gradient(135deg, #7c3aed, #2563eb)',
            border: 'none', borderRadius: 8, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {loading ? '⏳ AI 分析中...' : '🤖 AI 推荐风格'}
        </button>
        <button
          onClick={() => setShowBuilder(!showBuilder)}
          style={{
            padding: '10px 20px',
            background: 'rgba(15,23,42,0.08)',
            border: '1px solid rgba(15,23,42,0.24)', borderRadius: 8, color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer', fontSize: 13,
          }}
        >
          ✏️ 自建风格
        </button>
      </div>

      {/* 自建表单 */}
      {showBuilder && (
        <div style={{ background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.16)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>新增自定义风格</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input
              placeholder="风格名称（如：赛博霓虹）"
              value={builder.name}
              onChange={e => setBuilder({ ...builder, name: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="中文描述（可选）"
              value={builder.prompt_cn}
              onChange={e => setBuilder({ ...builder, prompt_cn: e.target.value })}
              style={inputStyle}
            />
          </div>
          <textarea
            placeholder="英文正向提示词（影响生图/生视频效果）"
            value={builder.prompt_en}
            onChange={e => setBuilder({ ...builder, prompt_en: e.target.value })}
            rows={3}
            style={{ ...inputStyle, width: '100%', marginBottom: 10, resize: 'vertical' }}
          />
          <textarea
            placeholder="负向提示词（避免的元素，可选）"
            value={builder.negative}
            onChange={e => setBuilder({ ...builder, negative: e.target.value })}
            rows={2}
            style={{ ...inputStyle, width: '100%', marginBottom: 12, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={addCustomStyle} style={{ ...btnPrimary, padding: '8px 16px' }}>✓ 保存</button>
            <button onClick={() => setShowBuilder(false)} style={{ ...btnSecondary, padding: '8px 16px' }}>取消</button>
          </div>
        </div>
      )}

      {/* 快捷风格 */}
      <div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>快捷风格</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {QUICK_STYLES.map((s) => {
            const isSelected = selectedId === s.key;
            return (
              <button key={s.key} onClick={() => applyStyle(s.key)} style={{
                background: isSelected ? 'rgba(124,58,237,0.25)' : 'rgba(15,23,42,0.064)',
                border: `1px solid ${isSelected ? '#7c3aed' : 'rgba(15,23,42,0.128)'}`,
                borderRadius: 10, padding: 16, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{s.label}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{s.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* AI 推荐/自定义风格列表 */}
      {styles.length > 0 && (
        <div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            AI 推荐 / 自定义风格 ({styles.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {styles.map((s) => {
              const isSelected = selectedId === s.id;
              return (
                <div key={s.id} onClick={() => applyStyle(s.id)} style={{
                  background: isSelected ? 'rgba(124,58,237,0.2)' : 'rgba(15,23,42,0.048)',
                  border: `1px solid ${isSelected ? '#7c3aed' : 'rgba(15,23,42,0.128)'}`,
                  borderRadius: 10, padding: 14, cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
                }}>
                  <button onClick={(e) => deleteStyle(s.id, e)} style={{
                    position: 'absolute', top: 8, right: 8, background: 'rgba(239,68,68,0.2)',
                    border: 'none', borderRadius: 4, color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: '2px 6px',
                  }}>✕</button>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, paddingRight: 24 }}>{s.name}</div>
                  {s.prompt_cn && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4 }}>{s.prompt_cn}</div>}
                  {s.prompt_en && <div style={{ color: 'rgba(15,23,42,0.35)', fontSize: 10, fontFamily: 'monospace' }}>{s.prompt_en.substring(0, 60)}...</div>}
                  {s.reason && <div style={{ color: 'rgba(124,58,237,0.8)', fontSize: 10, marginTop: 6 }}>{s.reason}</div>}
                  {s.usage_count > 0 && (
                    <div style={{ color: 'rgba(15,23,42,0.35)', fontSize: 10, marginTop: 4 }}>已使用 {s.usage_count} 次</div>
                  )}
                  {isSelected && (
                    <div style={{ color: '#7c3aed', fontSize: 11, fontWeight: 600, marginTop: 6 }}>✓ 已选中</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 当前选中提示 */}
      {selected && (
        <div style={{ padding: 14, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 8 }}>
          <div style={{ color: '#7c3aed', fontWeight: 600, marginBottom: 6 }}>✓ 当前风格：{selected.name}</div>
          {selected.prompt_en && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace' }}>{selected.prompt_en}</div>}
          {selected.negative && <div style={{ color: 'rgba(239,68,68,0.6)', fontSize: 12, marginTop: 4 }}>避免：{selected.negative}</div>}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 12px', background: 'rgba(15,23,42,0.08)',
  border: '1px solid rgba(15,23,42,0.24)', borderRadius: 6, color: '#fff', fontSize: 13, boxSizing: 'border-box',
};
const btnPrimary = { padding: '8px 16px', background: '#7c3aed', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 };
const btnSecondary = { padding: '8px 16px', background: 'rgba(15,23,42,0.08)', border: '1px solid rgba(15,23,42,0.24)', borderRadius: 6, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 13 };
