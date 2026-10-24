import React, { useState } from 'react';
import { T, MODELS, defaultModelKey, defaultRatio } from './i18n';
import { Icon, Btn, Pill, Seg, Empty, Field, SectionTitle, Modal } from './ui';
import { DispatchGlmClient } from '@dual/glm-client';
import {
  PROMPT_EXTRACT_ENTITIES, PROMPT_EXTRACT_ENTITIES_SYSTEM, PROMPT_RECOMMEND_STYLES,
  PROMPT_JSON_ONLY_SYSTEM, parseJsonLax, splitTextByLength,
  entityBaseName, entityDisplayName, entityKey, splitAppearance,
  buildWorkbenchPrompt, buildVariantImg2ImgPrompt,
  PROMPT_COSTUME_FROM_SCRIPT, pickCostumeExcerpt, cleanOutfitText,
} from '../../lib/prompts.js';
import { NEG_BASE } from '../../lib/asset-anatomy.js';
import { img2imgImage } from '../../dispatch-jobs.js';
import { generatePanelImage } from '../../lib/image-workflows.js';

const P = { padding: '18px 22px' };

// ── 实体抽取参数 ────────────────────────────────────────────────
// 旧实现把整篇剧本原样塞进提示词、maxTokens 只有 2000：长剧本必然被截断成半个 JSON，
// 解析直接失败。现改为：按 12000 字分段逐段抽取 + 每段失败重试 2 次（重试时降温并强调 JSON）。
const EXTRACT_CHUNK = 12000;       // 单次喂给 LLM 的剧本字数上限
const EXTRACT_MAX_TOKENS = 4000;   // 服务端默认 2048，抽取场景需要更长
const EXTRACT_TEMP = 0.3;          // 结构化 JSON 输出用低温，保证名字与格式稳定
const EXTRACT_TEMP_RETRY = 0.1;
const EXTRACT_RETRY = 2;           // 每段额外重试次数（服务端自身已重试 3 次网络层）

