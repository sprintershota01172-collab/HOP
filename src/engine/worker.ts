/// <reference lib="webworker" />
import type { AppData } from './types';
import { computeLevers, computeLoan, computeView, type LoanRequest } from './view';

type Msg = { id: number; kind: 'view'; data: AppData } | { id: number; kind: 'loan'; req: LoanRequest } | { id: number; kind: 'levers' };

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    const result = m.kind === 'view' ? computeView(m.data) : m.kind === 'loan' ? computeLoan(m.req) : computeLevers();
    (self as unknown as Worker).postMessage({ id: m.id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: m.id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
