// 子供の生活費（年齢・学年別の全国調査）と、大きな出費のローン
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { uid } from '../src/engine/defaults';
import { annuityPayment } from '../src/engine/loan';
import { makeContext } from '../src/engine/recommend';
import { CHILD_COST } from '../src/engine/reference';
import { resolvePlan } from '../src/engine/resolve';
import { childLivingOf, simulate } from '../src/engine/simulate';
import type { AppData, LifeEvent } from '../src/engine/types';
import { toYM } from '../src/engine/ym';
import { BASE, household, withPlan } from './helpers';

const run = (d: AppData, detail = false) => {
  const r = resolvePlan(d.plan);
  return { r, sim: simulate(r, null, makeContext(r).sc.base, { detail }) };
};
const near = (a: number, b: number, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const sum = (o: Record<string, number>) => Object.values(o).reduce((t, x) => t + x, 0);

describe('子供の生活費（年齢・学年別）', () => {
  const c = household({ children: 1 }).plan.children[0]; // 2028年6月生まれ → 小1は2035年4月

  it('生まれる前は0、0歳は0歳の平均、3歳は3歳の平均', () => {
    assert.equal(sum(childLivingOf(c, toYM(2028, 5))), 0);
    near(childLivingOf(c, toYM(2028, 6)).food, CHILD_COST[0].food / 12);
    near(childLivingOf(c, toYM(2031, 7)).food, CHILD_COST[3].food / 12);
    const r0 = CHILD_COST[0];
    near(childLivingOf(c, toYM(2028, 6)).wear, (r0.clothes + r0.goods) / 12);
  });

  it('小学校からは学年ごと（小1・中1・高3）', () => {
    near(childLivingOf(c, toYM(2035, 4)).food, CHILD_COST[7].food / 12);
    near(childLivingOf(c, toYM(2041, 4)).food, CHILD_COST[13].food / 12);
    near(childLivingOf(c, toYM(2046, 4)).misc, (CHILD_COST[18].medical + CHILD_COST[18].phone + CHILD_COST[18].allowance) / 12);
  });

  it('成長につれて食費が増える（0歳 < 小1 < 高3）', () => {
    const f = (ym: number) => childLivingOf(c, ym).food;
    assert.ok(f(toYM(2028, 6)) < f(toYM(2035, 4)));
    assert.ok(f(toYM(2035, 4)) < f(toYM(2046, 4)));
  });

  it('水準（％）を変えると比例して変わる', () => {
    near(sum(childLivingOf(c, toYM(2035, 4), 1.2)), sum(childLivingOf(c, toYM(2035, 4))) * 1.2, 0.01);
  });

  it('子供が増えると、その子の食費が生活費に加わる', () => {
    const one = run(household({ children: 1 }), true);
    const two = run(household({ children: 2 }), true);
    const kid2 = two.r.plan.children[1];
    const i = toYM(2031, 1) - one.r.start;
    const food = two.sim.parts!.find((p) => p.key === `child:${kid2.id}:food`)!;
    assert.ok(food.v[i] > 0);
    near(two.sim.rows[i].living - one.sim.rows[i].living, sum(Object.fromEntries(two.sim.parts!.filter((p) => p.key.startsWith(`child:${kid2.id}:`)).map((p) => [p.key, p.v[i]]))), 2);
  });
});

describe('大きな出費をローンで払う', () => {
  const car = (o: Partial<LifeEvent> = {}): LifeEvent => ({
    id: uid('ev'), name: '車の買い替え', icon: 'car', kind: 'expense', pattern: 'once', amount: 3_000_000,
    startYM: BASE + 12, endYM: null, everyYears: 1, inflate: false, ...o,
  });
  const plain = run(household()).sim;

  it('借りた分は翌月から年数×12回、元利均等で返す。現金で払うのは残りだけ', () => {
    const ev = car({ loan: { amount: 2_400_000, years: 5, rate: 0.025 } });
    const { sim, r } = run(withPlan(household(), (p) => void p.events.push(ev)));
    const i = ev.startYM - r.start;
    const pay = Math.round(annuityPayment(2_400_000, 0.025 / 12, 60));
    assert.equal(sim.rows[i].otherExpense - plain.rows[i].otherExpense, 600_000);
    assert.equal(sim.rows[i].debt - plain.rows[i].debt, 0);
    assert.equal(sim.rows[i + 1].debt - plain.rows[i + 1].debt, pay);
    assert.equal(sim.rows[i + 60].debt - plain.rows[i + 60].debt, pay);
    assert.equal(sim.rows[i + 61].debt - plain.rows[i + 61].debt, 0);
  });

  it('金利0%なら返済の合計は借入額と同じ', () => {
    const ev = car({ loan: { amount: 1_200_000, years: 2, rate: 0 } });
    const { sim, r } = run(withPlan(household(), (p) => void p.events.push(ev)));
    const extra = sim.rows.reduce((t, x, j) => t + x.debt - plain.rows[j].debt, 0);
    assert.equal(extra, 1_200_000);
    assert.equal(sim.rows[ev.startYM - r.start].otherExpense - plain.rows[ev.startYM - r.start].otherExpense, 1_800_000);
  });

  it('数年ごとの支出は、毎回借りる', () => {
    const ev = car({ pattern: 'repeat', everyYears: 7, loan: { amount: 1_000_000, years: 3, rate: 0.02 } });
    const { sim, r } = run(withPlan(household(), (p) => void p.events.push(ev)));
    const pay = Math.round(annuityPayment(1_000_000, 0.02 / 12, 36));
    const second = ev.startYM + 84 - r.start;
    assert.equal(sim.rows[second + 1].debt - plain.rows[second + 1].debt, pay);
  });

  it('積立と組み合わせると、積み立てるのは現金で払う分だけ', () => {
    const ev = car({ fund: true, loan: { amount: 2_000_000, years: 5, rate: 0.02 } });
    const { sim } = run(withPlan(household(), (p) => void p.events.push(ev)));
    assert.equal(sim.rows.reduce((t, x) => t + x.fundIn, 0), 1_000_000);
  });

  it('借入額が支出より多くても、支出の額までしか借りない', () => {
    const ev = car({ loan: { amount: 9_000_000, years: 5, rate: 0 } });
    const { sim } = run(withPlan(household(), (p) => void p.events.push(ev)));
    const extra = sim.rows.reduce((t, x, j) => t + x.debt - plain.rows[j].debt, 0);
    assert.equal(extra, 3_000_000);
  });
});
