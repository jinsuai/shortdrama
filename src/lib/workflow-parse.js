/**
 * 工作流 JSON 自动解析 → JINSU 面板接入草稿
 * ───────────────────────────────────────────────────────────────────
 * 来源：借鉴 infinite-creation/lib/core/workflow-specs.js 的 ComfyUI 节点识别规则
 *       （LoadImage/SaveImage/KSampler/EmptyLatent/seed/positive/negative 等）。
 * 适配：JINSU 走 Zealman 面板，提交形态是
 *         runPanelWorkflow({ workflowId, inputValues })
 *       其中 inputValues 的键是 `<节点id>:<控件名>`（如 '136:prompt'、'122:自定义宽'），
 *       文本型工作流（U00 提示词细化等）靠 ShowText 节点出文，走 runPanelTextWorkflow。
 *
 * 本模块只做「辅助生成接入配置」，不自动提交：它把粘贴的 ComfyUI 工作流 JSON 解析成
 *   - 识别到的可控输入（提示词 / 图 / 种子 / 尺寸 / 视频参数）
 *   - 输出保存节点
 *   - ShowText 文本输出节点
 * 然后产出一份「接入草稿」：含可直接抄进 media-workflows.js 的 inputValues 模板，
 * 以及一份可贴进 i18n.js 注册表的片段。最终仍须人工核对面板 _api_config 的控件名。
 *
 * 纯函数、零依赖，可在 Node 下直接跑（见仓库 scripts/workflow-parse-demo.mjs）。
 */

/* ════════════ 节点类型识别（来自 infinite-creation workflow-specs.js）════════════ */

const LOADER_CLASSES = {
  LoadImage:  { mediaType: 'image', field: 'image' },
  LoadAudio:  { mediaType: 'audio', field: 'audio' },
  LoadVideo:  { mediaType: 'video', field: 'file' },
  UploadImage: { mediaType: 'image', field: 'image' },
};

const SAVE_CLASSES = ['SaveImage', 'SaveVideo', 'SaveAnimatedWEBP', 'VHS_VideoCombine'];

const SAMPLE_CLASSES = ['KSampler', 'SamplerCustomAdvanced', 'KSamplerAdvanced'];

const MODEL_LOADER_RE =
  /(UNET|CLIP|VAE|Checkpoint|Diffusion|Lora|ControlNet).*Loader|Loader.*(Model|CLIP|VAE|UNET)/i;

/* JINSU 扩展：文本输出节点（ShowText 系）。U00 之类文本型工作流靠它出文。 */
const TEXT_OUTPUT_RE = /ShowText|OutputText|PreviewText|pysssss/i;

/** ComfyUI 的连接输入是 ["节点id", slot] 数组，不是直接可填的控件值 */
function isLink(v) {
  return Array.isArray(v) && v.length >= 1 && (typeof v[0] === 'string' || typeof v[0] === 'number');
}

/* ════════════ 归一化：UI 格式 / API 格式 → 统一节点列表 ═════════════ */

/**
 * 把两种常见 ComfyUI 导出格式统一成 [{ id, class_type, title, inputs }]。
 *  - API 格式（面板 _api_config 导出）：{ "10": { class_type, inputs, _meta } }
 *  - UI 格式（编辑器 workflow.json）：{ nodes: [{ id, type, title, widgets, inputs, widgets_values }] }
 * @param {Object} json
 * @returns {Array<{id:string, class_type:string, title:string, inputs:Object}>}
 */
export function normalizeWorkflow(json) {
  if (!json || typeof json !== 'object') return [];

  // UI 格式
  if (Array.isArray(json.nodes)) {
    return json.nodes.map((n) => {
      const inputs = {};
      // 控件值（widgets: [{name, value}] 最权威）
      for (const w of n.widgets || []) {
        if (w && typeof w.name === 'string') inputs[w.name] = w.value;
      }
      // 连接型输入（link 不为空 → 是上游连线，不是可填控件）
      for (const i of n.inputs || []) {
        if (i && i.link != null && !(i.name in inputs)) {
          inputs[i.name] = [String(i.link), 0];
        }
      }
      return {
        id: String(n.id),
        class_type: n.type || '',
        title: n.title || (n._meta && n._meta.title) || '',
        inputs,
      };
    });
  }

  // API 格式：顶层是节点 id → 节点定义
  if (!Array.isArray(json)) {
    return Object.entries(json).map(([id, n]) => ({
      id: String(id),
      class_type: n.class_type || '',
      title: (n._meta && n._meta.title) || '',
      inputs: n.inputs || {},
    }));
  }

  return [];
}

