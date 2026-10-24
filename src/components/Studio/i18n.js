/**
 * 界面文案 · 全量界面文案（中文）
 * 参考界面中英混杂，此处统一为中文；模型名替换为我们已部署的工作流。
 */

export const T = {
  // ── 品牌 ──
  brand: '烬序 JINSU',
  brandFull: '烬序・影墟',
  brandSub: '影墟 Studio',
  slogan: '以 AI 演绎光影叙事',

  // ── 全局导航 ──
  nav: {
    workspace: '工作区',
    library: '主体库',
    settings: '设置',
    restart: '重启服务',
    version: 'v0.1.0',
  },

  // ── 工作区 ──
  workspace: {
    title: (n) => `我的工作区 (${n})`,
    newSeries: '新建系列',
    newProject: '新建项目',
    sync: '同步',
    syncing: '同步中…',
    import: '导入文件',
    episodes: '集数',
    characters: '角色',
    scenes: '场景',
    shots: '分镜',
    openProject: '打开项目',
    statusTodo: '待开始',
    empty: '还没有项目，点击右上角「新建项目」开始',
    noDate: '未编辑',
  },

  // ── 系列详情 ──
  seriesView: {
    title: (t) => `系列 · ${t}`,
    back: '返回工作区',
    newEpisode: '新建剧集',
    edit: '编辑',
    deleteSeries: '删除系列',
    episodes: '剧集',
    characters: '角色',
    scenes: '场景',
    count: (n) => `${n} 个剧集`,
    empty: '这个系列还没有剧集，点击「新建剧集」开始创作',
    confirmEdit: '保存修改',
  },

  // ── 主体库 ──
  library: {
    title: '主体库',
    search: '搜索资产...',
    tabs: { characters: '角色', scenes: '场景', props: '道具' },
    count: (n) => `${n} 个资产`,
    empty: '暂无资产',
    emptyType: '暂无此类型资产',
  },

  // ── 设置 ──
  settings: {
    title: '设置',
    model: {
      title: '默认模型设置',
      desc: '各生成环节默认使用的模型 / 引擎（保存后全局生效）',
      image: '图片',
      video: '视频',
      tts: '配音',
      music: '音乐',
      post: '后期处理',
      ratioCharacter: '角色画幅比例',
      ratioScene: '场景画幅比例',
      ratioProp: '道具画幅比例',
      ratioShot: '分镜画幅比例',
      ratioVideo: '视频画幅比例',
      save: '保存默认设置',
    },
    prompt: {
      title: '默认提示词配置',
      desc: '新项目默认系统提示词配置，留空则使用内置默认值',
      storyboard: '分镜提示词润色',
      storyboardDesc: '用于分镜 / 图片提示词润色的系统提示词',
      i2v: '图生视频提示词润色',
      i2vDesc: '用于图生视频提示词润色的系统提示词',
      ref: '参考视频提示词润色',
      refDesc: '用于参考图 / 参考视频生成提示词润色的系统提示词',
      save: '保存默认设置',
    },
  },

  // ── 流水线步骤 ──
  steps: [
    { id: 'script', n: '01', label: '剧本', icon: 'file' },
    { id: 'art', n: '02', label: '艺术指导', icon: 'palette' },
    { id: 'assets', n: '03', label: '资产', icon: 'users' },
    { id: 'storyboard', n: '04', label: '分镜', icon: 'film' },
    { id: 'motion', n: '05', label: '动态', icon: 'play' },
    { id: 'assembly', n: '06', label: '装配', icon: 'layers' },
    { id: 'voice', n: '07', label: '配音', icon: 'mic', beta: true },
    { id: 'mix', n: '08', label: '混音', icon: 'sliders', beta: true },
    { id: 'export', n: '09', label: '导出', icon: 'download', beta: true },
  ],
  stepLabel: '步骤',
  projectLabel: '项目',

  // ── Script ──
  script: {
    editor: '剧本编辑器',
    extract: '提取实体',
    panel: '实体识别面板',
    recognized: (n) => `已识别 ${n} 个关键要素`,
    stats: '项目统计',
    words: '字数',
    chars: '角色数',
    scenes: '场景数',
    estDur: '预估时长',
    notes: '随手记',
    notesPlaceholder: '在此记录想法…',
    style: '艺术指导风格',
    styleName: '风格名称',
    positive: '正向提示词',
    negative: '负向提示词',
    tip: '提示：可在步骤 2（艺术指导）中修改风格',
  },

  // ── 实体属性弹窗 ──
  entity: {
    title: '实体属性配置',
    visual: '视觉描述',
    age: '年龄',
    gender: '性别',
    clothing: '服装',
    weight: '视觉权重',
    weightHint: '1: 背景路人 — 3: 重要配角 — 5: 核心主角 (需LoRA训练)',
    save: '保存配置',
  },

  // ── Art Direction ──
  art: {
    title: '艺术指导',
    subtitle: '风格定调 - 建立全局视觉标准',
    apply: '应用并继续',
    aiTitle: 'AI 智能推荐',
    analyze: '分析剧本',
    reason: '推荐理由',
    presets: '内置风格预设',
    editor: '风格编辑器',
    name: '风格名称',
    positive: '正向提示词',
    positiveDesc: '将自动应用到所有资产和分镜生成',
    negative: '负向提示词',
    negativeDesc: '避免的视觉元素',
    saveCustom: '保存为自定义风格',
    preview: '生成时的最终提示词预览：',
  },

  // ── 内置风格预设 ──
  presets: [
    { name: '水墨古典', en: 'Classical Ink Wash', desc: '借鉴中国传统水墨画意境，强调留白与气韵，营造古朴诗意的历史感。', tags: ['traditional chinese ink wash', 'soft brush strokes', 'monochromatic palette'] },
    { name: '电影黑色', en: 'Cinematic Noir', desc: '运用强烈的明暗对比和冷色调，突出夜色的深沉与人物内心的复杂情绪。', tags: ['cinematic chiaroscuro lighting', 'cool blue tones', 'high contrast'] },
    { name: '暖调浪漫', en: 'Warm Romanticism', desc: '采用暖色调和柔焦效果，展现室内奢华温馨的氛围，强调人物的自信与慵懒。', tags: ['warm ambient lighting', 'soft focus', 'rich golden hues'] },
    { name: '吉卜力魔法', en: 'Ghibli Magic', desc: '吉卜力工作室手绘风格，温暖细腻的水彩画质感', tags: ['Studio Ghibli style', 'hand-drawn animation', 'watercolor'] },
    { name: '皮克斯 3D', en: 'Pixar 3D', desc: '皮克斯风格3D动画，色彩鲜艳，角色生动', tags: ['Pixar style', '3D animation', 'vibrant colors'] },
    { name: '电影级写实', en: 'Cinematic Realism', desc: '电影级写实风格，专业打光和镜头语言', tags: ['cinematic', 'photorealistic', 'volumetric lighting'] },
    { name: '黑色电影', en: 'Film Noir', desc: '黑色电影风格，高对比度黑白影像', tags: ['black and white', 'film noir', 'high contrast'] },
    { name: '赛博霓虹', en: 'Cyberpunk Neon', desc: '赛博朋克风格，霓虹灯光和未来主义美学', tags: ['cyberpunk', 'neon lights', 'futuristic'] },
    { name: '日式动漫', en: 'Anime Style', desc: '日式动漫风格，明快色彩和夸张表现', tags: ['anime style', 'cel shading', 'vibrant colors'] },
    { name: '水彩梦境', en: 'Watercolor Dream', desc: '水彩画风格，柔和的色彩过渡和艺术质感', tags: ['watercolor painting', 'soft edges', 'pastel colors'] },
    { name: '美式漫画', en: 'Comic Book', desc: '美式漫画风格，粗线条和网点阴影', tags: ['comic book style', 'bold outlines', 'halftone shading'] },
  ],

  // ── Assets ──
  assets: {
    tabs: { characters: '角色', scenes: '场景', props: '道具' },
    syncDesc: '同步描述',
    add: '新增角色',
    generate: '生成',
    overview: '资产总览',
    overviewDesc: '管理画幅比例并查看全局风格设置。',
    ratio: '画幅比例',
    ratioCharacter: '角色',
    ratioScene: '场景',
    ratioProp: '道具',
    tip: '提示：可在步骤 2（艺术指导）中修改风格',
  },

  // ── 角色工作台弹窗 ──
  workbench: {
    title: (n) => `${n} 角色工作台`,
    tip: '提示：主图与三视图共同作为分镜与视频的参考图',
    master: '主图',
    masterDesc: '角色一致性的主要参考依据。',
    threeViews: '三视图',
    threeViewsDesc: '正面、侧面、背面视图，保证三维一致性。',
    avatar: '头像特写',
    avatarDesc: '面部细节与表情特写。',
    static: '静态',
    motion: '动态',
    zoom: '点击放大',
    generate: '生成',
    generating: '生成中…',
    prompt: '提示词',
    negativePrompt: '你的负向提示词',
    applyStyle: '应用艺术指导风格',
    styleAppend: '艺术指导风格（将被追加）',
  },

  // ── Storyboard ──
  storyboard: {
    title: '分镜画面',
    viewScript: '查看脚本',
    generate: '生成分镜',
    frames: (n) => `${n} 帧`,
    insert: '在开头插入画面',
    action: '动作',
    dialogue: '台词',
    noImage: '尚未生成图片',
    noVideo: '尚未生成视频',
    noPrompt: '无可用提示词',
    empty: '暂无分镜',
    selectHint: '选择一个画面以编辑其详情。',
    tip: '提示：使用侧边栏的 ⚙ 图标配置画幅比例。',
  },

  // ── Motion ──
  // 两种驱动模式（与交互设计稿一致）：
  //   i2v = 首帧驱动（首帧/尾帧图驱动画面起止）
  //   r2v = 角色驱动（角色参考图驱动人物外貌）
  motion: {
    title: '动态演绎',
    i2v: '首帧驱动 (I2V)',
    r2v: '角色驱动 (R2V)',
    firstFrame: '首帧图片',
    firstFrameSub: 'First Frame · 有关键帧图时优先用关键帧（角标 KF），没有才用分镜图',
    lastFrame: '尾帧图片',
    lastFrameSub: 'Last Frame · 默认取下一分镜的首帧；最后一镜不指定尾帧',
    badgeFirst: '首帧',
    badgeLast: '尾帧',
    autoLast: '跟随首帧',
    charRef: '角色参考图',
    charRefSub: 'Character Reference',
    storyboard: '分镜',
    upload: '上传',
    select: '选择',
    prompt: '提示词',
    promptPh: '描述画面运动与镜头，例如：镜头缓缓推进，人物转身望向窗外…',
    generating: '生成中…',
    camera: '运镜',
    polish: 'AI 润色',
    polishU00: 'U00 细化',
    polishLlm: '通用 LLM',
    clear: '清空',
    queueAdd: '加入生成队列 (Ctrl+Enter)',
    clearAfter: '提交后清空内容',
    params: '运动参数',
    queue: '队列',
    queueTitle: '任务队列',
    gpuIdle: '显卡空闲',
    filterAll: '全部',
    filterRunning: '进行中',
    filterDone: '已完成',
    remix: '再生成',
    input: '输入',
    result: '结果',
    // R2V
    selectFrame: '选择分镜',
    castSlots: '卡司槽位',
    slotMain: '主角',
    slotSupport: '配角',
    selectRefVideo: '选择参考视频...',
    noRefWarn: '暂无可用的参考视频，请在资产阶段为角色增强生成动态参考视频。',
    noCharWarn: '暂无角色参考图，请先在「角色资产」步骤生成角色参考图（正/侧/背/近）。',
    insertChar: (n) => `插入 角色${n}`,
    // ── 统一素材表单（2026-10-22 重写）──
    // 首帧 / 尾帧 / 参考图 / 驱动音频 全部选填，一次提交；不再有 i2v/r2v 互斥切换。
    materials: '驱动素材',
    materialsSub: '全部选填 · 没填的槽位自动用占位图',
    firstFrameOpt: '首帧（选填）',
    firstFrameOptSub: '不填 → 自动用本镜首帧；本镜没有则用上一分镜视频尾帧',
    lastFrameOpt: '尾帧（选填）',
    lastFrameOptSub: '不填 → 自动用下一分镜首帧；最后一镜回退本镜首帧',
    refImgs: '参考图（选填 · 最多 9 张）',
    refImgsSub: '角色 / 场景 / 道具，可多选',
    audioSrc: '驱动音频（选填）',
    audioAuto: '自动',
    audioAsset: '指定',
    audioNone: '无',
    audioAutoSub: '本镜已有配音就直接用，没有就按台词自动合成',
    audioAssetSub: '从素材库里挑一条已生成的音频',
    audioNoneSub: '留空，只生成画面不带驱动音频',
    targetShots: '目标分镜（可多选 · 批量排队）',
    targetShotsSub: '勾选多个则串行逐个生成，各自回写到对应分镜',
    noShotYet: '请先在「分镜」步骤生成分镜',
    pickLib: '素材库',
    pickShot: '分镜图',
    clearSel: '清除',
    selCount: (n) => `已选 ${n}`,
    batchRunning: (i, n) => `批量生成中 ${i}/${n}`,
    batchDone: (n) => `批量完成，成功 ${n} 个`,
    // 参数
    basic: '基础设置',
    model: '模型',
    duration: '生成时长',
    shotType: '镜头类型',
    single: '单镜头',
    multi: '多镜头叙事',
    multiDesc: '多镜头模式会生成包含多个切换镜头的叙事视频',
    quality: '画质规格',
    resolution: '画质',
    ratio: '画幅比例',
    batch: '生成数量',
    creative: '创意与音频',
    enhancer: '智能扩写',
    audio: '音频',
    mute: '静音',
    aiSound: 'AI 音效',
    soundDriven: '声音驱动',
    negative: '负向提示词',
    advanced: '高级',
    seed: '随机种子',
    // 批量生成
    batchAll: '批量生成全部镜头',
    batching: '批量生成中…',
    batchStop: '停止',
    batchProgress: (a, b) => `批量进度 ${a}/${b}`,
    batchHint: '一次性跑完所有待生成镜头（已出视频的自动跳过）',
  },

  // ── Assembly ──
  assembly: {
    title: '装配时间轴',
    ready: (a, b) => `${a}/${b} 帧已就绪`,
    merge: '合并并继续',
    merged: '合并完成',
    mergedDesc: '所有选中的片段已拼接为整片，可以继续添加配音与音效。',
    download: '下载 MP4',
    selectVideo: '选择视频',
    noVideos: '无视频',
    variants: (n) => `${n} 个变体`,
    variantsTitle: '变体',
    variantsHint: '从时间轴选择一个画面以查看视频变体。',
  },

  // ── Voice ──
  voice: {
    casting: '选角室',
    reader: '台词本',
    generateAll: '生成全部音频',
    assigned: '指定音色',
    selectVoice: '选择音色...',
    speed: '语速',
    pitch: '音调',
    volume: '音量',
    status: '配音状态',
    needVoices: '部分角色还需要指定音色。',
    frame: (n) => `画面 ${n}`,
  },

  // ── Final Mix ──
  mix: {
    title: '混音',
    mixer: '音频混音器',
    videoAudio: '视频原声',
    dialogue: '对白',
    sfx: '音效',
    music: '配乐',
    futureNote: '音频混音功能将在后续版本提供。',
    inspector: '轨道检查器',
    inspectorHint: '在时间轴上选择一个片段以查看详情。',
    video: '视频',
    bgm: '配乐',
    shot: (n) => `镜头 ${n}`,
    zoom: '缩放',
    defaultBgm: '影院张力配乐',
    doMix: '混音并生成成片',
    mixing: '混音中…',
    mixHint: '配音按镜头时长对齐，配乐铺满全片（画面不重编码）',
    noVideo: '还没有成片，请先完成「合成」步骤',
    mixDone: '混音完成',
    voiceVol: '配音音量',
    bgmVol: '配乐音量',
    soundtrack: '音轨',
    noVoice: '无配音',
    noBgm: '无配乐',
  },

  // ── Export ──
  export: {
    title: '导出中心',
    resolution: '分辨率',
    format: '格式',
    subtitles: '字幕',
    burnIn: '硬字幕(烧录)',
    srt: '导出 .SRT 文件',
    none: '无',
    render: '开始渲染',
    complete: '导出完成！',
    completeDesc: '你的视频已准备好，可以分享给全世界了。',
    download: '下载视频',
    history: '导出历史',
  },

  // ── 弹窗 ──
  dialog: {
    createSeries: '新建系列',
    seriesTitle: '系列标题',
    seriesTitlePh: '输入系列标题...',
    seriesDesc: '系列描述',
    seriesDescPh: '输入系列描述...',
    createProject: '新建项目',
    projectTitle: '项目标题',
    projectTitlePh: '输入项目标题...',
    projectText: '小说或剧本内容',
    projectTextPh: '粘贴小说或剧本内容...',
    importFile: '导入文件',
    importTip: '支持 .txt / .md / .docx 文件',
    importErr: '仅支持 .txt、.md 和 .docx 文件',
    cancel: '取消',
    create: '创建',
    confirmDeleteProject: (t) => `确定要删除项目"${t}"吗？`,
    confirmDeleteSeries: (t) => `确定要删除系列"${t}"吗？系列下的剧集会转为独立项目，不会被删除。`,
    confirmDeleteEpisode: (t) => `确定要删除剧集"${t}"吗？`,
    confirmRestart: '将重新加载配置并刷新页面。\n\n是否继续？',
    restartDegraded: '服务已执行降级重启',
    syncOk: (p, s) => `同步成功，拉取到 ${p} 个项目 / ${s} 个系列`,
    syncFail: (m) => `同步失败：${m}`,
  },

  // ── 通用空态（统一中文）──
  empty: {
    image: '尚未生成图片',
    video: '尚未生成视频',
    motionRef: '暂无动态参考',
    styleNone: '未配置风格',
    positiveNone: '未定义正向提示词',
    promptNone: '无可用提示词',
    noVideos: '无视频',
    assetType: '暂无此类型资产',
    seriesImport: '暂无其他可导入系列',
    episodes: '暂无集数',
  },
};

