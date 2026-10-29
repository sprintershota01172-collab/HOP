/**
 * 画面に渡す計算結果（シリアライズ可能・必要な分だけ）。
 * Web Worker 内でも、メインスレッドでも同じ関数を使う。
 */
import { monthPie, type PieSlice, type YearRow } from './aggregate';
import { afterPurchase, breakdown, levers, scenarioChecks, type AfterPurchase, type Breakdown, type Lever, type ScenarioCheck } from './explain';
import { goalStatus, type GoalStatus } from './goals';
import type { HouseEval } from './houses';
import { computeAll, loanTrial, type Computed, type LoanWhatIf } from './index';
import { tryLoan, type BankLimit, type Budget, type Context, type Fail, type Metrics, type ScenarioKey, type Tier, type TierKey, type TierResult } from './recommend';
import type { LoanSchedule } from './loan';
import type { Assumed } from './resolve';
import type { SimWarning } from './simulate';
import type { AppData, LoanTerms, Yen, YM } from './types';

export interface HouseView {
  id: string;
  name: string;
  total: Yen;
  price: Yen;
  misc: Yen;
  loan: Yen;
  down: Yen;
  tier: Tier;
  fails: Record<TierKey, Fail | null>;
  metrics: Metrics;
  bankOk: boolean;
  upkeepMonthly: Yen;
  cost35: Yen;
  cost35Years: number;
  fit: number;
  scores: HouseEval['scores'];
  financial: number | null;
  preference: number | null;
  totalScore: number;
  rank: number;
  strengths: string[];
  weakness: string | null;
  incomplete: boolean;
}

export interface ScheduleYear {
  year: number;
  index: number;
  payment: Yen;
  interest: Yen;
  principal: Yen;
  balanceEnd: Yen;
  rateEnd: number;
}

export interface LoanView {
  loan: Yen;
  total: Yen;
  price: Yen;
  down: Yen;
  tier: Tier;
  fails: Record<TierKey, Fail | null>;
  metrics: Metrics;
  schedule: ScheduleYear[];
  bonusFirst: Yen;
  years: number;
}

export interface ViewModel {
  ready: boolean;
  blocking: string[];
  assumed: Assumed[];
  confidence: { score: number; level: '高' | '中' | '低'; reasons: string[] };
  start: YM;
  end: YM;
  purchaseYM: YM;
  retireAllYM: YM;
  people: { id: string; name: string; birthYM: YM; retireYM: YM; pension: Yen; gross: Yen; net: Yen; bonus: Yen }[];
  tiers: Record<TierKey, TierResult> | null;
  bank: BankLimit | null;
  rec: {
    payment: Yen; paymentBonus: Yen; loan: Yen; total: Yen; price: Yen; down: Yen; overBank: boolean; final: Budget;
    metrics: Metrics | null; schedule: ScheduleYear[];
  };
  /** 計算の内訳（返済余力 → 借入目安 → 購入予算） */
  breakdown: Breakdown | null;
  /** 目指す予算で買った後の家計（購入後5年の月平均） */
  after: AfterPurchase | null;
  /** この予算で条件が変わった場合の検証 */
  checks: ScenarioCheck[];
  /** ローン画面の初期表示（推奨額・条件の変更なし） */
  loanBase: LoanView | null;
  houses: HouseView[];
  /** 自己資金の算出に使った値 */
  downInfo: { cashBefore: Yen; needWithRent: Yen; gift: Yen; moving: Yen } | null;
  fp: { basis: string; years: YearRow[]; pies: { year: number; income: Yen; slices: PieSlice[]; withdraw: Yen }[]; goals: GoalStatus[]; warnings: SimWarning[] } | null;
  ms: number;
}

let lastCtx: Context | null = null;
let lastComputed: Computed | null = null;

export function scheduleYears(c: { schedule: LoanSchedule | null; purchase: { ym: YM } | null }): ScheduleYear[] {
  const s = c.schedule;
  if (!s || !c.purchase) return [];
  const out: ScheduleYear[] = [];
  for (let i = 0; i < s.months; i += 12) {
    let pay = 0, int = 0, pr = 0;
    const end = Math.min(s.months, i + 12);
    for (let k = i; k < end; k++) {
      pay += s.monthly[k] + s.bonus[k];
      int += s.interest[k];
      pr += s.principalPaid[k];
    }
    out.push({ year: Math.floor((c.purchase.ym + i + 1) / 12), index: i / 12 + 1, payment: pay, interest: int, principal: pr, balanceEnd: s.balance[end - 1], rateEnd: s.rate[end - 1] });
  }
  return out;
}

