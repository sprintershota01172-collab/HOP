import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HEALTH, healthSpan, yearHealth } from '../src/engine/health';
import { computeAll } from '../src/engine/index';
import { computeView } from '../src/engine/view';
import { ymYear } from '../src/engine/ym';
import { household, withPlan } from './helpers';

const health = (d: ReturnType<typeof household>) => computeView(d).fp!.health;

describe('家計のゆとり（年ごとの緑・黄・赤）', () => {
  it('年の収支と同じ年が並び、年間収支は年の収支と円単位で一致する', () => {
    const vm = computeView(household({ children: 2 }));
    const h = vm.fp!.health;
    const years = vm.fp!.years;
    assert.equal(h.length, years.length);
    h.forEach((x, i) => {
      assert.equal(x.year, years[i].year);
      assert.equal(x.net, years[i].net, `${x.year}`);
      assert.ok(['ok', 'warn', 'tight'].includes(x.level));
      assert.ok(x.reasons.length > 0, `${x.year}: 理由がある`);
      // 判定は理由のいちばん重いものと同じ
      assert.equal(x.reasons[0].level, x.level);
    });
  });

  it('一時的な支出（頭金など）は月平均の余りに入れず、現金の減り方で見る', () => {
    const d = household();
    const h = health(d);
    const py = ymYear(d.plan.housing.purchaseYM!);
    const y = h.find((x) => x.year === py)!;
    assert.ok(y.once > 1_000_000, '購入の年は一時的な支出がある');
    assert.ok(y.surplus > 0, '月平均の余りは頭金で赤字にならない');
    assert.ok(y.cashMonths != null && y.cashMonths < h.find((x) => x.year === py - 1)!.cashMonths!, '現金は購入で減る');
  });

  it('収入が少ない世帯は「きつい」年が出て、その前に「きつくなり始め」がある', () => {
    const h = health(household({ children: 3, spouseNet: 0 }));
    const first = h.findIndex((x) => x.level === 'tight');
    assert.ok(first > 0, 'きつい年がある');
    assert.ok(h.slice(0, first).some((x) => x.level === 'warn'), 'その前に黄の年がある');
    assert.ok(h[first].reasons.some((r) => r.level === 'tight' && /赤字|現金|予備資金/.test(r.text)));
  });

  it('余裕のある世帯は、現役の多くの年が「ゆとり」', () => {
    const d = household();
    const h = health(d);
    const working = h.filter((x) => !x.retired);
    assert.ok(working.filter((x) => x.level === 'ok').length / working.length > 0.8);
  });

  it('ボーナスのない月が赤字の年は「きつくなり始め」（ボーナス頼み）', () => {
    const d = withPlan(household(), (p) => {
      p.self.netMonthly = 200_000;
      p.self.bonusNetAnnual = 2_400_000;
      p.spouse!.netMonthly = 150_000;
    });
    const h = health(d);
    const y = h.find((x) => x.noBonus != null && x.noBonus < 0 && x.surplus > 0)!;
    assert.ok(y, 'ボーナスのない月が赤字の年がある');
    assert.equal(y.level === 'ok', false);
    assert.ok(y.reasons.some((r) => r.text.includes('ボーナス頼み')));
  });

  it('老後は資産が持つかで判定し、尽きる年が近づくと黄 → 尽きると赤', () => {
    const d = withPlan(household(), (p) => {
      p.assumptions.retireLivingMonthly = 480_000;
    });
    const h = health(d);
    const old = h.filter((x) => x.retired);
    assert.ok(old.length > 10);
    const t = old.findIndex((x) => x.level === 'tight');
    assert.ok(t > 0, '資産が尽きる年がある');
    const before = old.slice(Math.max(0, t - HEALTH.warnRunway), t);
    assert.ok(before.some((x) => x.level === 'warn' && x.runway != null && x.runway < HEALTH.warnRunway), '尽きる前に黄の年がある');
    assert.ok(old.slice(0, Math.max(0, t - HEALTH.warnRunway - 1)).every((x) => x.level !== 'tight'));
  });

  it('退職の年は（給与が途中で止まっても）老後の判定にする', () => {
    const d = household();
    const c = computeAll(d);
    const h = yearHealth(c.fp!.sim, { reserveMonths: 3, retireAllYM: c.resolved.retireAllYM });
    const ry = ymYear(c.resolved.retireAllYM);
    assert.equal(h.find((x) => x.year === ry)!.retired, true);
    assert.equal(h.find((x) => x.year === ry - 1)!.retired, false);
  });

  it('予備資金の月数を増やすと、判定は厳しくなる（緑が減るか同じ）', () => {
    const c = computeAll(household({ children: 2 }));
    const a = yearHealth(c.fp!.sim, { reserveMonths: 3, retireAllYM: c.resolved.retireAllYM });
    const b = yearHealth(c.fp!.sim, { reserveMonths: 12, retireAllYM: c.resolved.retireAllYM });
    const ok = (l: typeof a) => l.filter((x) => x.level === 'ok').length;
    assert.ok(ok(b) <= ok(a));
  });

  it('同じ判定が続く期間', () => {
    const h = health(household({ children: 3, spouseNet: 0 }));
    const y = h.find((x) => x.level === 'tight')!.year;
    const sp = healthSpan(h, y)!;
    assert.ok(sp.from <= y && y <= sp.to);
    for (const x of h) if (x.year >= sp.from && x.year <= sp.to) assert.equal(x.level, 'tight');
    assert.equal(healthSpan(h, 1900), null);
  });
});