/**
 * 模型选项 —— 替换为我们已部署的工作流
 * (原为 Wan/Kling/Vidu 云 API)
 */
// 模型/工作流选项 —— 全部使用面板真实工作流 id
// ⚠️ 铁律（2026-10-22 实例实测）：面板 API 的 workflow_id = 工作流文件名去掉 .json。
//    面板进程是 /root/zealman-app 的 node server.js，`GET /api/workflow/list` 返回的 id
//    就是文件名（如 WF05_vid_av3in1），不是我们自定义的 JINSU-WF05。
//    所以这里一律写文件名形式，否则 dispatch 路由不到。
//
// 2026-10-22 起全部换成「JINSU 自建 9 工作流」（D:/JINSU/_workflow_rebuild/workflows/）：
//   WF01 文生图 / WF02 人物设定 / WF03 造型换装 / WF04 真音色TTS / WF05 视频三合一
//   WF06 首尾帧轻量 / WF08 视频超分 / WF09 分镜关键帧 / WF10 音乐BGM
//
// 【WF07 真唇同步(LTX2.3 22B) 已砍掉 2026-10-22】
//   它输出的是「固定机位单人正脸口播」，接不进有运镜/表演/环境的剧情镜头；
//   短剧里人物说话的口型由 WF05 的 drive_audio 在生成视频时就解决了，不需要单独一条流。
//   原图归档：workflows/_deprecated/WF07_vid_lipsync_已砍掉.json（依赖 Get/Set 节点包 + 27B gguf，实例均缺）
export const MODELS = {
  // ① 图片 —— 两个引擎槽位保留（UI 与已有设置兼容），都接到自建 SDXL 流。
  image: [
    { key: 'qwen',  label: 'SDXL 文生图', desc: '通用文生图 / 角色主视图（WF01）', wf: 'WF01_img_t2i' },
    { key: 'krea2', label: 'SDXL 角色设定', desc: '人物设定 / 多视图合图（WF02）', wf: 'WF02_img_charset' },
  ],
  // ② 视频引擎 —— Wan2.2 已弃用（G02/G18 不再使用），统一走 H3 三合一 WF05
  //    （9图参考 + 首尾帧 + 驱动音频，一个流吃下全部模式）。
  //    wf 仅作占位（defaultWf('video') 用），真实路由走 videoWf(engine, mode)。
  video: [
    { key: 'h3', label: 'MiniMax H3', desc: '三合一：9图参考 + 首尾帧 + 驱动音频（WF05）', wf: 'WF05_vid_av3in1' },
  ],
  // ③ 配音 / TTS
  tts: [
    { key: 'qwen3tts', label: 'Qwen3TTS', desc: '真音色语音合成（WF04）', wf: 'WF04_audio_tts' },
  ],
  // ④ 音乐（🔧 修复：原 id 多了 "-1" 后缀，面板实际为 N05-黑鹤001-ACE-Step-音乐歌曲生成流，导致路由 404）
  music: [
    { key: 'ace-step', label: 'ACE-Step', desc: '带人声歌曲 / BGM 生成（WF10）', wf: 'WF10_audio_music' },
  ],
  // ⑤ 后期处理
  post: [
    { key: 'vsr', label: '视频超分', desc: 'FlashVSR 视频超分辨率（WF08）', wf: 'WF08_vid_upscale' },
  ],
};

