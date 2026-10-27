import React, { useState } from 'react';
import { Icon, Btn, Pill } from './ui';
import {
  MODALITIES, PROVIDER_PRESETS, getAllModelConfig, saveAllModelConfig, detectProvider,
  listWorkflows, getWorkflowRules, describeRules, DEFAULT_WORKFLOW_PATHS,
} from '../../lib/providers/index.js';

/**
 * 开源版「模型配置（API Key）」面板。
 *
 * 与旧版「账号 / 调度机鉴权 / 计费」彻底无关：开源版不依赖任何后端，所有生成
 * 直连用户自备的模型 API。配置按「模态」写入本机 localStorage（MODEL_SETTINGS），不上传。
 *
 * 统一抽象为 OpenAI 兼容接口（baseUrl + apiKey + model），可对接 OpenAI / DeepSeek /
 * 通义 / 智谱 / Moonshot / Ollama 等绝大多数服务；视频 / 音乐等非标准模态额外允许 endpoint。
 */

const ORDER = ['text', 'image', 'video', 'tts', 'music', 'model3d'];

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(15,23,42,0.064)', border: '1px solid rgba(15,23,42,0.16)',
  borderRadius: 7, padding: '8px 10px', color: '#374151', fontSize: 12.5,
  fontFamily: 'inherit', outline: 'none',
};
const labelStyle = { fontSize: 11.5, color: '#5b6678', marginBottom: 5, display: 'block' };
const subCard = {
  padding: 14, borderRadius: 9, marginBottom: 12,
  background: 'rgba(15,23,42,0.032)', border: '1px solid rgba(15,23,42,0.096)',
};

// 内联字段帮助：每个输入框下面一行小字说明
const helpStyle = {
  fontSize: 10.5, color: '#8a93a3', marginTop: 5, lineHeight: 1.5,
};
function HelpHint({ children }) {
  return <div style={helpStyle}>{children}</div>;
}

// 按字段名给的填写说明（与具体模态无关，跨模态通用）
const FIELD_HELP = {
  preset: '选厂商可一键填入地址；选「自定义」则手动填 Base URL。预设只填地址，Key / 模型名仍需自己填。',
  baseUrl: '模型服务的根地址，填到「/v1」或域名根即可。末尾斜杠会自动处理，无需手填。',
  apiKey: '服务商提供的密钥，仅保存在本机浏览器，不会上传到任何服务器。',
  model: '该模态实际调用的模型 ID，如 gpt-4o-mini / deepseek-chat / qwen-max。多数服务必填；工作流型服务（AutoDL 等）不需要，留空即可。',
  authScheme: '鉴权头发法。绝大多数服务用 Bearer；AutoDL 的 ComfyUI 工作流 API 要求原样发送 Token。选错会 401。通常自动识别，不用改。',
  endpoint: '接口路径，可填相对路径（拼到 Base URL 后）或完整 URL。留空时按模态自动取标准路径（图片 /images/generations、视频 /video/generations…），并按已识别的厂商自动调整。只有特殊服务才需要改。',
  size: '视频分辨率，厂商特定。部分服务强制特定值（如 720P 必填）；其他按文档填，或留空用服务默认。',
  pollPath: '任务型 API 专用：先返回任务 id、再轮询拿结果（Kling / Runway / Sora 等）。填 /tasks/{id} 或完整轮询 URL；{id} 会自动替换成任务 id。直出型服务（返回即结果 URL）留空即可。',
  videoMode: '生成模式（请求里 mode 字段的取值），决定使用哪类素材：纯文字(text) / 首尾帧(keyframe) / 参考图·音频(reference)。留空则根据本次提交自动推断——有首/尾帧→keyframe，有参考图/音频→reference，都没有→text。换模型只改这里，代码无需动。',
  engine: '厂商自定义的引擎标识字段。默认不发送；只有你的服务商明确要求时才填。',
  sendNegative: '图片请求是否带上 negative_prompt（负向词）。默认勾选，使用内置通用负向词（糊、畸形、水印等）。若你的服务对未知字段做严格校验、带负向词就报错，取消勾选即可，请求体里将不再出现该字段。',
  imageField: '图生图时「参考图」放在哪个字段名下。留空即可：软件会按 image_url → image → init_image → … 自动试，试通后记住，下次直接用。只有确认自己的服务用别的名字时才填。',
  imageFieldArray: '强制把参考图按数组发送。默认关闭（单图发字符串、多图发数组）；若服务报类型错误，软件会自动切成数组并记住，一般不用手动勾。',
  workflowExtra: '自动映射认不出来的字段（如随机种子 seed、情感权重 emo_*）在这里手填，JSON 格式。填了就以这里为准，会覆盖自动推断出来的同名参数。',
  wfPaths: '四项分别是「拉取列表 / 读取参数 / 提交任务 / 查询结果」的接口路径，{id} 代表工作流 id、{task} 代表任务 id。默认已按 AutoDL 实测路径填好，接别的平台（RunningHub、自建 ComfyUI-on-API）时按它的文档改这里即可。',
  kind: '接入类型默认按 Base URL 自动识别：填 AutoDL 的地址会自动切到「工作流型」。若你用的是同类但没被认出来的平台，在这里手动选「工作流型」即可。',
};

