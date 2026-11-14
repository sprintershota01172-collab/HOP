import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { uid } from '../src/engine/defaults';
import { houseModel, makeContext, tryHouse, tryLoan } from '../src/engine/recommend';
import { resolvePlan } from '../src/engine/resolve';
import { deductionPlan, grossInYear, isKosodate } from '../src/engine/simulate';
import {
  acquisitionTax, deductibleTaxParts, deductionLimit, giftTax, loanCosts, propertyTaxParts, purchaseCostItems, saleGainTax, taxableOf,
} from '../src/engine/tax';
import { newHouse } from '../src/engine/defaults';
import { toYM } from '../src/engine/ym';
import { household, withPlan } from './helpers';

describe('所得税・住民税の概算', () => {
  it('住民税から引ける上限は所得税の課税総所得金額等の5%（最大97,500円）', () => {
    const t = taxableOf(5_600_000, 2027);
    const p = deductibleTaxParts(5_600_000, 2027);
    assert.equal(p.residentCap, Math.floor(Math.min(97_500, t * 0.05)));
    assert.ok(p.incomeTax > 0);
    assert.equal(deductibleTaxParts(0).incomeTax, 0);
  });

  it('令和8年度改正の基礎控除（合計所得489万円以下は104万円）で2026年からの税は軽くなる', () => {
    assert.ok(taxableOf(5_000_000, 2026) < taxableOf(5_000_000, 2025));
  });
});

describe('住宅ローン控除の限度額（令和8年度改正）', () => {
  it('新築: 長期優良4,500万（子育て5,000万）・ZEH 3,500万（4,500万）・省エネ基準2,000万（3,000万）13年', () => {
    assert.deepEqual(deductionLimit('longlife', 'kosodate', true, 2027), { limit: 50_000_000, years: 13 });
    assert.deepEqual(deductionLimit('zeh', 'normal', true, 2027), { limit: 35_000_000, years: 13 });
    assert.deepEqual(deductionLimit('standard', 'kosodate', true, 2027), { limit: 30_000_000, years: 13 });
    assert.deepEqual(deductionLimit('other', 'kosodate', true, 2027), { limit: 0, years: 0 });
  });
  it('2028年以降に入居する新築の省エネ基準適合住宅は 2,000万円×10年（2027年末までに建築確認のもの）', () => {
    assert.deepEqual(deductionLimit('standard', 'kosodate', true, 2028), { limit: 20_000_000, years: 10 });
  });
  it('中古: ZEH 3,500万（4,500万）13年、その他 2,000万 10年、2031年以降の入居は対象外', () => {
    assert.deepEqual(deductionLimit('zeh', 'kosodate', false, 2027), { limit: 45_000_000, years: 13 });
    assert.deepEqual(deductionLimit('other', 'kosodate', false, 2027), { limit: 20_000_000, years: 10 });
    assert.equal(deductionLimit('zeh', 'normal', true, 2031).limit, 0);
  });

  it('子育て世帯・若者夫婦世帯は入居した年の年齢・子供から自動で判定する', () => {
    const r = resolvePlan(household().plan); // 1996年・1997年生まれの夫婦
    assert.equal(isKosodate(r, 2027), true);
    assert.equal(isKosodate(r, 2040), false);
    const kid = resolvePlan(household({ children: 1 }).plan); // 2028年生まれの子
    assert.equal(isKosodate(kid, 2040), true);
    const single = resolvePlan(household({ spouse: false }).plan);
    assert.equal(isKosodate(single, 2027), false, '40歳未満でも配偶者がいなければ対象外');
  });

  it('育休の年は非課税の給付になるため、控除に使える税が減る', () => {
    const d = withPlan(household({ children: 1 }), (p) => {
      p.housing.deduction.enabled = true;
      p.housing.loan.borrower = 'pair';
      p.work = [{ id: uid(), owner: 'spouse', type: 'leave', startYM: toYM(2028, 6), months: 12, endYM: null, ratio: 1, maternity: true, childId: p.children[0].id }];
    });
    const r = resolvePlan(d.plan);
    const sp = r.people.find((p) => p.id === 'spouse')!;
    assert.ok(grossInYear(r, sp, 2029) < grossInYear(r, sp, 2031));
    const ctx = makeContext(r);
    const t = tryLoan(ctx, 40_000_000, 'standard', ctx.sc.base);
    const plan = deductionPlan(r, t.purchase, t.sim.schedule!)!;
    assert.equal(plan.family, 'kosodate');
    assert.equal(plan.list.length, 13);
    const y29 = plan.list.find((x) => x.year === 2029)!;
    const y31 = plan.list.find((x) => x.year === 2031)!;
    assert.ok(y29.unused > y31.unused, `育休の年 ${y29.unused} / 復帰後 ${y31.unused}`);
    for (const y of plan.list) {
      assert.equal(y.credit, y.incomeTax + y.resident);
      assert.ok(y.credit <= Math.floor(y.balance * 0.007) + 1);
    }
  });
});