/* ════════════ 文本角色（正/负向提示词）════════════ */

/**
 * 扫描节点输入，提取字符串型 text/prompt 候选，并按节点标题判断正负向。
 * 跳过 ShowText 类文本输出节点（它们的 text 是连线，不该当提示词）。
 */
export function textRoles(nodes) {
  const pos = [];
  const neg = [];
  for (const n of nodes) {
    if (TEXT_OUTPUT_RE.test(n.class_type || '')) continue;
    const inputs = n.inputs || {};
    for (const [field, val] of Object.entries(inputs)) {
      if (typeof val !== 'string') continue;
      if (field === 'text' || field === 'prompt') {
        const hay = ((n.title || '') + ' ' + field).toLowerCase();
        const isNeg = /neg|negative|负向|负面/.test(hay);
        const entry = {
          node: n.id,
          classType: n.class_type,
          field,
          sample: val.slice(0, 120),
          title: n.title || n.class_type,
        };
        (isNeg ? neg : pos).push(entry);
      }
    }
  }
  return { pos, neg };
}

/* ════════════ 主解析：识别角色 + 输出 + 文本节点 ═════════════ */

/**
 * 解析一个 ComfyUI 工作流 JSON，产出 JINSU 接入所需的角色映射与诊断信息。
 * @param {Object} json
 * @param {{kindGuess?:string, name?:string}} [opts]
 * @returns {{
 *   kind:string, name:string,
 *   roles:Object, outputs:string[],
 *   textOutputs:Array<{node:string, classType:string, title:string}>,
 *   diagnostics:Object
 * }}
 */
export function analyzeWorkflow(json, { kindGuess = 'auto', name = '' } = {}) {
  const nodes = normalizeWorkflow(json);

  const loaders = { image: [], audio: [], video: [] };
  const modelLoaders = [];
  const saves = [];
  const samplers = [];
  const sizeNodes = [];
  const textOutputs = [];

  for (const n of nodes) {
    const ct = n.class_type || '';
    const inputs = n.inputs || {};

    if (LOADER_CLASSES[ct]) {
      loaders[LOADER_CLASSES[ct].mediaType].push({ node: n.id, class: ct, field: LOADER_CLASSES[ct].field });
    } else if (MODEL_LOADER_RE.test(ct)) {
      modelLoaders.push({ node: n.id, class: ct });
    }

    if (SAVE_CLASSES.includes(ct)) {
      saves.push({ node: n.id, class: ct, field: 'filename_prefix' });
    }
    if (SAMPLE_CLASSES.includes(ct)) {
      samplers.push({ node: n.id, class: ct });
    }
    if ((ct.startsWith('Empty') && ct.includes('Latent')) ||
        (inputs.width != null && inputs.height != null && ct.includes('Latent'))) {
      sizeNodes.push({ node: n.id, class: ct });
    }
    if (TEXT_OUTPUT_RE.test(ct)) {
      textOutputs.push({ node: n.id, classType: ct, title: n.title || ct });
    }
  }

  const { pos, neg } = textRoles(nodes);

  // ── 猜语义角色 ──
  const roles = {};
  if (pos.length) roles.positive_prompt = { node: pos[0].node, field: pos[0].field };
  if (neg.length) roles.negative_prompt = { node: neg[0].node, field: neg[0].field };
  if (sizeNodes.length) {
    roles.width = { node: sizeNodes[0].node, field: 'width' };
    roles.height = { node: sizeNodes[0].node, field: 'height' };
  }
  // seed：sampler 或 Noise 节点的 seed / noise_seed（且为直接控件值，非连线）
  for (const n of nodes) {
    const inputs = n.inputs || {};
    const ct = n.class_type || '';
    if (inputs.seed != null && !isLink(inputs.seed) &&
        (SAMPLE_CLASSES.includes(ct) || ct.includes('Noise'))) {
      roles.seed = { node: n.id, field: 'seed' };
      break;
    }
    if (inputs.noise_seed != null && !isLink(inputs.noise_seed)) {
      roles.seed = { node: n.id, field: 'noise_seed' };
      break;
    }
  }
  if (saves.length) roles.filename_prefix = { node: saves[0].node, field: 'filename_prefix' };

  // 视频类参数（时长/分辨率/比例）
  const hasVideoFields = nodes.some((n) => {
    const i = n.inputs || {};
    return i.seconds != null || i.resolution != null || i.aspect_ratio != null;
  });
  if (hasVideoFields) {
    for (const n of nodes) {
      const i = n.inputs || {};
      if (i.seconds != null && !isLink(i.seconds) && !roles.seconds) roles.seconds = { node: n.id, field: 'seconds' };
      if (i.resolution != null && !isLink(i.resolution) && !roles.resolution) roles.resolution = { node: n.id, field: 'resolution' };
      if (i.aspect_ratio != null && !isLink(i.aspect_ratio) && !roles.aspect_ratio) roles.aspect_ratio = { node: n.id, field: 'aspect_ratio' };
    }
  }

  // 图生图 / 图生视频：LoadImage 且非媒体数组 → image 角色
  if (!roles.image && loaders.image.length) roles.image = { node: loaders.image[0].node, field: loaders.image[0].field };
  if (!roles.audio && loaders.audio.length) roles.audio = { node: loaders.audio[0].node, field: loaders.audio[0].field };
  if (!roles.video && loaders.video.length) roles.video = { node: loaders.video[0].node, field: loaders.video[0].field };

  // ── 判定工作流类型（JINSU 分类）──
  const kind = kindGuess === 'auto' ? detectKind({ nodes, saves, loaders, hasVideoFields, textOutputs }) : kindGuess;

  return {
    kind,
    name: name || '未命名工作流',
    description: '',
    roles,
    outputs: saves.map((s) => s.class),
    textOutputs,
    diagnostics: {
      nodeCount: nodes.length,
      loaders,
      modelLoaders,
      saves,
      samplers,
      sizeNodes,
      textCandidates: { pos, neg },
      hasVideoFields,
    },
  };
}