/**
 * 「已自动识别」提示条：把软件替用户推断出来的东西明说出来（可见即可改）。
 * 之所以要有这一行：全自动化最容易让人不信任——不知道它到底用了什么。
 */
function AutoDetected({ m, c }) {
  const p = detectProvider(c.baseUrl, c.model);
  if (!p) return null;
  const bits = [];
  if (p.endpoints?.[m]) bits.push(`接口 ${p.endpoints[m]}`);
  if (p.poll?.[m]) bits.push('任务完成后自动取结果');
  if (p.authScheme === 'raw') bits.push('原样 Token 鉴权');
  if (p.kind === 'workflow') bits.push('工作流型服务');
  return (
    <div style={{
      marginBottom: 10, padding: '7px 9px', borderRadius: 7,
      background: 'rgba(8,145,178,.08)', border: '1px solid rgba(8,145,178,.26)',
      fontSize: 10.5, color: '#0e7490', lineHeight: 1.55,
    }}>
      已识别为 <b>{p.name}</b>{bits.length ? ` · ${bits.join(' · ')}` : ''}。这些都不用你填，填错可在下方「高级」里改。
    </div>
  );
}

/**
 * 工作流选择器：工作流型服务（AutoDL 等）下，用户只需要「点选一条工作流」，
 * 不需要看懂字段名叫 ref_image_0 还是 prompt_text —— 那是 input_rules 的事。
 * 选完立刻把「这条工作流需要什么」用中文列出来，让用户在生成前就知道缺什么素材。
 */