// ════════════ 视频引擎 × 驱动模式 → 工作流 路由表 ════════════
// 设置里选「引擎」(video = h3 / wan22)，动态演绎里选「驱动模式」，两者组合决定工作流。
// 模式语义（与交互设计稿一致）：
//   i2v = 首帧驱动  → 用首帧/尾帧图控制画面起止，走各引擎的「首尾帧」工作流
//   r2v = 角色驱动  → 用角色参考图（多图参考 / 9图）驱动，走各引擎的「多图参考」工作流
export const VIDEO_WF = {
  h3: {
    // WF05 三合一（H3 T8 双采）：9图参考 + 首尾帧 + 驱动音频，一个流覆盖两种模式
    i2v: 'WF05_vid_av3in1',
    r2v: 'WF05_vid_av3in1',
  },
  // Wan2.2 已弃用（API-G02 / API-G18 不再使用）。保留键仅为兼容旧设置里存过 'wan22'，
  // 一律回退到 H3 三合一，避免路由落到已删工作流上。
  wan22: {
    i2v: 'WF05_vid_av3in1',
    r2v: 'WF05_vid_av3in1',
  },
};

/** 视频回退链：主工作流加载/提交失败时依次尝试 */
export const VIDEO_WF_FALLBACKS = {
  WF05_vid_av3in1: ['WF06_vid_flf_h3'], // 三合一 → H3 首尾帧轻量版（无音频）
};

