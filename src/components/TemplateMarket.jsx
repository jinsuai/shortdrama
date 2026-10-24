import React, { useState } from "react";

// ========== 剧本模板 ==========
const SCRIPT_TEMPLATES = [
  {
    id: "script_wuxia",
    name: "国风武侠·复仇篇",
    category: "国风武侠",
    duration: "60集",
    desc: "少年侠客身负血海深仇，误入秘境习得绝世武功，最终手刃仇敌、称霸江湖的经典武侠故事。",
    tags: ["武侠", "复仇", "成长", "热血"],
    outline: {
      synopsis: "少年林墨本是武林世家子弟，一夜之间家族被神秘组织灭门，唯有他侥幸逃脱。身负血海深仇的他误入秘境，意外获得失传已久的《天玄剑诀》。十年磨一剑，林墨重出江湖，一步步揭开家族灭门的真相，最终手刃仇敌，成为一代武林盟主。",
      themes: ["复仇", "成长", "江湖恩怨", "正邪对决"],
      totalEpisodes: 60,
    },
  },
  {
    id: "script_modern",
    name: "都市逆袭·赘婿崛起",
    category: "都市爽文",
    duration: "80集",
    desc: "隐藏身份的豪门继承人入赘苏家，受尽白眼，最终展露实力，逆袭成为都市传奇。",
    tags: ["都市", "逆袭", "赘婿", "爽文"],
    outline: {
      synopsis: "苏晴雪为了家族利益，嫁给了一无所有的陈凡。三年来，陈凡在苏家受尽白眼和羞辱，被称为'废物赘婿'。然而没有人知道，陈凡的真实身份是华夏第一豪门陈家的唯一继承人。当苏家遭遇灭顶之灾时，陈凡终于展露真实实力，一步步逆袭，成为都市传奇。",
      themes: ["逆袭", "身份反转", "家族斗争", "都市商战"],
      totalEpisodes: 80,
    },
  },
  {
    id: "script_xianxia",
    name: "仙侠修真·问道长生",
    category: "仙侠修真",
    duration: "100集",
    desc: "山村少年踏上修仙之路，从无名小卒成长为撼动天地的大能，追寻长生大道。",
    tags: ["仙侠", "修真", "成长", "热血"],
    outline: {
      synopsis: "青云村少年叶尘天生废脉，无法修炼，被全村人嘲笑。一次意外，他获得上古神器'混沌珠'，从此踏上修仙之路。从底层修士开始，叶尘历经无数生死考验，一步步揭开修真界的惊天秘密，最终飞升成仙，问道长生。",
      themes: ["修仙", "成长", "逆天改命", "大道争锋"],
      totalEpisodes: 100,
    },
  },
  {
    id: "script_suspense",
    name: "悬疑推理·暗夜追凶",
    category: "悬疑推理",
    duration: "30集",
    desc: "连环杀人案迷雾重重，天才刑警与高智商罪犯展开惊心动魄的猫鼠游戏。",
    tags: ["悬疑", "推理", "犯罪", "烧脑"],
    outline: {
      synopsis: "城市中发生连环杀人案，死者之间似乎毫无关联，却都留下神秘符号。天才刑警陈默临危受命，在调查过程中发现这起案件背后隐藏着一个惊天阴谋。随着调查深入，陈默发现凶手似乎对他了如指掌，一场惊心动魄的猫鼠游戏就此展开。",
      themes: ["悬疑", "推理", "犯罪心理", "正义与邪恶"],
      totalEpisodes: 30,
    },
  },
  {
    id: "script_romance",
    name: "甜宠爱情·总裁的契约妻",
    category: "甜宠爱情",
    duration: "50集",
    desc: "契约婚姻假戏真做，冷面总裁与元气少女的甜蜜爱情故事。",
    tags: ["甜宠", "爱情", "总裁", "契约婚姻"],
    outline: {
      synopsis: "为了救病重的弟弟，林小夏被迫与冷面总裁顾景琛签订契约婚姻。本以为只是一场交易，却在相处中渐生情愫。顾景琛冰冷的心被林小夏的温暖融化，两人从契约夫妻变成真心相爱，最终收获甜蜜爱情。",
      themes: ["甜宠", "契约婚姻", "先婚后爱", "治愈"],
      totalEpisodes: 50,
    },
  },
  {
    id: "script_horror",
    name: "恐怖惊悚·午夜医院",
    category: "恐怖惊悚",
    duration: "20集",
    desc: "废弃医院中的诡异事件，胆大妄为的探险者一步步踏入死亡陷阱。",
    tags: ["恐怖", "惊悚", "悬疑", "灵异"],
    outline: {
      synopsis: "传闻城郊废弃的圣心医院经常发生诡异事件，五个胆大的年轻人决定深夜去探险。然而他们不知道，这所医院隐藏着不为人知的秘密。随着探险深入，诡异事件接连发生，他们发现自己已经无法离开，一场生死逃亡就此展开。",
      themes: ["恐怖", "惊悚", "灵异", "生存"],
      totalEpisodes: 20,
    },
  },
];

