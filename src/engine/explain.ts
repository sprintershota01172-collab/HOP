/**
 * 計算の内訳・制限要因・シナリオ検証・感度分析。
 *
 * 毎月の返済余力は、購入から「借入額の上限を決めた時点」までの月次の家計から、次の恒等式で求まる。
 *
 *   返済の合計 = 手取り収入 − 住宅ローン以外の支出 − 積立・投資 − （期間末の現金 − 購入直後の現金）
 *
 * 期間末の現金は「標準の条件（金利+1%）で、その月に必要な予備資金ちょうど」になる。
 * そのため、内訳の各行を期間の月数で割ったものの合計は、画面の毎月の返済余力と一致する（端数を除く）。
 */
import { RETIRE_LIVING_COUPLE } from './reference';
import { checkTier, makeContext, SCENARIO_LABEL, searchTierNear, TIER_RESERVE, type Context, type Fail, type Recommendation, type ScenarioKey } from './recommend';
import { resolvePlan, type Resolved } from './resolve';
import { simulate, type MonthRow, type Scenario, type SimResult } from './simulate';
import { yenText } from './text';
import type { Plan, Yen, YM } from './types';
import { ageAt, formatYM } from './ym';

export type BreakOp = '+' | '−';
export interface BreakLine {
  key: string;
  label: string;
  /** 月平均（円）。常に0以上で、op が足すか引くかを表す */
  value: Yen;
  op: BreakOp;
  /** 値を変える入力画面 */
  sheet: string;
  sub?: string;
}

export type EndKind = 'reserve' | 'short' | 'depleted' | 'goal' | 'loanEnd' | 'atPurchase';

export interface Limit {
  ym: YM;
  kind: Fail['kind'];
  driver: string;
  scenario?: ScenarioKey;
  text: string;
}

export interface Breakdown {
  ok: boolean;
  months: number;
  from: YM;
  to: YM;
  endKind: EndKind;
  lines: BreakLine[];
  /** 期間中の返済の月平均（= lines の合計） */
  payment: Yen;
  firstPayment: Yen;
  bonusPayment: Yen;
  loan: Yen;
  rate: number;
  years: number;
  totalPayment: Yen;
  interest: Yen;
  down: Yen;
  total: Yen;
  price: Yen;
  misc: Yen;
  downParts: { cashBefore: Yen; gift: Yen; moving: Yen; kept: Yen; manual: boolean };
  limit: Limit | null;
}

const FAIL_TEXT: Record<Fail['kind'], string> = {
  reserve: '予備資金（生活費の数か月分）を下回る',
  short: '現金が足りなくなる',
  depleted: '老後の資金が足りなくなる',
  goal: '貯蓄目標に届かない',
};

export function limitText(r: Resolved, f: Fail): Limit {
  const self = r.people[0];
  const age = self ? `（${self.name} ${ageAt(self.birthYM, f.ym)}歳）` : '';
  const when = f.scenario && f.scenario !== 'base' ? `${SCENARIO_LABEL[f.scenario]}、` : '';
  return { ym: f.ym, kind: f.kind, driver: f.driver, scenario: f.scenario, text: `${when}${formatYM(f.ym)}${age}に${FAIL_TEXT[f.kind]}（${f.driver}）` };
}

const sumRows = (rows: MonthRow[], f: (x: MonthRow) => number) => rows.reduce((s, x) => s + f(x), 0);

