import React, { useState, useEffect } from "react";
import { api, generateImage } from "../../dispatch-jobs.js";
import { isLoggedIn, precheckCredits, deductCredits, getCreditBalance } from "../../utils/backend-api.js";
import { getPrice } from "../../utils/pricing-utils.js";

// 生图风格选项
const STYLE_OPTIONS = [
  { value: "wuxia", label: "武侠玄幻", desc: "武侠玄幻风格，东方古风美学，江湖意境，写实细腻光影" },
  { value: "cinematic", label: "电影级写实", desc: "电影级写实风格，胶片质感，专业光影，高对比度" },
  { value: "anime", label: "动漫风格", desc: "动漫风格，色彩鲜艳，表情生动，日式动画美学" },
  { value: "realistic", label: "超写实", desc: "超写实照片风格，真实皮肤质感，自然光影，极致细节" },
  { value: "noir", label: "黑色电影", desc: "黑色电影风格，黑白高反差，深邃阴影，神秘氛围" },
  { value: "cyberpunk", label: "赛博朋克", desc: "赛博朋克风格，霓虹灯光，未来都市，高科技低生活" },
  { value: "fantasy", label: "奇幻风格", desc: "奇幻风格，魔法氛围，空灵光线，梦幻意境" },
  { value: "horror", label: "恐怖风格", desc: "恐怖风格，黑暗氛围，阴森光线，悬疑惊悚" },
  { value: "comedy", label: "喜剧风格", desc: "喜剧风格，明亮色彩，欢快氛围，夸张表情" },
];

// 通用画质层（所有角色通用）
const QUALITY_LAYER = "8K超高清，专业角色设定图，电影级三点布光，柔光箱主光，轮廓光分离主体与背景，全局光照GI，环境光遮蔽AO，次表面散射SSS，锐利细节，干净背景，正交视图";

// 类型适配层（根据角色类型自动切换）
function getTypeLayer(appearance, role, name) {
  const text = (appearance + role + name).toLowerCase();
  const beastKeywords = ["兽", "妖", "怪", "龙", "虎", "狼", "狐", "鸟", "鱼", "虫", "兽首", "兽人", "妖兽", "怪物", "精", "灵", "魔"];
  const isBeast = beastKeywords.some(k => text.includes(k));
  if (isBeast) {
    return "毛发根根分明，兽类面部结构准确，瞳孔细节，爪子/蹄子/犄角细节，毛皮/鳞片纹理，生物结构合理";
  }
  return "皮肤毛孔级质感，发丝级细节，服装织物纹理，金属配饰反光，妆容精致";
}

// 通用负面提示词
const NEGATIVE_PROMPT = "模糊，低分辨率，变形，塑料感，蜡像感，过度磨皮，卡通，油画，AI感，多余肢体，结构错误，手指畸形";

// 从剧本内容识别默认风格（旧项目无 styleKey 时兜底；未识别返回空串）
export function detectStyleKey(text) {
  const st = (text || "").slice(0, 3000);
  if (/(科幻|星际|未来|机甲|赛博|末世|外太空)/.test(st)) return "cyberpunk";
  if (/(玄幻|修仙|仙侠|修真|武侠|江湖|武林|门派|侠客|剑客|古风|朝堂|帝王|将军|盟主)/.test(st)) return "wuxia";
  if (/(现代|都市|职场|校园|豪门|总裁|医院)/.test(st)) return "realistic";
  if (/(民国|军阀|旗袍|租界)/.test(st)) return "noir";
  return "";
}

// 基础提示词（不含风格描述与画面布局，供剧本分析/细化/存储使用；布局与风格在生成图片时注入）
export function buildCharacterBasePrompt(char) {
  const appearance = char.appearance || "";
  const personality = char.personality || "";
  const role = char.role || "";
  const genderHint = /(男主|先生|总裁|少爷|哥哥|弟弟|父亲|儿子|男|他)/.test(role + char.name + personality) ? "男性" :
                     /(女主|小姐|夫人|公主|姐姐|妹妹|母亲|女儿|女|她)/.test(role + char.name + personality) ? "女性" : "";
  const typeLayer = getTypeLayer(appearance, role, char.name);
  return `${char.name}${genderHint ? "，" + genderHint : ""}，${role}，${appearance}，性格气质：${personality}。${QUALITY_LAYER}，${typeLayer}。注意：此角色为「${char.name}」，请根据其身份「${role}」和性格「${personality}」生成独特的外貌和服装，不要与其他角色混淆。负面提示：${NEGATIVE_PROMPT}`;
}

