import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyzeFloatRisks,
  clampMaxFloat,
  decodeText,
  DEFAULT_MAX_FLOAT,
  MAX_MAX_FLOAT,
  MIN_MAX_FLOAT,
} from '../dist/index.js';

test('被同色针脚两端夹住的区间计为浮线，跨针数为中间异色针数', () => {
  const grid = [
    ['A', 'B', 'B', 'B', 'B', 'B', 'B', 'A'], // A 夹住 6 针 B
  ];
  const res = analyzeFloatRisks({ grid, width: 8, height: 1, maxFloat: 5 });
  assert.deepEqual(res.risks, [
    { row: 1, startCol: 2, endCol: 7, symbol: 'A', span: 6 },
  ]);
});

test('行首/行尾的开放区间不计为浮线', () => {
  const grid = [
    ['B', 'B', 'B', 'B', 'B', 'B', 'A', 'A'], // 左侧 B 长段在行首开放
    ['A', 'A', 'C', 'C', 'C', 'C', 'C', 'C'], // 右侧 C 长段在行尾开放
  ];
  const res = analyzeFloatRisks({ grid, width: 8, height: 2, maxFloat: 3 });
  assert.deepEqual(res.risks, []);
});

test('阈值边界：跨针数等于阈值不报，超过才报', () => {
  const grid = [
    ['A', 'B', 'B', 'B', 'A', 'C', 'C', 'C'], // A 夹 3 针 = 阈值 3 → 不报
    ['A', 'B', 'B', 'B', 'B', 'A', 'C', 'C'], // A 夹 4 针 > 3 → 报
  ];
  const res = analyzeFloatRisks({ grid, width: 8, height: 2, maxFloat: 3 });
  assert.deepEqual(res.risks, [
    { row: 2, startCol: 2, endCol: 5, symbol: 'A', span: 4 },
  ]);
});

test('同色多次落针按相邻两次分别计算区间', () => {
  // A 在 1、4、9 列：区间 (1,4) 跨 2 针不超限，(4,9) 跨 4 针超限
  const grid = [['A', 'B', 'B', 'A', 'B', 'B', 'B', 'B', 'A']];
  const res = analyzeFloatRisks({ grid, width: 9, height: 1, maxFloat: 3 });
  assert.deepEqual(res.risks, [
    { row: 1, startCol: 5, endCol: 8, symbol: 'A', span: 4 },
  ]);
});

test('奇偶行只影响口令阅读顺序：同一视觉图案在偶数行风险位置不镜像', () => {
  // 非对称图案：A 在第 2、8 列，夹住第 3–7 列共 5 针
  // （若偶数行被镜像，区间会错置为第 4–8 列）；其余符号均不形成超限区间
  const visual = ['B', 'A', 'C', 'B', 'C', 'B', 'C', 'A', 'C', 'B'];
  const grid = [visual, [...visual]]; // 第 1 行（奇）与第 2 行（偶）视觉相同
  const res = analyzeFloatRisks({ grid, width: 10, height: 2, maxFloat: 3 });
  assert.deepEqual(res.risks, [
    { row: 1, startCol: 3, endCol: 7, symbol: 'A', span: 5 },
    { row: 2, startCol: 3, endCol: 7, symbol: 'A', span: 5 },
  ]);
});

test('同一行内不同符号各自独立成对计算，可嵌套', () => {
  // A 在 1、12 列夹 10 针；B 在 2、7 列夹 4 针
  const grid = [
    ['A', 'B', 'C', 'C', 'C', 'C', 'B', 'C', 'C', 'C', 'C', 'A'],
  ];
  const res = analyzeFloatRisks({ grid, width: 12, height: 1, maxFloat: 3 });
  assert.deepEqual(res.risks, [
    { row: 1, startCol: 2, endCol: 11, symbol: 'A', span: 10 },
    { row: 1, startCol: 3, endCol: 6, symbol: 'B', span: 4 },
  ]);
});

test('风险列表按视觉坐标（行、起点列）升序汇总，与发现顺序无关', () => {
  // 第 2 行：B 区间（第 3–6 列，右端先出现）先于 A 区间（第 2–7 列）被发现，
  // 输出仍按起点列升序
  const grid = [
    ['A', 'B', 'B', 'B', 'B', 'B', 'B', 'A'], // 第 1 行一个风险
    ['A', 'B', 'C', 'C', 'C', 'C', 'B', 'A'], // 第 2 行两个风险（B 先发现、A 后发现）
  ];
  const res = analyzeFloatRisks({ grid, width: 8, height: 2, maxFloat: 3 });
  assert.deepEqual(res.risks, [
    { row: 1, startCol: 2, endCol: 7, symbol: 'A', span: 6 },
    { row: 2, startCol: 2, endCol: 7, symbol: 'A', span: 6 },
    { row: 2, startCol: 3, endCol: 6, symbol: 'B', span: 4 },
  ]);
});

test('空单元格视为区间断开，两侧各自成为开放区间', () => {
  // 若中间无空格，A 将夹住 5 针；空一格后左右两段均开放 → 无风险
  const grid = [['A', 'B', 'B', '', 'B', 'B', 'A']];
  const res = analyzeFloatRisks({ grid, width: 7, height: 1, maxFloat: 3 });
  assert.deepEqual(res.risks, []);
});

test('阈值夹取到 3–12，默认 5', () => {
  assert.equal(MIN_MAX_FLOAT, 3);
  assert.equal(MAX_MAX_FLOAT, 12);
  assert.equal(DEFAULT_MAX_FLOAT, 5);
  assert.equal(clampMaxFloat(1), 3);
  assert.equal(clampMaxFloat(99), 12);
  assert.equal(clampMaxFloat(7), 7);
  assert.equal(clampMaxFloat(Number.NaN), 5);
  // 越界阈值在分析入口同样被夹取
  const res = analyzeFloatRisks({
    grid: [['A', 'B', 'B', 'B', 'B', 'A']],
    width: 6,
    height: 1,
    maxFloat: 99,
  });
  assert.equal(res.maxFloat, 12);
  assert.deepEqual(res.risks, []); // 4 针 ≤ 12，不报
});

test('口令回写后的网格可直接复算：合法行更新、错误行保留原图', () => {
  const fallback = [
    ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'],
    ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'],
  ];
  const res = decodeText({
    text: ['01 → A1 B6 A1', '02 ← A3 B6' /* 9 针，保留原图 */].join('\n'),
    width: 8,
    height: 2,
    fallback,
    symbols: ['A', 'B'],
  });
  assert.deepEqual(res.appliedRows, [1]);
  const risks = analyzeFloatRisks({
    grid: res.grid,
    width: 8,
    height: 2,
    maxFloat: 5,
  });
  // 第 1 行回写为 A B6 A → A 夹 6 针超限；第 2 行保留全 A 原图，无风险
  assert.deepEqual(risks.risks, [
    { row: 1, startCol: 2, endCol: 7, symbol: 'A', span: 6 },
  ]);
});
