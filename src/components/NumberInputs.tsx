import React, { useRef } from 'react';
import { pad2 } from '../lib/lottery';

/** 7 个号码输入框：自动跳格、支持粘贴「01,05,12,23,31,45,18」 */
export function NumberInputs({
  values,
  onChange,
  invalid
}: {
  values: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setAt = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    const next = values.slice();
    next[index] = digits;
    onChange(next);
    if (digits.length === 2 && index < values.length - 1) refs.current[index + 1]?.focus();
  };

  const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    const parts = event.clipboardData.getData('text').split(/[^0-9]+/).filter(Boolean);
    if (parts.length < 2) return;
    event.preventDefault();
    const next = values.slice();
    parts.slice(0, values.length - index).forEach((part, i) => {
      const n = Number(part);
      if (n >= 1 && n <= 49) next[index + i] = pad2(n);
    });
    onChange(next);
    refs.current[Math.min(values.length - 1, index + parts.length - 1)]?.focus();
  };

  return (
    <div className={invalid ? 'num-inputs is-invalid' : 'num-inputs'}>
      {values.map((value, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          value={value}
          placeholder={i === 6 ? '特' : pad2(i + 1)}
          aria-label={i === 6 ? '特码' : `第 ${i + 1} 个主号`}
          className={i === 6 ? 'num-input is-special' : 'num-input'}
          onChange={(e) => setAt(i, e.target.value)}
          onPaste={(e) => handlePaste(i, e)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !values[i] && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight' && i < values.length - 1) refs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}