describe('固定資産税・都市計画税', () => {
  const base = { kind: 'detached' as const, newBuild: true, landPrice: 15_000_000, buildingPrice: 27_000_000, floorArea: 105, landArea: 150, energy: 'zeh' as const, cutEnabled: true };
  it('戸建ての新築の減額は3年度、マンションは5年度', () => {
    assert.ok(propertyTaxParts(base, 2).building < propertyTaxParts(base, 3).building);
    const m = { ...base, kind: 'mansion' as const };
    assert.ok(propertyTaxParts(m, 4).building < propertyTaxParts(m, 5).building);
  });
  it('200㎡を超える部分の土地は一般住宅用地（1/3・2/3）で高くなる', () => {
    assert.ok(propertyTaxParts({ ...base, landArea: 400 }, 0).land > propertyTaxParts({ ...base, landArea: 150 }, 0).land);
  });
  it('新築の建物は購入の翌年から課税される（購入した年は土地だけ）', () => {
    const d = household();
    const r = resolvePlan(d.plan);
    const ctx = makeContext(r);
    const rows = tryLoan(ctx, 30_000_000, 'standard', ctx.sc.base).sim.rows;
    const may = rows.find((x) => x.ym === toYM(2027, 5))!;
    const next = rows.find((x) => x.ym === toYM(2028, 5))!;
    // 維持費の差 = 建物分の固定資産税（保険・修繕は同じ。修繕は物価で少し増える）
    assert.ok(next.upkeep - may.upkeep > 2_000, `${may.upkeep} → ${next.upkeep}`);
  });
});

