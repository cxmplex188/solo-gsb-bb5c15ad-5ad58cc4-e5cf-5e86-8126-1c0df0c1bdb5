import type { FloatRisk, FloatRiskRequest, FloatRiskResponse } from './types.js';

/** 最大浮线针数允许范围与默认值 */
export const MIN_MAX_FLOAT = 3;
export const MAX_MAX_FLOAT = 12;
export const DEFAULT_MAX_FLOAT = 5;

/** 把阈值夹取到 3–12 的整数；非法输入回退默认值 */
export function clampMaxFloat(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_FLOAT;
  return Math.min(MAX_MAX_FLOAT, Math.max(MIN_MAX_FLOAT, Math.round(value)));
}

/**
 * 逐行分析浮线风险。
 *
 * 规则：
 * - 对每一行、每种符号，考察该符号相邻两次落针之间跨过的其他颜色针数（span）；
 * - 只有被同色针脚两端夹住的区间才计为浮线——行首/行尾的开放区间不计；
 * - span 超过 maxFloat 时报告，区间为左右两枚同色针脚之间的视觉列范围；
 * - 全程使用视觉坐标：奇偶行只影响口令阅读顺序，本分析与编织方向无关，
 *   偶数行绝不镜像。
 */
export function analyzeFloatRisks(req: FloatRiskRequest): FloatRiskResponse {
  const maxFloat = clampMaxFloat(req.maxFloat);
  const risks: FloatRisk[] = [];

  for (let r = 0; r < req.height; r += 1) {
    const row = req.grid[r] ?? [];
    // 每种符号最近一次落针的列（0 基）；空单元格视为区间断开
    const lastSeen = new Map<string, number>();
    for (let c = 0; c < req.width; c += 1) {
      const symbol = row[c];
      if (typeof symbol !== 'string' || symbol === '') {
        lastSeen.clear();
        continue;
      }
      const prev = lastSeen.get(symbol);
      if (prev !== undefined) {
        const span = c - prev - 1;
        if (span > maxFloat) {
          risks.push({
            row: r + 1,
            startCol: prev + 2, // 左端同色针脚右侧第一针（1 基）
            endCol: c, // 右端同色针脚左侧第一针（1 基，即 c+1-1）
            symbol,
            span,
          });
        }
      }
      lastSeen.set(symbol, c);
    }
  }

  // 按视觉坐标汇总：行号、起点列、终点列升序
  risks.sort(
    (a, b) => a.row - b.row || a.startCol - b.startCol || a.endCol - b.endCol,
  );
  return { maxFloat, risks };
}
