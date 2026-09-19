import { useRef } from 'react';

interface GridEditorProps {
  width: number;
  height: number;
  grid: string[][];
  rowIssueMap: Map<number, string>; // 1 基行号 -> 错误简述
  appliedRows: number[];
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
 */
export default function GridEditor({
  width,
  height,
  grid,
  rowIssueMap,
  appliedRows,
  onPaint,
}: GridEditorProps) {
  const painting = useRef(false);

  const rowClass = (r1: number) => {
    const classes: string[] = [];
    if (rowIssueMap.has(r1)) classes.push('row-error');
    if (appliedRows.includes(r1)) classes.push('row-applied');
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
            return (
              <tr key={r} className={rowClass(r1)}>
                <th className="row-head" title={isOdd ? '奇数行：自左向右 →' : '偶数行：自右向左 ←'}>
                  <span className="row-no">{String(r1).padStart(2, '0')}</span>
                  <span className={`dir-arrow ${isOdd ? 'odd' : 'even'}`}>
                    {isOdd ? '→' : '←'}
                  </span>
                </th>
                {Array.from({ length: width }, (_, c) => {
                  const symbol = grid[r]?.[c] ?? '';
                  return (
                    <td key={c} className="grid-cell-td">
                      <button
                        type="button"
                        className={`grid-cell ${SYMBOL_CLASS[symbol] ?? ''}`}
                        title={`第 ${r1} 行 第 ${c + 1} 列（视觉坐标）`}
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
