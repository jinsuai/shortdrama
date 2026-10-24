/**
 * workflow-parse 自检 demo。
 * 用两份样例 ComfyUI API 格式 JSON 跑通 analyzeWorkflow → toJinsuDraft → formatDraftMarkdown，
 * 验证节点识别、类型推断、面板键生成是否正确。
 * 运行：node scripts/workflow-parse-demo.mjs
 */
import { analyzeWorkflow, toJinsuDraft, formatDraftMarkdown, normalizeWorkflow } from '../src/lib/workflow-parse.js';

/* ── 样例 1：图生图（LoadImage + SaveImage + KSampler + EmptyLatent + CLIPTextEncode + ShowText）── */
const sampleImage = {
  '10': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' }, _meta: { title: 'Load Checkpoint' } },
  '6':  { class_type: 'CLIPTextEncode', inputs: { text: 'a girl standing on a beach, cinematic lighting', clip: ['10', 1] }, _meta: { title: 'Positive' } },
  '7':  { class_type: 'CLIPTextEncode', inputs: { text: 'blurry, low quality, watermark', clip: ['10', 1] }, _meta: { title: 'Negative Prompt' } },
  '3':  { class_type: 'EmptyLatentImage', inputs: { width: 768, height: 1344, batch_size: 1 }, _meta: { title: 'Empty Latent' } },
  '5':  { class_type: 'KSampler', inputs: { seed: 12345, steps: 20, cfg: 7, model: ['10', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['3', 0] }, _meta: { title: 'KSampler' } },
  '8':  { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['10', 2] }, _meta: { title: 'VAE Decode' } },
  '1':  { class_type: 'LoadImage', inputs: { image: 'input.png' }, _meta: { title: 'Load Image' } },
  '9':  { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'shortdrama/out' }, _meta: { title: 'Save Image' } },
  '13': { class_type: 'ShowText|pysssss', inputs: { text: ['6', 0] }, _meta: { title: 'Show Text' } },
};

/* ── 样例 2：图生视频（两个 LoadImage 首/尾帧 + SaveVideo + seconds 控件）── */
const sampleI2V = {
  '10': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'h3.safetensors' }, _meta: { title: 'Load Checkpoint' } },
  '6':  { class_type: 'CLIPTextEncode', inputs: { text: 'a warrior walks forward, epic', clip: ['10', 1] }, _meta: { title: 'Positive' } },
  '7':  { class_type: 'CLIPTextEncode', inputs: { text: 'static, blurry', clip: ['10', 1] }, _meta: { title: 'Negative' } },
  '114': { class_type: 'LoadImage', inputs: { image: 'first.png' }, _meta: { title: '首帧' } },
  '128': { class_type: 'LoadImage', inputs: { image: 'last.png' }, _meta: { title: '尾帧' } },
  '105': { class_type: 'KSamplerAdvanced', inputs: { noise_seed: 777, steps: 10, model: ['10', 0] }, _meta: { title: 'Sampler' } },
  '92':  { class_type: 'VHS_VideoCombine', inputs: { images: ['105', 0], filename_prefix: 'video/H3', seconds: 5 }, _meta: { title: 'Video Combine' } },
};

function run(label, json, opts) {
  console.log('\n==================================================');
  console.log(`样例：${label}`);
  console.log('==================================================');
  const analysis = analyzeWorkflow(json, opts);
  const draft = toJinsuDraft(analysis, { name: label });
  console.log(formatDraftMarkdown(draft));
  return { analysis, draft };
}

const a1 = run('示例·图生图(i2i)', sampleImage, { name: '示例图生图' });
const a2 = run('示例·图生视频(i2v)', sampleI2V, { name: '示例图生视频' });

/* 断言：关键识别是否正确 */
const checks = [];
checks.push(['i2i 类型推断', a1.analysis.kind === 'i2i']);
checks.push(['i2i 正向提示词节点', a1.analysis.roles.positive_prompt.node === '6']);
checks.push(['i2i 负向提示词节点', a1.analysis.roles.negative_prompt.node === '7']);
checks.push(['i2i 尺寸节点', a1.analysis.roles.width.node === '3' && a1.analysis.roles.height.node === '3']);
checks.push(['i2i 种子节点', a1.analysis.roles.seed.node === '5' && a1.analysis.roles.seed.field === 'seed']);
checks.push(['i2i 图像输入', a1.analysis.roles.image.node === '1']);
checks.push(['i2i ShowText 文本输出', a1.analysis.textOutputs.length === 1 && a1.analysis.textOutputs[0].node === '13']);
checks.push(['i2v 类型推断', a2.analysis.kind === 'i2v']);
checks.push(['i2v 两个 LoadImage', a2.analysis.diagnostics.loaders.image.length === 2]);
checks.push(['i2v 视频保存节点', a2.analysis.outputs.includes('VHS_VideoCombine')]);
checks.push(['i2v noise_seed', a2.analysis.roles.seed.field === 'noise_seed']);

console.log('\n──────── 断言结果 ────────');
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✓' : '✗'} ${name}`);
  if (!pass) ok = false;
}
console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