// ========== 角色模板 ==========
const CHARACTER_TEMPLATES = [
  {
    id: "char_hero_male",
    name: "热血男主",
    gender: "男",
    role: "主角",
    personality: "坚韧不拔、重情重义、嫉恶如仇、偶尔冲动",
    appearance: "20岁左右青年，剑眉星目，身材挺拔，常穿劲装，眼神坚定有力",
    bodyType: "muscular_male",
    color: "#c0392b",
  },
  {
    id: "char_heroine_female",
    name: "清冷女主",
    gender: "女",
    role: "主角",
    personality: "外冷内热、聪慧过人、独立坚强、心思缜密",
    appearance: "18岁少女，冷白皮，黑色长发，五官精致，气质清冷，常穿素色长裙",
    bodyType: "elegant_female",
    color: "#2980b9",
  },
  {
    id: "char_villain",
    name: "阴险反派",
    gender: "男",
    role: "反派",
    personality: "心狠手辣、城府极深、野心勃勃、为达目的不择手段",
    appearance: "40岁左右中年，面容阴鸷，眼神锐利，常穿深色长袍，气质阴冷",
    bodyType: "standard_male",
    color: "#cbd5e4",
  },
  {
    id: "char_sidekick",
    name: "搞笑配角",
    gender: "男",
    role: "配角",
    personality: "幽默风趣、重情重义、胆小但关键时刻靠谱、吃货",
    appearance: "20岁左右青年，圆脸微胖，笑容可掬，常穿宽松服饰，看起来憨厚可爱",
    bodyType: "standard_male",
    color: "#f39c12",
  },
  {
    id: "char_master",
    name: "神秘导师",
    gender: "男",
    role: "导师",
    personality: "深不可测、亦正亦邪、智慧超群、行踪不定",
    appearance: "60岁左右老者，白发白须，眼神深邃，常穿灰色长袍，气质仙风道骨",
    bodyType: "standard_male",
    color: "#7f8c8d",
  },
  {
    id: "char_femme_fatale",
    name: "魅惑女配",
    gender: "女",
    role: "女配",
    personality: "风情万种、心机深沉、亦正亦邪、为情所困",
    appearance: "25岁左右女性，美艳动人，身材火辣，常穿红色服饰，眼神勾魂摄魄",
    bodyType: "standard_female",
    color: "#e74c3c",
  },
];

