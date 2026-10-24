import React, { useState, useRef, useEffect } from "react";
import mammoth from "mammoth";
import { api } from "../../dispatch-jobs.js";
import { readTextFileAuto, parseSourceToScript } from "../../utils.js";
import { isLoggedIn, precheckCredits, deductCredits, getCreditBalance } from "../../utils/backend-api.js";
import { getPrice } from "../../utils/pricing-utils.js";
import { buildCharacterBasePrompt } from "./CharacterManager.jsx";

// 健壮的JSON解析函数：处理markdown代码块、多余文字、常见格式错误
// 剧本风格自动识别：写入 project.styleKey，供人物提示词风格层使用
const detectScriptStyle = (text) => {
  const t = (text || "").slice(0, 3000);
  if (/(科幻|星际|未来|机甲|赛博|末世|外太空)/.test(t)) return "cyberpunk";
  if (/(玄幻|修仙|仙侠|修真|武侠|江湖|武林|门派|侠客|剑客|古风|朝堂|帝王|将军|盟主)/.test(t)) return "wuxia";
  if (/(现代|都市|职场|校园|豪门|总裁|医院)/.test(t)) return "realistic";
  if (/(民国|军阀|旗袍|租界)/.test(t)) return "noir";
  return "";
};
const robustParseJSON = (text) => {
  if (!text) return null;
  let clean = text.trim();
  // 去除markdown代码块
  clean = clean.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  // 去除前后多余文字（找到第一个{和最后一个}）
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }
  // 尝试直接解析
  try {
    return JSON.parse(clean);
  } catch (e) {
    console.log("[JSON解析] 直接解析失败，尝试修复:", e.message);
  }
  // 修复常见错误：单引号转双引号
  try {
    const fixed = clean.replace(/'/g, '"');
    return JSON.parse(fixed);
  } catch (e) {
    console.log("[JSON解析] 单引号修复失败:", e.message);
  }
  // 修复：去除尾部多余逗号
  try {
    const fixed = clean.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(fixed);
  } catch (e) {
    console.log("[JSON解析] 去尾逗号失败:", e.message);
  }
  // 截断修复：如果JSON被截断，尝试找到最后一个完整的字符串字段并补全
  try {
    // 找到第一个{
    const start = clean.indexOf("{");
    if (start === -1) return null;
    let truncated = clean.slice(start);
    // 如果最后一个字符不是}，尝试补全
    if (!truncated.endsWith("}")) {
      // 找到最后一个完整的 "key":"value" 对
      const lastCompleteQuote = truncated.lastIndexOf('"');
      if (lastCompleteQuote > 0) {
        // 检查最后一个引号是不是值的结束引号
        const beforeQuote = truncated.slice(0, lastCompleteQuote + 1);
        // 简单补全：添加}
        truncated = beforeQuote + "}";
      } else {
        truncated = truncated + "}";
      }
    }
    return JSON.parse(truncated);
  } catch (e) {
    console.log("[JSON解析] 截断修复失败:", e.message);
  }
  return null;
};

