// 繰上返済・5年125%ルール・収入の変化・再雇用・iDeCoの節税・売却・年の途中からの項目
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { monthPies } from '../src/engine/aggregate';
import { uid } from '../src/engine/defaults';
import { computeAll } from '../src/engine/index';
import { buildSchedule, ratePath } from '../src/engine/loan';
import { makeContext } from '../src/engine/recommend';
import { resolvePlan } from '../src/engine/resolve';
import { simulate } from '../src/engine/simulate';
import { marginalTaxRate } from '../src/engine/tax';
import type { AppData } from '../src/engine/types';
import { toYM } from '../src/engine/ym';
import { household, withPlan } from './helpers';

const sim0 = (d: AppData) => {
  const r = resolvePlan(d.plan);
  return simulate(r, null, makeContext(r).sc.base);
};
const spec = { principal: 30_000_000, months: 420, method: 'annuity' as const, bonusShare: 0, rateAt: () => 0.01 };

describe('繰上返済', () => {
  const base = buildSchedule(spec);
  it('期間短縮: 毎月の返済は同じで、完済が早まり、利息が減る', () => {
    const s = buildSchedule({ ...spec, prepay: [{ k: 60, amount: 3_000_000, mode: 'shorten' }] });
    assert.equal(s.monthly[61], base.monthly[61]);
    assert.ok(s.lastK < base.lastK, `${s.lastK} < ${base.lastK}`);
    assert.ok(s.totalInterest < base.totalInterest);
    assert.equal(s.totalPrincipal, 30_000_000);
    assert.equal(s.totalPrepaid, 3_000_000);
  });
  it('返済額軽減: 期間は同じで、次の月から毎月の返済が下がる', () => {
    const s = buildSchedule({ ...spec, prepay: [{ k: 60, amount: 3_000_000, mode: 'reduce' }] });
    assert.ok(s.monthly[60] < base.monthly[60]);
    assert.equal(s.lastK, 420);
    assert.ok(s.totalInterest < base.totalInterest);
    const short = buildSchedule({ ...spec, prepay: [{ k: 60, amount: 3_000_000, mode: 'shorten' }] });
    assert.ok(short.totalInterest < s.totalInterest, '期間短縮のほうが利息は減る');
    assert.equal(s.balance[419], 0);
  });
  it('繰上返済のお金はその月の現金から払い、完済の年齢が早まる', () => {
    const d = withPlan(household(), (p) => void (p.housing.loan.prepayments = [{ id: uid(), ym: toYM(2032, 4), amount: 2_000_000, mode: 'shorten' }]));
    const c0 = computeAll(household());
    const c1 = computeAll(d);
    const row = c1.rec.sim!.rows.find((x) => x.ym === toYM(2032, 4))!;
    assert.ok(row.housingOnce >= 2_000_000);
    assert.ok(c1.rec.metrics!.payoffAge <= c0.rec.metrics!.payoffAge);
  });
});

describe('5年ルール・125%ルール', () => {
  const up = (k: number) => (k <= 12 ? 0.01 : 0.04);
  it('返済額は5年ごとにしか変わらず、上がっても前の1.25倍まで。払えない利息は持ち越し、最後に精算して完済', () => {
    const s = buildSchedule({ ...spec, rateAt: up, rule125: true });
    assert.equal(s.monthly[12], s.monthly[0], '6年目までは同じ');
    assert.ok(s.monthly[60] <= Math.floor(s.monthly[0] * 1.25) + 1);
    assert.equal(s.balance[419], 0);
    const plain = buildSchedule({ ...spec, rateAt: up });
    assert.ok(plain.monthly[12] > s.monthly[12], 'ルールなしは13回目から上がる');
  });
  it('全期間固定や金利が変わらない場合は、ルールの有無で同じ', () => {
    const a = buildSchedule({ ...spec, rule125: true });
    const b = buildSchedule(spec);
    assert.equal(a.totalPayment, b.totalPayment);
  });
});

