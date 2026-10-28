import { emptyData, newChild, uid } from '../src/engine/defaults';
import type { AppData, Plan } from '../src/engine/types';
import { toYM } from '../src/engine/ym';

export const BASE = toYM(2026, 10);

/** テスト用の世帯（必要な入力がそろった最小構成） */
export function household(opts: { spouse?: boolean; spouseNet?: number; children?: number; net?: number; cash?: number } = {}): AppData {
  const d = emptyData(BASE);
  const p = d.plan;
  p.self = { ...p.self, birthYM: toYM(1996, 5), netMonthly: opts.net ?? 300_000, bonusNetAnnual: 800_000, grossAnnual: 5_600_000, raiseRate: 0.01, retireAge: 65, retireBonus: 10_000_000, pensionStartAge: 65, pensionMonthly: 160_000, cash: opts.cash ?? 4_000_000 };
  if (opts.spouse === false) p.assumptions.retireLivingMonthly = 170_000;
  if (opts.spouse !== false) {
    p.spouse = { ...p.self, id: 'spouse', name: '配偶者', birthYM: toYM(1997, 9), netMonthly: opts.spouseNet ?? 220_000, bonusNetAnnual: opts.spouseNet === 0 ? 0 : 400_000, grossAnnual: opts.spouseNet === 0 ? 0 : 3_800_000, retireBonus: 0, pensionMonthly: 120_000, cash: 1_000_000 };
  }
  p.living = [
    { id: uid(), name: '食費', icon: 'food', monthly: 70_000, kind: 'variable' },
    { id: uid(), name: 'その他', icon: 'dots', monthly: 130_000, kind: 'variable' },
  ];
  p.housing.rentMonthly = 90_000;
  p.housing.purchaseYM = toYM(2027, 4);
  p.housing.movingCost = 300_000;
  if (opts.spouse !== false) p.assumptions.retireLivingMonthly = 250_000;
  p.assumptions.childrenConfirmed = true;
  const n = opts.children ?? 0;
  for (let i = 0; i < n; i++) p.children.push(newChild(toYM(2028 + i * 2, 6), i + 1));
  return d;
}

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const withPlan = (d: AppData, f: (p: Plan) => void): AppData => {
  const c = clone(d);
  f(c.plan);
  return c;
};