/** 期間の月平均で、収入と住宅ローン以外のお金の流れを行にする（内訳の共通部分） */
function flowLines(win: MonthRow[], per: (v: number) => number): { lines: BreakLine[]; eduOnce: number } {
  const salary = sumRows(win, (x) => x.salary + x.benefit);
  const bonus = sumRows(win, (x) => x.bonus);
  const pension = sumRows(win, (x) => x.pension);
  const allowance = sumRows(win, (x) => x.allowance);
  const other = sumRows(win, (x) => x.otherIncome + x.retireBonus + x.deduction + x.gift);
  const income = salary + bonus + pension + allowance + other;
  const living = sumRows(win, (x) => x.living);
  const edu = sumRows(win, (x) => x.education);
  const eduOnce = sumRows(win, (x) => x.educationOnce);
  const ins = sumRows(win, (x) => x.insurance);
  const debt = sumRows(win, (x) => x.debt);
  const events = sumRows(win, (x) => x.otherExpense + x.housingOnce);
  const upkeep = sumRows(win, (x) => x.upkeep);
  const rent = sumRows(win, (x) => x.rent);
  const invest = sumRows(win, (x) => x.contrib - x.withdraw - x.autoWithdraw + x.invTax);

  const lines: BreakLine[] = [];
  const subIncome = [
    salary && `給与・給付 ${yenText(per(salary))}`,
    bonus && `賞与 ${yenText(per(bonus))}`,
    pension && `年金 ${yenText(per(pension))}`,
    allowance && `児童手当 ${yenText(per(allowance))}`,
    other && `その他 ${yenText(per(other))}`,
  ].filter(Boolean).join('・');
  lines.push({ key: 'income', label: '世帯の手取り収入', value: per(income), op: '+', sheet: 'income', sub: subIncome });
  lines.push({ key: 'living', label: '生活費・お小遣い（子供の分を含む）', value: per(living), op: '−', sheet: 'living' });
  if (edu) lines.push({ key: 'education', label: '教育費', value: per(edu), op: '−', sheet: 'children', sub: eduOnce ? `うち大学の入学費用 ${yenText(per(eduOnce))}` : undefined });
  if (ins) lines.push({ key: 'insurance', label: '保険料', value: per(ins), op: '−', sheet: 'insurance' });
  if (debt) lines.push({ key: 'debt', label: 'いまある借入の返済', value: per(debt), op: '−', sheet: 'savings' });
  if (events) lines.push({ key: 'events', label: '一時的な支出（車・イベント）', value: per(events), op: '−', sheet: 'events' });
  lines.push({ key: 'upkeep', label: '住宅維持費（税・保険・修繕）', value: per(upkeep), op: '−', sheet: 'housing' });
  if (rent) lines.push({ key: 'rent', label: '家賃（引越しまでの重複）', value: per(rent), op: '−', sheet: 'housing' });
  if (invest) lines.push({ key: 'invest', label: invest > 0 ? 'NISAなどの積立' : '投資の取り崩し', value: per(Math.abs(invest)), op: invest > 0 ? '−' : '+', sheet: 'invest' });
  const fund = sumRows(win, (x) => x.fundIn);
  if (fund) lines.push({ key: 'fund', label: '旅行などの積立（時期から逆算）', value: per(fund), op: '−', sheet: 'events' });

  return { lines, eduOnce };
}