function WorkflowPicker({ m, c, prov, onPick }) {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [summary, setSummary] = useState(null);

  // 用表单里「当前填的」（可能还没保存）的值去请求，避免用户必须先保存才能选。
  const liveCfg = () => ({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    authScheme: c.authScheme || prov?.authScheme || 'raw',
    workflowPaths: {
      ...DEFAULT_WORKFLOW_PATHS,
      ...(prov?.workflow || {}),
      ...(c.wfPathList ? { list: c.wfPathList } : {}),
      ...(c.wfPathDetail ? { detail: c.wfPathDetail } : {}),
      ...(c.wfPathSubmit ? { submit: c.wfPathSubmit } : {}),
      ...(c.wfPathResult ? { result: c.wfPathResult } : {}),
    },
  });

  const load = async () => {
    setBusy(true); setErr('');
    try {
      const rows = await listWorkflows(liveCfg());
      setList(rows);
      if (!rows.length) setErr('没有拉到任何工作流，请确认 Base URL 与 API Key。');
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (id) => {
    onPick(m, 'workflowId', id);
    setSummary(null);
    if (!id) return;
    try {
      const meta = await getWorkflowRules(liveCfg(), id);
      const name = list.find((w) => w.id === id)?.name || meta.name;
      onPick(m, 'workflowName', name);
      setSummary({ name, ...describeRules(meta.rules) });
    } catch (e) {
      setErr(e?.message || String(e));
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>工作流（点「拉取列表」后选择）</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          value={c.workflowId || ''}
          onChange={(e) => pick(e.target.value)}
          style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}
        >
          <option value="">{list.length ? '请选择一条工作流…' : '尚未拉取列表'}</option>
          {list.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <button
          type="button" onClick={load} disabled={busy}
          style={{
            flexShrink: 0, padding: '8px 12px', borderRadius: 7, cursor: busy ? 'default' : 'pointer',
            border: '1px solid rgba(109,40,217,.34)', background: 'rgba(109,40,217,.09)',
            color: '#6d28d9', fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          {busy ? '拉取中…' : '拉取列表'}
        </button>
      </div>
      <HelpHint>选一条工作流即可，字段名会自动读取，不用手填。换工作流只在这里改。</HelpHint>

      {err && (
        <div style={{
          marginTop: 8, padding: '7px 9px', borderRadius: 7, fontSize: 10.5, lineHeight: 1.55,
          background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.28)', color: '#b91c1c',
        }}>{err}</div>
      )}

      {summary && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 7, fontSize: 10.5, lineHeight: 1.6,
          background: 'rgba(8,145,178,.07)', border: '1px solid rgba(8,145,178,.24)', color: '#0e7490',
        }}>
          <div style={{ marginBottom: 4 }}>已选：<b>{summary.name}</b></div>
          <div>需要：{summary.summary.map((s, i) => (
            <span key={i} style={{
              display: 'inline-block', margin: '2px 4px 2px 0', padding: '1px 6px', borderRadius: 5,
              background: s.required ? 'rgba(220,38,38,.12)' : 'rgba(15,23,42,.07)',
              border: `1px solid ${s.required ? 'rgba(220,38,38,.3)' : 'rgba(15,23,42,.12)'}`,
              color: s.required ? '#b91c1c' : '#5b6678',
            }}>{s.label}{s.count > 1 ? `×${s.count}` : ''}{s.required ? '（必填）' : ''}</span>
          ))}</div>
          <div style={{ marginTop: 4, color: '#5b6678' }}>标红的必填项如果这次生成没有对应素材，会直接提示缺什么，不会白跑一次。</div>
          {/* 不接受媒体的工作流要提前说清楚：否则用户带着关键帧生成，素材被静默丢弃却毫无察觉 */}
          {summary.accepts && !summary.accepts.image && !summary.accepts.audio && !summary.accepts.video && (
            <div style={{ marginTop: 4, color: '#b45309' }}>
              ⚠ 这条工作流只吃提示词，分镜关键帧 / 参考图 / 配音都不会被使用。要画面跟关键帧一致，请改选带「参考图」或「首帧图」的工作流。
            </div>
          )}
          {summary.accepts && summary.accepts.image > 0 && !summary.accepts.audio && (
            <div style={{ marginTop: 4, color: '#5b6678' }}>注意：这条工作流没有音频槽位，配音不会传给模型（画面不会跟着声音走）。</div>
          )}
        </div>
      )}
    </div>
  );
}

export function ApiSettings() {
  const [cfg, setCfg] = useState(() => {
    const all = getAllModelConfig();
    const init = {};
    ORDER.forEach((m) => {
      const meta = MODALITIES[m] || {};
      init[m] = {
        baseUrl: all[m]?.baseUrl ?? meta.defaultBase ?? '',
        apiKey: all[m]?.apiKey ?? '',
        model: all[m]?.model ?? meta.defaultModel ?? '',
        endpoint: all[m]?.endpoint ?? '',
        pollPath: all[m]?.pollPath ?? '',
        // 工作流型服务（AutoDL 等）：选一条工作流即可，不需要模型名。
        workflowId: all[m]?.workflowId ?? '',
        workflowName: all[m]?.workflowName ?? '',
        workflowExtraText: all[m]?.workflowExtra ? JSON.stringify(all[m].workflowExtra) : '',
        // 接入类型：留空=自动识别（按域名/模型名），可手动覆盖成 openai / workflow
        kind: all[m]?.kind ?? '',
        // 工作流接口路径模板：留空用平台默认值（AutoDL 实测路径）
        wfPathList: all[m]?.workflowPaths?.list ?? '',
        wfPathDetail: all[m]?.workflowPaths?.detail ?? '',
        wfPathSubmit: all[m]?.workflowPaths?.submit ?? '',
        wfPathResult: all[m]?.workflowPaths?.result ?? '',
        authScheme: all[m]?.authScheme ?? '',
        size: all[m]?.size ?? '',
        videoMode: all[m]?.videoMode ?? '',
        engine: all[m]?.engine ?? '',
        // 图片：参考图字段名（留空由后端默认 image_url）与是否按数组发送。
        imageField: all[m]?.imageField ?? '',
        imageFieldArray: all[m]?.imageFieldArray === true,
        // 图片：是否随请求提交 negative_prompt。默认开启（缺失该键亦视为开启），
        // 严格校验未知字段的服务可取消勾选。
        sendNegative: all[m]?.sendNegative !== false,
      };
    });
    return init;
  });
  const [saved, setSaved] = useState(false);
  // 改动未保存时给出显式提醒：徽章只代表「输入框里有值」，不代表已写入 localStorage。
  // 少了这条提示，用户很容易「填完就走」，然后被下游报「未配置」而完全对不上。
  const [dirty, setDirty] = useState(false);
  // 「高级」默认全部收起：用户 2026-10-27 明确要求只填 Base URL / Key / 模型名，
  // 其余一律自动推断。高级项保留但不再占据主界面。
  const [advOpen, setAdvOpen] = useState({});
  // 附加参数（JSON）解析失败时的提示
  const [jsonErr, setJsonErr] = useState('');

  const setField = (m, key, val) => {
    setCfg((c) => ({ ...c, [m]: { ...c[m], [key]: val } }));
    setDirty(true);
  };

  const onSave = () => {
    // 「附加参数」是手填 JSON，落盘前转成对象；写错不阻断保存，但会提示。
    const clean = {};
    ORDER.forEach((m) => {
      const c = { ...(cfg[m] || {}) };
      const raw = String(c.workflowExtraText || '').trim();
      if (raw) {
        try {
          c.workflowExtra = JSON.parse(raw);
        } catch {
          c.workflowExtra = {};
          setJsonErr(`「${MODALITIES[m]?.label || m}」附加参数不是合法 JSON，已忽略，其余配置照常保存。`);
        }
      }
      delete c.workflowExtraText;
      // 路径模板：只把填过的写进去，留空的交给平台默认值
      const paths = {};
      if (c.wfPathList) paths.list = c.wfPathList;
      if (c.wfPathDetail) paths.detail = c.wfPathDetail;
      if (c.wfPathSubmit) paths.submit = c.wfPathSubmit;
      if (c.wfPathResult) paths.result = c.wfPathResult;
      c.workflowPaths = paths;
      ['wfPathList', 'wfPathDetail', 'wfPathSubmit', 'wfPathResult'].forEach((k) => delete c[k]);
      clean[m] = c;
    });
    saveAllModelConfig(clean);
    setCfg(clean);
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div style={{
      padding: 18, borderRadius: 11,
      background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.128)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'rgba(109,40,217,.13)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="lock" size={15} color="#6d28d9" /></div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1f2937' }}>模型配置（API Key）</div>
      </div>
      <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 14, lineHeight: 1.6 }}>
        开源版不依赖任何后端，所有生成直连你自备的模型 API。配置按「模态」保存到本机浏览器（localStorage），不会上传。
        以 OpenAI 兼容接口为统一抽象，可对接 OpenAI / DeepSeek / 通义 / 智谱 / Moonshot / 本地 Ollama 等。
      </div>

      {jsonErr && (
        <div style={{
          marginBottom: 12, padding: '9px 11px', borderRadius: 8,
          background: 'rgba(220,38,38,.1)', border: '1px solid rgba(220,38,38,.32)',
          fontSize: 11.5, color: '#b91c1c', lineHeight: 1.62,
        }}>{jsonErr}</div>
      )}

      {dirty && (
        <div style={{
          marginBottom: 12, padding: '9px 11px', borderRadius: 8,
          background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.38)',
          fontSize: 11.5, color: '#92400e', lineHeight: 1.62,
        }}>
          有修改尚未保存。下面的「已配置」只表示输入框里有值，<b>必须点底部「保存全部配置」</b>后才会写入本机并生效。
        </div>
      )}

      {ORDER.map((m) => {
        const meta = MODALITIES[m] || {};
        const c = cfg[m] || {};
        const configured = !!(c.apiKey && c.apiKey.trim());
        // 图片也暴露 endpoint：图生图模型常常不在默认的 /images/generations 路径上
        const showEndpoint = m === 'video' || m === 'music' || m === 'image';
        // 轮询只有任务型（视频 / 音乐）用得上；图片是同步直出，不给它显示，免得误导
        const showPoll = m === 'video' || m === 'music';
        const presetValue =
          PROVIDER_PRESETS.find((p) => p.base === (c.baseUrl || ''))?.base || '__custom__';
        // 自动推断出的值（用于占位提示；用户填了就以用户为准）
        const prov = detectProvider(c.baseUrl, c.model);
        // 手动指定的接入类型优先于自动识别
        const isWorkflow = (c.kind || prov?.kind) === 'workflow';
        const autoEp = prov?.endpoints?.[m] || meta.defaultEndpoint || '';
        const autoScheme = prov?.authScheme || 'bearer';
        const autoPoll = prov?.poll?.[m] || '';

        return (
          <div key={m} style={subCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{meta.label || m}</div>
              {configured
                ? <Pill tone="green">已配置</Pill>
                : <Pill tone="orange">未配置</Pill>}
            </div>
            {meta.desc && (
              <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 12 }}>{meta.desc}</div>
            )}

            {/* 厂商预设 */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>厂商预设（一键填入地址）</label>
              <select
                value={presetValue}
                onChange={(e) => { if (e.target.value !== '__custom__') setField(m, 'baseUrl', e.target.value); }}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {PROVIDER_PRESETS.map((p) => (
                  <option key={p.name} value={p.base}>{p.name}</option>
                ))}
                <option value="__custom__">自定义…</option>
              </select>
              <HelpHint>{FIELD_HELP.preset}</HelpHint>
            </div>

            {/* baseUrl */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>API 基地址 (Base URL)</label>
              <input
                style={inputStyle} value={c.baseUrl || ''}
                placeholder={meta.defaultBase || 'https://api.openai.com/v1'}
                onChange={(e) => setField(m, 'baseUrl', e.target.value)}
              />
              <HelpHint>{FIELD_HELP.baseUrl}</HelpHint>
            </div>

            {/* apiKey */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>API Key</label>
              <input
                type="password" style={inputStyle} value={c.apiKey || ''}
                placeholder="sk-...（仅存于本机）"
                onChange={(e) => setField(m, 'apiKey', e.target.value)}
              />
              <HelpHint>{FIELD_HELP.apiKey}</HelpHint>
            </div>

            {/* 工作流型服务：选工作流代替填模型名（模型名对它没意义，反而会让人以为是必填） */}
            {isWorkflow ? (
              <WorkflowPicker m={m} c={c} prov={prov} onPick={setField} />
            ) : (
              <div style={{ marginBottom: showEndpoint ? 12 : 0 }}>
                <label style={labelStyle}>模型名 (Model)</label>
                <input
                  style={inputStyle} value={c.model || ''}
                  placeholder={meta.placeholderModel || 'gpt-4o-mini'}
                  onChange={(e) => setField(m, 'model', e.target.value)}
                />
                <HelpHint>{FIELD_HELP.model}</HelpHint>
              </div>
            )}

            {/* 自动识别结果：让用户知道软件替他推断了什么（可见、可改） */}
            <AutoDetected m={m} c={c} />

            {/* 高级：默认收起。以上都是自动推断的，只有特殊服务才需要动。 */}
            <div style={{ marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setAdvOpen((s) => ({ ...s, [m]: !s[m] }))}
                style={{
                  background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 11.5, color: '#6d28d9', fontFamily: 'inherit', display: 'inline-flex',
                  alignItems: 'center', gap: 4,
                }}
              >
                {advOpen[m] ? '▾' : '▸'} 高级（通常不用改）
              </button>
              {advOpen[m] && (
                <div style={{
                  marginTop: 10, padding: 12, borderRadius: 8,
                  background: 'rgba(15,23,42,0.028)', border: '1px dashed rgba(15,23,42,0.16)',
                }}>
                  {/* endpoint（仅视频 / 音乐等非标准模态） */}
                  {showEndpoint && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>接口路径 (Endpoint)</label>
                      <input
                        style={inputStyle} value={c.endpoint || ''}
                        placeholder={autoEp || meta.defaultEndpoint || '/video/generations'}
                        onChange={(e) => setField(m, 'endpoint', e.target.value)}
                      />
                      <HelpHint>{FIELD_HELP.endpoint}</HelpHint>
                    </div>
                  )}
                  {/* 接入类型：自动识别失败时的手动兜底，也是接入 AutoDL 之外同类平台的入口 */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>接入类型</label>
                    <select
                      value={c.kind || prov?.kind || 'openai'}
                      onChange={(e) => setField(m, 'kind', e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="openai">OpenAI 兼容（绝大多数服务）</option>
                      <option value="workflow">工作流型（ComfyUI 工作流 API）</option>
                    </select>
                    <HelpHint>{FIELD_HELP.kind}</HelpHint>
                  </div>
                  {/* 鉴权方式：默认 Bearer，AutoDL 等工作流型服务要求原样 Token */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>鉴权方式</label>
                    <select
                      value={c.authScheme || autoScheme}
                      onChange={(e) => setField(m, 'authScheme', e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="bearer">Bearer（绝大多数服务）</option>
                      <option value="raw">原样 Token（AutoDL 等）</option>
                    </select>
                    <HelpHint>{FIELD_HELP.authScheme}</HelpHint>
                  </div>
                  {/* 图片专有：参考图字段名 + 数组开关 + 负向词开关 */}
                  {m === 'image' && (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>参考图字段名（留空自动试）</label>
                        <input
                          style={inputStyle} value={c.imageField || ''}
                          placeholder="留空则按 image_url → image → … 自动试"
                          onChange={(e) => setField(m, 'imageField', e.target.value)}
                        />
                        <HelpHint>{FIELD_HELP.imageField}</HelpHint>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={c.imageFieldArray === true}
                            onChange={(e) => setField(m, 'imageFieldArray', e.target.checked)}
                            style={{ cursor: 'pointer', margin: 0 }}
                          />
                          参考图按数组发送（留空则报错时自动切换）
                        </label>
                        <HelpHint>{FIELD_HELP.imageFieldArray}</HelpHint>
                      </div>
                      <div style={{ marginBottom: 0 }}>
                        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={c.sendNegative !== false}
                            onChange={(e) => setField(m, 'sendNegative', e.target.checked)}
                            style={{ cursor: 'pointer', margin: 0 }}
                          />
                          提交负向词 (negative_prompt)
                        </label>
                        <HelpHint>{FIELD_HELP.sendNegative}</HelpHint>
                      </div>
                    </>
                  )}
                  {m === 'video' && (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>尺寸 (Size，可选)</label>
                        <input
                          style={inputStyle} value={c.size || ''}
                          placeholder="留空用服务默认（推荐）"
                          onChange={(e) => setField(m, 'size', e.target.value)}
                        />
                        <HelpHint>{FIELD_HELP.size}</HelpHint>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>生成模式 (Mode，可选)</label>
                        <select
                          value={c.videoMode || ''}
                          onChange={(e) => setField(m, 'videoMode', e.target.value)}
                          style={{ ...inputStyle, cursor: 'pointer' }}
                        >
                          <option value="">自动（按本次素材判断，推荐）</option>
                          <option value="text">纯文字生成</option>
                          <option value="keyframe">首尾帧控制画面起止</option>
                          <option value="reference">参考图 / 参考音频</option>
                        </select>
                        <HelpHint>{FIELD_HELP.videoMode}</HelpHint>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={c.videoSendNegative !== false}
                            onChange={(e) => setField(m, 'videoSendNegative', e.target.checked)}
                            style={{ cursor: 'pointer', margin: 0 }}
                          />
                          提交负向词 (negative_prompt)
                        </label>
                        <HelpHint>{FIELD_HELP.videoSendNegative}</HelpHint>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>附加字段 engine（可选）</label>
                        <input
                          style={inputStyle} value={c.engine || ''}
                          placeholder="留空则不发送该字段"
                          onChange={(e) => setField(m, 'engine', e.target.value)}
                        />
                        <HelpHint>{FIELD_HELP.engine}</HelpHint>
                      </div>
                    </>
                  )}
                  {/* 工作流型：接口路径模板。默认已按 AutoDL 实测填好，换平台才需要改。 */}
                  {isWorkflow && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>接口路径模板（换平台才用改）</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          style={inputStyle} value={c.wfPathList || ''}
                          placeholder={`列表 ${DEFAULT_WORKFLOW_PATHS.list}`}
                          onChange={(e) => setField(m, 'wfPathList', e.target.value)}
                        />
                        <input
                          style={inputStyle} value={c.wfPathDetail || ''}
                          placeholder={`详情 ${DEFAULT_WORKFLOW_PATHS.detail}`}
                          onChange={(e) => setField(m, 'wfPathDetail', e.target.value)}
                        />
                        <input
                          style={inputStyle} value={c.wfPathSubmit || ''}
                          placeholder={`提交 ${DEFAULT_WORKFLOW_PATHS.submit}`}
                          onChange={(e) => setField(m, 'wfPathSubmit', e.target.value)}
                        />
                        <input
                          style={inputStyle} value={c.wfPathResult || ''}
                          placeholder={`查结果 ${DEFAULT_WORKFLOW_PATHS.result}`}
                          onChange={(e) => setField(m, 'wfPathResult', e.target.value)}
                        />
                      </div>
                      <HelpHint>{FIELD_HELP.wfPaths}</HelpHint>
                    </div>
                  )}
                  {/* 工作流型：自动映射认不出来的字段（seed、emo_* 之类）留一个手填兜底 */}
                  {isWorkflow && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>附加参数（JSON，可选）</label>
                      <textarea
                        style={{ ...inputStyle, minHeight: 62, resize: 'vertical', lineHeight: 1.5 }}
                        value={c.workflowExtraText || ''}
                        placeholder='{"seed": 123, "emo_happy": 0.3}'
                        onChange={(e) => { setJsonErr(''); setField(m, 'workflowExtraText', e.target.value); }}
                      />
                      <HelpHint>{FIELD_HELP.workflowExtra}</HelpHint>
                    </div>
                  )}
                  {/* pollPath（任务型 API：先返回 id 再轮询，如 Kling / Runway / Sora） */}
                  {showPoll && (
                    <div style={{ marginBottom: 0 }}>
                      <label style={labelStyle}>轮询路径 (Poll Path，任务型 API 用)</label>
                      <input
                        style={inputStyle} value={c.pollPath || ''}
                        placeholder={autoPoll || '/tasks/{id} 或完整轮询 URL'}
                        onChange={(e) => setField(m, 'pollPath', e.target.value)}
                      />
                      <HelpHint>{FIELD_HELP.pollPath}</HelpHint>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        {saved && (
          <span style={{ fontSize: 11.5, color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="check" size={13} color="#22c55e" /> 已保存到本机
          </span>
        )}
        <Btn variant="primary" onClick={onSave}>
          <Icon name="save" size={13} /> 保存全部配置
        </Btn>
      </div>
    </div>
  );
}