export function NewScriptModule({ project, update, log, onSwitchTab }) {
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");
  const [outline, setOutline] = useState(null);

  const fileInputRef = useRef(null);

  // 处理文件上传（支持 txt/md 文本文件和 docx 文件）
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.[^/.]+$/, "");
    const ext = file.name.split('.').pop().toLowerCase();
    let scriptContent = "";

    setLoading(true);
    log(`正在读取文件：${file.name}`);

    try {
      if (ext === 'docx' || ext === 'doc') {
        // 使用 mammoth 解析 docx（避免 JSZip 缺失导致的乱码）
        try {
          const ab = await file.arrayBuffer();
          const res = await mammoth.extractRawText({ arrayBuffer: ab });
          scriptContent = res.value || res.errorMessage || "";
        } catch (zipErr) {
          scriptContent = "上传的 " + ext + " 文件解析失败：" + zipErr.message + "。请将文档内容复制粘贴到新建剧本中。";
        }
      } else {
        // txt/md 文本文件（自动检测 UTF-8 / GBK 编码，解决乱码）
        scriptContent = await readTextFileAuto(file);
        scriptContent = scriptContent.slice(0, 50000);
      }

      log("正在分析剧本内容...");
      log("本地解析并清洗分集内容（100%忠实原文），请稍候");

      // 未登录用户不能使用
      if (!isLoggedIn()) {
        alert("请先登录后再使用上传剧本AI分析功能");
        setLoading(false);
        return;
      }
      // 积分预校验（上传剧本AI分析价格从调度机获取）
      // 本地清洗已分集剧本原文：删除制作标注（【节拍】【AI 画面提示】【字幕建议】等），
// 只保留场景头/动作/台词，100% 忠实于原文，不经过 LLM 改写。
// 兼容"每场景一整行"与"逐行排版"两种格式。
// 把场景列表转换为统一的场景资产结构（视频生成界面用 name/desc/image，素材库用 title）
function toSceneAssets(scenes) {
  return (scenes || []).map((s, i) => ({
    id: s.id || ("scene_" + Date.now() + "_" + i),
    name: s.name || s.title || ("场景" + (i + 1)),
    title: s.title || s.name || ("场景" + (i + 1)),
    desc: s.desc || "",
    image: s.image || "",
    imageUrl: s.imageUrl || null,
    videoUrl: s.videoUrl || null,
    source: s.source || "auto"
  }));
}

// 从清洗后的分集内容中提取场景资产（按 1-1 场景头标记，全剧去重）
function extractSceneAssets(episodes) {
  const out = [];
  const seen = new Set();
  (episodes || []).forEach((ep, ei) => {
    for (const ln of (ep.content || "").split("\n")) {
      const m = ln.match(/^[\d]+-\d+\s+(.+?)\s+(?:日|夜|清晨|黄昏|黎明|午后|凌晨|晌午|傍晚)/);
      if (m) {
        const t = m[1].trim();
        if (!seen.has(t)) {
          seen.add(t);
          out.push({ id: "scene_" + Date.now() + "_" + out.length, name: t, title: t, desc: ln, image: "", imageUrl: null, videoUrl: null, source: "auto", episodeId: ep.id || null });
        }
      }
    }
  });
  return out;
}

// 把 LLM 生成的完整剧本文档（剧情梗概+人物小传+分集分镜脚本）走上传剧本同款本地解析+清洗管道
function buildFromScriptDoc(text, baseTitle) {
  const local = parseSourceToScript(text || "");
  const localEps = local.episodes || [];
  const meta = local.meta || {};
  if (localEps.length === 0) {
    // 兜底：识别不到集边界时按单集处理
    return {
      episodes: [{ id: "ep_1", title: baseTitle || "第1集", content: cleanEpisode(text || "") }],
      synopsis: (text || "").slice(0, 120),
      characters: [], scenes: [], meta
    };
  }
  const episodes = localEps.map((lp, i) => ({
    id: "ep_" + (i + 1),
    title: lp.title || ("第" + (i + 1) + "集"),
    content: cleanEpisode(lp.content || lp.body || "")
  }));
  const synopsis = meta.synopsis || (text || "").slice(0, 200) + "...";
  let characters = [];
  if (meta.charBlock) {
    const charLines = meta.charBlock.split("\n").map((s) => s.trim()).filter((s) => /^[\u4e00-\u9fa5·]{2,8}\s*[（(]/.test(s));
    characters = charLines.map((ln, i) => {
      const nm = (ln.match(/^([\u4e00-\u9fa5·]{2,8})/) || [])[1] || ("角色" + (i + 1));
      const role = (ln.match(/[（(]([^）)]{1,30})[）)]/) || [])[1] || "";
      const desc = ln.replace(/^([\u4e00-\u9fa5·]{2,8})\s*[（(][^）)]*[）)]\s*/, "");
      return { id: "char_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2, 6), name: nm, role, personality: "", appearance: (desc || ln).slice(0, 100), image: null, locked: false };
    });
  }
  characters = characters.map((ch) => ({ ...ch, promptCn: ch.promptCn || buildCharacterBasePrompt(ch) }));
  const scenes = extractSceneAssets(episodes);
  if (scenes.length === 0) {
    episodes.forEach((ep, i) => {
      scenes.push({ id: "scene_" + Date.now() + "_" + i, name: ep.title, title: ep.title, desc: ep.content || "", image: "", imageUrl: null, videoUrl: null, source: "auto", episodeId: ep.id });
    });
  }
  return { episodes, synopsis, characters, scenes, meta };
}

function cleanEpisode(body) {
  let s = body || "";
  // 1) 删除【节拍：xxx】标注
  s = s.replace(/【节拍：[^】]*】/g, "");
  // 2) 删除【AI 画面提示・xxx】块：从标记起到行尾（或下一个【）的内容
  s = s.replace(/【AI 画面提示[^】]*】[^【\n]*/g, "");
  // 3) 删除独立"字幕建议：xxx"
  s = s.replace(/字幕建议：[^\n]*/g, "");
  // 4) 清理残留：压缩空白、去掉空行、去掉行尾多余标点
  s = s.replace(/[ \t]+/g, " ");
  s = s.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  return s;
}

const analyzePrice = getPrice("llm_script_analyze", 2.0);
      try {
        const precheck = await precheckCredits(analyzePrice, "text", "上传剧本AI分析");
        if (!precheck.sufficient && precheck.sufficient !== undefined) {
          log(`❌ 积分不足：需要${analyzePrice}积分，当前余额${precheck.balance || 0}积分`);
          alert(`积分不足！上传剧本AI分析需要${analyzePrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
          setLoading(false);
          return;
        }
      } catch (e) {
        log(`⚠️ 积分预校验失败：${e.message}`);
      }

      try {
        // ── 先用本地解析器识别集边界（支持"第一集/第30集"中文数字 + 阿拉伯数字）──
        const local = parseSourceToScript(scriptContent);
        const localEps = local.episodes || [];   // [{title, body, order}]

        if (localEps.length >= 2) {
          // ✅ 已分集剧本：完全本地处理（100%忠实原文，零LLM调用零成本）
          log(`已识别剧本共 ${localEps.length} 集（本地解析），本地清洗中...`);
          const meta = local.meta || {};

          // 1) 集内容：清洗制作标注，保留场景/动作/台词原文
          const episodes = localEps.map((lp, i) => ({
            id: `ep_${i + 1}`,
            title: lp.title || `第${i + 1}集`,
            content: cleanEpisode(lp.content || lp.body || "")
          }));

          // 2) 梗概：直接用原文梗概（忠实）
          const synopsis = meta.synopsis || (scriptContent || "").slice(0, 200) + "...";

          // 3) 人物：本地从人物小传按"名字（身份）"行提取，姓名与原文完全一致
          let characters = [];
          if (meta.charBlock) {
            const charLines = meta.charBlock.split("\n").map((s) => s.trim()).filter((s) => /^[\u4e00-\u9fa5·]{2,8}\s*[（(]/.test(s));
            characters = charLines.map((ln, i) => {
              const nm = (ln.match(/^([\u4e00-\u9fa5·]{2,8})/) || [])[1] || ("角色" + (i + 1));
              const role = (ln.match(/[（(]([^）)]{1,30})[）)]/) || [])[1] || "";
              const desc = ln.replace(/^([\u4e00-\u9fa5·]{2,8})\s*[（(][^）)]*[）)]\s*/, "");
              return { id: "char_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2, 6), name: nm, role, personality: "", appearance: (desc || ln).slice(0, 100), image: null, locked: false };
            });
          }
          // 自动生成角色提示词（与"AI分析人物"同款本地模板，不额外扣费），用户在生成前可直接修改
          characters = (characters || []).map((ch) => ({ ...ch, promptCn: ch.promptCn || buildCharacterBasePrompt(ch) }));

          // 4) 场景：从各集原文提取场景头（如"1-1 武林大会广场 日 外"）
          const scenes = [];
          const seen = new Set();
          for (const ep of episodes) {
            for (const ln of (ep.content || "").split("\n")) {
              const m = ln.match(/^[\d]+-[\d]+\s+(.+?)\s+(?:日|夜|清晨|黄昏|黎明|午后|凌晨|晌午|傍晚)/);
              if (m) {
                const t = m[1].trim();
                if (!seen.has(t)) { seen.add(t); scenes.push({ title: t, desc: ln }); }
              }
            }
          }

          log(`剧本分析完成：${episodes.length}集，${characters.length}个人物，${scenes.length}个场景`);
          update({
            styleKey: detectScriptStyle(scriptContent || synopsis || ""),
        title: name,
            script: scriptContent,
            outline: { synopsis: synopsis || (scriptContent?.slice(0, 100) + "...") || "上传的剧本内容", characters, relations: [] },
            episodes,
            scenes: scenes.map((s, i) => ({
              id: `scene_${i + 1}`, episodeId: episodes[i]?.id || episodes[0]?.id || null,
              title: s.title || `场景${i + 1}`, desc: s.desc || "", imageUrl: null, videoUrl: null
            })),
            shots: [],
            materials: { characters, scenes: toSceneAssets(scenes) }
          });
        } else {
          // ✅ 未分集文本（小说/散文）：保持 LLM 按内容拆分（每集300-500字自然切分）
          const prompt = `你是一名专业竖屏短剧编剧。请将以下小说/剧本内容**完整拆分为短剧分集**，不要省略任何内容，并提取所有人物信息。

要求：
1. 每集时长90-120秒，对应300-500字剧本内容，按内容情节自然切分总集数，不要少拆也不要硬拆
2. 每集必须有明确的冲突点和钩子（结尾留悬念）
3. 人物信息要详细，包含外貌特征（便于AI生图保持一致性）
4. **只输出纯JSON，不要markdown代码块，不要解释，不要省略号**
5. episodes数组必须完整，不能截断

剧本内容：
${scriptContent.slice(0, 20000)}

输出JSON格式：
{
  "synopsis": "故事梗概（必填，150-200字，含核心冲突和卖点，不能为空）",
  "episodes": [
    {"title": "第X集：吸引人的标题", "content": "本集完整剧本（300-500字，含场景描述和人物对话）"}
  ],
  "characters": [
    {"name": "角色名", "role": "身份/职业", "personality": "性格特点（3-5个关键词）", "appearance": "外貌描述（年龄/发型/脸型/服装/体型，便于AI生图）"}
  ],
  "scenes": [
    {"title": "场景名", "desc": "场景描述（时间/地点/环境/氛围）"}
  ]
}`;

          const res = await api("/api/llm/chat", {
            method: "POST",
            body: JSON.stringify({
              messages: [{ role: "user", content: prompt }], max_tokens: 8192, llm_type: "script_analyze"
            })
          });

          const text = res.text || "{}";
          console.log("[上传剧本LLM输出]", text);
          log("LLM返回长度：" + text.length + "字符");

          let parsed = robustParseJSON(text);
          let episodes = (parsed?.episodes || []).map((ep, i) => ({
            id: `ep_${i + 1}`,
            title: ep.title || `第${i + 1}集`,
            content: ep.content || ""
          }));

          // 兜底：LLM失败/集为空时，用本地解析结果（有集标题则用，否则整篇为第1集），不再400字盲切
          if (!parsed || episodes.length === 0) {
            log("JSON解析失败/集为空，使用本地解析结果");
            episodes = localEps.map((ep, i) => ({
              id: `ep_${i + 1}`,
              title: ep.title || `第${i + 1}集`,
              content: ep.body || ""
            }));
          }

          let characters = (parsed?.characters || []).map((c, i) => ({
            id: `char_${i + 1}`,
            name: c.name || `角色${i + 1}`,
            role: c.role || "",
            personality: c.personality || "",
            appearance: c.appearance || "",
            image: null,
            locked: false
          }));

          if (characters.length === 0) {
            log("characters为空，生成默认角色");
            characters = [
              { id: "char_1", name: "主角", role: "主角", personality: "坚韧", appearance: "", image: null, locked: false },
              { id: "char_2", name: "反派", role: "反派", personality: "狡诈", appearance: "", image: null, locked: false },
              { id: "char_3", name: "配角", role: "配角", personality: "善良", appearance: "", image: null, locked: false }
            ];
          }

          const scenes = (parsed?.scenes || []).map((s, i) => ({
            id: `scene_${i + 1}`,
            episodeId: episodes[i]?.id || episodes[0]?.id || null,
            title: s.title || `场景${i + 1}`,
            desc: s.desc || "",
            imageUrl: null,
            videoUrl: null
          }));

          update({
            styleKey: detectScriptStyle(scriptContent || synopsis || ""),
        title: name,
            script: scriptContent,
            outline: {
              synopsis: parsed?.synopsis || (scriptContent?.slice(0, 100) + "...") || "上传的剧本内容",
              characters,
              relations: []
            },
            episodes,
            scenes,
            shots: [],
            materials: { characters, scenes: toSceneAssets(scenes) }
          });

          // 自动生成角色提示词（与"AI分析人物"同款本地模板，不额外扣费），用户在生成前可直接修改
          characters = (characters || []).map((ch) => ({ ...ch, promptCn: ch.promptCn || buildCharacterBasePrompt(ch) }));

          log(`剧本分析完成：${episodes.length}集，${characters.length}个人物`);
        }

        // 积分扣减（上传剧本AI分析2积分）
        if (isLoggedIn()) {
          try {
            await deductCredits(analyzePrice, "text", "上传剧本AI分析");
            log(`✅ 积分扣减成功：${analyzePrice}积分`);
            try {
              const balanceData = await getCreditBalance();
              if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
              if (window.refreshUserInfo) window.refreshUserInfo();
            } catch (e) {}
          } catch (e) {
            log(`⚠️ 积分扣减失败：${e.message}`);
          }
        }
      } catch (err) {
        log("分析失败，使用基础模式：" + err.message);
        update({
          styleKey: detectScriptStyle(scriptContent || synopsis || ""),
        title: name,
          script: scriptContent,
          outline: {
            synopsis: "上传的剧本内容",
            characters: []
          },
          episodes: [{ id: "ep_1", title: "第1集", content: scriptContent.slice(0, 2000) }],
          scenes: [{ id: "scene_1", title: "开场", desc: scriptContent.slice(0, 500) }],
          materials: { characters: [] }
        });
      } finally {
        setLoading(false);
      }
    } catch (uploadErr) {
      log("文件读取失败：" + uploadErr.message);
      setLoading(false);
    }
  };

  // 调用 LLM 生成剧本
  const generateScript = async (params) => {
    setLoading(true);
    // 未登录用户不能使用
    if (!isLoggedIn()) {
      alert("请先登录后再使用剧本生成功能");
      setLoading(false);
      return;
    }
    // 积分预校验（快速创建价格从调度机获取）
    const quickCreatePrice = getPrice("llm_script_quick_create", 3.0);
    try {
      const precheck = await precheckCredits(quickCreatePrice, "text", "剧本生成-快速创建");
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${quickCreatePrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！快速创建剧本需要${quickCreatePrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        setLoading(false);
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }
    try {
      const episodeCount = parseInt(params.episodes) || 5;
      const prompt = `你是一名爆款竖屏短剧编剧。请根据以下参数直接输出一部完整竖屏短剧的剧本文档（纯文本，不要JSON、不要markdown代码块、不要解释）。

【剧本文档格式】必须严格按照以下结构输出：

剧情梗概
（150-200字，含核心冲突和卖点，一段话）

人物小传
主角名（主角・身份）
一句话定位：xxx
性格：xxx
动机：xxx
成长弧线：xxx
视觉方向：xxx
关键道具：xxx
（每个主要人物都这样写一段，至少3个人物）

第一集：标题
1-1 场景名 日 外 人物：角色名
△（景别）动作与画面描述。
角色名：台词内容
【节拍：节奏点名称】
【AI 画面提示・通用】16:9 横屏。画面/运镜/氛围/音效描述。字幕建议：xxx
1-2 场景名 夜 内 人物：角色名
△（景别）动作与画面描述。
角色名：台词内容
【节拍：节奏点名称】
【AI 画面提示・通用】16:9 横屏。画面/运镜/氛围/音效描述。字幕建议：xxx

第二集：标题
（与第一集相同的格式，继续输出）
（直到全部集数写完）

【创作要求】
1. 竖屏短剧，每集90-120秒（300-500字），每集包含1-2个场景（1-1、1-2），场景编号必须连续
2. 开头3秒必须有强钩子（冲突/悬念/反转），每集结尾留悬念
3. 节奏快，冲突密集，爽点充足
4. 人物设定要具体（外貌描述便于AI生图保持一致性）
5. 【重要】台词格式必须规范：每句台词必须以"角色名：台词内容"格式开头，角色名要明确，不能用"他/她/他们"等代词
6. 【台词打磨】台词精炼有力，符合人物性格和身份，有记忆点和传播性，避免口水话、废话和重复表达；关键台词要有冲击力和情绪张力
7. 【重要】只输出剧本正文纯文本，不要JSON、不要解释、不要省略号、不要截断

【参数】
- 剧本类型：${params.type}
- 剧本名称：${params.title || "未命名"}
- 集数：必须生成 ${episodeCount} 集，不能少
- 单集时长：${params.duration}秒
- 主角性别：${params.gender}
- 核心关键词：${params.keywords || "无"}
`;

      const res = await api("/api/llm/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }], max_tokens: 16384, llm_type: "script_quick_create"
        })
      });

      // 本地解析+清洗：LLM 输出完整剧本文档 → parseSourceToScript 分集 → cleanEpisode 清洗
      const text = res.text || "{}";
      console.log("[LLM原始输出]", text.slice(0, 300));
      log("LLM返回长度：" + text.length + "字符");

      const built = buildFromScriptDoc(text, params.title || "新剧本");
      let episodes = built.episodes;

      // 确保集数足够
      if (episodes.length < episodeCount) {
        log(`警告：模型只返回了${episodes.length}集，补充到${episodeCount}集`);
        for (let i = episodes.length; i < episodeCount; i++) {
          episodes.push({
            id: `ep_${i + 1}`,
            title: `第${i + 1}集`,
            content: `第${i + 1}集内容待生成`
          });
        }
      }

      const scenes = built.scenes;

      // 确保characters至少3个
      let characters = built.characters || [];
      if (characters.length < 3) {
        const have = new Set(characters.map((ch) => ch.name));
        const defs = [
          { name: "主角", role: "主角", personality: "坚韧", appearance: "" },
          { name: "反派", role: "反派", personality: "狡诈", appearance: "" },
          { name: "配角", role: "配角", personality: "善良", appearance: "" }
        ];
        for (const d of defs) {
          if (!have.has(d.name)) { characters.push({ ...d, image: null, locked: false }); }
        }
      }

      const synopsis = built.synopsis || (episodes[0]?.content?.slice(0, 80) + "...") || ("类型：" + params.type + "，关键词：" + (params.keywords || "无"));

      update({
        styleKey: detectScriptStyle(scriptContent || synopsis || ""),
        title: params.title || "新剧本",
        type: params.type,
        episodes,
        outline: { synopsis, characters },
        scenes,
        materials: { characters, scenes }
      });

      setOutline(parsed);
      // 同时存入素材库（生成的剧本文本也保存）
      try {
        // 必须基于现有素材库追加，写死 [] 会让每次创建剧本都清空整个素材库
        const currentAssets = project?.assets || [];
        const scriptContent = text;
        const newTextAsset = {
          id: "a_text_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
          type: "text",
          title: `${params.title || "新剧本"}（快速创建，${new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}）`,
          url: "",
          content: scriptContent,
          status: "ready",
          tags: ["剧本生成", "快速创建", `${episodes.length}集`],
          favorite: false,
          episodeCount: episodes.length,
          characterCount: characters.length,
          createdAt: Date.now()
        };
        update({ assets: [newTextAsset, ...currentAssets] });
        log(`✅ 剧本已存入素材库：${newTextAsset.title}`);
      } catch (e) {
        log(`⚠️ 剧本存入素材库失败：${e.message}`);
      }
      log(`剧本生成成功：${episodes.length}集，${characters.length}个人物`);
      // 积分扣减（快速创建3积分）
      if (isLoggedIn()) {
        try {
                    log(`✅ 积分扣减成功：3积分`);
          try {
            const balanceData = await getCreditBalance();
            if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
            if (window.refreshUserInfo) window.refreshUserInfo();
          } catch (e) {}
        } catch (e) {
          log(`⚠️ 积分扣减失败：${e.message}`);
        }
      }
    } catch (e) {
      log("生成失败：" + e.message);
      console.error("[生成失败]", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 16, height: "100%", overflow: "auto", color: "var(--text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>🎬 剧本创作</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 13 }}>
            📁 上传剧本（AI分析 ${getPrice("llm_script_analyze", 1.0)}积分）
            <input type="file" accept=".txt,.md,.docx" style={{ display: "none" }} onChange={handleUpload} />
          </label>
          <button style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #6D28D9, #0891B2)", color: "#fff", cursor: "pointer" }} onClick={() => setNewModalOpen(true)}>
            + 新建剧本
          </button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        支持上传剧本或AI生成完整剧本（大纲+分集+分镜）
      </div>

      {/* 大纲展示 */}
      {project.outline && (
        <div style={{ marginBottom: 16, padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>📋 剧本大纲</h3>
            {project.episodes && project.episodes.length > 0 && (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{project.episodes.length} 集 · {project.outline.characters?.length || 0} 个人物</span>
            )}
          </div>
          {project.outline.synopsis && (
            <div style={{ marginBottom: 12, padding: 10, background: "var(--input-bg)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>故事梗概</div>
              <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>{project.outline.synopsis}</p>
            </div>
          )}
          {project.outline.characters && project.outline.characters.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>人物关系</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {project.outline.characters.map((c, i) => (
                  <div key={i} style={{ padding: "6px 10px", background: "rgba(109,40,217,0.15)", borderRadius: 6, border: "1px solid rgba(109,40,217,0.3)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#6D28D9" }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{c.role}{c.personality ? " · " + c.personality : ""}</div>
                  </div>
                ))}
              </div>
              {project.outline.relations && project.outline.relations.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
                  关系：{project.outline.relations.join("、")}
                </div>
              )}
            </div>
          )}
          {project.episodes && project.episodes.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>分集列表（{project.episodes.length}集）</div>
                <button style={{ fontSize: 11, padding: "2px 8px", border: "1px solid var(--border)", borderRadius: 4, background: "transparent", color: "var(--text)", cursor: "pointer" }}
                  onClick={() => onSwitchTab("storyboard")}>前往分镜 →</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {project.episodes.map((ep, i) => (
                  <div key={i} style={{ padding: "8px 12px", background: "var(--input-bg)", borderRadius: 6, fontSize: 12, cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                    onClick={() => onSwitchTab("editor")}>
                    <span style={{ fontWeight: 500 }}>{ep.title}</span>
                    <span style={{ color: "var(--text-muted)" }}>{ep.content?.length || 0} 字</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {newModalOpen && <NewScriptModal onClose={() => setNewModalOpen(false)} onCreated={(s) => { log("新剧本：" + s.title); setNewModalOpen(false); }} onGenerated={generateScript} log={log} update={update} />}
      {loading && <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>🤖 AI 正在生成剧本...</div>}
    </div>
  );
}

function NewScriptModal({ onClose, onCreated, onGenerated, log, update }) {
  const [mode, setMode] = useState("select");
  const [isVip, setIsVip] = useState(() => {
    // 从localStorage读取会员状态，默认为false（只有购买会员才是VIP）
    try {
      return localStorage.getItem("USER_VIP_STATUS") === "true";
    } catch { return false; }
  });
  const [vipChecking, setVipChecking] = useState(true);

  // 获取会员状态（只检查明确的会员状态key，避免模糊匹配误判）
  useEffect(() => {
    const checkVip = () => {
      // 只检查明确的会员状态key
      const explicitVipKeys = ["USER_VIP_STATUS", "VIP_STATUS", "MEMBERSHIP_STATUS", "IS_VIP", "IS_MEMBER"];
      for (const key of explicitVipKeys) {
        try {
          const val = localStorage.getItem(key);
          if (val === "true") {
            setIsVip(true);
            setVipChecking(false);
            return;
          }
        } catch {}
      }
      // 如果没有明确的VIP状态，默认是免费用户
      setIsVip(false);
      localStorage.setItem("USER_VIP_STATUS", "false");
      setVipChecking(false);
    };
    checkVip();
    const timer = setInterval(checkVip, 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>新建剧本</h3>
          <button style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "var(--text)" }} onClick={onClose}>×</button>
        </div>
        {mode === "select" && (
          <div style={{ display: "flex", gap: 12 }}>
            <button style={cardBtn} onClick={() => setMode("quick")}>
              <div style={{ fontSize: 24 }}>⚡</div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>快速创建</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>填写基本信息，AI自动生成剧本</div>
            </button>
            <button style={{ ...cardBtn, opacity: isVip ? 1 : 0.5, position: "relative" }} onClick={isVip ? () => setMode("detail") : undefined}>
              <div style={{ fontSize: 24 }}>🎯</div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>详细创建</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>VIP专属 · 4步完整配置</div>
              {!isVip && <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 4 }}>🔒 VIP权限</div>}
            </button>
          </div>
        )}
        {mode === "quick" && <QuickCreate onDone={(s) => { onCreated(s); onClose(); }} onBack={() => setMode("select")} onGenerate={onGenerated} onClose={onClose} />}
        {mode === "detail" && isVip && <DetailWizard onCreated={(s) => { onCreated(s); onClose(); }} onClose={onClose} log={log} update={update} />}
        {mode === "detail" && !isVip && (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 14, color: "var(--text)" }}>详细创建为 VIP 功能</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>订阅会员后可使用完整 4 步向导</div>
            <button style={{ marginTop: 16, padding: "8px 20px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", cursor: "pointer" }} onClick={() => { onClose(); onCreated({ vipRequired: true }); }}>
              立即开通 VIP
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickCreate({ onDone, onBack, onGenerate, onClose }) {
  const [form, setForm] = useState({
    type: "revenge", title: "", episodes: 10, duration: 120, gender: "female", keywords: ""
  });
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");
  const types = [
    { k: "revenge", n: "复仇", e: "🔥" }, { k: "sweet", n: "甜宠", e: "🍬" },
    { k: "inlaw", n: "婆媳", e: "🏠" }, { k: "counter", n: "逆袭", e: "🚀" },
    { k: "xuanhuan", n: "玄幻", e: "⚔️" }, { k: "modern", n: "都市", e: "🌆" },
    { k: "ancient", n: "古装", e: "👑" }, { k: "trans", n: "穿越", e: "🌀" },
    { k: "face", n: "打脸", e: "👊" }, { k: "suspense", n: "悬疑", e: "🔍" }
  ];
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updateForm = update; // 兼容别名
  
  const handleSubmit = async () => {
    if (onGenerate) {
      setLoading(true);
      try {
        await onGenerate(form);
        onClose();
      } finally {
        setLoading(false);
      }
    } else {
      onDone({ ...form, id: "script_" + Date.now(), createdAt: Date.now() });
      onClose();
    }
  };
  
  return (
    <div>
      <button style={{ marginBottom: 12, padding: "6px 12px", border: "1px solid var(--border)", background: "transparent", color: "var(--text)", borderRadius: 6, cursor: "pointer" }} onClick={onBack}>← 返回</button>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>剧本类型</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {types.map(t => (
              <button key={t.k} style={{ padding: "4px 10px", border: form.type === t.k ? "2px solid #6D28D9" : "1px solid var(--border)", borderRadius: 6, background: form.type === t.k ? "rgba(109,40,217,0.2)" : "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }} onClick={() => updateForm("type", t.k)}>{t.e} {t.n}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={label}>剧本名称（可留空AI生成）</label>
          <input style={input} value={form.title} onChange={e => updateForm("title", e.target.value)} placeholder="如：重生后我成了总裁" />
        </div>
        <div>
          <label style={label}>集数</label>
          <input style={input} type="number" value={form.episodes} onChange={e => updateForm("episodes", e.target.value)} min={1} max={100} />
        </div>
        <div>
          <label style={label}>单集时长（秒）</label>
          <select style={input} value={form.duration} onChange={e => updateForm("duration", e.target.value)}>
            <option value={90}>90秒</option>
            <option value={120}>120秒</option>
          </select>
        </div>
        <div>
          <label style={label}>主角性别</label>
          <select style={input} value={form.gender} onChange={e => updateForm("gender", e.target.value)}>
            <option value="female">女频</option>
            <option value="male">男频</option>
            <option value="dual">双主角</option>
          </select>
        </div>
        <div>
          <label style={label}>核心关键词（选填）</label>
          <input style={input} value={form.keywords} onChange={e => updateForm("keywords", e.target.value)} placeholder="如：失忆、豪门、真假千金" />
        </div>
      </div>
      <button style={submitBtn} onClick={handleSubmit} disabled={loading}>
        {loading ? "🤖 AI 生成中..." : `🎬 一键生成剧本（${getPrice("llm_script_one_click", 1.0)}积分）`}
      </button>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 };
const modal = { width: 600, maxWidth: "92vw", maxHeight: "90vh", overflow: "auto", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const cardBtn = { flex: 1, padding: 20, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-2)", cursor: "pointer", color: "var(--text)", textAlign: "center" };
const label = { display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 };
const input = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" };
const submitBtn = { width: "100%", marginTop: 16, padding: "12px", border: "none", borderRadius: 8, background: "linear-gradient(135deg, #6D28D9, #0891B2)", color: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 600 };

function DetailWizard({ onClose, onCreated, log, update }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title: "", type: "revenge", customType: "", genre: "modern",
    characters: [{ name: "", role: "", personality: "", appearance: "" }],
    outline: "", keywords: "",
    episodes: 5, durationPerEpisode: 120
  });
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");

  const updateForm = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const updateChar = (i, k, v) => {
    const chars = [...form.characters];
    chars[i] = { ...chars[i], [k]: v };
    updateForm("characters", chars);
  };
  const addChar = () => updateForm("characters", [...form.characters, { name: "", role: "", personality: "", appearance: "" }]);
  const removeChar = (i) => updateForm("characters", form.characters.filter((_, idx) => idx !== i));

  const generateFull = async () => {
    console.log("[详细创建] 点击生成按钮，form.title=", form.title, "form.type=", form.type, "form.episodes=", form.episodes, "form.durationPerEpisode=", form.durationPerEpisode);
    const _log = log || console.log;
    const _update = update || (() => {});
    const setDebug = (msg) => { setDebugInfo(msg); console.log("[详细创建]", msg); };
    // 所有字段都是选填，如果没有输入剧本名称，使用默认名称
    const scriptTitle = form.title.trim() || `未命名剧本_${new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}`;
    setLoading(true);
    // 未登录用户不能使用
    if (!isLoggedIn()) {
      alert("请先登录后再使用详细创建功能");
      setLoading(false);
      return;
    }
    // 积分预校验（详细创建价格从调度机获取）
    const detailedPrice = getPrice("llm_script_detailed", 5.0);
    try {
      const precheck = await precheckCredits(detailedPrice, "text", "剧本生成-详细创建");
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        _log(`❌ 积分不足：需要${detailedPrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！详细创建剧本需要${detailedPrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        setLoading(false);
        return;
      }
    } catch (e) {
      _log(`⚠️ 积分预校验失败：${e.message}`);
    }
    try {
      const charsJson = JSON.stringify(form.characters.filter(c => c.name.trim()));
      const prompt = `你是一名专业竖屏短剧编剧兼分镜导演。请根据以下详细设定直接输出一部完整竖屏短剧的剧本文档（纯文本，不要JSON、不要markdown代码块、不要解释）。

【剧本文档格式】必须严格按照以下结构输出：

剧情梗概
（200字左右，含核心冲突、人物关系、结局走向）

人物小传
（根据用户人物设定，每个角色一段，格式：）
角色名（身份）
一句话定位：xxx
性格：xxx
动机：xxx
成长弧线：xxx
视觉方向：xxx
关键道具：xxx

第一集：标题
1-1 场景名 日 外 人物：角色名
△（景别）动作与画面描述。
角色名：台词内容
【节拍：节奏点名称】
【AI 画面提示・通用】16:9 横屏。画面/运镜/氛围/音效详细描述。字幕建议：xxx
1-2 场景名 夜 内 人物：角色名
△（景别）动作与画面描述。
角色名：台词内容
【节拍：节奏点名称】
【AI 画面提示・通用】16:9 横屏。画面/运镜/氛围/音效详细描述。字幕建议：xxx
1-3 场景名 日 外 人物：角色名
（每集包含2-4个场景，场景编号连续）

第二集：标题
（与第一集相同的格式，继续输出）
（直到全部集数写完）

【创作要求】
1. 竖屏短剧，每集90-120秒，每集2-4个场景（1-1到1-4），场景编号必须连续
2. 严格按照用户设定的人物和剧情生成，不要擅自更改
3. 开头3秒强钩子，每集结尾留悬念
4. 冲突密集，节奏快，爽点充足
5. 场景描述要具体（便于AI生图/生视频）
6. 【重要】台词必须以"角色名：台词内容"格式开头，角色名明确，精炼有力、有记忆点
7. 【重要】只输出剧本正文纯文本，不要JSON、不要解释、不要省略号、不要截断

【设定】
- 剧本名称：${scriptTitle}
- 类型：${form.type}
- 时代：${form.genre}
- 核心关键词：${form.keywords || "无"}
- 故事大纲：${form.outline || "（用户未提供，根据类型和关键词创作）"}
- 人物设定：${charsJson}
- 集数：${form.episodes || 5}集
- 每集时长：${form.durationPerEpisode || 120}秒
`;

      setDebug("正在调用LLM API...");
      
      let res;
      try {
        res = await api("/api/llm/chat", {
          method: "POST",
          body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 16384, llm_type: "script_detailed" })
        });
        setDebug("API调用成功，返回结构：" + JSON.stringify(res).slice(0, 200));
      } catch (apiErr) {
        setDebug("API调用失败：" + apiErr.message);
        alert("剧本生成失败：" + apiErr.message + "\n\n请检查网络连接后重试。");
        setLoading(false);
        return;
      }

      // 本地解析+清洗：LLM 输出完整剧本文档 → parseSourceToScript 分集 → cleanEpisode 清洗
      const text = res.text || "{}";
      setDebug("模型返回text长度：" + text.length);
      if (!text || text === "{}" || text.length < 10) {
        setDebug("模型返回内容为空，完整返回：" + JSON.stringify(res));
        alert("剧本生成失败：模型返回内容为空，请重试。");
        setLoading(false);
        return;
      }

      const built = buildFromScriptDoc(text, scriptTitle);
      let episodes = built.episodes;
      const targetEpisodes = parseInt(form.episodes) || 5;
      if (episodes.length < targetEpisodes) {
        _log(`警告：模型只返回${episodes.length}集，补充到${targetEpisodes}集`);
        for (let i = episodes.length; i < targetEpisodes; i++) {
          episodes.push({ id: `ep_${i + 1}`, title: `第${i + 1}集`, content: `第${i + 1}集内容待生成` });
        }
      }

      const scenes = built.scenes;

      const characters = form.characters.filter(c => c.name.trim()).map(c => ({
        name: c.name, role: c.role, personality: c.personality,
        appearance: c.appearance
      }));

      const synopsis = built.synopsis || (episodes[0]?.content?.slice(0, 80) + "...") || (form.type + "题材短剧，" + (form.genre || "") + "风格");

      setDebug("正在更新项目状态...");
      _update({
        styleKey: detectScriptStyle(scriptContent || synopsis || ""),
        title: scriptTitle,
        type: form.type,
        episodes,
        outline: { synopsis, characters },
        scenes,
        materials: { characters, scenes }
      });
      setDebug("项目状态更新完成，共 " + episodes.length + " 集");
      // 同时存入素材库（生成的剧本文本也保存）
      try {
        // 必须基于现有素材库追加，写死 [] 会让每次创建剧本都清空整个素材库
        const currentAssets = project?.assets || [];
        const scriptContent = text;
        const newTextAsset = {
          id: "a_text_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
          type: "text",
          title: `${scriptTitle}（详细创建，${new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}）`,
          url: "",
          content: scriptContent,
          status: "ready",
          tags: ["剧本生成", "详细创建", `${episodes.length}集`],
          favorite: false,
          episodeCount: episodes.length,
          characterCount: characters.length,
          createdAt: Date.now()
        };
        update({ assets: [newTextAsset, ...currentAssets] });
        _log(`✅ 剧本已存入素材库：${newTextAsset.title}`);
      } catch (e) {
        _log(`⚠️ 剧本存入素材库失败：${e.message}`);
      }
      _log(`剧本「${scriptTitle}」生成成功，共 ${episodes.length} 集`);
      // 积分扣减（详细创建5积分）
      if (isLoggedIn()) {
        try {
                    _log(`✅ 积分扣减成功：5积分`);
          try {
            const balanceData = await getCreditBalance();
            if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
            if (window.refreshUserInfo) window.refreshUserInfo();
          } catch (e) {}
        } catch (e) {
          _log(`⚠️ 积分扣减失败：${e.message}`);
        }
      }
      // 延迟关闭，确保状态更新完成
      setTimeout(() => onClose(), 500);
    } catch (e) {
      console.error("[详细创建] 生成异常:", e);
      setDebug("生成异常：" + e.message + "\n堆栈：" + (e.stack || "").slice(0, 300));
    } finally {
      setLoading(false);
    }
  };

  const types = [
    { k: "revenge", n: "复仇", e: "🔥" }, { k: "sweet", n: "甜宠", e: "🍬" },
    { k: "inlaw", n: "婆媳", e: "🏠" }, { k: "counter", n: "逆袭", e: "🚀" },
    { k: "xuanhuan", n: "玄幻", e: "⚔️" }, { k: "modern", n: "都市", e: "🌆" },
    { k: "ancient", n: "古装", e: "👑" }, { k: "trans", n: "穿越", e: "🌀" },
    { k: "face", n: "打脸", e: "👊" }, { k: "suspense", n: "悬疑", e: "🔍" }
  ];
  const genres = [
    { k: "modern", n: "现代" }, { k: "ancient", n: "古装" },
    { k: "xianxia", n: "仙侠" }, { k: "sci-fi", n: "科幻" }
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[1, 2, 3, 4].map(s => (
          <div key={s} style={{ flex: 1, height: 4, background: s <= step ? "#6D28D9" : "var(--border)", borderRadius: 2 }} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>步骤 1/4：基本信息</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={label}>剧本名称（选填）</label>
              <input style={input} value={form.title} onChange={e => updateForm("title", e.target.value)} placeholder="如：重生之绝世神医（不填将自动生成）" />
            </div>
            <div>
              <label style={label}>剧本类型</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {types.map(t => (
                  <button key={t.k} style={{ padding: "4px 10px", border: form.type === t.k && !form.customType ? "2px solid #6D28D9" : "1px solid var(--border)", borderRadius: 6, background: form.type === t.k && !form.customType ? "rgba(109,40,217,0.2)" : "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }} onClick={() => { updateForm("type", t.k); updateForm("customType", ""); }}>{t.e} {t.n}</button>
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={{ ...label, fontSize: 11 }}>或自定义类型</label>
                <input style={{ ...input, fontSize: 12, padding: "6px 8px" }} value={form.customType} onChange={e => { updateForm("customType", e.target.value); if (e.target.value) updateForm("type", e.target.value); }} placeholder="如：武侠、科幻、校园..." />
              </div>
            </div>
            <div>
              <label style={label}>时代背景</label>
              <div style={{ display: "flex", gap: 6 }}>
                {genres.map(g => (
                  <button key={g.k} style={{ flex: 1, padding: "6px 0", border: form.genre === g.k ? "2px solid #6D28D9" : "1px solid var(--border)", borderRadius: 6, background: form.genre === g.k ? "rgba(109,40,217,0.2)" : "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }} onClick={() => updateForm("genre", g.k)}>{g.n}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={label}>核心关键词（选填）</label>
              <input style={input} value={form.keywords} onChange={e => updateForm("keywords", e.target.value)} placeholder="如：失忆、豪门、复仇" />
            </div>
            <div>
              <label style={label}>集数</label>
              <input style={input} type="number" min="1" max="100" value={form.episodes} onChange={e => updateForm("episodes", parseInt(e.target.value) || 5)} placeholder="如：5" />
            </div>
            <div>
              <label style={label}>每集时长（秒）</label>
              <input style={input} type="number" min="30" max="300" value={form.durationPerEpisode} onChange={e => updateForm("durationPerEpisode", parseInt(e.target.value) || 120)} placeholder="如：120" />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button style={submitBtn} onClick={() => setStep(2)}>下一步 →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>步骤 2/4：人物设定</div>
            <button style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 4, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 12 }} onClick={addChar}>+ 添加角色</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {form.characters.map((c, i) => (
              <div key={i} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--input-bg)" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input style={{ ...input, flex: 1 }} placeholder="角色姓名" value={c.name} onChange={e => updateChar(i, "name", e.target.value)} />
                  <input style={{ ...input, flex: 1 }} placeholder="角色身份" value={c.role} onChange={e => updateChar(i, "role", e.target.value)} />
                  <button style={{ padding: "4px 8px", border: "1px solid #ef4444", borderRadius: 4, background: "transparent", color: "#ef4444", cursor: "pointer" }} onClick={() => removeChar(i)}>✕</button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...input, flex: 1 }} placeholder="性格标签" value={c.personality} onChange={e => updateChar(i, "personality", e.target.value)} />
                  <input style={{ ...input, flex: 1 }} placeholder="外貌描述" value={c.appearance} onChange={e => updateChar(i, "appearance", e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            <button style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer" }} onClick={() => setStep(1)}>← 上一步</button>
            <button style={submitBtn} onClick={() => setStep(3)}>下一步 →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>步骤 3/4：故事大纲</div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>完整故事梗概（AI 将根据此生成剧情）</label>
            <textarea style={{ ...input, minHeight: 120, resize: "vertical" }} value={form.outline} onChange={e => updateForm("outline", e.target.value)} placeholder="请详细描述故事背景、主要冲突、人物关系和结局走向..." />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer" }} onClick={() => setStep(2)}>← 上一步</button>
            <button style={submitBtn} onClick={() => setStep(4)}>下一步 →</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>步骤 4/4：确认生成</div>
          {debugInfo && (
            <div style={{ padding: 10, background: "#e6ecf8", border: "1px solid #4facfe", borderRadius: 6, marginBottom: 12, fontSize: 11, color: "#4facfe", whiteSpace: "pre-wrap", maxHeight: 150, overflow: "auto" }}>
              <strong>调试信息：</strong>\n{debugInfo}
            </div>
          )}
          <div style={{ padding: 16, background: "var(--input-bg)", borderRadius: 8, marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}><strong>剧本名称：</strong>{form.title || "（未填写，将自动生成）"}</div>
            <div style={{ marginBottom: 8 }}><strong>类型：</strong>{form.customType || types.find(t => t.k === form.type)?.n || form.type}</div>
            <div style={{ marginBottom: 8 }}><strong>时代：</strong>{genres.find(g => g.k === form.genre)?.n || form.genre}</div>
            <div style={{ marginBottom: 8 }}><strong>集数：</strong>{form.episodes || 5} 集</div>
            <div style={{ marginBottom: 8 }}><strong>每集时长：</strong>{form.durationPerEpisode || 120} 秒（约{Math.round((form.durationPerEpisode || 120) * 4)}字）</div>
            <div style={{ marginBottom: 8 }}><strong>人物：</strong>{form.characters.filter(c => c.name.trim()).length} 位</div>
            <div><strong>大纲：</strong>{form.outline ? `${form.outline.length} 字` : "（未填写，将使用默认模板）"}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer" }} onClick={() => setStep(3)}>← 上一步</button>
            <button style={{ ...submitBtn, background: "linear-gradient(135deg, #10b981, #059669)" }} onClick={generateFull} disabled={loading}>
              {loading ? "🤖 AI 生成中..." : `🎬 确认生成剧本（${getPrice("llm_script_detailed", 5.0)}积分）`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}