// ════════════ 配音 / 音乐 / 后期 工作流 ════════════
export const MEDIA_WF = {
  tts: 'WF04_audio_tts',
  music: 'WF10_audio_music',   // 🔧 修 bug：原 'N05-...-1' 多了一个 -1，面板上不存在，音乐必失败
  post: 'WF08_vid_upscale',
};

/** 读取设置里的视频引擎 key（h3/wan22），缺省 h3 */
export function defaultVideoEngine() {
  try {
    const saved = JSON.parse(localStorage.getItem('APP_SETTINGS') || '{}');
    const k = saved.defaultModels && saved.defaultModels.video;
    if (k && VIDEO_WF[k]) return k;
  } catch {}
  return 'h3';
}

/** 引擎 + 驱动模式 → 具体面板工作流 id（生成时调用）；引擎不支持该模式则回退 H3 同名模式 */
export function videoWf(engine, mode) {
  const map = VIDEO_WF[engine] || VIDEO_WF.h3;
  return map[mode] || VIDEO_WF.h3[mode] || VIDEO_WF.h3.i2v;
}

// ════════════ 图片引擎 × 生成任务 → 工作流 路由表 ════════════
// 设置里选「图片模型」(image = qwen / krea2)，资产/角色工作台按生成任务类型路由到具体工作流。
// 任务语义（与交互设计稿一致）：
//   text  = 文生图（角色主视图 / 场景 / 道具）
//   four  = 做剧图像4视图（需要参考图）
export const IMAGE_WF = {
  qwen: {
    text: 'WF01_img_t2i',      // 文生图（角色主视图 / 场景 / 道具）
    four: 'WF02_img_charset',  // 人物设定 / 多视图合图（需参考图）
  },
  krea2: {
    text: 'WF01_img_t2i',
    four: 'WF02_img_charset',
  },
};

