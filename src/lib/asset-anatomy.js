// 🔴 非人角色（动物/虫类/怪物等）判定与专用提示词片段——modals.jsx（工作台）与
//    Studio.jsx（出图路由）共用，保证「提示词写法」与「工作流路由」一致。
//    背景：T10 是「人物四视图」模板、B03 编辑链路也偏人物，非人生物走这些链路
//    会被拼成人类躯干或多头融合体，必须识别出来走 T01 文生图 + 反拟人负向词。

export const NON_HUMAN_KEYWORDS = [
  'spider', '蜘蛛', '蛛', 'insect', '昆虫', '虫', 'bug', 'beetle', '甲虫', 'moth', '蛾', 'mantis', '螳螂',
  'scorpion', '蝎', 'centipede', '蜈蚣', 'octopus', '章鱼', 'crab', '蟹', 'snail', '蜗牛',
  'wolf', '狼', 'tiger', '虎', 'lion', '狮', 'bear', '熊', 'horse', '马', 'deer', '鹿', 'fox', '狐狸', 'cat', '猫', 'dog', '狗',
  'dragon', '龙', 'dinosaur', '恐龙', 'snake', '蛇', 'lizard', '蜥蜴', 'crocodile', '鳄', 'turtle', '龟', 'tortoise', '鳖',
  'bird', '鸟', 'eagle', '鹰', 'owl', '猫头鹰', 'crow', '乌鸦', 'fish', '鱼', 'shark', '鲨', 'whale', '鲸', 'dolphin', '海豚',
  'beast', '野兽', 'monster', '怪物', 'creature', 'alien', '外星', 'robot', '机器人', 'golem', '石像',
  'ape', 'gorilla', '猩猩', '变异', 'phantom', '幻', 'spirit', '灵', 'demon', '鬼', 'spiritual', '灵体',
];

/** 按名称+外观描述判断是否非人角色（命中任一关键词即视为非人） */
export const looksNonHuman = (name, desc) => {
  const s = `${name || ''} ${desc || ''}`.toLowerCase();
  return NON_HUMAN_KEYWORDS.some((k) => s.includes(k.toLowerCase()));
};

export const NEG_BASE = 'low quality, bad anatomy, text, error, cropped, worst quality';
/** 非人角色专用负向词：封死拟人拼接 + 多主体融合（蜘蛛实测主图会画出三只融合体） */
export const NEG_NON_HUMAN = ', humanoid, human torso, human arms, human legs, anthropomorphic, human-animal hybrid, upright bipedal human posture, multiple subjects, extra bodies, duplicated heads, fused bodies, collage';