// ========== 分镜模板 ==========
const STORYBOARD_TEMPLATES = [
  {
    id: "sb_fight",
    name: "武侠打斗场景",
    category: "动作",
    shots: [
      { title: "高手对峙", sceneType: "全景", cameraMove: "固定", sceneDesc: "两位高手在山巅对峙，狂风呼啸，衣袂翻飞，气氛紧张到极点。" },
      { title: "拔剑瞬间", sceneType: "特写", cameraMove: "快速推镜", sceneDesc: "主角缓缓拔出长剑，剑身在月光下寒光闪烁，眼神锐利如鹰。" },
      { title: "飞身出招", sceneType: "中景", cameraMove: "跟拍", sceneDesc: "主角飞身跃起，长剑划出一道寒光，向对手劈去，动作行云流水。" },
      { title: "兵器相交", sceneType: "近景", cameraMove: "固定", sceneDesc: "双剑相交，火花四溅，巨大的冲击力让周围空气都在震颤。" },
      { title: "胜负已分", sceneType: "全景", cameraMove: "拉远", sceneDesc: "对手缓缓倒下，主角收剑而立，夕阳西下，背影孤寂而伟岸。" },
    ],
  },
  {
    id: "sb_romance",
    name: "浪漫约会场景",
    category: "爱情",
    shots: [
      { title: "初次相遇", sceneType: "中景", cameraMove: "缓慢推镜", sceneDesc: "咖啡厅中，男女主目光相遇，时间仿佛静止，空气中弥漫着暧昧的气息。" },
      { title: "羞涩交谈", sceneType: "近景", cameraMove: "固定", sceneDesc: "两人相对而坐，女主羞涩地低头搅拌咖啡，男主温柔地注视着她。" },
      { title: "并肩散步", sceneType: "全景", cameraMove: "跟拍", sceneDesc: "夕阳下，两人并肩走在林荫道上，影子被拉得很长，温馨而浪漫。" },
      { title: "心动瞬间", sceneType: "特写", cameraMove: "固定", sceneDesc: "男主轻轻拂去女主发间的落叶，两人四目相对，心跳加速。" },
      { title: "甜蜜牵手", sceneType: "近景", cameraMove: "缓慢推镜", sceneDesc: "男主鼓起勇气牵起女主的手，女主微微一愣，然后露出幸福的笑容。" },
    ],
  },
  {
    id: "sb_suspense",
    name: "悬疑探案场景",
    category: "悬疑",
    shots: [
      { title: "案发现场", sceneType: "全景", cameraMove: "缓慢推镜", sceneDesc: "昏暗的房间里，警戒线拉起，警员们正在勘查现场，气氛凝重而诡异。" },
      { title: "发现线索", sceneType: "特写", cameraMove: "固定", sceneDesc: "刑警蹲下身子，目光锐利地盯着地上的一枚纽扣，这是关键线索。" },
      { title: "推理分析", sceneType: "中景", cameraMove: "固定", sceneDesc: "刑警站在白板前，上面贴满照片和线索，他正在梳理案件的来龙去脉。" },
      { title: "追踪嫌疑人", sceneType: "全景", cameraMove: "跟拍", sceneDesc: "雨夜，刑警撑伞跟踪嫌疑人，两人保持距离，气氛紧张而压抑。" },
      { title: "真相大白", sceneType: "中景", cameraMove: "固定", sceneDesc: "审讯室中，刑警将证据一一摆出，嫌疑人的心理防线终于崩溃。" },
    ],
  },
  {
    id: "sb_horror",
    name: "恐怖惊悚场景",
    category: "恐怖",
    shots: [
      { title: "进入禁地", sceneType: "全景", cameraMove: "缓慢推镜", sceneDesc: "深夜，探险者们推开废弃医院的大门，铁门发出刺耳的声响，黑暗中似乎有什么在注视着他们。" },
      { title: "诡异声响", sceneType: "近景", cameraMove: "固定", sceneDesc: "走廊深处传来诡异的脚步声，探险者们停下脚步，紧张地握紧手中的设备。" },
      { title: "恐怖发现", sceneType: "特写", cameraMove: "快速推镜", sceneDesc: "手电筒的光照到墙上，赫然是一个用血写成的警告符号，众人脸色煞白。" },
      { title: "仓皇逃跑", sceneType: "全景", cameraMove: "快速跟拍", sceneDesc: "恐怖的身影出现，探险者们尖叫着四散奔逃，走廊里回荡着急促的脚步声。" },
      { title: "生死一线", sceneType: "近景", cameraMove: "手持晃动", sceneDesc: "主角躲在柜子里，屏住呼吸，恐怖的脚步声越来越近，柜门被缓缓打开。" },
    ],
  },
];