export function computeView(data: AppData): ViewModel {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const c = computeAll(data);
  lastComputed = c;
  lastCtx = c.rec.ctx;
  const r = c.resolved;
  const houses: HouseView[] = c.houses.map((h) => ({
    id: h.id, name: h.name, total: h.total, price: h.model.price, misc: h.model.misc, loan: h.loan, down: h.down, tier: h.tier,
    fails: { safe: h.trials.safe.fail, standard: h.trials.standard.fail, caution: h.trials.caution.fail },
    metrics: h.metrics, bankOk: h.bankOk, upkeepMonthly: h.upkeepMonthly, cost35: h.cost35, cost35Years: h.cost35Years, fit: h.fit,
    scores: h.scores, financial: h.financial, preference: h.preference, totalScore: h.totalScore, rank: h.rank, strengths: h.strengths,
    weakness: h.weakness, incomplete: h.incomplete,
  }));
  const fp = c.fp
    ? {
        basis: c.fp.basis,
        years: c.fp.years,
        pies: c.fp.years.map((y) => ({ year: y.year, ...monthPie(y) })),
        goals: goalStatus(data.plan.goals, c.fp.sim),
        warnings: c.fp.sim.warnings,
      }
    : null;
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    ready: r.ready,
    blocking: r.blocking,
    assumed: r.assumed,
    confidence: r.confidence,
    start: r.start,
    end: r.end,
    purchaseYM: r.purchaseYM,
    retireAllYM: r.retireAllYM,
    people: r.people.map((p) => ({ id: p.id, name: p.name, birthYM: p.birthYM, retireYM: p.retireYM, pension: p.pension, gross: p.gross, net: p.net, bonus: p.bonus })),
    tiers: c.rec.tiers,
    bank: c.rec.bank,
    rec: {
      payment: c.rec.payment, paymentBonus: c.rec.paymentBonus, loan: c.rec.loan, total: c.rec.total, price: c.rec.price, down: c.rec.down,
      overBank: c.rec.overBank, final: c.rec.final, metrics: c.rec.metrics, schedule: c.rec.sim ? scheduleYears(c.rec.sim) : [],
    },
    breakdown: breakdown(c.rec),
    after: afterPurchase(c.rec),
    checks: scenarioChecks(c.rec),
    loanBase: c.rec.ctx ? computeLoan({ loan: c.rec.final.loan, whatIf: { rateDelta: 0, incomeCut: 0, years: null } }) : null,
    houses,
    downInfo: c.rec.ctx
      ? { cashBefore: c.rec.ctx.cashBefore, needWithRent: c.rec.ctx.needWithRent, gift: data.plan.housing.gift, moving: data.plan.housing.movingCost ?? 0 }
      : null,
    fp,
    ms: Math.round(t1 - t0),
  };
}

export interface LoanRequest {
  loan: Yen;
  whatIf: LoanWhatIf;
  terms?: Partial<LoanTerms>;
}

/** 直前の computeView の前提で、借入額・条件を変えた試算をする */
export function computeLoan(req: LoanRequest): LoanView | null {
  const ctx = lastCtx;
  if (!ctx || !lastComputed) return null;
  const { trial, metrics } = loanTrial(ctx, req.loan, req.whatIf, req.terms);
  // 段階判定（同じ借入額で、各段階の条件に「金利上昇・収入減」の試算を上乗せする）
  const sc = Object.fromEntries(
    (Object.keys(ctx.sc) as ScenarioKey[]).map((k) => [k, { ...ctx.sc[k], rateDelta: ctx.sc[k].rateDelta + req.whatIf.rateDelta, incomeFactor: ctx.sc[k].incomeFactor * (1 - req.whatIf.incomeCut) }]),
  ) as Context['sc'];
  const c2: Context = { ...ctx, terms: trial.purchase.terms, sc };
  const fails = {} as Record<TierKey, Fail | null>;
  for (const k of ['safe', 'standard', 'caution'] as const) fails[k] = tryLoan(c2, req.loan, k).fail;
  const tier: Tier = !fails.safe ? 'safe' : !fails.standard ? 'standard' : !fails.caution ? 'caution' : 'danger';
  return {
    loan: trial.loan,
    total: trial.total,
    price: trial.house.price,
    down: trial.down,
    tier,
    fails,
    metrics,
    schedule: scheduleYears(trial.sim),
    bonusFirst: trial.sim.schedule ? trial.sim.schedule.bonus[5] ?? 0 : 0,
    years: trial.purchase.terms.years,
  };
}

/** 感度分析（重いので、内訳を開いたときだけ計算する） */
export function computeLevers(): Lever[] {
  return lastComputed ? levers(lastComputed.rec) : [];
}