/* ══════════════ 步骤 1：剧本 ══════════════ */
export function ScriptStep({ project, update, log, onOpenEntity }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const chars = project?.materials?.characters || [];
  const scenes = project?.materials?.scenes || [];
  const props = project?.materials?.props || [];
  // 🔴 列表恒从 project.materials 派生（而不是抽取瞬间的本地快照），
  //    这样在实体弹窗里改完描述会立刻反映到面板上，不会出现「改了但没变」的错觉。
  const list = [...chars, ...scenes, ...props];

  /**
   * 把 LLM 返回的一类实体收进收集桶：丢弃无名项、按「本名」去重、
   * 重名时保留描述更完整的那条（长剧本分段抽取时后段往往写得更细）。
   *
   * 🔴 抽取阶段一人一条：variant 恒为空串，同一个人无论 LLM 返回了几套造型
   *    （顾拾遗·戏装扮相 / 顾拾遗·日常便服）都会在本步合并成「顾拾遗」一条。
   *    换装造型统一留到「资产」环节派生，避免同一个人物在素材列表里分裂成多条。
   */
  const mergeInto = (bucket, items) => {
    for (const it of items || []) {
      if (!it || typeof it !== 'object') continue;
      const rawName = String(it.name ?? it.title ?? '').trim();
      if (!rawName) continue;                               // 无名实体：下游按名匹配，留着只会污染
      // 造型标签一律丢弃：即使 LLM 硬塞了 variant 或「名字·造型」，也归并到本名
      const entry = {
        baseName: entityBaseName(rawName),                  // 本名（去造型标签与身份后缀）
        variant: '',
        name: entityBaseName(rawName),                      // 显示名 = 本名，一人一条
        description: String(it.description ?? it.desc ?? it.appearance ?? '').trim(),
      };
      const hit = bucket.find((x) => entityKey(x) === entityKey(entry));
      if (hit) { if (entry.description.length > (hit.description || '').length) hit.description = entry.description; }
      else bucket.push(entry);
    }
  };

  const extract = async () => {
    const script = project?.script || '';
    setErr(null);
    setOkMsg(null);
    if (!script.trim()) {
      setErr('请先输入剧本内容');
      log?.("请先输入剧本内容");
      return;
    }
    setLoading(true);
    try {
      const client = new DispatchGlmClient();
      const chunks = splitTextByLength(script, EXTRACT_CHUNK);
      if (chunks.length > 1) log?.(`剧本较长，分 ${chunks.length} 段抽取…`);

      const collected = { characters: [], scenes: [], props: [] };
      for (let ci = 0; ci < chunks.length; ci++) {
        const base = PROMPT_EXTRACT_ENTITIES.replace('{{script_text}}', chunks[ci]);
        let parsed = null;
        let lastMsg = '';
        for (let attempt = 0; attempt <= EXTRACT_RETRY; attempt++) {
          const prompt = attempt === 0
            ? base
            : `${base}\n\n【重要】上一次输出无法解析为 JSON（${lastMsg}）。请严格只输出一个 JSON 对象，顶层键为 characters / scenes / props，不要任何解释文字、不要用代码围栏。`;
          try {
            const raw = await client.chat(prompt, {
              system: PROMPT_EXTRACT_ENTITIES_SYSTEM,
              llmType: 'character_extract',   // 服务端按功能档计费（2.0 分）
              maxTokens: EXTRACT_MAX_TOKENS,
              temperature: attempt === 0 ? EXTRACT_TEMP : EXTRACT_TEMP_RETRY,
            });
            parsed = parseJsonLax(raw || '');
            break;
          } catch (e) {
            lastMsg = e?.message || String(e);
          }
        }
        if (!parsed) {
          if (chunks.length > 1) { log?.(`第 ${ci + 1}/${chunks.length} 段抽取失败，跳过：${lastMsg}`); continue; }
          throw new Error(`解析失败：${lastMsg}`);
        }
        mergeInto(collected.characters, Array.isArray(parsed.characters) ? parsed.characters : []);
        mergeInto(collected.scenes, Array.isArray(parsed.scenes) ? parsed.scenes : []);
        mergeInto(collected.props, Array.isArray(parsed.props) ? parsed.props : []);
      }

      const total = collected.characters.length + collected.scenes.length + collected.props.length;
      if (!total) throw new Error('未识别到任何角色/场景/道具');

      const stamp = Date.now();
      const toEntities = (arr, type, prefix) => arr.map((c, i) => ({
        id: `${prefix}_${stamp}_${i}`,
        type,
        name: c.name,                       // 显示名（一人一条，等于本名）
        baseName: c.baseName,               // 本名
        variant: '',                        // 抽取阶段不做造型变体，资产环节再派生
        appearance: c.description || '',
        desc: c.description || '',
      }));
      const newChars = toEntities(collected.characters, 'character', 'char');
      const newScenes = toEntities(collected.scenes, 'scene', 'scene');
      const newProps = toEntities(collected.props, 'prop', 'prop');
      const all = [...newChars, ...newScenes, ...newProps];

      // 同步写回 project.materials，供后续步骤（艺术指导 / 资产 / 分镜）复用。
      // 合并策略：保留已有实体（继承来的首集资产 / 已手动调好的），仅补充本次新提取且不同名的，
      // 既不覆盖继承资产、也不重复追加（已有版本优先）。
      // 🔴 抽取阶段一人一条：写入前先把已有数据里「同一角色的旧造型变体」清掉
      //    （variant 非空，或名字带「·造型」后缀），否则重新抽取后旧的一人多套会继续挂在列表里。
      //    只清顶层本名命中本次抽取结果的条目，其它角色/场景/道具原样保留；
      //    用户手动「派生造型」出来的条目带 derivedFrom，属于资产阶段成果，一律保留不动。
      const pickedNames = new Set(collected.characters.map((c) => c.baseName));
      const dropStaleVariants = (existing = []) => (existing || []).filter((e) => {
        if (e && e.derivedFrom) return true;                       // 手动派生的造型：保留
        const bn = entityBaseName(e.baseName || e.name || '');
        if (!pickedNames.has(bn)) return true;                     // 本次没抽到的角色：不动
        return !String(e.variant || '').trim() && !/[·・]/.test(String(e.name || ''));
      });
      const mergeKeep = (existing = [], incoming = []) => {
        const keys = new Set((existing || []).map((e) => entityKey(e)).filter(Boolean));
        const added = (incoming || []).filter((e) => !keys.has(entityKey(e)));
        return [...(existing || []), ...added];
      };
      update?.({
        ...project,
        materials: {
          ...(project?.materials || {}),
          characters: mergeKeep(dropStaleVariants(project?.materials?.characters), newChars),
          scenes: mergeKeep(project?.materials?.scenes, newScenes),
          props: mergeKeep(project?.materials?.props, newProps),
        },
      });
      const summary = `已识别 ${all.length} 个关键要素（${newChars.length} 角色 / ${newScenes.length} 场景 / ${newProps.length} 道具）`;
      setOkMsg(summary);
      log?.(summary);
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(`提取失败：${msg}`);
      log?.(`提取失败：${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const words = (project?.script || '').length;
  const estMin = Math.max(1, Math.round(words / 300));

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* 剧本编辑器 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(15,23,42,0.096)' }}>
        <div style={{ ...P, paddingBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="file" size={16} color="#6d28d9" />
            <span style={{ fontSize: 14.5, fontWeight: 600, color: '#1f2937' }}>{T.script.editor}</span>
          </div>
          <Btn size="sm" onClick={extract} disabled={loading} loading={loading}>
            <Icon name="sparkle" size={13} />{T.script.extract}
          </Btn>
        </div>
        <div style={{ flex: 1, padding: '0 22px 18px', overflow: 'hidden' }}>
          <textarea
            value={project?.script || ''}
            onChange={(e) => update?.({ ...project, script: e.target.value })}
            placeholder="粘贴小说或剧本内容..."
            style={{
              width: '100%', height: '100%', background: 'rgba(15,23,42,0.048)',
              border: '1px solid rgba(15,23,42,0.128)', borderRadius: 9, padding: 16,
              color: '#374151', fontSize: 13, lineHeight: 1.8, resize: 'none',
              fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* 实体识别面板 */}
      <div style={{ width: 330, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ ...P, paddingBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1f2937' }}>{T.script.panel}</div>
          <div style={{ fontSize: 11, color: '#4b5563', marginTop: 3 }}>
            {list.length ? T.script.recognized(list.length) : '点击「提取实体」以识别'}
          </div>
          {loading && (
            <div style={{ fontSize: 11, color: '#6d28d9', marginTop: 6 }}>正在调用 DeepSeek 识别中…</div>
          )}
          {okMsg && !loading && (
            <div style={{ fontSize: 11, color: '#34d399', marginTop: 6 }}>✓ {okMsg}</div>
          )}
          {err && !loading && (
            <div style={{ fontSize: 11, color: '#f87171', marginTop: 6, lineHeight: 1.5, wordBreak: 'break-all' }}>⚠ {err}</div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 16px' }}>
          {list.length === 0
            ? <Empty icon="users" text="尚未提取实体" />
            : list.map((e, i) => (
              <div key={e.id || i} onClick={() => onOpenEntity?.(e)}
                style={{
                  padding: '10px 12px', borderRadius: 8, marginBottom: 7, cursor: 'pointer',
                  background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.112)',
                  display: 'flex', gap: 9, alignItems: 'flex-start', transition: 'all .15s',
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = 'rgba(109,40,217,.4)'; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = 'rgba(15,23,42,0.112)'; }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                  background: 'rgba(109,40,217,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={e.type === 'scene' ? 'image' : e.type === 'prop' ? 'layers' : 'users'} size={14} color="#6d28d9" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: '#1f2937', fontWeight: 500 }}>{e.name || e.title}</div>
                  <div style={{ fontSize: 11, color: '#4b5563', marginTop: 3, lineHeight: 1.5 }}>
                    {e.appearance || e.desc || e.description || ''}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/** Script 上下文栏 */
export function ScriptContext({ project }) {
  const words = (project?.script || '').length;
  const chars = (project?.materials?.characters || []).length;
  const scenes = (project?.materials?.scenes || []).length;
  const est = Math.max(1, Math.round(words / 300));
  const st = project?.artDirection || {};
  return (
    <>
      <CtxHead label="SCRIPT" />
      <CtxBlock title={T.script.stats}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          <CtxStat label={T.script.words} value={words} />
          <CtxStat label={T.script.chars} value={chars} />
          <CtxStat label={T.script.scenes} value={scenes} />
          <CtxStat label={T.script.estDur} value={`~${est}m`} />
        </div>
      </CtxBlock>
      <CtxBlock title={T.script.notes}>
        <textarea placeholder="在此记录想法…" rows={3}
          style={{
            width: '100%', background: 'rgba(15,23,42,0.064)', border: '1px solid rgba(15,23,42,0.144)',
            borderRadius: 6, padding: '7px 9px', color: '#374151', fontSize: 11.5,
            fontFamily: 'inherit', resize: 'vertical', outline: 'none',
          }} />
      </CtxBlock>
      <CtxBlock title={T.script.style}>
        <CtxField label={T.script.styleName} value={st.name || T.empty.styleNone} />
        <CtxField label={T.script.positive} value={st.positive || T.empty.positiveNone} multiline />
        <CtxField label={T.script.negative} value={st.negative || ''} multiline />
        <div style={{ fontSize: 10, color: '#4b5563', marginTop: 6 }}>💡 {T.script.tip}</div>
      </CtxBlock>
    </>
  );
}

/* ══════════════ 步骤 2：艺术指导 ══════════════ */
export function ArtDirectionStep({ project, update, log, applyStyle, onApply }) {
  const [selected, setSelected] = useState(project?.artDirection?.preset || 'ink');
  const [editing, setEditing] = useState({
    name: project?.artDirection?.name || T.presets[0].name,
    positive: project?.artDirection?.positive || T.presets[0].tags.join(', '),
    negative: project?.artDirection?.negative || 'photorealistic, 3d render, bright colors, sharp details',
  });
  // DeepSeek 读剧本推荐（3 种）
  const [aiStyles, setAiStyles] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState(null);
  const [aiMsg, setAiMsg] = useState(null);
  // 用户自建风格
  const [customStyles, setCustomStyles] = useState(project?.artDirection?.custom_styles || []);
  const [showBuilder, setShowBuilder] = useState(false);
  const [builder, setBuilder] = useState({ name: '', positive: '', negative: '' });

  // 兼容：script 可能是字符串（当前模型）或 { text } 对象（历史数据）
  const scriptText = typeof project?.script === 'string'
    ? project.script
    : (project?.script?.text || '');

  const tagsOf = (p) => (Array.isArray(p?.tags) ? p.tags : String(p?.positive || '').split(',').map((s) => s.trim()).filter(Boolean));

  const pick = (p) => {
    setSelected(p.en);
    const pos = p.positive || tagsOf(p).join(', ');
    setEditing({ name: p.name, positive: pos, negative: p.negative || editing.negative });
  };

  const apply = () => {
    const ad = { ...editing, preset: selected };
    update?.({ ...project, artDirection: { ...(project?.artDirection || {}), ...ad, custom_styles: customStyles }, dramaType: 'real' });
    applyStyle?.(ad);
    log?.(`已应用风格：${editing.name}`);
    onApply?.();
  };

  /** 让 DeepSeek 读剧本，推荐 3 种贴合的艺术风格 */
  const analyzeScript = async () => {
    setAiErr(null);
    setAiMsg(null);
    if (!scriptText.trim()) {
      setAiErr('请先在步骤 01 撰写或粘贴剧本内容');
      return;
    }
    setAiBusy(true);
    try {
      const client = new DispatchGlmClient();
      const prompt = PROMPT_RECOMMEND_STYLES.replace('{{script_text}}', scriptText.slice(0, 6000));
      // 🔴 服务端 /api/llm/chat 不接受 model（模型由服务端写死），只认 llm_type 计费标识
      const raw = await client.chat(prompt, {
        system: PROMPT_JSON_ONLY_SYSTEM,  // 风格推荐返回 JSON 数组，同样要求「只吐合法 JSON」
        llmType: 'script_analyze',
        maxTokens: 2500,
        temperature: 0.7,
      });
      const text = typeof raw === 'string' ? raw : (raw?.content || raw?.text || '');
      let parsed = parseJsonLax(text);
      if (!Array.isArray(parsed)) parsed = [parsed];
      const styles = parsed.slice(0, 3).map((s, i) => {
        const pos = s.positional_prompt || s.positive || s.prompt_en || '';
        return {
          en: s.style_name_en || s.styleName || s.en || ('ai_' + i),
          name: s.style_name_cn || s.name || ('推荐风格 ' + (i + 1)),
          desc: s.style_description_cn || s.description || s.desc || '',
          positive: pos,
          negative: s.negative_prompt || s.negative || '',
          reason: s.reason_cn || s.reason || '',
          tags: String(pos).split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3),
          ai: true,
        };
      });
      setAiStyles(styles);
      setAiMsg(`DeepSeek 已根据剧本推荐 ${styles.length} 种风格`);
      log?.(`AI 已根据剧本推荐 ${styles.length} 种风格`);
    } catch (e) {
      const m = e?.message || String(e);
      setAiErr('推荐失败：' + m);
      log?.('风格推荐失败：' + m);
    } finally {
      setAiBusy(false);
    }
  };

  /** 保存用户自建风格 */
  const saveCustom = () => {
    if (!builder.name.trim() || !builder.positive.trim()) return;
    const one = {
      en: 'custom_' + Date.now(),
      name: builder.name.trim(),
      desc: builder.positive.trim().slice(0, 80),
      positive: builder.positive.trim(),
      negative: builder.negative.trim(),
      tags: builder.positive.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3),
      custom: true,
    };
    const next = [...customStyles, one];
    setCustomStyles(next);
    update?.({ ...project, artDirection: { ...(project?.artDirection || {}), custom_styles: next } });
    setShowBuilder(false);
    setBuilder({ name: '', positive: '', negative: '' });
    pick(one);
    log?.('已保存自定义风格：' + one.name);
  };

  return (
    <div style={{ ...P, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="palette" size={17} color="#6d28d9" />
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 600, color: '#1f2937' }}>{T.art.title}</div>
            <div style={{ fontSize: 11.5, color: '#4b5563', marginTop: 2 }}>{T.art.subtitle}</div>
          </div>
        </div>
        <Btn variant="primary" onClick={apply}>{T.art.apply}</Btn>
      </div>

      {/* AI 智能推荐（DeepSeek 读剧本）+ 用户自建 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="sparkle" size={14} color="#f59e0b" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{T.art.aiTitle}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="sm" onClick={() => { setBuilder({ name: '', positive: '', negative: '' }); setShowBuilder(true); }}>
            <Icon name="plus" size={12} />自建风格
          </Btn>
          <Btn size="sm" variant="primary" onClick={analyzeScript} disabled={aiBusy}>
            <Icon name="sparkle" size={12} />{aiBusy ? '分析中…' : T.art.analyze}
          </Btn>
        </div>
      </div>
      {aiBusy && (
        <div style={{ fontSize: 11.5, color: '#6d28d9', marginBottom: 10 }}>正在调用 DeepSeek 阅读剧本…</div>
      )}
      {aiMsg && !aiBusy && (
        <div style={{ fontSize: 11.5, color: '#34d399', marginBottom: 10 }}>✓ {aiMsg}</div>
      )}
      {aiErr && !aiBusy && (
        <div style={{ fontSize: 11.5, color: '#f87171', marginBottom: 10, lineHeight: 1.5, wordBreak: 'break-all' }}>⚠ {aiErr}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 11, marginBottom: 24 }}>
        {(aiStyles.length ? aiStyles : T.presets.slice(0, 3)).map((p) => (
          <StyleCard key={p.en} preset={p} active={selected === p.en} onClick={() => pick(p)}
            showReason={aiStyles.length > 0} />
        ))}
      </div>

      {/* 内置风格预设 */}
      <SectionTitle>{T.art.presets}</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {T.presets.map((p) => (
          <StyleCard key={p.en} preset={p} active={selected === p.en} onClick={() => pick(p)} />
        ))}
      </div>

      {/* 我的自定义风格 */}
      {customStyles.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <SectionTitle>我的自定义风格</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {customStyles.map((p) => (
              <StyleCard key={p.en} preset={p} active={selected === p.en} onClick={() => pick(p)} />
            ))}
          </div>
        </div>
      )}

      {/* 自建风格弹窗 */}
      <Modal
        open={showBuilder}
        onClose={() => setShowBuilder(false)}
        title="自建风格"
        width={460}
        footer={
          <Btn variant="primary" onClick={saveCustom} disabled={!builder.name.trim() || !builder.positive.trim()}>
            <Icon name="save" size={13} />{T.art.saveCustom}
          </Btn>
        }
      >
        <Field label={T.art.name} value={builder.name}
          onChange={(v) => setBuilder({ ...builder, name: v })} placeholder="例如：冷调悬疑" />
        <Field label={T.art.positive} value={builder.positive} multiline rows={3}
          onChange={(v) => setBuilder({ ...builder, positive: v })}
          placeholder="cold color grading, moody atmosphere, ..." hint={T.art.positiveDesc} />
        <Field label={T.art.negative} value={builder.negative} multiline rows={2}
          onChange={(v) => setBuilder({ ...builder, negative: v })}
          placeholder="warm tones, bright highlights, ..." hint={T.art.negativeDesc} />
      </Modal>
    </div>
  );
}

function StyleCard({ preset, active, onClick, showReason }) {
  const tags = Array.isArray(preset?.tags)
    ? preset.tags
    : String(preset?.positive || '').split(',').map((s) => s.trim()).filter(Boolean);
  return (
    <div onClick={onClick} style={{
      background: active ? 'rgba(109,40,217,.13)' : 'rgba(15,23,42,0.048)',
      border: `1px solid ${active ? 'rgba(109,40,217,.55)' : 'rgba(15,23,42,0.128)'}`,
      borderRadius: 10, padding: 14, cursor: 'pointer', transition: 'all .16s',
      position: 'relative',
    }}>
      {active && (
        <div style={{
          position: 'absolute', top: 9, right: 9, width: 17, height: 17, borderRadius: '50%',
          background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="check" size={11} color="#fff" strokeWidth={3} /></div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2937' }}>{preset.name}</span>
        {preset.ai && <Pill tone="orange">AI</Pill>}
        {preset.custom && <Pill>自建</Pill>}
      </div>
      <div style={{ fontSize: 11, color: '#5b6678', lineHeight: 1.55, minHeight: showReason ? 34 : 30 }}>
        {preset.desc}
      </div>
      {showReason && preset.reason && (
        <div style={{
          fontSize: 10.5, color: '#f59e0b', marginTop: 7, padding: '5px 7px',
          background: 'rgba(245,158,11,.09)', borderRadius: 5, borderLeft: '2px solid rgba(245,158,11,.5)',
        }}>{T.art.reason}：{preset.reason}</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
        {tags.slice(0, 3).map((t) => <Pill key={t}>{t}</Pill>)}
      </div>
    </div>
  );
}

/** 艺术指导上下文栏 */
export function ArtContext({ project, update }) {
  const ad = project?.artDirection || {};
  const [form, setForm] = useState({
    name: ad.name || T.presets[0].name,
    positive: ad.positive || T.presets[0].tags.join(', '),
    negative: ad.negative || '',
  });
  return (
    <>
      <CtxHead label="ART DIRECTION" />
      <CtxBlock title={T.art.editor}>
        <Field label={T.art.name} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label={T.art.positive} value={form.positive} onChange={(v) => setForm({ ...form, positive: v })}
          multiline rows={4} hint={T.art.positiveDesc} />
        <Field label={T.art.negative} value={form.negative} onChange={(v) => setForm({ ...form, negative: v })}
          multiline rows={3} hint={T.art.negativeDesc} />
        <Btn size="sm" variant="outline" onClick={() => update?.({ ...project, artDirection: { ...ad, ...form } })}>
          <Icon name="save" size={12} />{T.art.saveCustom}
        </Btn>
      </CtxBlock>
      <CtxBlock title={T.art.preview}>
        <div style={{
          fontSize: 10.5, color: '#5b6678', background: 'rgba(15,23,42,0.06)', borderRadius: 6,
          padding: '8px 9px', lineHeight: 1.6, fontFamily: 'Consolas,Monaco,monospace',
        }}>"{form.positive}, [用户描述]"</div>
      </CtxBlock>
    </>
  );
}

/* ══════════════ 步骤 3：资产 ══════════════ */
/* 资产桶 ↔ 实体字段映射（与 LLM 抽取路径写入的字段保持完全一致） */
const ASSET_BUCKETS = {
  characters: { key: 'characters', type: 'character', prefix: 'char', label: '角色' },
  scenes: { key: 'scenes', type: 'scene', prefix: 'scene', label: '场景' },
  props: { key: 'props', type: 'prop', prefix: 'prop', label: '道具' },
};

export function AssetsStep({ project, update, log, onOpenWorkbench }) {
  const [tab, setTab] = useState('characters');
  const [addOpen, setAddOpen] = useState(false);
  const [addBucket, setAddBucket] = useState('characters');
  const [addBaseName, setAddBaseName] = useState('');
  const [addVariant, setAddVariant] = useState('');
  const [addDesc, setAddDesc] = useState('');
  // 派生造型专用：这套造型的服装/妆造（喂给图生图）。派生时外貌继承父角色，服装必须重写，
  // 否则提示词里还是原来那套衣服，生成结果自然和原造型一模一样。
  const [addOutfit, setAddOutfit] = useState('');
  const [outfitBusy, setOutfitBusy] = useState(false);  // 「从剧本提取服装」进行中
  const [deriving, setDeriving] = useState(null);   // 派生时的源资产（用于标题/继承）
  const [genVariantBusy, setGenVariantBusy] = useState(false); // 派生造型「创建并生成」进行中

  const mats = project?.materials || {};
  const list = tab === 'characters' ? (mats.characters || [])
    : tab === 'scenes' ? (mats.scenes || []) : (mats.props || []);

  /** 打开「新增」弹窗：类型跟随当前 tab */
  const openAdd = (bucket = tab) => {
    setDeriving(null);
    setAddBucket(bucket);
    setAddBaseName('');
    setAddVariant('');
    setAddDesc('');
    setAddOutfit('');
    setAddOpen(true);
  };

  /**
   * 打开「派生造型」弹窗：只继承源角色的「外貌/五官/体型/画风」（锁身份），
   * 服装部分**故意清空**——新造型的服装必须由用户填写，否则等于复制原造型。
   */
  const openDerive = (asset) => {
    const base = entityBaseName(asset) || asset?.name || '';
    const { looks } = splitAppearance(asset?.appearance || asset?.desc || '');
    setDeriving(asset);
    setAddBucket('characters');
    setAddBaseName(base);
    setAddVariant('');
    setAddDesc(looks);
    setAddOutfit('');
    setAddOpen(true);
  };

  /**
   * 「✨ 从剧本提取」这套造型的服装 / 妆造。
   *
   * 服装框不让用户凭记忆手敲：先按造型标签 + 角色名在剧本里检索相关段落（本地召回，不花钱），
   * 再让 LLM 只输出服装那一段（含剧本没写时按身份与时代补全）。
   * 检索为空时不报错——那正好说明剧本没细写，交给 LLM 依据身份补全一套合理造型。
   */
  const extractOutfit = async () => {
    if (outfitBusy) return;
    const variant = String(addVariant || '').trim();
    const base = String(addBaseName || '').trim();
    const script = project?.script || '';
    if (!variant) { log?.('请先填写造型标签（如「戏装扮相」），提取要用它去剧本里找这一段'); return; }
    if (!script.trim()) { log?.('剧本内容为空，无法提取；请先在「剧本」步骤粘贴内容'); return; }
    setOutfitBusy(true);
    try {
      const excerpt = pickCostumeExcerpt(script, base, variant);
      const looks = String(addDesc || '').trim();
      const identity = [
        `角色本名：${base || '（未填）'}`,
        looks ? `已确定的日常造型与外貌（勿重复，勿改动）：${looks}` : '',
        excerpt ? '' : `剧本开头片段（用于判断时代与身份）：\n${script.slice(0, 1200)}`,
      ].filter(Boolean).join('\n');
      const prompt = PROMPT_COSTUME_FROM_SCRIPT
        .replace('{{name}}', base || '该角色')
        .replace('{{variant}}', variant)
        .replace('{{identity}}', identity)
        .replace('{{script_text}}', excerpt || '（剧本中没有检索到与该造型直接相关的段落）');
      const raw = await new DispatchGlmClient().chat(prompt, {
        llmType: 'character_extract',
        maxTokens: 600,
        temperature: 0.45,
      });
      const text = cleanOutfitText(raw);
      if (!text) throw new Error('模型没有返回可用描述');
      setAddOutfit(text);
      log?.(excerpt
        ? `已从剧本提取「${variant}」的服装描述`
        : `剧本没细写「${variant}」，已按角色身份与时代补全服装描述`);
    } catch (e) {
      log?.(`提取服装描述失败：${e?.message || e}`);
    } finally {
      setOutfitBusy(false);
    }
  };

  /**
   * 组装实体对象：字段与 extract() 里的 toEntities 完全一致（baseName / variant / name / appearance / desc）。
   * 派生（带 variant）时，把造型标签拼进 appearance/desc，避免后续在分镜/工作台里生成成「原造型」。
   */
  const buildEntity = () => {
    const meta = ASSET_BUCKETS[addBucket] || ASSET_BUCKETS.characters;
    const base = String(addBaseName || '').trim();
    if (!base) { log?.('请填写名称'); return null; }
    const variant = meta.type === 'character' ? String(addVariant || '').trim() : '';
    const name = meta.type === 'character' && variant ? entityDisplayName(base, variant) : base;
    const looks = String(addDesc || '').trim();
    const outfit = meta.type === 'character' ? String(addOutfit || '').trim() : '';
    // 外貌与服装分段拼接：外貌锁身份（脸/发型/体型/画风），服装描述这套造型
    const joinClauses = (...arr) => arr
      .map((s) => String(s || '').trim().replace(/[。；;，,\s]+$/, ''))
      .filter(Boolean).join('。');
    const desc = joinClauses(looks, outfit);
    const appearance = variant ? `${desc}。造型变体：${variant}` : desc;
    return {
      id: `${meta.prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: meta.type,
      name,
      baseName: base,
      variant,
      appearance,
      desc: appearance,
      ...(deriving?.id ? { derivedFrom: deriving.id } : {}),
    };
  };

  /** 新增 / 派生：仅入库，不自动出图 */
  const createAsset = () => {
    // 派生造型必须写这套造型的服装：不写就只有造型标签，生成出来还是原造型
    if (deriving && !String(addOutfit || '').trim()) {
      log?.('请先填写这套造型的服装/妆造——留空的话生成结果会和原造型一样');
      return;
    }
    const entity = buildEntity();
    if (!entity) return;
    const meta = ASSET_BUCKETS[addBucket] || ASSET_BUCKETS.characters;
    const existing = mats[meta.key] || [];
    if (existing.some((e) => entityKey(e) === entityKey(entity))) {
      log?.(`「${entity.name}」已存在（同名同造型），未重复添加`);
      return;
    }
    // 函数式更新：避免与其它步骤的并发写入互相覆盖
    update?.((prev) => {
      const prevMats = prev?.materials || {};
      return {
        materials: {
          ...prevMats,
          [meta.key]: [...(prevMats[meta.key] || []), entity],
        },
      };
    });
    log?.(deriving
      ? `已为「${entityBaseName(deriving)}」派生造型：${entity.name}`
      : `已新增${meta.label}：${entity.name}`);
    setAddOpen(false);
  };

  /**
   * 派生造型「创建并生成造型图」：
   * ① 优先走图生图（img2img）——拿父角色原图当参考，锁死脸/身份，只换服装/年龄；
   * ② 父角色还没有图时，回退文生图（用 buildWorkbenchPrompt 构造主视图提示词）。
   */
  const createAndGenerateVariant = async () => {
    if (genVariantBusy) return;
    const outfitText = String(addOutfit || '').trim();
    // 🔴 造型图能不能换成新衣服，全靠这段服装描述进 img2img 提示词。
    //    旧实现这里传的是空串，导致无论填什么都只按「造型标签」盲换装，等于没换。
    if (deriving && !outfitText) {
      log?.('请先填写这套造型的服装/妆造——留空的话生成结果会和原造型一样');
      return;
    }
    const entity = buildEntity();
    if (!entity) return;
    const meta = ASSET_BUCKETS[addBucket] || ASSET_BUCKETS.characters;
    const existing = mats[meta.key] || [];
    if (existing.some((e) => entityKey(e) === entityKey(entity))) {
      log?.(`「${entity.name}」已存在（同名同造型），未重复添加`);
      return;
    }
    // 先入库，保证后续按 id 写回图片
    update?.((prev) => {
      const prevMats = prev?.materials || {};
      return {
        materials: {
          ...prevMats,
          [meta.key]: [...(prevMats[meta.key] || []), entity],
        },
      };
    });
    setAddOpen(false);

    const parentImg = deriving?.masterUrl || deriving?.imageUrl || deriving?.avatarUrl || '';
    setGenVariantBusy(true);
    try {
      let resultUrl = '';
      if (parentImg) {
        log?.(`正在用图生图生成造型「${entity.name}」（基于原图，保持人物一致）…`);
        const res = await img2imgImage({
          image_url: parentImg,
          prompt: buildVariantImg2ImgPrompt(entity.variant, outfitText),
          negative_prompt: NEG_BASE,
        });
        resultUrl = res?.image_url || res?.result_url || '';
      } else {
        log?.(`父角色尚无原图，回退文生图生成造型「${entity.name}」`);
        const r = await generatePanelImage({
          modelKey: defaultModelKey('image'),
          task: 'text',
          prompt: buildWorkbenchPrompt('master', entity.name, entity.appearance, entity.type),
          negative: NEG_BASE,
          ratio: defaultRatio('character'),
        });
        resultUrl = r?.resultUrl || '';
      }
      if (!resultUrl) throw new Error('生成未返回图片地址');
      // 写回 masterUrl + imageUrl（imageUrl 是资产库/分镜封面）
      update?.((prev) => {
        const prevMats = prev?.materials || {};
        const patch = (arr = []) => arr.map((x) => (x.id === entity.id
          ? { ...x, masterUrl: resultUrl, imageUrl: resultUrl } : x));
        return {
          materials: {
            ...prevMats,
            characters: patch(prevMats.characters),
            scenes: patch(prevMats.scenes),
            props: patch(prevMats.props),
          },
        };
      });
      log?.(`造型图生成完成：${entity.name}`);
    } catch (e) {
      log?.(`造型图生成失败：${e?.message || e}`);
    } finally {
      setGenVariantBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 顶栏 */}
      <div style={{
        ...P, paddingTop: 14, paddingBottom: 12, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(15,23,42,0.096)',
      }}>
        <Seg
          options={[
            { key: 'characters', label: `${T.assets.tabs.characters} ${(mats.characters || []).length}` },
            { key: 'scenes', label: `${T.assets.tabs.scenes} ${(mats.scenes || []).length}` },
            { key: 'props', label: `${T.assets.tabs.props} ${(mats.props || []).length}` },
          ]}
          value={tab} onChange={setTab}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="sm" onClick={() => log?.('已同步描述')}><Icon name="refresh" size={13} />{T.assets.syncDesc}</Btn>
          <Btn size="sm" variant="primary" onClick={() => openAdd(tab)}>
            <Icon name="plus" size={13} />新增{ASSET_BUCKETS[tab]?.label || '资产'}
          </Btn>
        </div>
      </div>

      {/* 网格 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {list.length === 0
          ? <Empty icon="users" text={T.library.emptyType} />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              {list.map((a) => (
                <AssetCard key={a.id} asset={a}
                  onClick={() => onOpenWorkbench?.(a)}
                  onDerive={tab === 'characters' ? openDerive : undefined} />
              ))}
              <div
                onClick={() => openAdd(tab)}
                style={{
                  aspectRatio: '3/4', borderRadius: 10, border: '1px dashed rgba(15,23,42,0.288)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 6, cursor: 'pointer', color: '#7c8798', fontSize: 11.5,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(109,40,217,.5)'; e.currentTarget.style.color = '#6d28d9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(15,23,42,0.288)'; e.currentTarget.style.color = '#7c8798'; }}>
                <Icon name="plus" size={20} />{T.assets.add}
              </div>
            </div>
          )}
      </div>

      {/* 新增 / 派生造型弹窗 */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={deriving ? `派生造型 · ${entityBaseName(deriving)}` : `新增${ASSET_BUCKETS[addBucket]?.label || '资产'}`}
        subtitle={deriving ? '同一人物换一套造型：外貌（脸/发型/体型/画风）自动继承；填好造型标签后，点服装框右上「从剧本提取」可自动生成这段服装描述' : '手动创建资产，字段与 AI 抽取完全一致'}
        width={520}
        footer={<>
          <Btn size="sm" onClick={() => setAddOpen(false)}>取消</Btn>
          {deriving && (
            <Btn size="sm" onClick={createAndGenerateVariant} disabled={genVariantBusy}
              title="用人物原图做图生图（保住脸与身份，只换服装/年龄），生成后自动写入造型图">
              {genVariantBusy ? '生成中…' : '✨ 创建并生成造型图'}
            </Btn>
          )}
          <Btn size="sm" variant="primary" onClick={createAsset} disabled={genVariantBusy}>{deriving ? '仅创建造型' : '创建'}</Btn>
        </>}
      >
        {!deriving && (
          <Seg
            options={[
              { key: 'characters', label: '角色' },
              { key: 'scenes', label: '场景' },
              { key: 'props', label: '道具' },
            ]}
            value={addBucket}
            onChange={setAddBucket}
          />
        )}
        <div style={{ height: 14 }} />
        <Field
          label={addBucket === 'characters' ? '本名' : '名称'}
          value={addBaseName}
          onChange={setAddBaseName}
          placeholder={addBucket === 'characters' ? '如：顾拾遗' : addBucket === 'scenes' ? '如：雨夜长街' : '如：青铜长剑'}
        />
        {addBucket === 'characters' && (
          <Field
            label="造型标签（可留空）"
            value={addVariant}
            onChange={setAddVariant}
            placeholder="如：夜行黑袍 / 少年时期"
            hint={addVariant
              ? `显示名：${entityDisplayName(addBaseName, addVariant)}`
              : (deriving
                ? '填一个标签（如「戏装扮相」），下方服装框就能按它去剧本里提取'
                : '留空表示该人物只有一套造型')}
          />
        )}
        {deriving ? (
          <>
            <Field
              label="外貌 / 五官（锁身份，已继承）"
              value={addDesc}
              onChange={setAddDesc}
              multiline
              rows={3}
              hint="脸型、五官、肤色、发型、体型、画风 —— 从原角色继承，保证还是同一个人，一般不用改"
            />
            <Field
              label="这套造型的服装 / 妆造（喂给生图）"
              value={addOutfit}
              onChange={setAddOutfit}
              multiline
              rows={3}
              action={
                <Btn size="sm" variant="primary" onClick={extractOutfit} disabled={outfitBusy}
                  title="按角色名 + 造型标签去剧本里找这套造型的描写；剧本没细写时按身份与时代补全">
                  {outfitBusy ? '提取中…' : '✨ 从剧本提取'}
                </Btn>
              }
              placeholder="如：京剧武生戏装，头戴黑色夫子盔，朱红底绣金蟒纹戏袍，腰系玉带，脚踩厚底靴"
              hint="点右上「从剧本提取」可由剧本自动生成，不用手写；提取后可再改。留空会生成和原造型一样的图"
            />
          </>
        ) : (
          <Field
            label="外观 / 描述（喂给生图）"
            value={addDesc}
            onChange={setAddDesc}
            multiline
            rows={4}
            placeholder="外貌、服装、材质、气质等"
            hint="新增实体不在剧本里，需手动填写"
          />
        )}
      </Modal>
    </div>
  );
}

function AssetCard({ asset, onClick, onDerive }) {
  // 封面：优先 imageUrl，回退工作台生成的主图
  const cover = asset.imageUrl || asset.masterUrl || '';
  const has = !!cover;
  return (
    <div onClick={onClick} style={{
      borderRadius: 10, overflow: 'hidden', cursor: 'pointer', position: 'relative',
      background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.128)',
      transition: 'all .16s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(109,40,217,.45)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(15,23,42,0.128)'; }}>
      <div style={{
        aspectRatio: '3/4', background: has ? '#000' : 'rgba(15,23,42,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        {has
          ? <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Icon name={asset.type === 'scene' ? 'image' : 'users'} size={26} color="#7c8798" />}
        {asset.voiceAudio && (
          <div title="已配置真音色样本（进视频）"
            style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,.82)', fontSize: 10, color: '#6d28d9', backdropFilter: 'blur(4px)' }}>
            🔊 音色
          </div>
        )}
        {onDerive && (
          <button
            onClick={(e) => { e.stopPropagation(); onDerive(asset); }}
            title="派生一套造型变体（同一人物不同服装/年龄）"
            style={{
              position: 'absolute', top: 6, right: 6, display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '3px 7px', borderRadius: 6, border: '1px solid rgba(109,40,217,.55)',
              background: 'rgba(255,255,255,.82)', color: '#6d28d9', fontSize: 10, cursor: 'pointer',
              fontFamily: 'inherit', backdropFilter: 'blur(4px)', zIndex: 2,
            }}
          >
            <Icon name="plus" size={10} />造型
          </button>
        )}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 8px 7px',
          background: 'linear-gradient(transparent, rgba(0,0,0,.85))',
        }}>
          <div style={{ fontSize: 11.5, color: '#ffffff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {asset.name || asset.title}
          </div>
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.75)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {asset.appearance || asset.desc || ''}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 资产上下文栏 */
export function AssetsContext({ project, update }) {
  const [ratios, setRatios] = useState({
    character: project?.ratios?.character || '9:16',
    scene: project?.ratios?.scene || '16:9',
    prop: project?.ratios?.prop || '1:1',
  });
  const ad = project?.artDirection || {};
  const set = (k, v) => {
    const next = { ...ratios, [k]: v };
    setRatios(next);
    update?.({ ...project, ratios: next });
  };
  return (
    <>
      <CtxHead label="ASSETS" />
      <CtxBlock title={T.assets.overview}>
        <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.6 }}>{T.assets.overviewDesc}</div>
      </CtxBlock>
      <CtxBlock title={T.assets.ratio}>
        <RatioRow label={T.assets.ratioCharacter} value={ratios.character} onChange={(v) => set('character', v)} />
        <RatioRow label={T.assets.ratioScene} value={ratios.scene} onChange={(v) => set('scene', v)} />
        <RatioRow label={T.assets.ratioProp} value={ratios.prop} onChange={(v) => set('prop', v)} />
      </CtxBlock>
      <CtxBlock title={T.script.style}>
        <CtxField label={T.script.styleName} value={ad.name || T.empty.styleNone} />
        <CtxField label={T.script.positive} value={ad.positive || T.empty.positiveNone} multiline />
        <CtxField label={T.script.negative} value={ad.negative || ''} multiline />
        <div style={{ fontSize: 10, color: '#4b5563', marginTop: 6 }}>💡 {T.assets.tip}</div>
      </CtxBlock>
    </>
  );
}

function RatioRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 10.5, color: '#4b5563', letterSpacing: '.05em' }}>{label}</span>
      <Seg size="sm" options={['9:16', '16:9', '1:1'].map((r) => ({ key: r, label: r }))} value={value} onChange={onChange} />
    </div>
  );
}