/** 「四视图/人物设定」工作流（原 T10，现 WF02）。提交时互为回退的候选列表 */
export const T10_WF_IDS = ['WF02_img_charset'];
export const isT10Wf = (id) => T10_WF_IDS.includes(id);

/** U00 · 提示词细化工作流（Qwen3.8-27B VL）。
 *  节点结构：LoadImage 1~9（9 张参考图）→ ZealmanLLM_ModelLoader 14 → ZealmanLLM_Generate 15
 *  → ShowText 13。系统提示词烤死在节点 15，调用方只需喂 `15:提示词` 和 1~9 的图。
 *  面板注册名以「U00-minimax_h3提示词QWEN3.8群主版」为准，带 API- 前缀的作回退。 */
export const U00_WF_ID = 'U00-minimax_h3提示词QWEN3.8群主版';
export const U00_WF_FALLBACKS = ['API-U00-minimax_h3提示词QWEN3.8群主版'];

/** 分镜生图工作流：统一仅保留 f2k（自搭 · Flux2 Klein 9B 多图参考，见 SHOT_IMAGE_WF_FLUX2）。
 *  B03（Qwen-Image-Edit-2511）与 D18（klein9b 真人剧制造机）已从面板移除，不再引用。 */

/**
 * 分镜 / 关键帧生图工作流（2026-09-30 起默认）：**自搭 · Flux2 Klein 9B 多图参考（自适应画幅）**。
 *
 * 🔴 这是我们自己在 D14 基础上搭的：砍掉整条 VLM 自动改写链，只保留 ReferenceLatent 潜空间注入，
 *    三张参考图各自 encode 成 latent 串进 conditioning —— 比 B03「在提示词里喊话要像参考图」硬得多，
 *    专治「人物锁得住、场景锁不住」（B03 的 F2P 是锁脸 LoRA，只管人脸，场景它根本不管）。
 *
 *    节点：参考图 259/300/301 → 缩放 249/302/303 → VAE 编码 → ReferenceLatent 串联 → CFGGuider → 出图。
 *    画幅：320（画幅决定）的 width/height 同时驱动 空Latent 251 与 Flux2Scheduler 226，改一处即可。
 *
 *    面板 id 就是工作流文件名；若在面板上注册成 API 版则会多一个「API-」前缀，故备一个回退 id。
 */