/**
 * 推断 JINSU 工作流大类：
 *   text 文本细化(U00类) / i2v 图生视频 / r2v 文生视频·多图参考 / i2i 图生图 /
 *   t2i 文生图 / music 音乐 / video 通用视频 / audio 音频
 */
function detectKind({ nodes, saves, loaders, hasVideoFields, textOutputs }) {
  const hasVideoSave = saves.some((s) =>
    s.class === 'SaveVideo' || s.class === 'VHS_VideoCombine' || s.class === 'SaveAnimatedWEBP');
  const isMusicish = nodes.some((n) => /Music3|ACE[-_]?Step|MusicGen|AudioLDM|Music/i.test(n.class_type || ''));
  const isPureText = textOutputs.length && !saves.length &&
    !loaders.image.length && !loaders.video.length;

  if (isPureText && !hasVideoFields) return 'text';
  if (hasVideoSave || hasVideoFields) {
    // 有图输入但无视频输入 → 图生视频（首帧驱动）；否则文生视频/多图参考
    if (loaders.image.length && !loaders.video.length) return 'i2v';
    return 'r2v';
  }
  if (loaders.image.length && saves.some((s) => s.class === 'SaveImage')) return 'i2i';
  if (isMusicish && (loaders.audio.length || saves.some((s) => /audio/i.test(s.class)))) return 'music';
  if (loaders.video.length || saves.some((s) => /video/i.test(s.class))) return 'video';
  return 't2i';
}

/* ════════════ 生成 JINSU 接入草稿 ═════════════ */

const ROLE_EXAMPLES = {
  positive_prompt: '<正向提示词>',
  negative_prompt: '<负向提示词>',
  image: '<图片URL或上传>',
  audio: '<音频URL>',
  video: '<视频URL>',
  seed: 0,
  width: 768,
  height: 1344,
  seconds: 5,
  resolution: '1080',
  aspect_ratio: '9:16',
  filename_prefix: 'shortdrama/output',
};

const ROLE_LABELS = {
  positive_prompt: '正向提示词',
  negative_prompt: '负向提示词',
  image: '参考图/首帧',
  audio: '音频输入',
  video: '视频输入',
  seed: '随机种子',
  width: '宽度',
  height: '高度',
  seconds: '时长(秒)',
  resolution: '分辨率',
  aspect_ratio: '画幅比例',
  filename_prefix: '输出前缀',
};

const ROLE_ORDER = [
  'positive_prompt', 'negative_prompt', 'image', 'audio', 'video',
  'seed', 'width', 'height', 'seconds', 'resolution', 'aspect_ratio', 'filename_prefix',
];

