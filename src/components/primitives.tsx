import React from 'react';
import { pad2, waveOf, zodiacOf } from '../lib/lottery';

/* ----------------------------- 号码球 ----------------------------- */

const SIZE_CLASS: Record<string, string> = {
  xs: 'ball-xs',
  sm: 'ball-sm',
  md: 'ball-md',
  lg: 'ball-lg',
  xl: 'ball-xl'
};

export function Ball({
  number,
  special = false,
  size = 'md',
  matched = false,
  dim = false,
  showZodiac = false,
  date,
  placeholder = false,
  style
}: {
  number: number;
  special?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  matched?: boolean;
  dim?: boolean;
  showZodiac?: boolean;
  date?: string;
  placeholder?: boolean;
  style?: React.CSSProperties;
}) {
  if (placeholder) {
    return <span className={`ball ball-ph ${SIZE_CLASS[size]}`} aria-hidden="true" />;
  }
  const wave = waveOf(number);
  const classes = [
    'ball',
    `ball-${wave}`,
    SIZE_CLASS[size],
    special ? 'is-special' : '',
    matched ? 'is-matched' : '',
    dim ? 'is-dim' : ''
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} style={style} title={special ? `特码 ${pad2(number)}` : `号码 ${pad2(number)}`}>
      <span className="ball-face">{pad2(number)}</span>
      {showZodiac && date ? <span className="ball-zodiac">{zodiacOf(number, date)}</span> : null}
      {special ? <span className="ball-flag">特</span> : null}
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
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  matched?: number[];
  specialMatched?: boolean;
  showZodiac?: boolean;
  date?: string;
  className?: string;
}) {
  return (
    <div className={`ball-row ${className}`}>
      {main.map((n) => (
        <Ball key={`m-${n}`} number={n} size={size} matched={matched.includes(n)} showZodiac={showZodiac} date={date} />
      ))}
      {special != null ? (
        <Ball
          number={special}
          special
          size={size}
          matched={specialMatched}
          showZodiac={showZodiac}
          date={date}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------- 容器 ----------------------------- */

export function Panel({
  title,
  kicker,
  desc,
  actions,
  children,
  className = '',
  padded = true,
  id
}: {
  title?: React.ReactNode;
  kicker?: React.ReactNode;
  desc?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          <div className="panel-head-text">
            {kicker ? <span className="kicker">{kicker}</span> : null}
            {title ? <h2 className="panel-title">{title}</h2> : null}
            {desc ? <p className="panel-desc">{desc}</p> : null}
          </div>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </header>
      )}
      <div className={padded ? 'panel-body' : 'panel-body panel-body-flush'}>{children}</div>
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  dot = false
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'accent';
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot ? <i className="badge-dot" /> : null}
      {children}
    </span>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
  ariaLabel
}: {
  value: T;
  options: { value: T; label: React.ReactNode; hint?: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  return (
    <div className={`segmented segmented-${size}`} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={`segmented-item ${opt.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(opt.value)}
          title={opt.hint}
          aria-pressed={opt.value === value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  children
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'accent';
  children?: React.ReactNode;
}) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit ? <em className="stat-unit">{unit}</em> : null}
      </span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
      {children}
    </div>
  );
}

export function EmptyState({ title, desc, icon }: { title: string; desc?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? '◌'}</div>
      <strong>{title}</strong>
      {desc ? <p>{desc}</p> : null}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="加载中" />;
}

export function Field({
  label,
  hint,
  children
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
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
        className={`toggle ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}