export const SHOT_IMAGE_WF_FLUX2 = 'WF09_img_shot';
export const SHOT_IMAGE_WF_FLUX2_API = 'WF09_img_shot';

/** 分镜生图引擎：仅 f2k（自搭 · Flux2 Klein 9B 多图参考，ReferenceLatent 潜空间注入）。
 *  B03 / D18 已从面板移除，不再作为可选引擎；旧设置里的 b03/d18 一律回退到 f2k。 */
export function defaultShotImageEngine() {
  try {
    const s = JSON.parse(localStorage.getItem('APP_SETTINGS') || '{}');
    const k = s.defaultModels && s.defaultModels.shotImage;
    if (k === 'f2k') return k;
  } catch {}
  return 'f2k';
}

/** 提示词润色引擎：'u00' = 调度机 U00 视频提示词细化端点（Qwen3.8-27B 中文六段，默认）；
 *  'llm'  = 通用 LLM（glm-client /api/llm/chat + videoPolishSystemPrompt）。
 *  读取 APP_SETTINGS.defaultPrompts.polishEngine；非法或缺省时回退 u00。 */
export function defaultPolishEngine() {
  try {
    const s = JSON.parse(localStorage.getItem('APP_SETTINGS') || '{}');
    const k = s.defaultPrompts && s.defaultPrompts.polishEngine;
    if (k === 'u00' || k === 'llm') return k;
  } catch {}
  return 'u00';
}

