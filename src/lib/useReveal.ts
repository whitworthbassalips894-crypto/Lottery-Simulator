import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 揭晓节奏控制器：把 7 个号码一个接一个放出来
 * 主号 380ms 间隔，第 6 个主号之后停顿 700ms 再揭晓特码。
 */
export function useReveal(total = 7, reduceMotion = false) {
  const [step, setStepState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);

  const clear = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => clear, [clear]);

  const setStep = useCallback(
    (value: number) => {
      clear();
      setPlaying(false);
      setStepState(Math.max(0, Math.min(total, value)));
    },
    [clear, total]
  );

  const play = useCallback(
    (onDone?: () => void) => {
      clear();
      if (reduceMotion) {
        setStepState(total);
        setPlaying(false);
        onDone?.();
        return;
      }
      setStepState(0);
      setPlaying(true);
      let elapsed = 0;
      for (let i = 1; i <= total; i++) {
        elapsed = i < total ? 380 * i : 380 * (total - 1) + 700;
        const id = window.setTimeout(() => {
          setStepState(i);
          if (i === total) {
            setPlaying(false);
            onDone?.();
          }
        }, elapsed);
        timers.current.push(id);
      }
    },
    [clear, reduceMotion, total]
  );

  return { step, playing, play, setStep };
}