describe('収入の変化・再雇用', () => {
  it('指定した月から手取りが変わり、その後は昇給率で増える', () => {
    const d = withPlan(household({ spouse: false }), (p) => void p.incomeChanges.push({ id: uid(), owner: 'self', ym: toYM(2029, 10), netMonthly: 380_000, bonusNetAnnual: 1_200_000, note: '転職' }));
    const s = sim0(d);
    const at = (ym: number) => s.rows.find((x) => x.ym === ym)!;
    assert.ok(at(toYM(2029, 9)).salary < 380_000);
    assert.equal(at(toYM(2029, 10)).salary, 380_000);
    assert.equal(at(toYM(2030, 4)).salary, Math.round(380_000 * 1.01));
    assert.equal(at(toYM(2029, 12)).bonus, 600_000);
  });
  it('定年後の再雇用: 退職した月から指定の年齢まで、手取りが入る', () => {
    const d = withPlan(household({ spouse: false }), (p) => void (p.self.rehire = { untilAge: 70, netMonthly: 200_000 }));
    const s = sim0(d);
    const born = d.plan.self.birthYM!;
    const at = (ym: number) => s.rows.find((x) => x.ym === ym)!;
    assert.equal(at(born + 65 * 12).salary, 200_000);
    assert.equal(at(born + 70 * 12 - 1).salary, 200_000);
    assert.equal(at(born + 70 * 12).salary, 0);
  });
});

describe('iDeCoの節税', () => {
  it('その年の掛金 × 税率が12月に戻る', () => {
    const d = withPlan(household({ spouse: false }), (p) => void p.investments.push({ id: uid(), name: 'iDeCo', kind: 'ideco', owner: 'self', balance: 0, basis: null, monthly: 23_000, startYM: null, endYM: null, withdrawStartYM: null, withdrawMonthly: 0 }));
    const s = sim0(d), b = sim0(household({ spouse: false }));
    const dec = toYM(2027, 12);
    const diff = s.rows.find((x) => x.ym === dec)!.otherIncome - b.rows.find((x) => x.ym === dec)!.otherIncome;
    const rate = marginalTaxRate(5_600_000);
    assert.equal(diff, Math.floor(23_000 * 12 * rate));
    assert.ok(rate > 0.15 && rate < 0.35, `${rate}`);
  });
});

describe('家の売却・住み替え', () => {
  const d = withPlan(household(), (p) => void (p.housing.sale = { ym: toYM(2045, 4), price: null, rentAfter: 100_000 }));
  const c = computeAll(d);
  const fp = c.fp!.sim;
  it('売却の月にローンを一括で返し、その後はローン・維持費がなく家賃を払う', () => {
    const i = fp.rows.findIndex((x) => x.ym === toYM(2045, 4));
    assert.equal(fp.soldYM, toYM(2045, 4));
    assert.equal(fp.rows[i].loanBalance, 0);
    assert.ok(fp.rows[i].otherIncome > 10_000_000, '売却代金');
    const after = fp.rows[i + 2];
    assert.equal(after.loanPayment, 0);
    assert.equal(after.upkeep, 0);
    assert.ok(after.rent >= 100_000);
    assert.equal(c.fp!.years.find((y) => y.year === 2046)!.homeValue, 0);
  });
  it('住宅購入予算は売却を当てにしない（売却の予定で変わらない）', () => {
    assert.equal(c.rec.final.total, computeAll(household()).rec.final.total);
  });
});

describe('年の途中から始まる項目', () => {
  it('購入した年のローン返済は「◯月から 月◯円」を示す（月平均だけだと小さく見えるため）', () => {
    const d = withPlan(household(), (p) => void (p.housing.purchaseYM = toYM(2027, 11)));
    const c = computeAll(d);
    const pies = monthPies(c.fp!.sim, c.fp!.years);
    const y = c.fp!.years.findIndex((x) => x.year === 2027);
    const avg = pies[y].find((x) => x.kind === 'avg')!;
    const loan = avg.detail.housing.find((x) => x.key === 'loan')!;
    assert.equal(loan.span, '12月から');
    assert.equal(loan.perMonth, c.fp!.sim.schedule!.monthly[0]);
    assert.ok(loan.value < loan.perMonth!);
  });
});