/**
 * 把解析结果转成「接入草稿」：
 *   - inputs：每个可控角色 → 面板键 `<nodeId>:<widget>` + 示例值
 *   - panelInputValuesTemplate：可直接抄进 media-workflows.js 的 inputValues 模板
 *   - registrySnippet：可贴进 i18n.js 注册表的片段
 *   - submitExample：提交调用示例
 *   - notes：人工核对清单
 * @param {Object} analysis analyzeWorkflow 的返回值
 * @param {{name?:string, workflowId?:string, label?:string}} [opts]
 */
export function toJinsuDraft(analysis, { name = '', workflowId = 'XX-你的工作流显示名', label = '' } = {}) {
  const { kind, roles } = analysis;
  const inputs = [];
  for (const role of ROLE_ORDER) {
    // 媒体类输入（图/音频/视频）：多个 loader（首帧/尾帧、多图参考）时展开为 image_1 / image_2 …
    if (role === 'image' || role === 'audio' || role === 'video') {
      const list = analysis.diagnostics.loaders[role] || [];
      if (!list.length) continue;
      list.forEach((ld, idx) => {
        const suffix = list.length > 1 ? `_${idx + 1}` : '';
        inputs.push({
          role: role + suffix,
          label: (ROLE_LABELS[role] || role) + (list.length > 1 ? ` ${idx + 1}` : ''),
          nodeId: ld.node,
          widget: ld.field,
          panelKey: `${ld.node}:${ld.field}`,
          example: ROLE_EXAMPLES[role],
        });
      });
      continue;
    }
    const r = roles[role];
    if (!r) continue;
    inputs.push({
      role,
      label: ROLE_LABELS[role] || role,
      nodeId: r.node,
      widget: r.field,
      panelKey: `${r.node}:${r.field}`,
      example: ROLE_EXAMPLES[role],
    });
  }

  // inputValues 模板（仅含直接可填控件，连线类交给面板自动接）
  const tplLines = inputs.map((i) => {
    const v = JSON.stringify(i.example);
    return `      '${i.panelKey}': ${v},`;
  });
  const panelInputValuesTemplate = `{
${tplLines.join('\n')}
    }`;

  // 注册表片段（按类型拼到 i18n.js 对应表里）
  const registrySnippet = buildRegistrySnippet(kind, workflowId, label || name || '新工作流');

  // 提交示例
  const submitExample = textOnlyKind(kind)
    ? `// 文本型工作流（ShowText 出文），用 runPanelTextWorkflow
import { runPanelTextWorkflow } from '../dispatch-jobs.js';
const { text } = await runPanelTextWorkflow({ workflowId: '${workflowId}', inputValues: ${panelInputValuesTemplate} });`
    : `// 图片/视频型工作流，用 runPanelWorkflow
import { runPanelWorkflow } from '../dispatch-jobs.js';
const out = await runPanelWorkflow({ workflowId: '${workflowId}', inputValues: ${panelInputValuesTemplate} });`;

  const notes = buildNotes(analysis, inputs);

  return {
    kind,
    workflowId,
    label: label || name || '未命名工作流',
    inputs,
    textOutputs: analysis.textOutputs,
    outputs: analysis.outputs,
    panelInputValuesTemplate,
    registrySnippet,
    submitExample,
    notes,
  };
}

function textOnlyKind(kind) {
  return kind === 'text';
}

function buildRegistrySnippet(kind, wfId, label) {
  switch (kind) {
    case 't2i':
    case 'i2i':
      return `// 贴进 i18n.js 的 IMAGE_WF（按模型分）：
//   qwen: { text: '${wfId}', four: '${wfId}' },
// 如要作为新模型在设置里露出，再往 MODELS.image 加一项：
//   { key: 'newkey', label: '${label}', desc: '...', wf: '${wfId}' },`;
    case 'i2v':
    case 'r2v':
      return `// 贴进 i18n.js 的 VIDEO_WF（按引擎分，i2v=首帧驱动 / r2v=多图参考）：
//   h3: { i2v: '${wfId}', r2v: '${wfId}' },
// 注意：若面板注册名带「API-」前缀，再补一条回退 id（参考 U00_WF_FALLBACKS）。`;
    case 'music':
      return `// 贴进 i18n.js 的 MEDIA_WF：
//   music: '${wfId}',
// 同时把 MODELS.music 的 wf 指向它（替换 N05-ACE-Step）。`;
    case 'text':
      return `// 文本型（U00 类）单独建常量，参考 U00_WF_ID：
//   export const NEW_WF_ID = '${wfId}';
//   export const NEW_WF_FALLBACKS = ['API-${wfId}'];`;
    default:
      return `// 类型「${kind}」未匹配到标准注册表，请人工决定贴到 VIDEO_WF / IMAGE_WF / MEDIA_WF 哪一张。`;
  }
}

