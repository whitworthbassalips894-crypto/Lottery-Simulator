import React from 'react';
import { pad2, waveOf, zodiacOf } from '../lib/lottery';

/* ----------------------------- 号码球（扁平） ----------------------------- */

const SIZE_CLASS = {
  sm: 'ball-sm',
  md: 'ball-md',
  lg: 'ball-lg'
} as const;

export type BallSize = keyof typeof SIZE_CLASS;

export function Ball({
  number,
  special = false,
  size = 'md',
  matched = false,
  dim = false,
  zodiac,
  style
}: {
  number: number;
  special?: boolean;
  size?: BallSize;
  matched?: boolean;
  dim?: boolean;
  zodiac?: string;
  style?: React.CSSProperties;
}) {
  const wave = waveOf(number);
  return (
    <span
      className={[
        'ball',
        `ball-${wave}`,
        SIZE_CLASS[size],
        special ? 'is-special' : '',
        matched ? 'is-matched' : '',
        dim ? 'is-dim' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      title={special ? `特码 ${pad2(number)}` : `号码 ${pad2(number)}`}
    >
      {pad2(number)}
      {special ? <em className="ball-tag">特</em> : null}
      {zodiac ? <i className="ball-zodiac">{zodiac}</i> : null}
    </span>
  );
}

export function BallRow({
  main,
  special,
  size = 'md',
  matched = [],
  specialMatched = false,
  showZodiac = false,
  date,
  className = ''
}: {
  main: number[];
  special?: number;
  size?: BallSize;
  matched?: number[];
  specialMatched?: boolean;
  showZodiac?: boolean;
  date?: string;
  className?: string;
}) {
  return (
    <div className={`ball-row ${className}`}>
      {main.map((n) => (
        <Ball
          key={n}
          number={n}
          size={size}
          matched={matched.includes(n)}
          zodiac={showZodiac && date ? zodiacOf(n, date) : undefined}
        />
      ))}
      {special != null ? (
        <Ball
          number={special}
          special
          size={size}
          matched={specialMatched}
          zodiac={showZodiac && date ? zodiacOf(special, date) : undefined}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------- 容器 ----------------------------- */

export function Card({
  title,
  kicker,
  desc,
  actions,
  children,
  className = '',
  flush = false
}: {
  title?: React.ReactNode;
  kicker?: React.ReactNode;
  desc?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <header className="card-head">
          <div className="card-head-text">
            {kicker ? <span className="kicker">{kicker}</span> : null}
            {title ? <h2>{title}</h2> : null}
            {desc ? <p>{desc}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={flush ? 'card-body card-body-flush' : 'card-body'}>{children}</div>
    </section>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  dot = false
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'accent';
  dot?: boolean;
}) {
  return (
    <span className={`chip chip-${tone}`}>
      {dot ? <i className="chip-dot" /> : null}
      {children}
    </span>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label
}: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={opt.value === value ? 'seg-item is-active' : 'seg-item'}
          onClick={() => onChange(opt.value)}
          aria-pressed={opt.value === value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  desc
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  desc?: React.ReactNode;
}) {
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <strong>{label}</strong>
        {desc ? <span>{desc}</span> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={checked ? 'toggle is-on' : 'toggle'}
        onClick={() => onChange(!checked)}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="加载中" />;
}

export function Empty({ title, desc }: { title: string; desc?: React.ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {desc ? <p>{desc}</p> : null}
    </div>
  );
}
