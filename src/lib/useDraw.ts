import { useCallback, useEffect, useRef, useState } from 'react';
import { randomTicket } from './rng';

export interface Ticket {
  main: number[];
  special: number;
}

/** 摇号动画：期间号码快速跳动，结束后落到确定结果（同一期同一次尝试结果固定） */
export function useDrawAnimation(reduceMotion: boolean, onFinish?: (ticket: Ticket) => void) {
  const [display, setDisplay] = useState<Ticket | null>(null);
  const [drawing, setDrawing] = useState(false);
  const timers = useRef<{ interval?: number; timeout?: number }>({});

  const stop = useCallback(() => {
    if (timers.current.interval) window.clearInterval(timers.current.interval);
    if (timers.current.timeout) window.clearTimeout(timers.current.timeout);
    timers.current = {};
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    (ticket: Ticket) => {
      stop();
      if (reduceMotion) {
        setDisplay(ticket);
        onFinish?.(ticket);
        return;
      }
      setDrawing(true);
      let ticks = 0;
      timers.current.interval = window.setInterval(() => {
        ticks++;
        setDisplay(randomTicket(Math.random));
      }, 65);
      timers.current.timeout = window.setTimeout(() => {
        stop();
        setDisplay(ticket);
        setDrawing(false);
        onFinish?.(ticket);
      }, 1250 + Math.min(500, ticks));
    },
    [onFinish, reduceMotion, stop]
  );

  const reset = useCallback(() => setDisplay(null), []);
  const set = useCallback((ticket: Ticket | null) => setDisplay(ticket), []);

  return { display, drawing, play, reset, set };
}