/* ══════════ 上下文栏小工具 ══════════ */
function CtxHead({ label }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={{
        fontSize: 9.5, color: '#6d28d9', letterSpacing: '.1em', fontWeight: 600,
        background: 'rgba(109,40,217,.13)', padding: '3px 8px', borderRadius: 5,
      }}>CONTEXT / {label}</span>
    </div>
  );
}

function CtxBlock({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10.5, color: '#4b5563', letterSpacing: '.05em', marginBottom: 6,
        paddingBottom: 5, borderBottom: '1px solid rgba(15,23,42,0.096)',
      }}>{title}</div>
      {children}
    </div>
  );
}

function CtxStat({ label, value }) {
  return (
    <div style={{
      background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.112)',
      borderRadius: 7, padding: '7px 9px',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#4b5563', marginTop: 1 }}>{label}</div>
    </div>
  );
}

function CtxField({ label, value, multiline }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 3 }}>{label}</div>
      <div style={{
        fontSize: 11, color: '#5b6678', background: 'rgba(15,23,42,0.06)', borderRadius: 5,
        padding: '6px 8px', lineHeight: 1.55, maxHeight: multiline ? 62 : 'auto',
        overflow: multiline ? 'auto' : 'hidden', fontFamily: multiline ? 'Consolas,Monaco,monospace' : 'inherit',
      }}>{value || '—'}</div>
    </div>
  );
}