export function breakdown(rec: Recommendation): Breakdown | null {
  const ctx = rec.ctx;
  const tiers = rec.tiers;
  const base = rec.hhSim;
  const std = rec.stdSim;
  if (!ctx || !tiers || !base || !std) return null;
  const r = ctx.r;
  const p = base.pIndex;
  if (p < 0) return null;
  const terms = ctx.terms;
  const n = base.schedule ? base.schedule.months : terms.years * 12;
  const st = tiers.standard;
  const bind = st.ok ? st.binding : st.zeroFail;
  const tB = bind ? bind.ym - r.purchaseYM : Infinity;
  const W = Math.max(0, Math.min(tB, n, base.rows.length - 1 - p));
  const endKind: EndKind = bind && tB <= 0 ? 'atPurchase' : bind && tB <= n ? bind.kind : 'loanEnd';
  const win = base.rows.slice(p + 1, p + 1 + W);
  const per = (v: number) => (W > 0 ? v / W : 0);

  const pay = sumRows(win, (x) => x.loanPayment);
  const cashStart = base.rows[p].cash;
  const cashEnd = W > 0 ? base.rows[p + W].cash : cashStart;
  const { lines } = flowLines(win, per);

  const change = cashEnd - cashStart;
  if (endKind === 'reserve' || endKind === 'short' || endKind === 'depleted' || endKind === 'goal') {
    // 期間末の現金 = 残すべき額（標準の条件での予備資金） + 金利上昇がなかった分の余裕
    const floor = endKind === 'reserve' ? TIER_RESERVE.standard * r.plan.assumptions.reserveMonths * std.rows[p + W].need : 0;
    const kept = endKind === 'depleted' || endKind === 'goal' ? cashEnd : Math.min(cashEnd, floor);
    const reserveDelta = kept - cashStart;
    const margin = cashEnd - kept;
    if (reserveDelta !== 0)
      lines.push({
        key: 'reserve',
        label:
          reserveDelta <= 0
            ? '購入後の手元資金を取り崩す'
            : endKind === 'depleted'
              ? '老後に向けて残す'
              : endKind === 'goal'
                ? `${bind?.driver ?? '貯蓄目標'}に向けて貯める`
                : '予備資金の積み増し',
        value: per(Math.abs(reserveDelta)),
        op: reserveDelta > 0 ? '−' : '+',
        sheet: reserveDelta <= 0 ? 'housing' : endKind === 'goal' ? 'goals' : 'assumptions',
        sub: endKind === 'reserve' ? `${formatYM(r.purchaseYM + W)}に生活費${r.plan.assumptions.reserveMonths}か月分 ${yenText(floor)} を残す` : undefined,
      });
    if (margin > 0)
      lines.push({
        key: 'margin',
        label: rec.stdScenario === 'income10' ? '収入減（−10%）への備え' : '金利上昇（+1%）への備え',
        value: per(margin),
        op: '−',
        sheet: rec.stdScenario === 'income10' ? 'income' : 'loanTerms',
      });
  } else if (endKind === 'loanEnd') {
    if (change !== 0)
      lines.push({
        key: 'future',
        label: change > 0 ? '完済までに貯める（老後・将来の負担への準備）' : '購入後の手元資金を取り崩す',
        value: per(Math.abs(change)),
        op: change > 0 ? '−' : '+',
        sheet: change > 0 ? 'assumptions' : 'housing',
        sub: change > 0 ? `完済時の現金 ${yenText(cashEnd)}` : undefined,
      });
  }

  const sch = base.schedule;
  const info = ctx.cashBefore + r.plan.housing.gift - (r.plan.housing.movingCost ?? 0);
  return {
    ok: st.ok,
    months: W,
    from: r.purchaseYM + 1,
    to: r.purchaseYM + W,
    endKind,
    lines,
    payment: per(pay),
    firstPayment: sch ? sch.firstMonthly : 0,
    bonusPayment: sch ? sch.bonus[5] ?? 0 : 0,
    loan: rec.loan,
    rate: terms.rate,
    years: terms.years,
    totalPayment: sch ? sch.totalPayment : 0,
    interest: sch ? sch.totalInterest : 0,
    down: rec.down,
    total: rec.total,
    price: rec.price,
    misc: rec.total - rec.price,
    downParts: {
      cashBefore: ctx.cashBefore,
      gift: r.plan.housing.gift,
      moving: r.plan.housing.movingCost ?? 0,
      kept: Math.max(0, info - rec.down),
      manual: r.plan.housing.downMode === 'manual',
    },
    limit: bind ? limitText(r, bind) : null,
  };
}

/* ---------------- 目指す予算で買った後の家計 ---------------- */

export interface AfterPurchase {
  months: number;
  from: YM;
  to: YM;
  /** 収入 − 支出 − 積立 − 住宅ローンの返済（月平均）。合計 = surplus */
  lines: BreakLine[];
  /** 毎月の余裕（現金の増え方の月平均） */
  surplus: Yen;
  payment: Yen;
}