// ========== 主组件 ==========
export function TemplateMarket({ project, update, log, onClose }) {
  const [activeCategory, setActiveCategory] = useState("script");
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const categories = [
    { key: "script", label: "📖 剧本模板", count: SCRIPT_TEMPLATES.length },
    { key: "character", label: "👤 角色模板", count: CHARACTER_TEMPLATES.length },
    { key: "storyboard", label: "🎬 分镜模板", count: STORYBOARD_TEMPLATES.length },
  ];

  const getCurrentTemplates = () => {
    if (activeCategory === "script") return SCRIPT_TEMPLATES;
    if (activeCategory === "character") return CHARACTER_TEMPLATES;
    return STORYBOARD_TEMPLATES;
  };

  const applyTemplate = (template) => {
    if (activeCategory === "script") {
      // 应用剧本模板
      update({
        title: template.name,
        outline: template.outline,
        script: template.outline.synopsis,
      });
      log(`✅ 已应用剧本模板：${template.name}`);
    } else if (activeCategory === "character") {
      // 应用角色模板（添加到角色列表）
      const newChar = {
        id: "char_" + Date.now(),
        name: template.name,
        role: template.role,
        personality: template.personality,
        appearance: template.appearance,
        bodyType: template.bodyType,
        color: template.color,
        image: null,
      };
      const existingChars = project?.materials?.characters || [];
      update({
        materials: {
          ...project.materials,
          characters: [...existingChars, newChar],
        },
      });
      log(`✅ 已添加角色模板：${template.name}`);
    } else if (activeCategory === "storyboard") {
      // 应用分镜模板（添加到分镜列表）
      const newShots = template.shots.map((s, i) => ({
        id: "shot_" + Date.now() + "_" + i,
        title: s.title,
        sceneType: s.sceneType,
        cameraMove: s.cameraMove,
        sceneDesc: s.sceneDesc,
        imageUrl: null,
        videoUrl: null,
        duration: 5,
      }));
      const existingShots = project?.shots || [];
      update({ shots: [...existingShots, ...newShots] });
      log(`✅ 已应用分镜模板：${template.name}（${newShots.length}个镜头）`);
    }
    setSelectedTemplate(null);
    if (onClose) onClose();
  };

  const templates = getCurrentTemplates();

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99999 }} onClick={onClose}>
      <div
        style={{ width: "90%", maxWidth: 1000, maxHeight: "85vh", background: "var(--panel, #e6ecf8)", border: "1px solid var(--border, #dbe3f2)", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border, #dbe3f2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "var(--text, #fff)" }}>🎨 模板市场</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "var(--text-muted, #888)", cursor: "pointer", fontSize: 20 }}>×</button>
        </div>

        {/* 分类标签 */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border, #dbe3f2)" }}>
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => { setActiveCategory(cat.key); setSelectedTemplate(null); }}
              style={{
                flex: 1,
                padding: "12px 0",
                border: "none",
                background: activeCategory === cat.key ? "rgba(109,40,217,0.15)" : "transparent",
                color: activeCategory === cat.key ? "#6D28D9" : "var(--text-muted, #888)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: activeCategory === cat.key ? 600 : 400,
                borderBottom: activeCategory === cat.key ? "2px solid #6D28D9" : "2px solid transparent",
              }}
            >
              {cat.label} <span style={{ fontSize: 11, opacity: 0.7 }}>({cat.count})</span>
            </button>
          ))}
        </div>

        {/* 模板列表 */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => setSelectedTemplate(tpl)}
                style={{
                  padding: 14,
                  border: selectedTemplate?.id === tpl.id ? "2px solid #6D28D9" : "1px solid var(--border, #dbe3f2)",
                  borderRadius: 10,
                  background: selectedTemplate?.id === tpl.id ? "rgba(109,40,217,0.08)" : "var(--panel-2, #e8eef8)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text, #fff)", marginBottom: 6 }}>{tpl.name}</div>
                {tpl.category && (
                  <span style={{ display: "inline-block", padding: "2px 8px", background: "rgba(109,40,217,0.15)", borderRadius: 4, fontSize: 10, color: "#6D28D9", marginBottom: 8 }}>
                    {tpl.category}
                  </span>
                )}
                {tpl.duration && (
                  <span style={{ fontSize: 11, color: "var(--text-muted, #888)", marginLeft: 8 }}>{tpl.duration}</span>
                )}
                {tpl.gender && (
                  <span style={{ fontSize: 11, color: "var(--text-muted, #888)", marginLeft: 8 }}>{tpl.gender}</span>
                )}
                {tpl.role && (
                  <span style={{ fontSize: 11, color: "var(--text-muted, #888)", marginLeft: 8 }}>{tpl.role}</span>
                )}
                <div style={{ fontSize: 12, color: "var(--text-secondary, #aaa)", marginTop: 8, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {tpl.desc || tpl.personality || tpl.outline?.synopsis || `${tpl.shots?.length || 0}个镜头`}
                </div>
                {tpl.tags && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                    {tpl.tags.map((tag, i) => (
                      <span key={i} style={{ padding: "1px 6px", background: "var(--input-bg, #e6ecf8)", borderRadius: 3, fontSize: 10, color: "var(--text-muted, #888)" }}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 底部操作 */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border, #dbe3f2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted, #888)" }}>
            {selectedTemplate ? `已选择：${selectedTemplate.name}` : "点击选择一个模板"}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid var(--border, #dbe3f2)", borderRadius: 6, background: "transparent", color: "var(--text, #aaa)", cursor: "pointer", fontSize: 13 }}>取消</button>
            <button
              onClick={() => selectedTemplate && applyTemplate(selectedTemplate)}
              disabled={!selectedTemplate}
              style={{ padding: "8px 20px", border: "none", borderRadius: 6, background: selectedTemplate ? "linear-gradient(135deg, #6D28D9, #0891b2)" : "#555", color: "#fff", cursor: selectedTemplate ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600 }}
            >
              应用模板
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TemplateMarket;
