import { annuityPayment, principalFromPayment } from './loan';
import { ASSUME, CARE_RESERVE, SCREENING } from './reference';
import type { Resolved } from './resolve';
import { incomeOf, simulate, spendOf, type HouseModel, type MonthRow, type Purchase, type Scenario, type SimResult } from './simulate';
import { estimatePropertyTax } from './tax';
import type { Assumptions, House, LoanTerms, Yen, YM } from './types';
import { yenText } from './text';
import { ageAt, ymYear } from './ym';

export type TierKey = 'safe' | 'standard' | 'caution';
export type Tier = TierKey | 'danger';

export const TIER_LABEL: Record<Tier, string> = { safe: '安心', standard: '標準', caution: '注意', danger: '危険' };

export type ScenarioKey = 'base' | 'rate1' | 'income10' | 'severe';

/** 試算に使う条件（金利上昇は変動金利・固定期間後に5年かけて反映、収入減は購入後の給与・賞与・給付に反映） */
export function scenarios(a: Assumptions): Record<ScenarioKey, Scenario> {
  return {
    base: { key: 'base', rateDelta: 0, incomeFactor: 1, inflationDelta: 0, returnRate: a.returnMid },
    rate1: { key: 'rate1', rateDelta: 0.01, incomeFactor: 1, inflationDelta: 0, returnRate: a.returnMid },
    income10: { key: 'income10', rateDelta: 0, incomeFactor: 0.9, inflationDelta: 0, returnRate: a.returnMid },
    severe: { key: 'severe', rateDelta: 0.02, incomeFactor: 0.9, inflationDelta: 0, returnRate: a.returnLow },
  };
}

export const SCENARIO_LABEL: Record<ScenarioKey, string> = {
  base: '想定どおりの場合',
  rate1: '金利が1%上がった場合',
  income10: '購入後の収入が10%減った場合',
  severe: '金利が2%上がり、収入も10%減った場合',
};

/**
 * 段階ごとに、すべて満たす必要がある条件。
 *  - 安心: 金利+2% と 収入−10% が同時に起きても、予備資金を2倍（初期6か月分）保てる
 *  - 標準: 金利+1%、収入−10% のどちらが起きても、予備資金（初期3か月分）と老後の資金を保てる
 *  - 注意: 想定どおりなら、現金が一度も0円を下回らない
 */
export const TIER_SCENARIOS: Record<TierKey, ScenarioKey[]> = {
  safe: ['severe'],
  standard: ['rate1', 'income10'],
  caution: ['base'],
};

/** 予備資金の倍率（設定の「生活費◯か月分」に掛ける） */
export const TIER_RESERVE: Record<TierKey, number> = { safe: 2, standard: 1, caution: 0 };

export interface Fail {
  ym: YM;
  /** reserve: 予備資金を下回る / short: 現役中に現金が尽きる / depleted: 老後の資金が尽きる / goal: 貯蓄目標に届かない */
  kind: 'reserve' | 'short' | 'depleted' | 'goal';
  cash: Yen;
  floor: Yen;
  driver: string;
  /** どの条件で崩れたか */
  scenario?: ScenarioKey;
}