/** 実際に目指す予算（③）で購入した場合の、購入後5年の家計の月平均 */
export function afterPurchase(rec: Recommendation): AfterPurchase | null {
  const sim = rec.sim;
  if (!rec.ctx || !sim || sim.pIndex < 0) return null;
  const p = sim.pIndex;
  const W = Math.max(0, Math.min(60, sim.rows.length - 1 - p));
  if (W === 0) return null;
  const win = sim.rows.slice(p + 1, p + 1 + W);
  const per = (v: number) => v / W;
  const { lines } = flowLines(win, per);
  const pay = per(sumRows(win, (x) => x.loanPayment));
  lines.push({ key: 'loan', label: '住宅ローンの返済', value: pay, op: '−', sheet: 'loanTerms' });
  const surplus = per(sim.rows[p + W].cash - sim.rows[p].cash);
  return { months: W, from: sim.rows[p + 1].ym, to: sim.rows[p + W].ym, lines, surplus, payment: pay };
}

/* ---------------- シナリオ検証 ---------------- */

export interface ScenarioCheck {
  key: string;
  label: string;
  ok: boolean;
  fail: Limit | null;
  /** 購入〜退職で最も少ない現金 */
  minCash: Yen;
}

function minCashOf(sim: SimResult): Yen {
  let m = Infinity;
  for (let i = Math.max(0, sim.pIndex); i < Math.min(sim.rows.length, sim.retireIndex); i++) m = Math.min(m, sim.rows[i].cash);
  return m === Infinity ? 0 : m;
}

/** 教育費が増える: 子供全員が高校・大学とも私立（大学は理系） */
export function withPrivateEducation(plan: Plan): Plan {
  const c = structuredClone(plan);
  c.children = c.children.map((x) => ({ ...x, high: 'private' as const, univ: 'privateSci' as const }));
  return c;
}

/** 育休・時短が長引く: 登録した育休・時短を1年延長。未登録なら、配偶者が各子供の誕生から1年育休 */
export function withLongerLeave(plan: Plan): Plan | null {
  const c = structuredClone(plan);
  if (c.work.length) {
    c.work = c.work.map((w) => (w.type === 'leave' ? { ...w, months: w.months + 12 } : { ...w, endYM: w.endYM == null ? null : w.endYM + 12 }));
    return c;
  }
  if (!c.spouse || !c.children.length) return null;
  c.work = c.children.map((ch, i) => ({ id: `lever-leave-${i}`, owner: 'spouse' as const, type: 'leave' as const, startYM: ch.birthYM, months: 12, endYM: null, ratio: 1, maternity: false, childId: ch.id }));
  return c;
}

export function scenarioChecks(rec: Recommendation): ScenarioCheck[] {
  const ctx = rec.ctx;
  // 実際に目指す予算（審査の目安で抑えた場合はその額）で購入した場合を確かめる
  const purchase = rec.sim?.purchase ?? rec.stdSim?.purchase;
  if (!ctx || !purchase) return [];
  const r = ctx.r;
  const sc = ctx.sc;
  const run = (key: string, label: string, rr: Resolved, s: Scenario): ScenarioCheck => {
    const sim = simulate(rr, purchase, s);
    const f = checkTier(rr, sim, 'standard');
    return { key, label, ok: !f, fail: f ? limitText(rr, f) : null, minCash: minCashOf(sim) };
  };
  const out: ScenarioCheck[] = [
    run('base', '想定どおり', r, sc.base),
    run('rate1', '金利 +1%（5年かけて上昇）', r, sc.rate1),
    run('income10', '購入後の収入 −10%', r, sc.income10),
    run('rate2', '金利 +2%', r, { ...sc.rate1, key: 'rate2', rateDelta: 0.02 }),
  ];
  if (r.plan.children.length) out.push(run('edu', '高校・大学が私立（教育費の増加）', resolvePlan(withPrivateEducation(r.plan)), sc.base));
  const lv = withLongerLeave(r.plan);
  if (lv) out.push(run('leave', r.plan.work.length ? '育休・時短が1年長引く' : '配偶者が育休を1年取る', resolvePlan(lv), sc.base));
  if (r.plan.spouse && r.plan.assumptions.retireLivingMonthly == null && r.retireLiving < RETIRE_LIVING_COUPLE) {
    const c = structuredClone(r.plan);
    c.assumptions.retireLivingMonthly = RETIRE_LIVING_COUPLE;
    out.push(run('retire', `老後の生活費が平均並み（月${yenText(RETIRE_LIVING_COUPLE)}）`, resolvePlan(c), sc.base));
  }
  return out;
}