// 从角色数据/细化提示词中提取纯外貌描述（去掉布局前缀、画面布局段、画面段、负面提示段），供细化与各生图布局复用
export function extractAppearance(char) {
  const existing = (char.promptCn || "").trim();
  const appearance = char.appearance || "";
  const personality = char.personality || "";
  const role = char.role || "";
  return (existing.split("画面布局")[0] || "")
    .trim()
    .replace(/^角色设定三视图加面部特写[，,、。]?\s*/, "")
    .replace(/^角色设定图[，,、。]?\s*/, "")
    .replace(/^三视图加面部特写[，,、。]?\s*/, "")
    .split("画面：")[0]
    .split("画面:")[0]
    .split("负面提示")[0]
    .trim() || `${char.name}，${role}，${appearance}，性格气质：${personality}`.replace(/[，,]+$/, "");
}

// 完整提示词 = 基础提示词 + 风格描述（生成人物图片时使用）
export function buildCharacterPrompt(char, styleValue) {
  const styleObj = STYLE_OPTIONS.find(s => s.value === styleValue) || STYLE_OPTIONS[0];
  return `${buildCharacterBasePrompt(char)}${styleObj.desc}。`;
}

// 四视图+面部特写展示图提示词（横排四格：面部特写→正面全身→侧面全身→背面全身，供人物卡/素材展示与视频锁定；布局与风格在生成时注入）
export function buildCharacterSheetPrompt(char) {
  const appearance = char.appearance || "";
  const personality = char.personality || "";
  const role = char.role || "";
  const descPart = extractAppearance(char);
  const typeLayer = getTypeLayer(appearance, role, char.name);
  return `纯白色背景的角色设定图，纯净角色立绘，整张画面中只有角色本人，背景必须为纯白色（RGB 255,255,255）铺满整个画面，不得出现任何场景、环境、背景元素、地面、地板、阴影、道具、武器、血迹、雨、闪电、灯笼、装饰物、其他人物或群演；人物描述中的场景、环境、动作元素仅作为服装和外观参考，一律不得绘制出来。${descPart}。画面布局：整图从左到右横向排布、边界清晰互不干扰——左侧三分之一宽度为面部特写画面（头部至胸口，表情自然正视镜头）；右侧三分之二宽度均匀划分为三个等宽画面，依次为正面全身视图（完整头部到脚）、侧面全身视图（侧身站立，完整头部到脚）、背面全身视图（完整头部到脚）。左侧面部特写与右侧三个全身视图之间、以及右侧三个全身视图彼此之间均留出明显空白间隔，各画面完全分离、互不接触、互不重叠、互不遮挡、互不融合，禁止出现一个画面的人物侵入另一个画面的情况。所有视图和特写中角色外貌完全一致：相同面部五官/头部结构、发型发色、服装款式与颜色、配饰、体型肤色，严格保持角色一致性。全身视图必须展示完整全身，脚部完整可见，自然站立姿势，双臂自然下垂，双脚与肩同宽。8K超高清，专业角色设定图，柔和均匀棚拍布光，人物受光均匀无阴影，纯白色背景，无任何阴影、投影、渐变、环境光，正交视图。${typeLayer}，四个画面外貌完全统一。注意：此角色为「${char.name}」，请严格保持其外貌、服装与配饰的完整性和辨识度，不要改变或简化。负面提示：背景，场景，环境，地面，地板，阴影，投影，渐变，环境光，道具，武器，血迹，雨，闪电，灯笼，装饰物，第二人物，尸体，旁观者，群演，人群，截断身体，半身，缺少脚部，脚部出框，重叠，遮挡，融合，粘连，共用身体，格间串色，多个人物，多人组合，${NEGATIVE_PROMPT}`;
}

// 生成图片时向已有提示词注入风格描述（插在"负面提示"之前；已含则不重复）
export function injectStyleDesc(p, styleDesc) {
  if (!styleDesc) return p;
  if (p && p.includes(styleDesc)) return p;
  const idx = (p || "").indexOf("负面提示");
  if (idx > -1) return p.slice(0, idx) + styleDesc + "。" + p.slice(idx);
  return p + "。" + styleDesc;
}

