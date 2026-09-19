import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DecodeIssue, FloatRisk } from '@jacquard/shared';
import { clampMaxFloat, DEFAULT_MAX_FLOAT } from '@jacquard/shared';
import { api } from './api.js';
import GridEditor from './GridEditor.js';
import CommandEditor from './CommandEditor.js';

const SYMBOLS = ['A', 'B', 'C'];
const DEFAULT_WIDTH = 12;
const DEFAULT_HEIGHT = 8;

function makeGrid(width: number, height: number, fill = 'A'): string[][] {
  return Array.from({ length: height }, () => new Array(width).fill(fill));
}

/** 示例提花图案：交错菱形 */
function makeSample(width: number, height: number): string[][] {
  const grid = makeGrid(width, height, 'A');
  const cx = (width - 1) / 2;
  for (let r = 0; r < height; r += 1) {
    for (let c = 0; c < width; c += 1) {
      const d = Math.abs(c - cx) + Math.abs(r - (height - 1) / 2);
      if (d < 2.4) grid[r][c] = 'B';
      else if (d < 3.8) grid[r][c] = 'C';
    }
  }
  return grid;
}

type Tab = 'grid' | 'command';

export default function App() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [grid, setGrid] = useState<string[][]>(() =>
    makeSample(DEFAULT_WIDTH, DEFAULT_HEIGHT),
  );
  const [activeSymbol, setActiveSymbol] = useState('B');
  const [tab, setTab] = useState<Tab>('grid');

  const [commandText, setCommandText] = useState('');
  const [issues, setIssues] = useState<DecodeIssue[]>([]);
  const [appliedRows, setAppliedRows] = useState<number[]>([]);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{
    kind: 'ok' | 'warn' | 'error';
    text: string;
  } | null>(null);

  /** 浮线风险检查：阈值（3–12）与实时分析结果 */
  const [maxFloat, setMaxFloat] = useState(DEFAULT_MAX_FLOAT);
  const [floatRisks, setFloatRisks] = useState<FloatRisk[]>([]);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [selectedRisk, setSelectedRisk] = useState<FloatRisk | null>(null);
  const [flashRow, setFlashRow] = useState<number | null>(null);

  /** 口令文本是否与当前网格一致（未手工修改） */
  const syncedText = useRef<string | null>(null);

  // 图案、尺寸或阈值变化后实时重算浮线风险；
  // 口令合法行回写 / 错误行保留原图也会改变 grid，同样触发重算
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .floatRisks({ grid, width, height, maxFloat })
        .then((res) => {
          if (cancelled) return;
          setFloatRisks(res.risks);
          setRiskError(null);
        })
        .catch((e) => {
          if (!cancelled) setRiskError((e as Error).message);
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [grid, width, height, maxFloat]);

  // 重算后若选中项已不存在（图案/阈值变化），自动取消选中
  useEffect(() => {
    setSelectedRisk((prev) =>
      prev &&
      floatRisks.some(
        (r) =>
          r.row === prev.row &&
          r.startCol === prev.startCol &&
          r.endCol === prev.endCol &&
          r.symbol === prev.symbol,
      )
        ? prev
        : null,
    );
  }, [floatRisks]);

  // 定位闪烁行短暂高亮后自动消退
  useEffect(() => {
    if (flashRow === null) return;
    const timer = setTimeout(() => setFlashRow(null), 1600);
    return () => clearTimeout(timer);
  }, [flashRow]);

  const locateRisk = (risk: FloatRisk) => {
    setSelectedRisk(risk);
    setFlashRow(risk.row);
  };

  const paint = useCallback(
    (r: number, c: number) => {
      setGrid((prev) => {
        if (prev[r][c] === activeSymbol) return prev;
        const next = prev.map((row) => [...row]);
        next[r][c] = activeSymbol;
        return next;
      });
      // 网格一旦修改，旧的校验结果失效
      setIssues([]);
      setAppliedRows([]);
      setBanner(null);
      syncedText.current = null;
    },
    [activeSymbol],
  );

  const changeWidth = (w: number) => {
    setWidth(w);
    setGrid((prev) =>
      Array.from({ length: height }, (_, r) => {
        const old = prev[r] ?? [];
        const row = old.slice(0, w);
        while (row.length < w) row.push('A');
        return row;
      }),
    );
    setIssues([]);
    setAppliedRows([]);
    syncedText.current = null;
  };

  const changeHeight = (h: number) => {
    setHeight(h);
    setGrid((prev) => {
      const next = prev.slice(0, h);
      while (next.length < h) next.push(new Array(width).fill('A'));
      return next;
    });
    setIssues([]);
    setAppliedRows([]);
    syncedText.current = null;
  };

  const generateCommand = useCallback(
    async (switchTab: boolean) => {
      setBusy(true);
      setBanner(null);
      try {
        const res = await api.encode({ grid, width, height });
        setCommandText(res.text);
        syncedText.current = res.text;
        setIssues([]);
        setAppliedRows([]);
        if (switchTab) setTab('command');
      } catch (e) {
        setBanner({ kind: 'error', text: `生成口令失败：${(e as Error).message}` });
      } finally {
        setBusy(false);
      }
    },
    [grid, width, height],
  );

  const applyCommand = useCallback(async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await api.decode({
        text: commandText,
        width,
        height,
        fallback: grid,
        symbols: SYMBOLS,
      });
      setGrid(res.grid);
      setIssues(res.issues);
      setAppliedRows(res.appliedRows);
      setSelectedLine(null);
      if (res.ok) {
        setBanner({
          kind: 'ok',
          text: `校验通过：${res.appliedRows.length} 行针数全部恰好等于行宽 ${width}，已回写网格。`,
        });
        syncedText.current = commandText;
      } else {
        setBanner({
          kind: 'warn',
          text: `已回写 ${res.appliedRows.length} 行；${res.issues.length} 处错误行保留原图（见下方定位）。偶数行按 ← 方向解析，视觉坐标不变。`,
        });
      }
      setTab('grid');
    } catch (e) {
      setBanner({ kind: 'error', text: `校验失败：${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [commandText, width, height, grid]);

  const onCommandChange = (text: string) => {
    setCommandText(text);
    if (syncedText.current !== null && text !== syncedText.current) {
      syncedText.current = null;
    }
  };

  const switchTab = (next: Tab) => {
    // 首次进入口令页且尚无内容时，按当前网格自动生成；
    // 此后保留用户已编辑/已校验的口令文本，避免切换时丢修改
    if (
      next === 'command' &&
      commandText === '' &&
      syncedText.current === null &&
      !busy
    ) {
      void generateCommand(false).then(() => setTab('command'));
      return;
    }
    setTab(next);
  };

  const rowIssueMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const issue of issues) {
      if (issue.row !== null && !m.has(issue.row)) {
        m.set(issue.row, issue.message);
      }
    }
    return m;
  }, [issues]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>提花编织口令校验</h1>
        <p className="subtitle">
          奇数行 <strong>→ 自左向右</strong>，偶数行{' '}
          <strong>← 自右向左</strong>；口令按实际编织方向记录游程，
          偶数行视觉坐标始终保持原位、不做镜像。
        </p>
      </header>

      <div className="toolbar">
        <div className="tool-group">
          <label>
            行宽
            <input
              type="number"
              min={4}
              max={64}
              value={width}
              onChange={(e) => changeWidth(Number(e.target.value))}
            />
            针
          </label>
          <label>
            行数
            <input
              type="number"
              min={1}
              max={64}
              value={height}
              onChange={(e) => changeHeight(Number(e.target.value))}
            />
          </label>
          <label title="同一行内被同色针脚夹住的异色针数超过该值即报告">
            最大浮线
            <input
              type="number"
              min={3}
              max={12}
              value={maxFloat}
              onChange={(e) => setMaxFloat(clampMaxFloat(Number(e.target.value)))}
            />
            针
          </label>
        </div>

        <div className="tool-group symbol-group" role="group" aria-label="符号选择">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              className={`symbol-btn sym-${s.toLowerCase()} ${
                activeSymbol === s ? 'selected' : ''
              }`}
              onClick={() => setActiveSymbol(s)}
            >
              {s}
            </button>
          ))}
          <span className="hint">点击或拖动绘制</span>
        </div>

        <div className="tool-group">
          <button type="button" onClick={() => setGrid(makeSample(width, height))}>
            示例图案
          </button>
          <button type="button" onClick={() => setGrid(makeGrid(width, height))}>
            清空
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'grid'}
          className={tab === 'grid' ? 'tab active' : 'tab'}
          onClick={() => switchTab('grid')}
        >
          图案网格
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'command'}
          className={tab === 'command' ? 'tab active' : 'tab'}
          onClick={() => switchTab('command')}
        >
          游程口令
        </button>
      </div>

      {banner && <div className={`banner banner-${banner.kind}`}>{banner.text}</div>}

      <main className="panel">
        {tab === 'grid' ? (
          <>
            <GridEditor
              width={width}
              height={height}
              grid={grid}
              rowIssueMap={rowIssueMap}
              appliedRows={appliedRows}
              floatRisks={floatRisks}
              selectedRisk={selectedRisk}
              flashRow={flashRow}
              onPaint={paint}
            />
            <div className="risk-panel">
              <div className="risk-head">
                {riskError
                  ? `浮线风险检查失败：${riskError}`
                  : floatRisks.length === 0
                    ? `浮线风险检查：未发现超过 ${maxFloat} 针的浮线（仅统计被同色针脚夹住的区间，行首/行尾开放区间不计）。`
                    : `发现 ${floatRisks.length} 段浮线超过 ${maxFloat} 针——点击条目定位对应行列：`}
              </div>
              {floatRisks.length > 0 && (
                <ul>
                  {floatRisks.map((risk, idx) => {
                    const selected =
                      selectedRisk !== null &&
                      selectedRisk.row === risk.row &&
                      selectedRisk.startCol === risk.startCol &&
                      selectedRisk.endCol === risk.endCol &&
                      selectedRisk.symbol === risk.symbol;
                    return (
                      <li key={idx}>
                        <button
                          type="button"
                          className={`risk-item${selected ? ' selected' : ''}`}
                          onClick={() => locateRisk(risk)}
                        >
                          <span className="risk-loc">
                            第 {risk.row} 行 · 第 {risk.startCol}–{risk.endCol} 列
                          </span>
                          <span
                            className={`risk-sym sym-${risk.symbol.toLowerCase()}`}
                          >
                            {risk.symbol}
                          </span>
                          <span className="risk-msg">
                            {risk.symbol} 浮线跨 {risk.span} 针（阈值 {maxFloat} 针）
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="action-bar">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void generateCommand(true)}
              >
                生成逐行口令
              </button>
              <div className="legend">
                <span className="legend-item">
                  <i className="swatch odd" /> → 奇数行（左起）
                </span>
                <span className="legend-item">
                  <i className="swatch even" /> ← 偶数行（右起，显示不镜像）
                </span>
                <span className="legend-item">
                  <i className="swatch err" /> 针数/语法错误行（保留原图）
                </span>
                <span className="legend-item">
                  <i className="swatch float" /> 浮线超阈值行（点击列表定位起止列）
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <CommandEditor
              text={commandText}
              issues={issues}
              selectedLine={selectedLine}
              onChange={onCommandChange}
              onSelectLine={setSelectedLine}
            />
            <div className="action-bar">
              <button
                type="button"
                className="primary"
                disabled={busy || commandText.trim() === ''}
                onClick={() => void applyCommand()}
              >
                校验并回写网格
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void generateCommand(false)}
              >
                从网格重新生成（丢弃修改）
              </button>
              <span className="hint">
                规则：每行游程针数之和必须恰好等于行宽 {width}；行号（如
                02:）、方向箭头与 # 注释均可省略。
              </span>
            </div>
          </>
        )}
      </main>

      <footer className="app-footer">
        React + TypeScript + Node.js(Express) · 编解码核心由 Node 服务统一执行
      </footer>
    </div>
  );
}
