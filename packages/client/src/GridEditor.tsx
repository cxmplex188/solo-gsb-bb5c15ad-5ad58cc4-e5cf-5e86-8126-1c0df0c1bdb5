import { useEffect, useMemo, useRef } from 'react';
import type { FloatRisk } from '@jacquard/shared';

interface GridEditorProps {
  width: number;
  height: number;
  grid: string[][];
  rowIssueMap: Map<number, string>; // 1 基行号 -> 错误简述
  appliedRows: number[];
  floatRisks: FloatRisk[]; // 超阈值浮线（视觉坐标）
  selectedRisk: FloatRisk | null; // 风险列表中当前选中的浮线
  flashRow: number | null; // 需要闪烁定位的 1 基行号
  onPaint: (row: number, col: number) => void;
}

const SYMBOL_CLASS: Record<string, string> = {
  A: 'sym-a',
  B: 'sym-b',
  C: 'sym-c',
};

/**
 * 定宽符号网格。
 * 关键约束：视觉坐标恒定——列 0 始终在最左；
 * 偶数行行首用 ← 标注实际编织方向，但该行绝不做视觉镜像。
 * 浮线风险同样按视觉坐标标注：风险行右侧记 ~，选中的浮线
 * 在网格上高亮其起止列区间与两端同色针脚。
 */
export default function GridEditor({
  width,
  height,
  grid,
  rowIssueMap,
  appliedRows,
  floatRisks,
  selectedRisk,
  flashRow,
  onPaint,
}: GridEditorProps) {
  const painting = useRef(false);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());

  const floatByRow = useMemo(() => {
    const m = new Map<number, FloatRisk[]>();
    for (const risk of floatRisks) {
      const list = m.get(risk.row);
      if (list) list.push(risk);
      else m.set(risk.row, [risk]);
    }
    return m;
  }, [floatRisks]);

  // 定位：闪烁行或选中风险变化时，把对应行滚动到可视区域
  useEffect(() => {
    const target = flashRow ?? selectedRisk?.row ?? null;
    if (target === null) return;
    rowRefs.current
      .get(target)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [flashRow, selectedRisk]);

  const rowClass = (r1: number) => {
    const classes: string[] = [];
    if (rowIssueMap.has(r1)) classes.push('row-error');
    if (appliedRows.includes(r1)) classes.push('row-applied');
    if (floatByRow.has(r1)) classes.push('row-float');
    if (flashRow === r1) classes.push('row-flash');
    return classes.join(' ');
  };

  return (
    <div className="grid-scroll">
      <table
        className="grid-table"
        onPointerDown={() => {
          painting.current = true;
        }}
        onPointerUp={() => {
          painting.current = false;
        }}
        onPointerLeave={() => {
          painting.current = false;
        }}
      >
        <thead>
          <tr>
            <th className="corner-head">行</th>
            {Array.from({ length: width }, (_, c) => (
              <th key={c} className="col-head">
                {c + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: height }, (_, r) => {
            const r1 = r + 1;
            const isOdd = r1 % 2 === 1;
            const issue = rowIssueMap.get(r1);
            const rowRisks = floatByRow.get(r1);
            return (
              <tr
                key={r}
                className={rowClass(r1)}
                ref={(el) => {
                  if (el) rowRefs.current.set(r1, el);
                  else rowRefs.current.delete(r1);
                }}
              >
                <th className="row-head" title={isOdd ? '奇数行：自左向右 →' : '偶数行：自右向左 ←'}>
                  <span className="row-no">{String(r1).padStart(2, '0')}</span>
                  <span className={`dir-arrow ${isOdd ? 'odd' : 'even'}`}>
                    {isOdd ? '→' : '←'}
                  </span>
                </th>
                {Array.from({ length: width }, (_, c) => {
                  const symbol = grid[r]?.[c] ?? '';
                  const col1 = c + 1;
                  const onRiskRow = selectedRisk !== null && selectedRisk.row === r1;
                  const inSpan =
                    onRiskRow &&
                    col1 >= selectedRisk.startCol &&
                    col1 <= selectedRisk.endCol;
                  const isAnchor =
                    onRiskRow &&
                    (col1 === selectedRisk.startCol - 1 ||
                      col1 === selectedRisk.endCol + 1);
                  const cls = [
                    'grid-cell',
                    SYMBOL_CLASS[symbol] ?? '',
                    inSpan ? 'float-span' : '',
                    isAnchor ? 'float-anchor' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <td key={c} className="grid-cell-td">
                      <button
                        type="button"
                        className={cls}
                        title={`第 ${r1} 行 第 ${col1} 列（视觉坐标）`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          painting.current = true;
                          onPaint(r, c);
                        }}
                        onPointerEnter={() => {
                          if (painting.current) onPaint(r, c);
                        }}
                      >
                        {symbol}
                      </button>
                    </td>
                  );
                })}
                {issue ? (
                  <th className="row-flag" title={issue}>
                    !
                  </th>
                ) : rowRisks ? (
                  <th
                    className="row-flag row-flag-float"
                    title={rowRisks
                      .map(
                        (k) =>
                          `第 ${k.startCol}–${k.endCol} 列 ${k.symbol} 浮线跨 ${k.span} 针`,
                      )
                      .join('\n')}
                  >
                    ~
                  </th>
                ) : (
                  <th className="row-flag row-flag-empty" />
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