function buildNotes(analysis, inputs) {
  const notes = [];
  notes.push('① 面板键名核对：草稿里的 `<节点id>:<控件名>` 来自 ComfyUI 原始 JSON；但 Zealman 面板 _api_config 暴露的控件名可能与原始 widget 名不一致（尤其中文控件如「自定义宽」）。务必打开面板 GET /workflows/<id>.json 逐一比对。');
  notes.push('② 连线型输入：模型/正负向/潜空间等若在工作流里是节点连线（非直接控件），无需在 inputValues 里填，面板会自动接；草稿已自动跳过这类。');
  if (analysis.textOutputs.length) {
    notes.push(`③ 文本输出：检测到 ${analysis.textOutputs.length} 个 ShowText 类节点（${analysis.textOutputs.map((t) => t.node).join(', ')}），文本型工作流请走 runPanelTextWorkflow，结果从 TEXT_KEYS 深找。`);
  }
  if (analysis.diagnostics.loaders.image.length > 1 && /i2v/.test(analysis.kind)) {
    notes.push('④ 多图输入：检测到多个 LoadImage，i2v 首帧/尾帧（或 r2v 多参考图）需按面板连线顺序逐一映射到对应节点 id。');
  }
  if (!inputs.length) {
    notes.push('⑤ 未识别到任何可填控件：可能粘贴的是 UI 格式且缺少 widgets 字段，或工作流只由连线驱动。请用面板导出的 API 格式 JSON。');
  }
  notes.push('⑥ 计费/权限：workflowId 必须在面板已注册且调度机已配置计费，否则 runPanelWorkflow 会报「工作流不存在」。');
  return notes;
}

/* ════════════ 人类可读渲染（供 UI / 控制台）════════════ */

/**
 * 把草稿渲染成 Markdown，方便在对话框/日志里直接看。
 * @param {Object} draft toJinsuDraft 的返回值
 */
export function formatDraftMarkdown(draft) {
  const lines = [];
  lines.push(`## 工作流接入草稿：${draft.label}`);
  lines.push('');
  lines.push(`- **推断类型**：\`${draft.kind}\`（如不符，analyzeWorkflow 时传 kindGuess 覆盖）`);
  lines.push(`- **面板 workflowId**：\`${draft.workflowId}\`（替换为面板实际注册名）`);
  if (draft.outputs.length) lines.push(`- **输出节点**：${draft.outputs.join(', ')}`);
  if (draft.textOutputs.length) lines.push(`- **文本输出(ShowText)**：${draft.textOutputs.map((t) => `${t.node}(${t.classType})`).join(', ')}`);
  lines.push('');
  lines.push('### 可控输入 → 面板键');
  lines.push('');
  lines.push('| 角色 | 含义 | 面板键 `<节点id>:<控件>` | 示例 |');
  lines.push('| --- | --- | --- | --- |');
  for (const i of draft.inputs) {
    lines.push(`| \`${i.role}\` | ${i.label} | \`${i.panelKey}\` | ${JSON.stringify(i.example)} |`);
  }
  if (!draft.inputs.length) lines.push('| — | 未识别到可填控件 | — | — |');
  lines.push('');
  lines.push('### 可直接抄进 media-workflows.js 的 inputValues 模板');
  lines.push('');
  lines.push('```js');
  lines.push(draft.panelInputValuesTemplate);
  lines.push('```');
  lines.push('');
  lines.push('### 注册表片段（i18n.js）');
  lines.push('');
  lines.push('```js');
  lines.push(draft.registrySnippet);
  lines.push('```');
  lines.push('');
  lines.push('### 提交调用示例');
  lines.push('');
  lines.push('```js');
  lines.push(draft.submitExample);
  lines.push('```');
  lines.push('');
  lines.push('### 人工核对清单');
  lines.push('');
  for (const n of draft.notes) lines.push(`- ${n}`);
  return lines.join('\n');
}

export default { analyzeWorkflow, normalizeWorkflow, textRoles, toJinsuDraft, formatDraftMarkdown };
