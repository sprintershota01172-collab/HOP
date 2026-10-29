// 住む地域で変わる費用（保育料・給食費・学童・都市計画税）
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { childMonth, childCtxs, nurseryMonthlyOf } from '../src/engine/simulate';
import { EDU_LUNCH, EDU_MEXT } from '../src/engine/reference';
import { nurseryFee, REGIONS, residentIncomeTax } from '../src/engine/region';
import { resolvePlan } from '../src/engine/resolve';
import { estimatePropertyTax } from '../src/engine/tax';
import { computeAll } from '../src/engine/index';
import { toYM } from '../src/engine/ym';
import { household, withPlan } from './helpers';

const near = (a: number, b: number, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

describe('保育料の階層', () => {
  it('所得割額（6%）の概算: 額面550万円 → 約16.2万円', () => {
    // 給与所得控除 154万・社会保険料 82.5万・基礎控除 43万 → 課税所得 270.5万 × 6%
    assert.equal(residentIncomeTax(5_500_000, 5_000_000), 162_300);
    assert.equal(residentIncomeTax(0, null), 0);
    // 相手の収入が123万円以下なら配偶者控除33万円
    assert.equal(residentIncomeTax(5_500_000, 1_000_000), 142_500);
  });
  it('同じ所得割でも市で保育料が違う（名古屋C10・瀬戸D14・日進D7・豊田D02）', () => {
    const t = 162_300;
    assert.deepEqual([nurseryFee(REGIONS.nagoya, t).fee, nurseryFee(REGIONS.seto, t).fee, nurseryFee(REGIONS.nisshin, t).fee, nurseryFee(REGIONS.toyota, t).fee], [34_900, 37_000, 43_000, 15_000]);
    assert.equal(nurseryFee(REGIONS.nagoya, t).code, 'C10');
    // 境界: 「未満」なので境界の額は上の階層
    assert.equal(nurseryFee(REGIONS.nagoya, 180_000).code, 'C11');
    assert.equal(nurseryFee(REGIONS.toyota, 77_100).fee, 0);
    assert.equal(nurseryFee(REGIONS.toyota, 77_101).fee, 12_000);
    assert.equal(nurseryFee(REGIONS.nisshin, 10_000_000).fee, 59_500);
  });
});

describe('地域を選んだ場合の教育費', () => {
  const base = household({ children: 2 }); // 第1子 2028年6月、第2子 2030年6月
  const at = (key: keyof typeof REGIONS | null, m: number, idx: number) => {
    const d = withPlan(base, (p) => void (p.assumptions.region = key));
    const r = resolvePlan(d.plan);
    const c = r.plan.children[idx];
    const ctx = childCtxs(r, m, key ? REGIONS[key] : null).get(c.id)!;
    return { c, ctx, cm: childMonth(c, m, r.plan.assumptions.childLiving, 1, ctx) };
  };

  it('0〜2歳の保育料は市の表から（地域なしは仮置き3万円）', () => {
    const m = toYM(2029, 7); // 第1子1歳
    const n = at('nagoya', m, 0);
    assert.equal(n.cm.parts.nursery, nurseryFee(REGIONS.nagoya, n.ctx.incomeTax).fee);
    assert.equal(at(null, m, 0).cm.parts.nursery, 30_000);
  });

  it('同時に通う2人目は半額（名古屋）、豊田市は第2子以降0円', () => {
    const m = toYM(2031, 7); // 第1子3歳（保育園）・第2子1歳
    const withNursery = withPlan(base, (p) => p.children.forEach((c) => (c.kinder = 'none')));
    const run = (key: 'nagoya' | 'toyota') => {
      const d = withPlan(withNursery, (p) => void (p.assumptions.region = key));
      const r = resolvePlan(d.plan);
      const c = r.plan.children[1];
      return nurseryMonthlyOf(c, childCtxs(r, m, REGIONS[key]).get(c.id)!);
    };
    const full = nurseryFee(REGIONS.nagoya, at('nagoya', m, 1).ctx.incomeTax).fee;
    assert.equal(run('nagoya').fee, Math.round(full / 2));
    assert.match(run('nagoya').how, /2人目は半額/);
    assert.equal(run('toyota').fee, 0);
  });

  it('公立小の給食費は0円、公立中の給食費は市ごと（豊田市0円・名古屋はスクールランチ）', () => {
    const elem = toYM(2036, 5); // 第1子 小2
    assert.equal(at('nagoya', elem, 0).cm.parts.lunch ?? 0, 0);
    near(at('nagoya', elem, 0).cm.parts.school!, (EDU_MEXT.elem.public.school - EDU_LUNCH.elemPublic) / 12, 0.01);
    const mid = toYM(2042, 5); // 第1子 中2
    assert.equal(at('toyota', mid, 0).cm.parts.lunch ?? 0, 0);
    near(at('nagoya', mid, 0).cm.parts.lunch!, (320 * 20 * 11) / 12, 0.01);
    near(at(null, mid, 0).cm.parts.lunch!, 35_667 / 12, 0.01);
  });

  it('学童保育は小1〜小3だけ（日進市 月5,200円・8月8,200円の年額を月割り）', () => {
    const d = withPlan(base, (p) => {
      p.assumptions.region = 'nisshin';
      p.children[0].afterSchool = true;
    });
    const r = resolvePlan(d.plan);
    const c = r.plan.children[0];
    const m3 = toYM(2037, 5); // 小3
    const m4 = toYM(2038, 5); // 小4
    near(childMonth(c, m3, r.plan.assumptions.childLiving, 1, childCtxs(r, m3, REGIONS.nisshin).get(c.id)!).parts.afterSchool!, (5_200 * 11 + 8_200) / 12, 0.01);
    assert.equal(childMonth(c, m4, r.plan.assumptions.childLiving, 1, childCtxs(r, m4, REGIONS.nisshin).get(c.id)!).parts.afterSchool ?? 0, 0);
  });

  it('都市計画税は市の税率（日進市0.15% < 名古屋市0.3%）', () => {
    const h = { kind: 'detached' as const, newBuild: true, landPrice: 15_000_000, buildingPrice: 25_000_000, floorArea: 100, energy: 'zeh' as const, cutEnabled: true };
    assert.ok(estimatePropertyTax(h, 0, REGIONS.nisshin.cityPlanRate) < estimatePropertyTax(h, 0, REGIONS.nagoya.cityPlanRate));
    assert.equal(estimatePropertyTax(h, 0, REGIONS.nagoya.cityPlanRate), estimatePropertyTax(h, 0));
  });

  it('地域を変えると推奨予算が変わる（豊田市は保育料・給食費が安い）', () => {
    const total = (key: keyof typeof REGIONS | null) => computeAll(withPlan(base, (p) => void (p.assumptions.region = key))).rec.final.total;
    assert.ok(total('toyota') > total('nagoya'), `${total('toyota')} > ${total('nagoya')}`);
  });
});