/** 图片模型 key + 任务类型 → 具体面板工作流 id（生成时调用）；缺省回退 qwen.text */
export function imageWf(modelKey, task = 'text') {
  const map = IMAGE_WF[modelKey] || IMAGE_WF.qwen;
  return map[task] || map.text || IMAGE_WF.qwen.text;
}

/** 读取设置里的画幅比例（如 defaultRatios.video），非法或缺省时回退 9:16 */
export function defaultRatio(key) {
  try {
    const s = JSON.parse(localStorage.getItem('APP_SETTINGS') || '{}');
    const r = s.defaultRatios && s.defaultRatios[key];
    if (RATIOS.includes(r)) return r;
  } catch {}
  return '9:16';
}

/** 读取某分类默认选中的工作流 id（wf）——优先用设置里的默认，否则取列表第一项 */
export function defaultWf(category) {
  const list = MODELS[category];
  if (!list || !list.length) return '';
  try {
    const saved = JSON.parse(localStorage.getItem('APP_SETTINGS') || '{}');
    const key = (saved.defaultModels && saved.defaultModels[category]) || list[0].key;
    const entry = list.find((m) => m.key === key);
    return entry ? entry.wf : list[0].wf;
  } catch {
    return list[0].wf;
  }
}

/** 读取某分类默认选中的 key */
export function defaultModelKey(category) {
  const list = MODELS[category];
  if (!list || !list.length) return '';
  try {
    const saved = JSON.parse(localStorage.getItem('APP_SETTINGS') || '{}');
    if (saved.defaultModels && saved.defaultModels[category]) return saved.defaultModels[category];
  } catch {}
  return list[0].key;
}

/** 画幅比例 */
export const RATIOS = ['9:16', '16:9', '1:1'];

/** 分辨率（视频） */
export const RESOLUTIONS = ['480p', '720p', '1080p'];

/** 镜头类型 */
export const SHOT_TYPES = [
  { key: 'single', label: T.motion.single },
  { key: 'multi', label: T.motion.multi, desc: T.motion.multiDesc },
];

/** 音频模式 */
export const AUDIO_MODES = [
  { key: 'mute', label: T.motion.mute },
  { key: 'aiSound', label: T.motion.aiSound },
  { key: 'soundDriven', label: T.motion.soundDriven },
];

/** 混音轨道 */
export const MIX_TRACKS = [
  { key: 'videoAudio', label: T.mix.videoAudio, value: 100 },
  { key: 'dialogue', label: T.mix.dialogue, value: 100 },
  { key: 'sfx', label: T.mix.sfx, value: 80 },
  { key: 'music', label: T.mix.music, value: 50 },
];
