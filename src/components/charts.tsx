import React, { useMemo, useState } from 'react';
import { pad2, waveOf } from '../lib/lottery';

/* ----------------------------- 迷你走势 ----------------------------- */

export function Sparkline({
  values,
  width = 120,
  height = 34,
  color = 'currentColor',
  fill = true,
  baseline
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  baseline?: number;
}) {
  if (values.length < 2) return <div style={{ width, height }} className="spark-empty" />;
  const min = Math.min(...values, baseline ?? Infinity);
  const max = Math.max(...values, baseline ?? -Infinity);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const points = values.map((v, i) => `${(i * stepX).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `0,${height} ${points} ${width},${height}`;
  const id = `spark-${Math.round(width)}-${values.length}-${Math.round(values[values.length - 1] * 100)}`;
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      {fill ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${id})`} />
        </>
      ) : null}
      {baseline != null ? (
        <line x1="0" x2={width} y1={y(baseline)} y2={y(baseline)} stroke={color} strokeDasharray="3 4" strokeOpacity="0.45" />
      ) : null}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ----------------------------- 折线图 ----------------------------- */

export interface Series {
  name: string;
  color: string;
  values: number[];
  dashed?: boolean;
  width?: number;
}

export function LineChart({
  series,
  labels,
  height = 260,
  yFormat = (v: number) => String(Math.round(v)),
  xFormat,
  ariaLabel
}: {
  series: Series[];
  labels: string[];
  height?: number;
  yFormat?: (v: number) => string;
  xFormat?: (label: string, index: number) => string;
  ariaLabel?: string;
}) {
  const width = 760;
  const pad = { top: 16, right: 18, bottom: 30, left: 44 };
  const [hover, setHover] = useState<number | null>(null);
  const count = Math.max(...series.map((s) => s.values.length), 1);

  const { min, max } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    series.forEach((s) =>
      s.values.forEach((v) => {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      })
    );
    if (!Number.isFinite(lo)) return { min: 0, max: 1 };
    if (hi === lo) hi = lo + 1;
    return { min: Math.max(0, lo - (hi - lo) * 0.08), max: hi + (hi - lo) * 0.08 };
  }, [series]);

  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (count <= 1 ? innerW / 2 : (i / (count - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - min) / (max - min)) * innerH;
  const ticks = 4;

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rel = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = (rel - pad.left) / innerW;
    if (ratio < -0.02 || ratio > 1.02) {
      setHover(null);
      return;
    }
    setHover(Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1)))));
  };

  const hoverLabel = hover != null ? labels[hover] ?? '' : '';

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel ?? '折线图'}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const value = min + ((max - min) / ticks) * i;
          const yy = y(value);
          return (
            <g key={i}>
              <line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="chart-grid" />
              <text x={pad.left - 8} y={yy + 4} className="chart-axis" textAnchor="end">
                {yFormat(value)}
              </text>
            </g>
          );
        })}
        {[0, Math.floor(count / 4), Math.floor(count / 2), Math.floor((count * 3) / 4), count - 1]
          .filter((v, i, arr) => v >= 0 && arr.indexOf(v) === i)
          .map((i) => (
            <text key={`x-${i}`} x={x(i)} y={height - 8} className="chart-axis" textAnchor="middle">
              {xFormat ? xFormat(labels[i] ?? '', i) : labels[i] ?? ''}
            </text>
          ))}
        {series.map((s) => {
          const d = s.values
            .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`)
            .join(' ');
          return (
            <path
              key={s.name}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width ?? 2.2}
              strokeDasharray={s.dashed ? '6 5' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {hover != null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} className="chart-crosshair" />
            {series.map((s) =>
              s.values[hover] != null ? (
                <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r="3.6" fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />
              ) : null
            )}
          </g>
        ) : null}
      </svg>
      {hover != null ? (
        <div className="chart-tooltip" style={{ left: `${(x(hover) / width) * 100}%` }}>
          <strong>{hoverLabel}</strong>
          {series.map((s) =>
            s.values[hover] != null ? (
              <span key={s.name}>
                <i style={{ background: s.color }} />
                {s.name}
                <b>{yFormat(s.values[hover])}</b>
              </span>
            ) : null
          )}
        </div>
      ) : null}
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- 柱状图 ----------------------------- */

export function BarChart({
  data,
  height = 180,
  formatter = (v: number) => String(v),
  expected
}: {
  data: { label: string; value: number; color?: string; hint?: string }[];
  height?: number;
  formatter?: (v: number) => string;
  expected?: number[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value), ...(expected ?? []));
  return (
    <div className="barchart" style={{ height }}>
      {data.map((d, i) => (
        <div key={d.label} className="bar-col" title={d.hint ?? `${d.label}：${formatter(d.value)}`}>
          <span className="bar-value">{formatter(d.value)}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ height: `${(d.value / max) * 100}%`, background: d.color ?? 'var(--accent)' }}
            />
            {expected && expected[i] != null ? (
              <div className="bar-expected" style={{ height: `${(expected[i] / max) * 100}%` }} />
            ) : null}
          </div>
          <span className="bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- 分布条 ----------------------------- */

export function DistributionBars({
  data,
  tone = 'accent',
  max
}: {
  data: { label: string; count: number; rate: number; color?: string }[];
  tone?: string;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="dist-list">
      {data.map((d) => (
        <li key={d.label}>
          <span className="dist-label">{d.label}</span>
          <span className="dist-track">
            <span
              className={`dist-fill dist-${tone}`}
              style={{ width: `${(d.count / top) * 100}%`, background: d.color }}
            />
          </span>
          <span className="dist-value">
            {d.count}
            <em>{(d.rate * 100).toFixed(1)}%</em>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------- 49 码热力网格 ----------------------------- */

export function Heatmap({
  rows,
  mode = 'frequency',
  max,
  onSelect,
  selected
}: {
  rows: { number: number; count: number; omission: number }[];
  mode?: 'frequency' | 'omission';
  max?: number;
  onSelect?: (n: number) => void;
  selected?: number | null;
}) {
  const peak = max ?? Math.max(1, ...rows.map((r) => (mode === 'frequency' ? r.count : r.omission)));
  return (
    <div className="heatmap">
      {rows.map((row) => {
        const value = mode === 'frequency' ? row.count : row.omission;
        const intensity = Math.min(1, value / peak);
        const wave = waveOf(row.number);
        return (
          <button
            key={row.number}
            type="button"
            className={`heat-cell heat-${wave} ${selected === row.number ? 'is-selected' : ''}`}
            style={{ ['--heat' as string]: intensity.toFixed(3) }}
            onClick={() => onSelect?.(row.number)}
            title={`${pad2(row.number)} 号 · 出现 ${row.count} 次 · 当前遗漏 ${row.omission} 期`}
          >
            <span className="heat-num">{pad2(row.number)}</span>
            <span className="heat-count">{mode === 'frequency' ? row.count : row.omission}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- 进度条 ----------------------------- */

export function Meter({
  value,
  max = 1,
  tone = 'accent',
  label,
  caption
}: {
  value: number;
  max?: number;
  tone?: 'accent' | 'good' | 'warn' | 'danger' | 'neutral';
  label?: React.ReactNode;
  caption?: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter">
      {(label || caption) && (
        <div className="meter-head">
          <span>{label}</span>
          <span>{caption}</span>
        </div>
      )}
      <div className="meter-track">
        <div className={`meter-fill meter-${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
