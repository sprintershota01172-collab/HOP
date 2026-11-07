// 給与の推移（昇給が止まる年齢）・育休のカット率・働き方の表示
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { monthPies } from '../src/engine/aggregate';
import { uid } from '../src/engine/defaults';
import { computeAll } from '../src/engine/index';
import { resolvePlan } from '../src/engine/resolve';
import { baseIncome, raiseFactor, wageSeries } from '../src/engine/simulate';
import { toYM } from '../src/engine/ym';
import { household, withPlan } from './helpers';

describe('給与の推移（給与勾配）', () => {
  const person = { raise: 0.02, raiseUntilAge: null as number | null, raiseAfter: 0, birthYM: toYM(1996, 5) };
  it('昇給が止まる年齢がなければ、毎年4月に昇給率で増える', () => {
    assert.equal(raiseFactor(person, toYM(2026, 10), toYM(2031, 10)), Math.pow(1.02, 5));
  });
  it('昇給が止まる年齢の後は横ばい、または毎年の変化率で変わる', () => {
    const p = { ...person, raiseUntilAge: 35 }; // 2031年5月に35歳、2032年5月に36歳
    const f = raiseFactor(p, toYM(2026, 10), toYM(2040, 10));
    assert.equal(f, Math.pow(1.02, 6), '2027〜2032年の4月（35歳の間の4月まで）昇給し、その後は横ばい');
    const down = raiseFactor({ ...p, raiseAfter: -0.01 }, toYM(2026, 10), toYM(2040, 10));
    assert.ok(Math.abs(down - Math.pow(1.02, 6) * Math.pow(0.99, 8)) < 1e-9, '2033〜2040年の4月は1%ずつ下がる');
  });
  it('夫と妻で別々の昇給率・止まる年齢を設定できる', () => {
    const d = withPlan(household(), (p) => {
      p.self.raiseRate = 0.03;
      p.self.raiseUntilAge = 50;
      p.spouse!.raiseRate = 0.01;
      p.spouse!.raiseAfter = null;
    });
    const r = resolvePlan(d.plan);
    const [self, spouse] = r.people;
    const at = (q: typeof self, y: number) => baseIncome(r, q, toYM(y, 6)).net;
    assert.ok(at(self, 2040) / at(self, 2030) > 1.3, '本人は年3%で上がる');
    assert.ok(Math.abs(at(self, 2060) - at(self, 2047)) < 1, '本人は50歳の間の4月（2047年4月）の後は横ばい');
    assert.ok(at(self, 2047) > at(self, 2046), '2047年4月（50歳）は昇給');
    assert.ok(Math.abs(at(spouse, 2040) / at(spouse, 2030) - Math.pow(1.01, 10)) < 1e-9, '配偶者は年1%');
  });
});

describe('育休・時短のカット率と期間', () => {
  const base = () =>
    withPlan(household({ children: 1 }), (p) => {
      const c = p.children[0];
      p.work = [
        { id: uid('work'), owner: 'spouse', type: 'leave', startYM: c.birthYM, months: 10, endYM: null, ratio: 1, maternity: false, childId: c.id },
        { id: uid('work'), owner: 'spouse', type: 'short', startYM: c.birthYM + 10, months: 0, endYM: c.birthYM + 33, ratio: 0.5, maternity: false, childId: c.id },
      ];
    });
  it('育休のカット率を決めると、期間を通して手取りのその割合を受け取る（決めなければ法定の給付）', () => {
    const d = withPlan(base(), (p) => void (p.work[0].payRate = 0.7));
    const r = resolvePlan(d.plan);
    const sp = r.people.find((x) => x.id === 'spouse')!;
    const s = wageSeries(r, sp);
    const birth = d.plan.children[0].birthYM;
    for (const k of [0, 5, 9]) {
      const w = s[birth + k - r.start];
      assert.equal(w.state, 'leave');
      assert.equal(w.salary, 0);
      assert.ok(Math.abs(w.benefit - w.base * 0.7) < 1e-6, `${k}か月目: 手取りの70%`);
    }
    const auto = wageSeries(resolvePlan(base().plan), sp);
    const a0 = auto[birth - r.start], a8 = auto[birth + 8 - r.start];
    assert.ok(a0.benefit / a0.base > 0.8, '法定: 最初の6か月は手取りの約8割');
    assert.ok(a8.benefit / a8.base < 0.7, '法定: 7か月目以降は下がる');
  });
  it('時短は給与の割合（カット率）で減り、終わりの月の翌月からフルタイムに戻る', () => {
    const d = base();
    const r = resolvePlan(d.plan);
    const sp = r.people.find((x) => x.id === 'spouse')!;
    const s = wageSeries(r, sp);
    const birth = d.plan.children[0].birthYM;
    const sh = s[birth + 20 - r.start];
    assert.equal(sh.state, 'short');
    assert.ok(Math.abs(sh.salary - sh.base * 0.5) < 1e-6, '50%カット');
    assert.equal(s[birth + 33 - r.start].state, 'short', '終わりの月まで時短');
    assert.equal(s[birth + 34 - r.start].state, 'full', '翌月からフルタイム');
  });
  it('月の収支に、人ごとの働き方（育休・時短の月数とカット率）が出る。時短の給与はカット率つきの別の行', () => {
    const d = base();
    const c = computeAll(d);
    const all = monthPies(c.fp!.sim, c.fp!.years);
    const birthY = Math.floor(d.plan.children[0].birthYM / 12);
    const yi = c.fp!.years.findIndex((y) => y.year === birthY + 1);
    const avg = all[yi].find((x) => x.kind === 'avg')!;
    const w = avg.work.spouse!;
    assert.equal(w.months, 12);
    assert.equal(w.leave + w.short + w.full, 12);
    assert.ok(w.short > 0 && Math.abs(w.shortCut - 0.5) < 1e-9, '時短 50%カット');
    assert.equal(avg.work.self!.full, 12, '本人はフルタイム');
    assert.ok(avg.detail.income.some((r) => r.label === '配偶者の給与（時短・50%カット）' && r.owner === 'spouse'));
    const later = all[c.fp!.years.findIndex((y) => y.year === birthY + 4)].find((x) => x.kind === 'avg')!;
    assert.equal(later.work.spouse!.full, 12, '時短が終わった後はフルタイム');
  });
});