/* ---------------- 感度分析（どの入力を変えると予算が動くか） ---------------- */

export interface Lever {
  key: string;
  label: string;
  sheet: string;
  deltaLoan: Yen;
  deltaTotal: Yen;
}

export function levers(rec: Recommendation): Lever[] {
  const ctx = rec.ctx;
  const tiers = rec.tiers;
  if (!ctx || !tiers) return [];
  const r = ctx.r;
  const plan = r.plan;
  const baseLoan = tiers.standard.ok ? tiers.standard.maxLoan : 0;
  const baseTotal = tiers.standard.ok ? rec.total : 0;
  const cands: { key: string; label: string; sheet: string; plan: Plan }[] = [];
  const mk = (key: string, label: string, sheet: string, f: (p: Plan) => void) => {
    const c = structuredClone(plan);
    f(c);
    cands.push({ key, label, sheet, plan: c });
  };
  mk('living', '生活費を月1万円減らす', 'living', (p) => p.living.push({ id: 'lever', name: 'lever', icon: 'dots', monthly: -10_000, kind: 'variable' }));
  mk('income', '手取りを月1万円増やす', 'income', (p) => void (p.self.netMonthly = (p.self.netMonthly ?? 0) + 10_000));
  const active = plan.investments.filter((x) => x.monthly >= 10_000).sort((a, b) => b.monthly - a.monthly)[0];
  if (active) mk('invest', 'NISAなどの積立を月1万円減らす', 'invest', (p) => void (p.investments.find((x) => x.id === active.id)!.monthly -= 10_000));
  if (ctx.terms.years <= 30) mk('term', '返済期間を5年延ばす', 'loanTerms', (p) => void (p.housing.loan.years = Math.min(50, ctx.terms.years + 5)));
  mk('delay', '購入を1年遅らせる', 'housing', (p) => void (p.housing.purchaseYM = r.purchaseYM + 12));
  mk('gift', '自己資金を100万円増やす（援助など）', 'housing', (p) => void (p.housing.gift += 1_000_000));
  mk('retire', '老後の生活費を月1万円減らす', 'assumptions', (p) => void (p.assumptions.retireLivingMonthly = Math.max(0, r.retireLiving - 10_000)));
  const short = plan.work.find((w) => w.type === 'short' && w.ratio < 1);
  if (short) mk('short', '時短勤務の時間を25%増やす', 'work', (p) => void (p.work.find((w) => w.id === short.id)!.ratio = Math.min(1, short.ratio + 0.25)));
  if (plan.housing.loan.rate >= 0.005) mk('rate', '金利が0.5%低い場合', 'loanTerms', (p) => void (p.housing.loan.rate -= 0.005));

  const out: Lever[] = [];
  for (const c of cands) {
    const rr = resolvePlan(c.plan);
    if (!rr.ready) continue;
    const cx: Context = makeContext(rr);
    const t = searchTierNear(cx, 'standard', baseLoan);
    const loan = t.ok ? t.maxLoan : 0;
    const total = t.ok ? t.total : 0;
    out.push({ key: c.key, label: c.label, sheet: c.sheet, deltaLoan: loan - baseLoan, deltaTotal: total - baseTotal });
  }
  return out.sort((a, b) => b.deltaTotal - a.deltaTotal);
}