describe('購入時の諸費用と税', () => {
  const h = { kind: 'detached' as const, newBuild: true, price: 42_000_000, landPrice: 15_000_000, buildingPrice: 27_000_000, floorArea: 105, landArea: 150, energy: 'zeh' as const };

  it('不動産取得税: 新築住宅は評価額から1,200万円控除、土地は減額で0円になることが多い', () => {
    const a = acquisitionTax(h);
    assert.equal(a.building, Math.floor(((27_000_000 * 0.6 - 12_000_000) * 0.03) / 100) * 100);
    assert.equal(a.land, 0);
    assert.equal(acquisitionTax({ ...h, energy: 'longlife' }).building, Math.floor(((27_000_000 * 0.6 - 13_000_000) * 0.03) / 100) * 100);
  });

  it('登録免許税・印紙税・融資手数料を借入額に応じて積み上げる', () => {
    const items = purchaseCostItems(h, 38_000_000, { loanFeeRate: 0.022, extra: 0 });
    const v = (k: string) => items.find((x) => x.key === k)?.value ?? 0;
    assert.equal(v('regLoan'), 38_000);
    assert.equal(v('stampLoan'), 20_000);
    assert.equal(v('stamp'), 10_000 + 10_000);
    assert.equal(v('loanFee'), 836_000);
    assert.equal(v('reg'), Math.floor((15_000_000 * 0.7 * 0.015 + 27_000_000 * 0.6 * 0.0015) / 100) * 100);
    assert.equal(v('broker'), 0, '新築は仲介手数料なし');
    assert.equal(loanCosts(38_000_000, 0.022), v('regLoan') + v('stampLoan') + v('loanFee'));
    const used = purchaseCostItems({ ...h, newBuild: false }, 0, { loanFeeRate: 0, extra: 0 });
    assert.equal(used.find((x) => x.key === 'broker')!.value, Math.round((42_000_000 * 0.03 + 60_000) * 1.1));
  });

  it('不動産取得税は購入の6か月後、外構などの工事は購入時の諸費用に入る', () => {
    const d = withPlan(household(), (p) => void (p.housing.extraCost = 1_500_000));
    d.houses = [{ ...newHouse(), name: 'A', price: 42_000_000, landPrice: 15_000_000, buildingPrice: 27_000_000, floorArea: 105, landArea: 150 }];
    const r = resolvePlan(d.plan);
    const ctx = makeContext(r);
    const model = houseModel(r, d.houses[0]);
    assert.ok(model.acqTax > 0);
    const t = tryHouse(ctx, model, 'standard', ctx.sc.base);
    assert.equal(t.total, t.house.price + t.house.misc);
    assert.equal(t.loan + t.down, t.total);
    assert.ok(t.house.misc > 1_500_000 + loanCosts(t.loan, 0.022));
    const at = t.sim.rows.find((x) => x.ym === toYM(2027, 10))!;
    assert.ok(at.housingOnce >= model.acqTax);
  });

  it('贈与税: 住宅取得等資金の非課税は2026年までの贈与。使えない年は相続時精算課税を選べば0円', () => {
    assert.equal(giftTax(1_800_000, 'exempt', 'zeh', 2026).tax, 0);
    const late = giftTax(1_800_000, 'exempt', 'zeh', 2027);
    assert.equal(late.usable, false);
    assert.equal(late.tax, 70_000);
    assert.equal(giftTax(1_800_000, 'settlement', 'zeh', 2027).tax, 0);
    assert.equal(giftTax(1_000_000, 'calendar', 'zeh', 2027).tax, 0);
    assert.equal(giftTax(15_000_000, 'exempt', 'zeh', 2026).tax, Math.floor(3_900_000 * 0.15 - 100_000));
  });

  it('援助の贈与税は翌年3月に払う', () => {
    const d = withPlan(household(), (p) => void ((p.housing.gift = 1_800_000), (p.housing.giftMode = 'calendar')));
    const r = resolvePlan(d.plan);
    const ctx = makeContext(r);
    const rows = tryLoan(ctx, 30_000_000, 'standard', ctx.sc.base).sim.rows;
    const off = withPlan(d, (p) => void (p.housing.giftMode = 'settlement'));
    const r2 = resolvePlan(off.plan);
    const ctx2 = makeContext(r2);
    const rows2 = tryLoan(ctx2, 30_000_000, 'standard', ctx2.sc.base).sim.rows;
    const m = (x: typeof rows) => x.find((y) => y.ym === toYM(2028, 3))!.housingOnce;
    assert.equal(m(rows) - m(rows2), 70_000);
  });

  it('家を売ったときの税: 3,000万円の特別控除の範囲なら0円、超えた分に所有期間に応じた税率', () => {
    const base = { cost: 2_000_000, landPrice: 15_000_000, buildingPrice: 27_000_000, misc: 2_000_000, kind: 'detached' as const, heldYears: 12, usedYears: 12.5 };
    assert.equal(saleGainTax({ ...base, price: 40_000_000 }).tax, 0);
    const big = saleGainTax({ ...base, price: 90_000_000 });
    assert.ok(big.gain > 30_000_000 && big.tax > 0);
    assert.equal(big.tax, Math.floor((big.gain - 30_000_000) * 0.1421));
    assert.ok(saleGainTax({ ...base, price: 90_000_000, heldYears: 3 }).tax > big.tax);
  });
});