export function CharacterManager({ project, update, log }) {
  const characters = project.materials?.characters || [];

  // 自愈：旧版本数据修复——提示词串名（含其他角色名且不含自己）自动重建；缺失 id 自动补
  useEffect(() => {
    const chars = project.materials?.characters || [];
    if (!chars.length) return;
    const names = chars.map(c => c.name).filter(Boolean);
    const hasSelf = (prompt, nm) => !nm || (prompt && prompt.includes(nm));
    let dirty = false;
    const fixed = chars.map(ch => {
      let out = ch;
      if (!out.id) { dirty = true; out = { ...out, id: "char_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) }; }
      if (out.appearance && out.name && new RegExp("^" + out.name + "[（(]").test(out.appearance)) { dirty = true; out = { ...out, appearance: "" }; }
      if (out.promptCn && names.some(nm => nm && nm !== out.name && out.promptCn.includes(nm)) && !hasSelf(out.promptCn, out.name)) {
        dirty = true; out = { ...out, promptCn: buildCharacterBasePrompt(out) };
      }
      return out;
    });
    // 风格兜底：旧项目无 styleKey 时按剧本内容自动识别
    if (!project.styleKey) {
      const sk = detectStyleKey(project.script || project.outline?.synopsis || "");
      if (sk && STYLE_OPTIONS.some(s => s.value === sk)) {
        try { update({ styleKey: sk }); } catch (e) {}
        setSelectedStyle(sk);
      }
    }
    if (dirty) {
      try { update({ materials: { ...project.materials, characters: fixed } }); } catch (e) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [generatingCharIds, setGeneratingCharIds] = useState({}); // {charId: true} 支持多个人物同时生成
  const [generatingFourViewIds, setGeneratingFourViewIds] = useState({}); // {charId: true} 四视图生成中
  const [refiningCharId, setRefiningCharId] = useState(""); // 正在细化提示词的角色
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedStyle, setSelectedStyle] = useState(() => {
    const k = project.styleKey;
    if (STYLE_OPTIONS.some(s => s.value === k)) return k;
    return detectStyleKey(project.script || project.outline?.synopsis || "") || STYLE_OPTIONS[0].value;
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newChar, setNewChar] = useState({ name: "", role: "", personality: "", appearance: "" });

  // 从剧本中自动提取人物
  const analyzeCharacters = async () => {
    const script = project.script || "";
    const outline = project.outline?.synopsis || "";
    
    if (!script && !outline) {
      log("请先上传或创作剧本");
      return;
    }

    // 未登录用户不能使用
    if (!isLoggedIn()) {
      alert("请先登录后再使用角色提取功能");
      return;
    }

    // 积分预校验（角色描述生成价格从调度机获取）
    const charExtractPrice = getPrice("llm_character_extract", 2.0);
    try {
      const precheck = await precheckCredits(charExtractPrice, "text", "角色描述生成");
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${charExtractPrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！自动提取角色需要${charExtractPrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }

    log("正在分析剧本提取人物...");
    try {
      const content = script || outline;
      const prompt = `你是一名短剧角色分析师。请从以下剧本内容中提取所有人物信息。

要求：
1. 提取所有有台词或重要动作的角色
2. 外貌描述要具体详细（年龄/性别/发型/脸型/五官/服装/体型/配饰），便于AI生图保持人物一致性
3. 性格用3-5个关键词概括
4. 只输出纯JSON，不要markdown代码块，不要解释

剧本内容：
${content.slice(0, 5000)}

输出JSON格式：
{
  "characters": [
    {
      "name": "角色姓名",
      "role": "身份/职业（如主角/反派/配角）",
      "personality": "性格特点（3-5个关键词，如高冷/腹黑/善良）",
      "appearance": "外貌描述（年龄/发型/脸型/五官/上衣/下装/鞋履/配饰/体型/表情神态，80-150字，要具体到能直接出图）"
    }
  ]
}`;

      const res = await api("/api/llm/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          llm_type: "character_extract"
        })
      });

      const text = res.text || "{}";
      let parsed;
      try {
        const match = text.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : { characters: [] };
      } catch {
        parsed = { characters: [] };
      }

      const newCharacters = (parsed.characters || []).map((c, i) => {
        const char = {
          id: `char_${Date.now()}_${i}`,
          name: c.name || `角色${i + 1}`,
          role: c.role || "",
          personality: c.personality || "",
          appearance: c.appearance || "",
          image: null,
          locked: false
        };
        // 剧本分析完立即生成提示词（基础版，不含风格描述），用户可在生成前修改；生成图片时再按所选风格注入
        char.promptCn = buildCharacterBasePrompt(char);
        return char;
      });

      // 合并现有角色和新提取的角色
      const existingNames = new Set(characters.map(c => c.name));
      const uniqueNewChars = newCharacters.filter(c => !existingNames.has(c.name));
      
      const allCharacters = [...uniqueNewChars, ...characters];
      
      update({
        materials: { ...project.materials, characters: allCharacters },
        outline: { ...project.outline, characters: allCharacters }
      });

      log(`成功提取 ${uniqueNewChars.length} 个人物，共 ${allCharacters.length} 人`);
      // 积分扣减（角色描述生成2积分/次）
      if (isLoggedIn()) {
        try {
                    log(`✅ 积分扣减成功：2积分`);
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
      log("提取人物失败：" + err.message);
    }
  };

  // AI细化人物提示词（整体穿着/面容细节/头发细节等）
  const refineCharacterPrompt = async (char) => {
    if (refiningCharId) return;
    if (!isLoggedIn()) { alert("请先登录后再使用提示词细化"); return; }
    const price = getPrice("llm_character_refine", 1.0);
    try {
      const precheck = await precheckCredits(price, "text", `细化人物提示词：${char.name}`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${price}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！提示词细化需要${price}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }
    setRefiningCharId(char.id);
    log(`正在细化「${char.name}」人物提示词...`);
    try {
      const current = extractAppearance(char).trim();
      const prompt = `你是专业的AI生图提示词工程师。请细化以下角色设定图的生图提示词，使其更精致、细节更丰富，可直接用于AI生图。
细化方向（必须逐项加强细节）：
1. 整体穿着：服装款式、颜色、面料材质、纹理纹样、层次搭配、腰带/玉佩/披风/护腕等配饰；
2. 面容细节：脸型、眉眼、鼻梁、嘴唇、肤色肤质、五官比例、神情气质；
3. 头发细节：发型、发长、发色、刘海/发髻/发冠/发饰；
4. 体型与随身道具。
要求：
1. 不要包含任何画面布局/视图/构图描述（如三视图、多视图、单张全身照、拼图、镜像、侧面背面视角等），画面布局由生图时统一注入；
2. 负面提示使用通用禁词（模糊、低分辨率、变形、塑料感、AI感等），不要包含视图/布局相关禁词；
3. 不要包含任何风格/画风描述（如动漫、写实、武侠、奇幻等），风格由生成时统一注入；
4. 150-260字；
5. 只输出细化后的完整提示词本身，不要解释、不要markdown代码块。

角色：${char.name}（${char.role || "未知身份"}）
当前提示词：${current}`;
      const res = await api("/api/llm/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], max_tokens: 8192 }),
      });
      const text = (res.text || "").trim();
      if (!text) throw new Error("LLM未返回内容");
      update(prev => {
        const allChars = prev.materials?.characters || [];
        const newChars = allChars.map(x => x.id === char.id ? { ...x, promptCn: text } : x);
        return { materials: { ...prev.materials, characters: newChars } };
      });
      log(`✅ 「${char.name}」提示词已细化（${text.length}字符）`);
      try {
        const balanceData = await getCreditBalance();
        if (window.onCreditUpdate) window.onCreditUpdate(balanceData.balance || balanceData.credits || 0);
        if (window.refreshUserInfo) window.refreshUserInfo();
      } catch (e) {}
    } catch (err) {
      log(`❌ 提示词细化失败：${err.message}`);
    } finally {
      setRefiningCharId("");
    }
  };

  // AI根据人物描述生成参考图
  const generateCharacterImage = async (char) => {
    if (generatingCharIds[char.id]) return; // 该人物正在生成中，忽略重复点击
    setGeneratingCharIds(prev => ({ ...prev, [char.id]: true }));
    // 未登录用户不能使用
    if (!isLoggedIn()) {
      alert("请先登录后再使用角色生图功能");
      setGeneratingCharIds(prev => { const next = {...prev}; delete next[char.id]; return next; });
      return;
    }
    // 积分预校验（角色生图价格从调度机获取）
    const charImagePrice = getPrice("image_generate", 1.0);
    try {
      const precheck = await precheckCredits(charImagePrice, "image", `角色生图：${char.name}`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${charImagePrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！生成角色参考图需要${charImagePrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        setGeneratingCharIds(prev => { const next = {...prev}; delete next[char.id]; return next; });
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }
    log(`正在为「${char.name}」生成人物参考图...`);
    try {
      const styleObj = STYLE_OPTIONS.find(s => s.value === selectedStyle) || STYLE_OPTIONS[0];
      // 单张人物参考图（正常竖版人物图，无四视图布局要求），视频生成时用这张做人物锁定
      const basePrompt = buildCharacterBasePrompt(char);
      // 生成时注入所选风格描述
      const prompt = injectStyleDesc(basePrompt, styleObj.desc);
      const res = await generateImage({ prompt, model: "Qwen/Qwen-Image", size: "1024x1024", n: 1 });
      const imageUrl = res.image_url || res.url || (res.images && res.images[0]) || res.result_url;
      if (!imageUrl) throw new Error("未返回图片地址");
      // 使用函数式更新，确保使用最新的状态，并使用ID匹配人物
      console.log("[人物生成] 更新图片，char.id=", char.id, "imageUrl=", imageUrl.substring(0, 50));
      update(prev => {
        const allChars = prev.materials?.characters || [];
        console.log("[人物生成] 当前人物列表:", allChars.map(c => ({id: c.id, name: c.name, hasImage: !!c.image})));
        const newChars = allChars.map(x => {
          const matched = (x.id && char.id) ? (x.id === char.id) : (x.name === char.name);
          if (matched) {
            console.log("[人物生成] 匹配到人物:", x.name, "，更新图片");
            // 只更新图片，提示词保持纯人物描述（不覆盖为含布局的生成提示词，布局内容对用户不可见）
            return { ...x, image: imageUrl };
          }
          return x;
        });
        return { materials: { ...prev.materials, characters: newChars } };
      });
      // 同时存入素材库（所有生成的角色图片都保存，不覆盖）
      try {
        const currentAssets = project?.assets || [];
        const newImageAsset = {
          id: "a_char_image_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
          type: "image",
          title: `${char.name}人物参考图（${styleObj.label}，${new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}）`,
          url: imageUrl,
          status: "ready",
          tags: ["人物参考图", "角色生图", styleObj.label, char.name],
          favorite: false,
          characterId: char.id,
          characterName: char.name,
          style: selectedStyle,
          createdAt: Date.now()
        };
        update({ assets: [newImageAsset, ...currentAssets] });
        log(`✅ 角色图已存入素材库：${newImageAsset.title}`);
      } catch (e) {
        log(`⚠️ 角色图存入素材库失败：${e.message}`);
      }
      log(`「${char.name}」人物参考图生成成功`);
      // 积分扣减（角色生图价格从调度机获取）
      if (isLoggedIn()) {
        try {
                    log(`✅ 积分扣减成功：${charImagePrice}积分`);
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
      log(`生成失败：${err.message}`);
    } finally {
      setGeneratingCharIds(prev => { const next = {...prev}; delete next[char.id]; return next; });
    }
  };

  // AI生成Krea2四视图（T100-Krea2做剧图像4视图工作流，经调度机 /api/image/four-view）
  const generateFourViewImage = async (char) => {
    if (generatingFourViewIds[char.id]) return; // 该人物正在生成中，忽略重复点击
    setGeneratingFourViewIds(prev => ({ ...prev, [char.id]: true }));
    // 未登录用户不能使用
    if (!isLoggedIn()) {
      alert("请先登录后再使用四视图生成功能");
      setGeneratingFourViewIds(prev => { const next = {...prev}; delete next[char.id]; return next; });
      return;
    }
    // 四视图是图生图：必须有人物参考图
    if (!char.image) {
      log(`❌ 请先生成「${char.name}」的人物参考图，再生成四视图`);
      alert(`请先生成「${char.name}」的人物参考图，再生成四视图`);
      setGeneratingFourViewIds(prev => { const next = {...prev}; delete next[char.id]; return next; });
      return;
    }
    // 积分预校验（四视图复用图片生成价格，从调度机获取）
    const fourViewPrice = getPrice("image_generate", 1.0);
    try {
      const precheck = await precheckCredits(fourViewPrice, "image", `Krea2四视图：${char.name}`);
      if (!precheck.sufficient && precheck.sufficient !== undefined) {
        log(`❌ 积分不足：需要${fourViewPrice}积分，当前余额${precheck.balance || 0}积分`);
        alert(`积分不足！生成四视图需要${fourViewPrice}积分，当前余额${precheck.balance || 0}积分。请充值后再试。`);
        setGeneratingFourViewIds(prev => { const next = {...prev}; delete next[char.id]; return next; });
        return;
      }
    } catch (e) {
      log(`⚠️ 积分预校验失败：${e.message}`);
    }
    log(`正在为「${char.name}」生成Krea2四视图（参考人物图）...`);
    try {
      const styleObj = STYLE_OPTIONS.find(s => s.value === selectedStyle) || STYLE_OPTIONS[0];
      // 角色外观描述 + 风格（四视图以人物参考图为主，图生图由T10工作流完成）
      const basePrompt = buildCharacterBasePrompt(char);
      const prompt = injectStyleDesc(basePrompt, styleObj.desc);
      const res = await api("/api/image/four-view", {
        method: "POST",
        body: JSON.stringify({ prompt, image_url: char.image }),
      });
      const imageUrl = res.image_url || res.url || (res.images && res.images[0]) || res.result_url;
      if (!imageUrl) throw new Error("未返回四视图图片地址");
      update(prev => {
        const allChars = prev.materials?.characters || [];
        const newChars = allChars.map(x => {
          const matched = (x.id && char.id) ? (x.id === char.id) : (x.name === char.name);
          if (matched) {
            return { ...x, fourView: imageUrl };
          }
          return x;
        });
        return { materials: { ...prev.materials, characters: newChars } };
      });
      // 同时存入素材库（不覆盖）
      try {
        const currentAssets = project?.assets || [];
        const newImageAsset = {
          id: "a_char_fourview_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
          type: "image",
          title: `${char.name}四视图（${styleObj.label}，${new Date().toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}）`,
          url: imageUrl,
          status: "ready",
          tags: ["四视图", "角色生图", styleObj.label, char.name],
          favorite: false,
          characterId: char.id,
          characterName: char.name,
          style: selectedStyle,
          createdAt: Date.now()
        };
        update({ assets: [newImageAsset, ...currentAssets] });
        log(`✅ 四视图已存入素材库：${newImageAsset.title}`);
      } catch (e) {
        log(`⚠️ 四视图存入素材库失败：${e.message}`);
      }
      log(`「${char.name}」Krea2四视图生成成功`);
      // 积分扣减（四视图价格从调度机获取）
      if (isLoggedIn()) {
        try {
          log(`✅ 积分扣减成功：${fourViewPrice}积分`);
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
      log(`四视图生成失败：${err.message}`);
    } finally {
      setGeneratingFourViewIds(prev => { const next = {...prev}; delete next[char.id]; return next; });
    }
  };

  return (
    <div style={{ padding: 16, height: "100%", overflow: "auto", color: "var(--text)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>👤 人物管理</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 13, cursor: "pointer" }}
            title="选择生图风格"
          >
            {STYLE_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button 
            style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 13 }}
            onClick={analyzeCharacters}
          >
            🤖 AI分析人物（2积分）
          </button>
          <button 
            style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #6D28D9, #0891B2)", color: "#fff", cursor: "pointer", fontSize: 13 }}
            onClick={() => {
              setNewChar({ name: "", role: "", personality: "", appearance: "" });
              setShowAddModal(true);
            }}
          >
            + 新增角色
          </button>
        </div>
      </div>
      
      {characters.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: 12 }}>
          暂无角色，点击「AI分析人物」或「新增角色」添加
        </div>
      )}
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {characters.map(c => (
          <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--panel-2)" }}>
            <div style={{ width: "100%", height: 160, background: "var(--input-bg)", borderRadius: 8, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, position: "relative" }}>
              {c.image ? <img src={c.image} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, cursor: "zoom-in" }} onClick={() => setPreviewImage(c.image)} /> : "👤"}
              {c.sheetImage && (
                <button
                  style={{ position: "absolute", right: 4, top: 4, padding: "2px 7px", fontSize: 10, border: "1px solid rgba(255,255,255,0.4)", borderRadius: 4, background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", zIndex: 2 }}
                  onClick={(e) => { e.stopPropagation(); setPreviewImage(c.sheetImage); }}
                >
                  🖼 三视图
                </button>
              )}
              {c.fourView && (
                <button
                  style={{ position: "absolute", right: 4, bottom: 4, padding: "2px 7px", fontSize: 10, border: "1px solid rgba(255,255,255,0.4)", borderRadius: 4, background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", zIndex: 2 }}
                  onClick={(e) => { e.stopPropagation(); setPreviewImage(c.fourView); }}
                >
                  🧩 四视图
                </button>
              )}
            </div>
            <div style={{ fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{c.role || "未设定"}</div>
            {c.personality && <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>性格：{c.personality}</div>}
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6, marginBottom: 2 }}>🎨 生成提示词（可编辑）</div>
            <textarea
              style={{ width: "100%", minHeight: 80, fontSize: 10, boxSizing: "border-box", resize: "vertical", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", padding: 6 }}
              value={c.promptCn || ""}
              onChange={(e) => update(prev => {
                const allChars = prev.materials?.characters || [];
                return { materials: { ...prev.materials, characters: allChars.map(x => x.id === c.id ? { ...x, promptCn: e.target.value } : x) } };
              })}
              placeholder="提示词已自动生成，可修改后点击生成"
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button
                style={{ flex: 1, minWidth: "45%", padding: "4px 0", border: generatingCharIds[c.id] ? "1px solid #f59e0b" : "1px solid #6D28D9", borderRadius: 4, background: generatingCharIds[c.id] ? "rgba(245,158,11,0.15)" : "rgba(109,40,217,0.15)", color: generatingCharIds[c.id] ? "#f59e0b" : "#6D28D9", fontSize: 11, cursor: generatingCharIds[c.id] ? "wait" : "pointer" }}
                onClick={() => generateCharacterImage(c)}
                disabled={generatingCharIds[c.id]}
                title="生成单张人物参考图，用于视频锁人物与人物卡展示"
              >
                {generatingCharIds[c.id] ? "⏳ 生成中..." : `🖼 人物参考图（${getPrice("image_generate", 1.0)}积分）`}
              </button>
              <button
                style={{ flex: 1, minWidth: "45%", padding: "4px 0", border: generatingFourViewIds[c.id] ? "1px solid #f59e0b" : "1px solid #10b981", borderRadius: 4, background: generatingFourViewIds[c.id] ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.12)", color: generatingFourViewIds[c.id] ? "#f59e0b" : "#10b981", fontSize: 11, cursor: generatingFourViewIds[c.id] ? "wait" : "pointer" }}
                onClick={() => generateFourViewImage(c)}
                disabled={generatingFourViewIds[c.id]}
                title="生成Krea2四视图（正面/侧面/背面 + 面部特写）"
              >
                {generatingFourViewIds[c.id] ? "⏳ 生成中..." : `🧩 Krea2四视图（${getPrice("image_generate", 1.0)}积分）`}
              </button>
              <button
                style={{ flex: 1, minWidth: "45%", padding: "4px 0", border: "1px solid var(--border)", borderRadius: 4, background: "transparent", color: "var(--text)", fontSize: 11, cursor: "pointer" }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const img = ev.target.result;
                      // 使用函数式更新，确保使用最新的状态，并使用ID匹配人物
                      update(prev => {
                        const allChars = prev.materials?.characters || [];
                        const newChars = allChars.map(x => 
                          x.id === c.id ? { ...x, image: img } : x
                        );
                        return { materials: { ...prev.materials, characters: newChars } };
                      });
                      log(`已上传角色 ${c.name} 的参考图`);
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }}
              >
                📷 上传图片
              </button>
              <button
                style={{ flex: 1, minWidth: "45%", padding: "4px 0", border: c.voiceSample ? "1px solid #0891B2" : "1px solid var(--border)", borderRadius: 4, background: c.voiceSample ? "rgba(8,145,178,0.12)" : "transparent", color: c.voiceSample ? "#0891B2" : "var(--text)", fontSize: 11, cursor: "pointer" }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file"; input.accept = "audio/*";
                  input.onchange = (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const data = ev.target.result;
                      update(prev => {
                        const allChars = prev.materials?.characters || [];
                        return { materials: { ...prev.materials, characters: allChars.map(x => x.id === c.id ? { ...x, voiceSample: data } : x) } };
                      });
                      log(`已为角色 ${c.name} 设置真音色样本`);
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }}
                title="上传角色真音色样本（MP3/WAV），生成视频（全能参考/对口型）时自动带入，让角色音色一致"
              >
                {c.voiceSample ? "🎙 音色已设" : "🎙 上传音色"}
              </button>
              <button
                style={{ flex: 1, padding: "4px 0", border: "1px solid var(--border)", borderRadius: 4, background: refiningCharId === c.id ? "rgba(109,40,217,0.3)" : "transparent", color: refiningCharId === c.id ? "#6D28D9" : "var(--text)", fontSize: 11, cursor: "pointer" }}
                onClick={() => refineCharacterPrompt(c)}
                disabled={!!refiningCharId}
              >
                ✨ 细化提示词
              </button>
              <button
                style={{ flex: 1, padding: "4px 0", border: "1px solid var(--border)", borderRadius: 4, background: c.locked ? "rgba(109,40,217,0.3)" : "transparent", color: c.locked ? "#6D28D9" : "var(--text)", fontSize: 11, cursor: "pointer" }} 
                onClick={() => {
                  update({ materials: { ...project.materials, characters: characters.map(x => x.id === c.id ? { ...x, locked: !x.locked } : x) } });
                  log(c.locked ? "已解锁角色" : "已锁定角色形象");
                }}
              >
                {c.locked ? "已锁定" : "锁定"}
              </button>
              <button
                style={{ flex: 1, padding: "4px 0", border: "1px solid var(--border)", borderRadius: 4, background: "transparent", color: "var(--text)", fontSize: 11, cursor: "pointer" }}
                onClick={() => {
                  const base = c.name || "角色";
                  const n = (characters.filter(x => (x.name || "").startsWith(base + "·")).length) + 1;
                  const variant = {
                    id: "char_" + Date.now() + "_v" + n,
                    name: `${base}·造型${n}`,
                    role: c.role || "",
                    personality: c.personality || "",
                    appearance: c.appearance || "",
                    image: null,
                    locked: false,
                    parentId: c.id,
                    variantType: "costume"
                  };
                  variant.promptCn = buildCharacterBasePrompt(variant);
                  update({ materials: { ...project.materials, characters: [...characters, variant] } });
                  log(`已为「${c.name}」派生造型变体：${variant.name}（可在人物卡改名/改外貌后重新生图）`);
                }}
                title="派生一个造型/年龄变体（如顾拾遗·夜行黑袍）。变体是独立的角色卡，可单独生成四视图并绑定到分镜，实现同一人物的多套造型。"
              >
                ＋ 派生变体
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {/* 图片放大预览模态框 */}
      {previewImage && (
        <div 
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99999, cursor: "zoom-out" }}
          onClick={() => setPreviewImage(null)}
        >
          <img src={previewImage} alt="预览大图" style={{ maxWidth: "92%", maxHeight: "92%", objectFit: "contain", borderRadius: 8 }} />
          <div style={{ position: "absolute", top: 20, right: 20, color: "#fff", fontSize: 14, background: "rgba(0,0,0,0.5)", padding: "6px 12px", borderRadius: 6 }}>点击任意处关闭</div>
        </div>
      )}

      {/* 新增角色表单弹窗 */}
      {showAddModal && (
        <div 
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99998 }}
          onClick={() => setShowAddModal(false)}
        >
          <div 
            style={{ width: 480, maxWidth: "92vw", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>➕ 新增角色</h3>
            
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>角色姓名 *</label>
              <input 
                style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
                value={newChar.name}
                onChange={e => setNewChar(f => ({ ...f, name: e.target.value }))}
                placeholder="如：林晚、沈砚"
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>角色身份/定位</label>
              <input 
                style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
                value={newChar.role}
                onChange={e => setNewChar(f => ({ ...f, role: e.target.value }))}
                placeholder="如：主角、反派、女配、龙套"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>性格特点</label>
              <input 
                style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" }}
                value={newChar.personality}
                onChange={e => setNewChar(f => ({ ...f, personality: e.target.value }))}
                placeholder="如：坚韧果敢、阴险狡诈、温柔善良"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>外貌描述（用于AI生图提示词）</label>
              <textarea 
                style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--text)", fontSize: 13, boxSizing: "border-box", minHeight: 80, resize: "vertical" }}
                value={newChar.appearance}
                onChange={e => setNewChar(f => ({ ...f, appearance: e.target.value }))}
                placeholder="如：25岁女性，黑色长发，冷白皮，穿红色风衣，眼神坚定，身材高挑..."
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button 
                style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: "pointer", fontSize: 13 }}
                onClick={() => setShowAddModal(false)}
              >
                取消
              </button>
              <button 
                style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: "linear-gradient(135deg, #6D28D9, #0891B2)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                onClick={() => {
                  if (!newChar.name.trim()) {
                    alert("请输入角色姓名");
                    return;
                  }
                  const c = { 
                    id: "char_" + Date.now(), 
                    name: newChar.name.trim(), 
                    role: newChar.role.trim(), 
                    personality: newChar.personality.trim(), 
                    appearance: newChar.appearance.trim(), 
                    image: null, 
                    locked: false 
                  };
                  c.promptCn = buildCharacterBasePrompt(c);
                  update({ materials: { ...project.materials, characters: [c, ...characters] } });
                  log("新增角色：" + c.name);
                  setShowAddModal(false);
                }}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