/** 失敗した年に何が増えた（減った）のかを特定する */
function driverOf(sim: SimResult, i: number): string {
  const rows = sim.rows;
  const yearRows = (from: number) => rows.slice(Math.max(0, from), Math.max(0, from + 12));
  const cur = yearRows(i - 11);
  const prev = yearRows(i - 47); // 3年前からの1年間を基準にする
  if (prev.length === 0 || cur.length === 0) return '購入時の支出';
  const sum = (rs: MonthRow[], f: (r: MonthRow) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  const cands: [string, number][] = [
    ['教育費の増加', sum(cur, (r) => r.education) - sum(prev, (r) => r.education)],
    ['住宅費の増加', sum(cur, (r) => r.housing + r.housingOnce) - sum(prev, (r) => r.housing + r.housingOnce)],
    ['生活費の増加', sum(cur, (r) => r.living) - sum(prev, (r) => r.living)],
    ['ライフイベントの一時的な支出', sum(cur, (r) => r.otherExpense) - sum(prev, (r) => r.otherExpense)],
    ['育休・時短・退職などによる収入の減少', sum(prev, (r) => incomeOf(r)) - sum(cur, (r) => incomeOf(r))],
  ];
  cands.sort((x, y) => y[1] - x[1]);
  return cands[0][1] > 0 ? cands[0][0] : '支出が収入を上回る状態の継続';
}

/** 老後の予備資金を最後まで残すか（注意は残さない） */
export const TIER_TERMINAL: Record<TierKey, boolean> = { safe: true, standard: true, caution: false };

/**
 * 段階の条件を満たすか。満たさない場合は最初に崩れた月と原因を返す。
 *  - 購入〜退職: 現金 ≥ 毎月の支出 ×（予備資金の月数 × 段階の倍率）
 *  - 退職後: 現金 ≥ 0、かつ 現金＋投資 ≥ 老後の予備資金（介護費用の平均×人数、物価で増加）
 *  - 貯蓄目標（安心・標準）: 目標の月の前月末に、現金＋投資 ≥ 目標額
 */
export function checkTier(r: Resolved, sim: SimResult, tier: TierKey): Fail | null {
  const a = r.plan.assumptions;
  const mult = TIER_RESERVE[tier] * a.reserveMonths;
  const terminal = TIER_TERMINAL[tier] ? CARE_RESERVE * r.people.length : 0;
  const from = Math.max(0, sim.pIndex);
  const retireI = sim.retireIndex;
  const baseYear = ymYear(r.start);
  const goals = TIER_TERMINAL[tier]
    ? r.plan.goals
        .map((g) => ({ g, i: g.ym - 1 - r.start }))
        .filter((x) => x.i >= from && x.i < sim.rows.length && x.g.target > 0)
    : [];
  for (let i = from; i < sim.rows.length; i++) {
    const row = sim.rows[i];
    if (i < retireI) {
      const floor = mult * row.need;
      if (row.cash < floor) return { ym: row.ym, kind: floor > 0 ? 'reserve' : 'short', cash: row.cash, floor, driver: driverOf(sim, i) };
    } else {
      const care = terminal * Math.pow(1 + a.inflation, ymYear(row.ym) - baseYear);
      // 老後は目的別の積立も手元のお金として数える
      if (row.cash + row.fund < 0 || row.cash + row.fund + row.invest < care) {
        return { ym: row.ym, kind: 'depleted', cash: row.cash + row.fund + row.invest, floor: Math.round(care), driver: driverOf(sim, i) };
      }
    }
    for (const x of goals) {
      if (x.i === i && row.cash + row.fund + row.invest < x.g.target) {
        return { ym: row.ym, kind: 'goal', cash: row.cash + row.fund + row.invest, floor: x.g.target, driver: `貯蓄目標「${x.g.name}」${yenText(x.g.target)}` };
      }
    }
  }
  return null;
}

/** 返済期間を「完済80歳以内」に調整した条件 */
export function effectiveTerms(r: Resolved, terms: LoanTerms = r.plan.housing.loan): LoanTerms {
  const self = r.people[0];
  const age = self ? ageAt(self.birthYM, r.purchaseYM) : 30;
  const years = Math.max(1, Math.min(terms.years, SCREENING.maxAge - age));
  return { ...terms, years };
}

export interface BankLimit {
  amount: Yen;
  /** 夫婦の収入で計算したか */
  pair: boolean;
  gross: Yen;
  ratio: number;
  years: number;
  rate: number;
  debtAnnual: Yen;
}

/** ① 借りられる可能性のある金額（フラット35の総返済負担率を参考にした目安） */
export function bankLimit(r: Resolved): BankLimit {
  const t = r.plan.housing.loan;
  const borrowers = t.borrower === 'pair' ? r.people : r.people.filter((p) => p.id === 'self');
  const gross = borrowers.reduce((s, p) => s + p.gross, 0);
  const ratio = gross < SCREENING.lowIncome ? SCREENING.ratioLow : SCREENING.ratioHigh;
  const self = r.people[0];
  const age = self ? ageAt(self.birthYM, r.purchaseYM) : 30;
  const years = Math.max(0, Math.min(SCREENING.maxYears, t.years, SCREENING.maxAge - age));
  const debtAnnual = r.plan.debts.filter((d) => d.endYM >= r.purchaseYM).reduce((s, d) => s + d.monthly * 12, 0);
  const monthly = Math.max(0, (ratio * gross - debtAnnual) / 12);
  const rate = Math.max(t.screeningRate, t.rate);
  const amount = years > 0 ? Math.floor(principalFromPayment(monthly, rate / 12, years * 12) / 100_000) * 100_000 : 0;
  return { amount, pair: borrowers.length > 1, gross, ratio, years, rate, debtAnnual };
}

/** 予算（住宅取得総額）から仮の住宅を作る */
export function budgetHouse(r: Resolved, total: Yen): HouseModel {
  const h = r.plan.housing;
  const price = Math.round(total / (1 + h.miscRate));
  const land = Math.round(price * h.landShare);
  return {
    label: '予算モデル',
    price,
    misc: total - price,
    kind: h.kind,
    newBuild: true,
    landPrice: land,
    buildingPrice: price - land,
    floorArea: null,
    energy: h.deduction.energy,
    propertyTaxAnnual: null,
    insuranceAnnual: h.insuranceAnnual ?? (h.kind === 'mansion' ? ASSUME.insuranceMansion : ASSUME.insuranceDetached),
    maintenanceMonthly: h.maintenanceMonthly ?? (h.kind === 'mansion' ? ASSUME.maintenanceMansion : ASSUME.maintenanceDetached),
    parkingMonthly: h.parkingMonthly,
  };
}

/** 登録した住宅から計算用の住宅を作る */
export function houseModel(r: Resolved, x: House): HouseModel {
  const h = r.plan.housing;
  const price = x.price ?? (x.landPrice ?? 0) + (x.buildingPrice ?? 0);
  const share = x.kind === 'mansion' ? ASSUME.landShareMansion : h.landShare;
  const land = x.landPrice ?? Math.round(price * share);
  const building = x.buildingPrice ?? Math.max(0, price - land);
  const maint =
    x.kind === 'mansion'
      ? x.costs.mgmtMonthly + x.costs.repairFundMonthly || (h.maintenanceMonthly ?? ASSUME.maintenanceMansion)
      : x.costs.repairMonthly ?? h.maintenanceMonthly ?? ASSUME.maintenanceDetached;
  return {
    label: x.name,
    price,
    misc: x.misc ?? Math.round(price * h.miscRate),
    kind: x.kind,
    newBuild: x.newBuild,
    landPrice: land,
    buildingPrice: building,
    floorArea: x.floorArea,
    energy: x.perf.energy ?? h.deduction.energy,
    propertyTaxAnnual: x.costs.propertyTaxAnnual,
    insuranceAnnual: x.costs.insuranceAnnual ?? h.insuranceAnnual ?? (x.kind === 'mansion' ? ASSUME.insuranceMansion : ASSUME.insuranceDetached),
    maintenanceMonthly: maint,
    parkingMonthly: x.costs.parkingMonthly,
  };
}

/** 購入しない場合の推移（自己資金の算出に使う） */
export interface Context {
  r: Resolved;
  sc: Record<ScenarioKey, Scenario>;
  baseline: SimResult;
  cashBefore: Yen;
  needWithRent: Yen;
  terms: LoanTerms;
  bank: BankLimit;
}

export function makeContext(r: Resolved): Context {
  const sc = scenarios(r.plan.assumptions);
  const baseline = simulate(r, null, sc.base);
  const idx = r.purchaseYM - r.start;
  const initial = r.people.reduce((s, p) => s + p.cash, 0);
  const cashBefore = idx > 0 ? baseline.rows[idx - 1].cash : initial;
  const needWithRent = baseline.rows[Math.min(idx, baseline.rows.length - 1)]?.need ?? 0;
  return { r, sc, baseline, cashBefore, needWithRent, terms: effectiveTerms(r), bank: bankLimit(r) };
}

/** 購入後の毎月の住宅費（初年度の概算） */
export function housingMonthly(ctx: Context, house: HouseModel, loan: Yen): Yen {
  const t = ctx.terms;
  const pay = loan > 0 ? annuityPayment(loan * (1 - t.bonusShare), t.rate / 12, t.years * 12) + annuityPayment(loan * t.bonusShare, t.rate / 2, Math.floor(t.years * 2)) / 6 : 0;
  const tax = house.propertyTaxAnnual ?? estimatePropertyTax({ ...house, cutEnabled: ctx.r.plan.housing.newBuildTaxCut }, 0);
  return pay + tax / 12 + house.insuranceAnnual / 12 + house.maintenanceMonthly + house.parkingMonthly;
}

export interface DownInfo {
  down: Yen;
  available: Yen;
  reserve: Yen;
}

/**
 * 充当する自己資金。
 * 自動の場合: 購入直前の現金 + 援助 − 引越し費用 − 予備資金（購入後の毎月の支出 ×（段階の月数 + 1か月））
 */
export function downFor(ctx: Context, tier: TierKey, housingAfter: Yen, total: Yen): DownInfo {
  const h = ctx.r.plan.housing;
  const available = ctx.cashBefore + h.gift - (h.movingCost ?? 0);
  // 購入月は家賃と住宅費が重なることもあるため、購入前後で大きい方を基準にする
  const needPost = Math.max(ctx.needWithRent, Math.max(0, ctx.needWithRent - ctx.r.rent) + housingAfter);
  const reserve = Math.round(needPost * (TIER_RESERVE[tier] * ctx.r.plan.assumptions.reserveMonths + 1));
  let down = h.downMode === 'manual' ? h.downPayment ?? 0 : Math.max(0, available - reserve);
  down = Math.max(0, Math.min(down, total));
  return { down: Math.round(down), available, reserve };
}

export interface Trial {
  loan: Yen;
  down: Yen;
  total: Yen;
  house: HouseModel;
  purchase: Purchase;
  /** 最初の条件での推移（崩れた場合は、崩れた条件での推移） */
  sim: SimResult;
  fail: Fail | null;
}

/** 段階のすべての条件で確かめる。崩れた条件があれば、最も早く崩れたものを返す */
export function evaluate(ctx: Context, purchase: Purchase, tier: TierKey, scenario?: Scenario): { sim: SimResult; fail: Fail | null } {
  const { r } = ctx;
  if (scenario) {
    const sim = simulate(r, purchase, scenario);
    return { sim, fail: checkTier(r, sim, tier) };
  }
  let first: { sim: SimResult; fail: Fail | null } | null = null;
  let worst: { sim: SimResult; fail: Fail } | null = null;
  for (const key of TIER_SCENARIOS[tier]) {
    const sim = simulate(r, purchase, ctx.sc[key]);
    const f = checkTier(r, sim, tier);
    if (!first) first = { sim, fail: null };
    if (f && (!worst || f.ym < worst.fail.ym)) worst = { sim, fail: { ...f, scenario: key } };
  }
  return worst ?? first!;
}

/** 借入額を決めたときの購入（予算モデル）を試す */
export function tryLoan(ctx: Context, loan: Yen, tier: TierKey, scenario?: Scenario): Trial {
  const { r } = ctx;
  // 自己資金は借入額に応じた住宅費で決まる（1回の見積で十分に収束する）
  const guess = budgetHouse(r, loan + Math.max(0, ctx.cashBefore));
  const info = downFor(ctx, tier, housingMonthly(ctx, guess, loan), Infinity);
  const total = loan + info.down;
  const house = budgetHouse(r, total);
  const purchase: Purchase = { house, loan, down: info.down, ym: r.purchaseYM, terms: ctx.terms };
  const ev = evaluate(ctx, purchase, tier, scenario);
  return { loan, down: info.down, total, house, purchase, sim: ev.sim, fail: ev.fail };
}

/** 決まった住宅（取得総額が固定）を、段階ごとの自己資金で試す */
export function tryHouse(ctx: Context, house: HouseModel, tier: TierKey, scenario?: Scenario): Trial {
  const { r } = ctx;
  const total = house.price + house.misc;
  let loan = Math.max(0, total - Math.max(0, ctx.cashBefore));
  let info = downFor(ctx, tier, housingMonthly(ctx, house, loan), total);
  for (let i = 0; i < 3; i++) {
    loan = total - info.down;
    info = downFor(ctx, tier, housingMonthly(ctx, house, loan), total);
  }
  loan = Math.max(0, total - info.down);
  const purchase: Purchase = { house, loan, down: info.down, ym: r.purchaseYM, terms: ctx.terms };
  const ev = evaluate(ctx, purchase, tier, scenario);
  return { loan, down: info.down, total, house, purchase, sim: ev.sim, fail: ev.fail };
}

export interface TierResult {
  tier: TierKey;
  ok: boolean;
  maxLoan: Yen;
  total: Yen;
  price: Yen;
  down: Yen;
  /** これ以上借りると崩れる理由 */
  binding: Fail | null;
  /** 0円でも条件を満たせない場合の理由 */
  zeroFail: Fail | null;
}

const STEP = 10_000;
const HI = 300_000_000;

export function searchTier(ctx: Context, tier: TierKey): TierResult {
  const zero = tryLoan(ctx, 0, tier);
  if (zero.fail) {
    return { tier, ok: false, maxLoan: 0, total: zero.total, price: zero.house.price, down: zero.down, binding: zero.fail, zeroFail: zero.fail };
  }
  let lo = 0;
  let hi = HI;
  let best = zero;
  const top = tryLoan(ctx, hi, tier);
  if (!top.fail) best = top;
  else {
    while (hi - lo > STEP) {
      const mid = Math.floor((lo + hi) / 2 / STEP) * STEP;
      if (mid <= lo) break;
      const t = tryLoan(ctx, mid, tier);
      if (t.fail) hi = mid;
      else {
        lo = mid;
        best = t;
      }
    }
  }
  const over = best.loan >= HI ? null : tryLoan(ctx, best.loan + STEP, tier).fail;
  return { tier, ok: true, maxLoan: best.loan, total: best.total, price: best.house.price, down: best.down, binding: over, zeroFail: null };
}

export interface Metrics {
  monthlyHousing: Yen;
  loanMonthly: Yen;
  surplus5y: Yen;
  savingsNow: Yen;
  savingsAtPurchase: Yen;
  savings10y: Yen;
  cashAtRetire: Yen;
  investAtRetire: Yen;
  minCashAfter: Yen;
  minCashYM: YM;
  totalPayment: Yen;
  totalInterest: Yen;
  payoffAge: number;
  burden: number;
}

export function metricsOf(ctx: Context, sim: SimResult): Metrics {
  const rows = sim.rows;
  const p = Math.max(0, sim.pIndex);
  const after = rows.slice(p + 1, p + 13);
  const avg = (rs: MonthRow[], f: (x: MonthRow) => number) => (rs.length ? rs.reduce((s, x) => s + f(x), 0) / rs.length : 0);
  const five = rows.slice(p + 1, p + 61);
  const retireRow = rows[Math.min(rows.length - 1, Math.max(0, sim.retireIndex - 1))];
  let minCash = Infinity;
  let minYM = rows[p]?.ym ?? ctx.r.start;
  for (let i = p; i < Math.min(rows.length, sim.retireIndex); i++) {
    if (rows[i].cash < minCash) {
      minCash = rows[i].cash;
      minYM = rows[i].ym;
    }
  }
  if (minCash === Infinity) minCash = rows[p]?.cash ?? 0;
  const sched = sim.schedule;
  const self = ctx.r.people[0];
  const payoffAge = sched && sim.purchase && self ? ageAt(self.birthYM, sim.purchase.ym + sched.months) : 0;
  const firstYearPay = sched ? sched.monthly.slice(0, 12).reduce((s, v) => s + v, 0) + sched.bonus.slice(0, 12).reduce((s, v) => s + v, 0) : 0;
  const gross = ctx.bank.gross;
  const initial = ctx.r.people.reduce((s, x) => s + x.cash, 0) + ctx.r.plan.investments.reduce((s, x) => s + x.balance, 0);
  const at = (i: number) => {
    const row = rows[Math.min(rows.length - 1, Math.max(0, i))];
    return row ? row.cash + row.fund + row.invest : 0;
  };
  return {
    monthlyHousing: Math.round(avg(after, (x) => x.housing)),
    loanMonthly: sched ? sched.firstMonthly : 0,
    surplus5y: Math.round(avg(five, (x) => incomeOf(x) - spendOf(x) - x.contrib - x.fundIn)),
    savingsNow: initial,
    savingsAtPurchase: at(p),
    savings10y: at(120),
    cashAtRetire: retireRow?.cash ?? 0,
    investAtRetire: retireRow?.invest ?? 0,
    minCashAfter: minCash,
    minCashYM: minYM,
    totalPayment: sched ? sched.totalPayment : 0,
    totalInterest: sched ? sched.totalInterest : 0,
    payoffAge,
    burden: gross > 0 ? firstYearPay / gross : 0,
  };
}

export interface Budget {
  loan: Yen;
  total: Yen;
  price: Yen;
  down: Yen;
  payment: Yen;
  paymentBonus: Yen;
}

export interface Recommendation {
  ready: boolean;
  ctx: Context | null;
  tiers: Record<TierKey, TierResult> | null;
  /** 金融機関の審査の目安（参考値） */
  bank: BankLimit | null;
  /** ① 毎月無理なく返済できる金額（②の初回返済額。ボーナス返済は別） */
  payment: Yen;
  paymentBonus: Yen;
  /** ② ①から金利・返済期間で逆算した借入目安額（家計上、標準の条件を満たす上限） */
  loan: Yen;
  /** ③ 家計上の住宅購入予算 = ② + 充当自己資金 = 物件価格 + 諸費用 */
  total: Yen;
  price: Yen;
  down: Yen;
  /** ② が審査の目安を超えている（その分は借りられない可能性が高い） */
  overBank: boolean;
  /** 実際に目指す予算 = 借入は ② と審査の目安の小さい方 */
  final: Budget;
  /** final で購入した場合の推移（想定どおり） */
  sim: SimResult | null;
  /** ② で購入した場合の推移（想定どおり・内訳の計算用） */
  hhSim: SimResult | null;
  /** ② を決めた条件（標準のうち上限を決めた条件）での推移 */
  stdSim: SimResult | null;
  stdScenario: ScenarioKey;
  metrics: Metrics | null;
}

const EMPTY_BUDGET: Budget = { loan: 0, total: 0, price: 0, down: 0, payment: 0, paymentBonus: 0 };

const budgetOf = (t: Trial): Budget => {
  const sch = t.sim.schedule;
  return { loan: t.loan, total: t.total, price: t.house.price, down: t.down, payment: sch ? sch.firstMonthly : 0, paymentBonus: sch ? sch.bonus[5] ?? 0 : 0 };
};

export function recommend(r: Resolved): Recommendation {
  if (!r.ready)
    return {
      ready: false, ctx: null, tiers: null, bank: null, payment: 0, paymentBonus: 0, loan: 0, total: 0, price: 0, down: 0, overBank: false,
      final: EMPTY_BUDGET, sim: null, hhSim: null, stdSim: null, stdScenario: 'rate1', metrics: null,
    };
  const ctx = makeContext(r);
  const tiers = {
    safe: searchTier(ctx, 'safe'),
    standard: searchTier(ctx, 'standard'),
    caution: searchTier(ctx, 'caution'),
  };
  const std = tiers.standard;
  // 家計上の上限（審査の目安では頭打ちにしない）
  const loan = std.ok ? std.maxLoan : 0;
  const hh = tryLoan(ctx, loan, 'standard', ctx.sc.base);
  // 借入額の上限を決めた条件（1万円多く借りると崩れる条件）での推移
  const bindKey = (std.ok ? std.binding : std.zeroFail)?.scenario ?? 'rate1';
  const stdTrial = tryLoan(ctx, loan, 'standard', ctx.sc[bindKey]);
  const overBank = std.ok && loan > ctx.bank.amount;
  // 実際に目指す予算: 審査の目安を超える分は借りられないものとする
  const fin = overBank ? tryLoan(ctx, ctx.bank.amount, 'standard', ctx.sc.base) : hh;
  const b = budgetOf(hh);
  return {
    ready: true,
    ctx,
    tiers,
    bank: ctx.bank,
    payment: b.payment,
    paymentBonus: b.paymentBonus,
    loan,
    total: std.ok ? b.total : 0,
    price: std.ok ? b.price : 0,
    down: b.down,
    overBank,
    final: std.ok ? budgetOf(fin) : { ...EMPTY_BUDGET, down: fin.down },
    sim: fin.sim,
    hhSim: hh.sim,
    stdSim: stdTrial.sim,
    stdScenario: bindKey,
    metrics: std.ok ? metricsOf(ctx, fin.sim) : null,
  };
}

/** 中心値の前後だけを探す（感度分析用。結果は searchTier と同じ1万円単位） */
export function searchTierNear(ctx: Context, tier: TierKey, center: Yen, span: Yen = 40_000_000): TierResult {
  let lo = Math.max(0, Math.floor((center - span) / STEP) * STEP);
  let hi = Math.ceil((center + span) / STEP) * STEP;
  const lt = tryLoan(ctx, lo, tier);
  if (lt.fail) return searchTier(ctx, tier);
  const ht = tryLoan(ctx, hi, tier);
  if (!ht.fail) return searchTier(ctx, tier);
  let best = lt;
  while (hi - lo > STEP) {
    const mid = Math.floor((lo + hi) / 2 / STEP) * STEP;
    if (mid <= lo) break;
    const t = tryLoan(ctx, mid, tier);
    if (t.fail) hi = mid;
    else {
      lo = mid;
      best = t;
    }
  }
  return { tier, ok: true, maxLoan: best.loan, total: best.total, price: best.house.price, down: best.down, binding: tryLoan(ctx, best.loan + STEP, tier).fail, zeroFail: null };
}

/** 段階の判定（ある購入が安心〜危険のどこか） */
export function classify(run: (tier: TierKey) => Trial): { tier: Tier; trials: Record<TierKey, Trial> } {
  const trials = { safe: run('safe'), standard: run('standard'), caution: run('caution') };
  const tier: Tier = !trials.safe.fail ? 'safe' : !trials.standard.fail ? 'standard' : !trials.caution.fail ? 'caution' : 'danger';
  return { tier, trials };
}
