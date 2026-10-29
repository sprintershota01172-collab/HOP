import { toYears, type YearRow } from './aggregate';
import { evaluateHouses, type HouseEval } from './houses';
import { effectiveTerms, metricsOf, recommend, tryLoan, type Context, type Metrics, type Recommendation, type Trial } from './recommend';
import { resolvePlan, type Resolved } from './resolve';
import { simulate, type SimResult } from './simulate';
import type { AppData, LoanTerms } from './types';

export * from './types';

export interface Computed {
  resolved: Resolved;
  rec: Recommendation;
  houses: HouseEval[];
  fp: { sim: SimResult; years: YearRow[]; basis: string } | null;
}

/** アプリ全体の計算。入力（AppData）だけで決まり、表示中の年などの画面状態には依存しない */
export function computeAll(data: AppData): Computed {
  const resolved = resolvePlan(data.plan);
  const rec = recommend(resolved);
  const ctx = rec.ctx;
  const houses = ctx ? evaluateHouses(ctx, data.houses, data.weights, rec.tiers) : [];
  let fp: Computed['fp'] = null;
  if (ctx) {
    const h = data.plan.housing;
    let sim: SimResult = ctx.baseline;
    let basis = '購入しない（賃貸のまま）';
    if (h.fpBasis === 'house' && h.houseId) {
      const e = houses.find((x) => x.id === h.houseId);
      if (e) {
        sim = e.base.sim;
        basis = `${e.name}を購入`;
      }
    } else if (h.fpBasis === 'desired' && h.desiredLoan != null) {
      sim = tryLoan(ctx, h.desiredLoan, 'standard', ctx.sc.base).sim;
      basis = '希望借入額で購入';
    } else if (h.fpBasis !== 'none' && rec.sim && rec.tiers?.standard.ok) {
      sim = rec.sim;
      basis = '適正予算で購入';
    }
    // 同じ購入・同じ条件で、項目ごとの内訳を記録しながら計算し直す（売却の予定はここでだけ反映。予算の計算では売却を当てにしない）
    const detailed = simulate(resolved, sim.purchase, ctx.sc.base, { detail: true, sale: true });
    fp = { sim: detailed, years: toYears(detailed), basis };
  }
  return { resolved, rec, houses, fp };
}

export interface LoanWhatIf {
  rateDelta: number;
  incomeCut: number;
  years: number | null;
}

/** ローン画面の試算（希望借入額と、金利上昇・収入減・期間変更の影響） */
export function loanTrial(ctx: Context, loan: number, w: LoanWhatIf, terms?: Partial<LoanTerms>): { trial: Trial; metrics: Metrics } {
  const base = { ...ctx.r.plan.housing.loan, ...terms };
  if (w.years != null) base.years = w.years;
  const c2: Context = { ...ctx, terms: effectiveTerms(ctx.r, base) };
  const sc = { ...ctx.sc.base, key: 'whatif', rateDelta: w.rateDelta, incomeFactor: 1 - w.incomeCut };
  // 固定金利は上昇の影響を受けないため、上昇幅は変動・固定期間後にだけ反映される
  const trial = tryLoan(c2, loan, 'standard', sc);
  return { trial, metrics: metricsOf(c2, trial.sim) };
}
