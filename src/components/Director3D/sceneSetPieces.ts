// 场景布景件库（白模 / 程序化素模，不加载任何外部 GLB）。
// 思路对齐 Reveric 的「命名布景件」：每个场景由一组有名字的复合几何体拼成，
// 如客厅=沙发+茶几+电视柜+电视+地毯+绿植，宫殿=厅柱×4+中堂地台+中堂屏+匾額+公案+座椅。
// 复合件用 parts（多体素）表达，渲染仍走 DirectorCanvas 的素模材质。
import type { Prop, SceneTemplateType } from './types';

type SetPieceDef = Omit<Prop, 'id'>;

// 白模色调：家具统一偏灰冷，与浅色地面、浅色人物区分，又守住「白模预演」观感。
const CLAY = '#cdd5e2';
const CLAY_LT = '#dbe2ec';
const CLAY_DK = '#aab3c2';
const WOOD = '#c2b89f';
const METAL = '#a9b2c1';
const GOLD = '#bd9f63';
const FABRIC = '#c6cfdc';
const GREEN = '#9fb89a';

export const SCENE_SET_PIECES: Record<SceneTemplateType, SetPieceDef[]> = {
  empty: [],

  // 中性室内：未识别出具体地点时的兜底。只给「一个空间」的骨架（墙/地毯/桌/椅/灯），
  // 不假装是某个具体场景，用户看清空间关系后再在下拉里换成真实场景即可。
  generic: [
    {
      name: '背景墙', type: 'box', position: { x: 0, y: 1.5, z: -5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: CLAY_LT,
      parts: [
        { shape: 'box', size: { x: 7.6, y: 3, z: 0.16 }, offset: { x: 0, y: 0, z: 0 }, color: CLAY_LT },
        { shape: 'box', size: { x: 7.6, y: 0.12, z: 0.2 }, offset: { x: 0, y: 1.5, z: 0 }, color: CLAY_DK },
      ],
    },
    { name: '地毯', type: 'plane', position: { x: 0, y: 0.012, z: -1.5 }, rotation: { x: -Math.PI / 2, y: 0, z: 0 }, scale: { x: 1.9, y: 1, z: 1.5 }, color: FABRIC },
    {
      name: '长桌', type: 'box', position: { x: 0, y: 0, z: -1.8 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: WOOD,
      parts: [
        { shape: 'box', size: { x: 1.8, y: 0.1, z: 0.85 }, offset: { x: 0, y: 0.75, z: 0 }, color: WOOD },
        { shape: 'box', size: { x: 0.08, y: 0.75, z: 0.08 }, offset: { x: -0.82, y: 0.375, z: -0.35 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.08, y: 0.75, z: 0.08 }, offset: { x: 0.82, y: 0.375, z: -0.35 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.08, y: 0.75, z: 0.08 }, offset: { x: -0.82, y: 0.375, z: 0.35 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.08, y: 0.75, z: 0.08 }, offset: { x: 0.82, y: 0.375, z: 0.35 }, color: CLAY_DK },
      ],
    },
    {
      name: '座椅1', type: 'box', position: { x: -1.25, y: 0, z: -1.5 }, rotation: { x: 0, y: Math.PI / 2, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: FABRIC,
      parts: [
        { shape: 'box', size: { x: 0.5, y: 0.1, z: 0.5 }, offset: { x: 0, y: 0.45, z: 0 }, color: FABRIC },
        { shape: 'box', size: { x: 0.5, y: 0.55, z: 0.1 }, offset: { x: 0, y: 0.72, z: -0.2 }, color: CLAY_LT },
        { shape: 'box', size: { x: 0.44, y: 0.45, z: 0.44 }, offset: { x: 0, y: 0.22, z: 0 }, color: CLAY_DK },
      ],
    },
    {
      name: '座椅2', type: 'box', position: { x: 1.25, y: 0, z: -1.5 }, rotation: { x: 0, y: -Math.PI / 2, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: FABRIC,
      parts: [
        { shape: 'box', size: { x: 0.5, y: 0.1, z: 0.5 }, offset: { x: 0, y: 0.45, z: 0 }, color: FABRIC },
        { shape: 'box', size: { x: 0.5, y: 0.55, z: 0.1 }, offset: { x: 0, y: 0.72, z: -0.2 }, color: CLAY_LT },
        { shape: 'box', size: { x: 0.44, y: 0.45, z: 0.44 }, offset: { x: 0, y: 0.22, z: 0 }, color: CLAY_DK },
      ],
    },
    {
      name: '落地灯', type: 'cylinder', position: { x: 2.9, y: 0, z: -2.4 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: METAL,
      parts: [
        { shape: 'cylinder', size: { x: 0.36, y: 0.06, z: 0.36 }, offset: { x: 0, y: 0.03, z: 0 }, color: CLAY_DK },
        { shape: 'cylinder', size: { x: 0.06, y: 1.5, z: 0.06 }, offset: { x: 0, y: 0.78, z: 0 }, color: METAL },
        { shape: 'cylinder', size: { x: 0.4, y: 0.34, z: 0.4 }, offset: { x: 0, y: 1.62, z: 0 }, color: CLAY_LT },
      ],
    },
  ],

  // 拱门庭院：婚礼/过门/仪式类镜头。拱门（双立柱+横梁）置于后半区 z≈-2.2，三级台阶由前向后抬升，
  // 红毯从原点一路铺到拱下；人物在原点起步、拾级走向拱门，机位由后前推正好框住整组。
  arch: [
    { name: '拱门左柱', type: 'cylinder', position: { x: -1.2, y: 1.4, z: -2.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.32, y: 2.8, z: 0.32 }, color: WOOD },
    { name: '拱门右柱', type: 'cylinder', position: { x: 1.2, y: 1.4, z: -2.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.32, y: 2.8, z: 0.32 }, color: WOOD },
    { name: '拱门横梁', type: 'box', position: { x: 0, y: 2.85, z: -2.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2.8, y: 0.32, z: 0.32 }, color: GOLD },
    { name: '拱顶花饰', type: 'box', position: { x: 0, y: 3.1, z: -2.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1.2, y: 0.4, z: 0.3 }, color: GREEN },
    { name: '台阶1', type: 'box', position: { x: 0, y: 0.1, z: -0.9 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 3.2, y: 0.2, z: 0.9 }, color: CLAY_DK },
    { name: '台阶2', type: 'box', position: { x: 0, y: 0.3, z: -1.4 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 3.0, y: 0.2, z: 0.8 }, color: CLAY_DK },
    { name: '台阶3', type: 'box', position: { x: 0, y: 0.5, z: -1.9 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2.8, y: 0.2, z: 0.8 }, color: CLAY_DK },
    { name: '红毯', type: 'plane', position: { x: 0, y: 0.02, z: -1.2 }, rotation: { x: -Math.PI / 2, y: 0, z: 0 }, scale: { x: 1.3, y: 1, z: 3.4 }, color: '#b0413e' },
    { name: '花柱左', type: 'cylinder', position: { x: -2.1, y: 0.5, z: -1.0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.22, y: 1.0, z: 0.22 }, color: GREEN },
    { name: '花柱右', type: 'cylinder', position: { x: 2.1, y: 0.5, z: -1.0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.22, y: 1.0, z: 0.22 }, color: GREEN },
  ],

  livingroom: [
    {
      name: '沙发', type: 'box', position: { x: -1.7, y: 0, z: -1.3 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: FABRIC,
      parts: [
        { shape: 'box', size: { x: 1.9, y: 0.2, z: 0.9 }, offset: { x: 0, y: 0.42, z: 0 }, color: FABRIC },
        { shape: 'box', size: { x: 1.9, y: 0.6, z: 0.2 }, offset: { x: 0, y: 0.8, z: -0.35 }, color: CLAY_LT },
        { shape: 'box', size: { x: 0.22, y: 0.5, z: 0.9 }, offset: { x: -0.97, y: 0.62, z: 0 }, color: CLAY_LT },
        { shape: 'box', size: { x: 0.22, y: 0.5, z: 0.9 }, offset: { x: 0.97, y: 0.62, z: 0 }, color: CLAY_LT },
        { shape: 'box', size: { x: 0.8, y: 0.14, z: 0.72 }, offset: { x: -0.45, y: 0.56, z: 0.02 }, color: CLAY_LT },
        { shape: 'box', size: { x: 0.8, y: 0.14, z: 0.72 }, offset: { x: 0.45, y: 0.56, z: 0.02 }, color: CLAY_LT },
      ],
    },
    {
      name: '茶几', type: 'box', position: { x: 0, y: 0, z: -0.3 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: WOOD,
      parts: [
        { shape: 'box', size: { x: 1.2, y: 0.08, z: 0.6 }, offset: { x: 0, y: 0.4, z: 0 }, color: WOOD },
        { shape: 'box', size: { x: 0.06, y: 0.4, z: 0.06 }, offset: { x: -0.55, y: 0.2, z: -0.25 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.06, y: 0.4, z: 0.06 }, offset: { x: 0.55, y: 0.2, z: -0.25 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.06, y: 0.4, z: 0.06 }, offset: { x: -0.55, y: 0.2, z: 0.25 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.06, y: 0.4, z: 0.06 }, offset: { x: 0.55, y: 0.2, z: 0.25 }, color: CLAY_DK },
      ],
    },
    { name: '电视柜', type: 'box', position: { x: 0, y: 0.3, z: -2.7 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 0.6, z: 0.4 }, color: CLAY_DK },
    { name: '电视', type: 'box', position: { x: 0, y: 1.1, z: -2.85 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1.5, y: 0.85, z: 0.08 }, color: METAL },
    { name: '地毯', type: 'plane', position: { x: 0, y: 0.012, z: -0.3 }, rotation: { x: -Math.PI / 2, y: 0, z: 0 }, scale: { x: 1.6, y: 1, z: 1.3 }, color: CLAY_LT },
    {
      name: '绿植', type: 'cylinder', position: { x: 2.7, y: 0, z: -1.9 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: WOOD,
      parts: [
        { shape: 'cylinder', size: { x: 0.26, y: 0.4, z: 0.26 }, offset: { x: 0, y: 0.2, z: 0 }, color: WOOD },
        { shape: 'sphere', size: { x: 0.5, y: 0.55, z: 0.5 }, offset: { x: 0, y: 0.7, z: 0 }, color: GREEN },
      ],
    },
  ],

  palace: [
    { name: '厅柱·左前', type: 'cylinder', position: { x: -3, y: 2, z: -0.6 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.3, y: 4, z: 0.3 }, color: GOLD },
    { name: '厅柱·右前', type: 'cylinder', position: { x: 3, y: 2, z: -0.6 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.3, y: 4, z: 0.3 }, color: GOLD },
    { name: '厅柱·左后', type: 'cylinder', position: { x: -3, y: 2, z: 1.8 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.3, y: 4, z: 0.3 }, color: GOLD },
    { name: '厅柱·右后', type: 'cylinder', position: { x: 3, y: 2, z: 1.8 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.3, y: 4, z: 0.3 }, color: GOLD },
    { name: '中堂地台', type: 'box', position: { x: 0, y: 0.15, z: 0.6 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 5, y: 0.3, z: 4 }, color: WOOD },
    { name: '中堂屏', type: 'box', position: { x: 0, y: 1.4, z: -1.7 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 3, y: 2.2, z: 0.15 }, color: CLAY_LT },
    { name: '匾額', type: 'box', position: { x: 0, y: 3.2, z: -2.4 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1.2, y: 0.5, z: 0.12 }, color: GOLD },
    {
      name: '公案', type: 'box', position: { x: 0, y: 0, z: 0.9 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: WOOD,
      parts: [
        { shape: 'box', size: { x: 2, y: 0.14, z: 0.9 }, offset: { x: 0, y: 1.0, z: 0 }, color: WOOD },
        { shape: 'box', size: { x: 0.12, y: 1, z: 0.12 }, offset: { x: -0.9, y: 0.5, z: -0.4 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.12, y: 1, z: 0.12 }, offset: { x: 0.9, y: 0.5, z: -0.4 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.12, y: 1, z: 0.12 }, offset: { x: -0.9, y: 0.5, z: 0.4 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.12, y: 1, z: 0.12 }, offset: { x: 0.9, y: 0.5, z: 0.4 }, color: CLAY_DK },
      ],
    },
    {
      name: '座椅', type: 'box', position: { x: 0, y: 0, z: 1.9 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: GOLD,
      parts: [
        { shape: 'box', size: { x: 0.6, y: 0.1, z: 0.6 }, offset: { x: 0, y: 0.5, z: 0 }, color: GOLD },
        { shape: 'box', size: { x: 0.6, y: 0.6, z: 0.1 }, offset: { x: 0, y: 0.8, z: -0.25 }, color: CLAY_LT },
        { shape: 'box', size: { x: 0.06, y: 0.5, z: 0.06 }, offset: { x: -0.25, y: 0.25, z: -0.25 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.06, y: 0.5, z: 0.06 }, offset: { x: 0.25, y: 0.25, z: -0.25 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.06, y: 0.5, z: 0.06 }, offset: { x: -0.25, y: 0.25, z: 0.25 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.06, y: 0.5, z: 0.06 }, offset: { x: 0.25, y: 0.25, z: 0.25 }, color: CLAY_DK },
      ],
    },
  ],

  bedroom: [
    {
      name: '床', type: 'box', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: FABRIC,
      parts: [
        { shape: 'box', size: { x: 2, y: 0.3, z: 2.6 }, offset: { x: 0, y: 0.3, z: 0 }, color: WOOD },
        { shape: 'box', size: { x: 1.9, y: 0.2, z: 2.5 }, offset: { x: 0, y: 0.55, z: 0 }, color: FABRIC },
        { shape: 'box', size: { x: 0.6, y: 0.18, z: 0.4 }, offset: { x: -0.5, y: 0.72, z: -1.0 }, color: CLAY_LT },
        { shape: 'box', size: { x: 0.6, y: 0.18, z: 0.4 }, offset: { x: 0.5, y: 0.72, z: -1.0 }, color: CLAY_LT },
      ],
    },
    { name: '床头柜', type: 'box', position: { x: -1.5, y: 0.25, z: -0.9 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.5, y: 0.5, z: 0.5 }, color: WOOD },
    {
      name: '台灯', type: 'cylinder', position: { x: -1.5, y: 0, z: -0.9 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: CLAY_DK,
      parts: [
        { shape: 'cylinder', size: { x: 0.14, y: 0.06, z: 0.14 }, offset: { x: 0, y: 0.5, z: 0 }, color: CLAY_DK },
        { shape: 'cylinder', size: { x: 0.04, y: 0.4, z: 0.04 }, offset: { x: 0, y: 0.72, z: 0 }, color: CLAY_DK },
        { shape: 'sphere', size: { x: 0.24, y: 0.22, z: 0.24 }, offset: { x: 0, y: 0.98, z: 0 }, color: CLAY_LT },
      ],
    },
    { name: '衣柜', type: 'box', position: { x: 2, y: 1, z: -1.8 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1.5, y: 2, z: 0.6 }, color: CLAY_DK },
    { name: '地毯', type: 'plane', position: { x: 0, y: 0.012, z: 1.5 }, rotation: { x: -Math.PI / 2, y: 0, z: 0 }, scale: { x: 1.3, y: 1, z: 1.1 }, color: CLAY_LT },
  ],

  office: [
    {
      name: '办公桌', type: 'box', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: WOOD,
      parts: [
        { shape: 'box', size: { x: 1.8, y: 0.1, z: 0.9 }, offset: { x: 0, y: 0.78, z: 0 }, color: WOOD },
        { shape: 'box', size: { x: 0.08, y: 0.78, z: 0.08 }, offset: { x: -0.85, y: 0.39, z: -0.4 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.08, y: 0.78, z: 0.08 }, offset: { x: 0.85, y: 0.39, z: -0.4 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.08, y: 0.78, z: 0.08 }, offset: { x: -0.85, y: 0.39, z: 0.4 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.08, y: 0.78, z: 0.08 }, offset: { x: 0.85, y: 0.39, z: 0.4 }, color: CLAY_DK },
      ],
    },
    {
      name: '办公椅', type: 'box', position: { x: 0, y: 0, z: 1.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: CLAY_DK,
      parts: [
        { shape: 'box', size: { x: 0.55, y: 0.1, z: 0.55 }, offset: { x: 0, y: 0.48, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.55, y: 0.6, z: 0.1 }, offset: { x: 0, y: 0.8, z: -0.22 }, color: CLAY_LT },
        { shape: 'cylinder', size: { x: 0.08, y: 0.48, z: 0.08 }, offset: { x: 0, y: 0.24, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.5, y: 0.06, z: 0.5 }, offset: { x: 0, y: 0.04, z: 0 }, color: CLAY_DK },
      ],
    },
    { name: '文件柜', type: 'box', position: { x: -2, y: 0.9, z: -1 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.8, y: 1.8, z: 0.4 }, color: CLAY_DK },
    {
      name: '显示器', type: 'box', position: { x: 0, y: 0, z: -0.35 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: METAL,
      parts: [
        { shape: 'cylinder', size: { x: 0.06, y: 0.25, z: 0.06 }, offset: { x: 0, y: 1.0, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.55, y: 0.34, z: 0.04 }, offset: { x: 0, y: 1.2, z: -0.05 }, color: METAL },
      ],
    },
  ],

  street: [
    { name: '建筑1', type: 'box', position: { x: -4, y: 4, z: -1 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 3, y: 8, z: 3 }, color: CLAY_DK },
    { name: '建筑2', type: 'box', position: { x: 4, y: 5, z: -3 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 3.5, y: 10, z: 3 }, color: CLAY_LT },
    {
      name: '路灯', type: 'cylinder', position: { x: -2, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: CLAY_DK,
      parts: [
        { shape: 'cylinder', size: { x: 0.12, y: 4, z: 0.12 }, offset: { x: 0, y: 2, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.5, y: 0.1, z: 0.1 }, offset: { x: 0.2, y: 3.9, z: 0 }, color: CLAY_DK },
        { shape: 'sphere', size: { x: 0.18, y: 0.18, z: 0.18 }, offset: { x: 0.4, y: 3.85, z: 0 }, color: '#e8e08a' },
      ],
    },
    {
      name: '长椅', type: 'box', position: { x: 2, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: WOOD,
      parts: [
        { shape: 'box', size: { x: 1.8, y: 0.08, z: 0.5 }, offset: { x: 0, y: 0.45, z: 0 }, color: WOOD },
        { shape: 'box', size: { x: 1.8, y: 0.4, z: 0.08 }, offset: { x: 0, y: 0.7, z: -0.21 }, color: CLAY_LT },
        { shape: 'box', size: { x: 0.08, y: 0.45, z: 0.08 }, offset: { x: -0.8, y: 0.22, z: -0.2 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.08, y: 0.45, z: 0.08 }, offset: { x: 0.8, y: 0.22, z: -0.2 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.08, y: 0.45, z: 0.08 }, offset: { x: -0.8, y: 0.22, z: 0.2 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.08, y: 0.45, z: 0.08 }, offset: { x: 0.8, y: 0.22, z: 0.2 }, color: CLAY_DK },
      ],
    },
    { name: '路缘', type: 'box', position: { x: 0, y: 0.1, z: 3.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 10, y: 0.2, z: 0.3 }, color: CLAY_DK },
    { name: '垃圾桶', type: 'cylinder', position: { x: -3, y: 0.35, z: 1.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.3, y: 0.7, z: 0.3 }, color: CLAY_DK },
  ],

  forest: [
    {
      name: '树1', type: 'cylinder', position: { x: -2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: WOOD,
      parts: [
        { shape: 'cylinder', size: { x: 0.35, y: 3, z: 0.35 }, offset: { x: 0, y: 1.5, z: 0 }, color: WOOD },
        { shape: 'sphere', size: { x: 1.4, y: 1.4, z: 1.4 }, offset: { x: 0, y: 3.2, z: 0 }, color: GREEN },
        { shape: 'sphere', size: { x: 1.1, y: 1.1, z: 1.1 }, offset: { x: 0.3, y: 2.4, z: 0.3 }, color: '#8fae8e' },
      ],
    },
    {
      name: '树2', type: 'cylinder', position: { x: 2.5, y: 0, z: -1.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1.2, y: 1.2, z: 1.2 }, color: WOOD,
      parts: [
        { shape: 'cylinder', size: { x: 0.35, y: 3, z: 0.35 }, offset: { x: 0, y: 1.5, z: 0 }, color: WOOD },
        { shape: 'sphere', size: { x: 1.5, y: 1.5, z: 1.5 }, offset: { x: 0, y: 3.3, z: 0 }, color: '#93b392' },
      ],
    },
    {
      name: '树3', type: 'cylinder', position: { x: 0.5, y: 0, z: 2.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.8, y: 0.8, z: 0.8 }, color: WOOD,
      parts: [
        { shape: 'cylinder', size: { x: 0.3, y: 2.6, z: 0.3 }, offset: { x: 0, y: 1.3, z: 0 }, color: WOOD },
        { shape: 'sphere', size: { x: 1.1, y: 1.1, z: 1.1 }, offset: { x: 0, y: 2.7, z: 0 }, color: GREEN },
      ],
    },
    { name: '灌木1', type: 'sphere', position: { x: -3, y: 0.45, z: 1.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.7, y: 0.6, z: 0.7 }, color: '#88a988' },
    { name: '灌木2', type: 'sphere', position: { x: 3, y: 0.45, z: 1.8 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.8, y: 0.7, z: 0.8 }, color: '#88a988' },
    { name: '岩石', type: 'sphere', position: { x: 1.6, y: 0.25, z: 1.0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 0.5, z: 1.2 }, color: CLAY_DK },
  ],

  bar: [
    {
      name: '吧台', type: 'box', position: { x: 0, y: 0, z: -1 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: CLAY_DK,
      parts: [
        { shape: 'box', size: { x: 4, y: 0.1, z: 0.7 }, offset: { x: 0, y: 1.1, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 4, y: 1.1, z: 0.1 }, offset: { x: 0, y: 0.55, z: -0.35 }, color: '#3a2f45' },
      ],
    },
    {
      name: '高脚凳1', type: 'cylinder', position: { x: -1, y: 0, z: 0.4 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: CLAY_DK,
      parts: [
        { shape: 'cylinder', size: { x: 0.4, y: 0.1, z: 0.4 }, offset: { x: 0, y: 0.75, z: 0 }, color: CLAY_DK },
        { shape: 'cylinder', size: { x: 0.06, y: 0.75, z: 0.06 }, offset: { x: 0, y: 0.37, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.3, y: 0.05, z: 0.3 }, offset: { x: 0, y: 0.05, z: 0 }, color: CLAY_DK },
      ],
    },
    {
      name: '高脚凳2', type: 'cylinder', position: { x: 1, y: 0, z: 0.4 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: CLAY_DK,
      parts: [
        { shape: 'cylinder', size: { x: 0.4, y: 0.1, z: 0.4 }, offset: { x: 0, y: 0.75, z: 0 }, color: CLAY_DK },
        { shape: 'cylinder', size: { x: 0.06, y: 0.75, z: 0.06 }, offset: { x: 0, y: 0.37, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.3, y: 0.05, z: 0.3 }, offset: { x: 0, y: 0.05, z: 0 }, color: CLAY_DK },
      ],
    },
    { name: '酒架', type: 'box', position: { x: 2.6, y: 0.8, z: -2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 2.5, y: 1.6, z: 0.3 }, color: CLAY_DK },
    {
      name: '卡座', type: 'box', position: { x: -3, y: 0, z: 1.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: CLAY_DK,
      parts: [
        { shape: 'box', size: { x: 2, y: 0.15, z: 0.8 }, offset: { x: 0, y: 0.45, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 2, y: 0.7, z: 0.15 }, offset: { x: 0, y: 0.8, z: 0.35 }, color: CLAY_LT },
      ],
    },
  ],

  hospital: [
    {
      name: '病床', type: 'box', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: '#dfe6f0',
      parts: [
        { shape: 'box', size: { x: 1.2, y: 0.3, z: 2.5 }, offset: { x: 0, y: 0.45, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 1.1, y: 0.15, z: 2.4 }, offset: { x: 0, y: 0.7, z: 0 }, color: '#dfe6f0' },
        { shape: 'box', size: { x: 0.5, y: 0.12, z: 0.35 }, offset: { x: 0, y: 0.82, z: -1.0 }, color: CLAY_LT },
        { shape: 'box', size: { x: 1.1, y: 0.1, z: 0.06 }, offset: { x: 0.6, y: 0.95, z: 0 }, color: METAL },
        { shape: 'box', size: { x: 1.1, y: 0.1, z: 0.06 }, offset: { x: -0.6, y: 0.95, z: 0 }, color: METAL },
      ],
    },
    { name: '床头柜', type: 'box', position: { x: -1, y: 0.3, z: -0.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.4, y: 0.6, z: 0.4 }, color: CLAY_DK },
    { name: '隔帘杆', type: 'box', position: { x: 1.5, y: 2.4, z: -1.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 3, y: 0.08, z: 0.08 }, color: METAL },
    {
      name: '监护仪', type: 'box', position: { x: 1, y: 0, z: 0.3 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: METAL,
      parts: [
        { shape: 'cylinder', size: { x: 0.05, y: 1.4, z: 0.05 }, offset: { x: 0, y: 0.7, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.5, y: 0.4, z: 0.05 }, offset: { x: 0, y: 1.5, z: -0.1 }, color: METAL },
      ],
    },
    {
      name: '输液架', type: 'cylinder', position: { x: 1.2, y: 0, z: 1.2 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: METAL,
      parts: [
        { shape: 'cylinder', size: { x: 0.05, y: 2, z: 0.05 }, offset: { x: 0, y: 1.0, z: 0 }, color: METAL },
        { shape: 'box', size: { x: 0.1, y: 0.1, z: 0.1 }, offset: { x: 0, y: 2.0, z: 0 }, color: CLAY_DK },
        { shape: 'box', size: { x: 0.12, y: 0.25, z: 0.12 }, offset: { x: 0, y: 1.8, z: 0 }, color: '#e0f2fe' },
      ],
    },
  ],
};
