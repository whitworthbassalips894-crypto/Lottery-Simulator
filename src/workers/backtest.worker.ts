import { runBacktest, type BacktestOptions, type BacktestResult } from '../lib/backtest';
import type { Draw } from '../lib/types';

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
};

ctx.onmessage = (event: MessageEvent) => {
  const { draws, options, requestId } = event.data as {
    draws: Draw[];
    options: BacktestOptions;
    requestId: number;
  };
  try {
    const result: BacktestResult = runBacktest(draws, options, (ratio, label) => {
      ctx.postMessage({ type: 'progress', requestId, ratio, label });
    });
    ctx.postMessage({ type: 'done', requestId, result });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      requestId,
      message: err instanceof Error ? err.message : String(err)
    });
  }
};
