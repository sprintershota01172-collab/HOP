import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { monthPie, toYears } from '../src/engine/aggregate';
import { uid } from '../src/engine/defaults';
import { goalStatus } from '../src/engine/goals';
import { computeAll } from '../src/engine/index';
import { EDU_MEXT, EDU_UNIV, LEAVE } from '../src/engine/reference';
import { makeContext, scenarios, tryLoan } from '../src/engine/recommend';
import { resolvePlan } from '../src/engine/resolve';
import { childAllowance, childMonth, incomeOf, simulate, spendOf } from '../src/engine/simulate';
import { toYM } from '../src/engine/ym';
import { BASE, household, withPlan } from './helpers';

/** 標準段階の予算（審査目安の上限を掛ける前の、人生設計だけで決まる額） */
const recTotal = (d: ReturnType<typeof household>) => computeAll(d).rec.tiers!.standard.total;
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe('世帯の形', () => {
  it('単身世帯: 計算でき、推奨額が出る', () => {
    const c = computeAll(household({ spouse: false, net: 350_000 }));
    assert.equal(c.resolved.ready, true);
    assert.ok(c.rec.loan > 0);
    assert.ok(c.rec.total < computeAll(household({ net: 350_000 })).rec.total);
  });

  it('共働きは片働き（配偶者の収入0）より推奨額が大きい', () => {
    const dual = recTotal(household());
    const single = recTotal(household({ spouseNet: 0 }));
    assert.ok(dual > single, `${dual} > ${single}`);
  });

  it('子供0人 > 1人 > 2人（同じ収入でも人生設計で推奨額が変わる）', () => {
    const c0 = recTotal(household({ children: 0 }));
    const c1 = recTotal(household({ children: 1 }));
    const c2 = recTotal(household({ children: 2 }));
    assert.ok(c0 > c1 && c1 > c2, `${c0} > ${c1} > ${c2}`);
  });

  it('必須入力が欠けると推奨額を出さない（未入力を確定値として扱わない）', () => {
    const d = withPlan(household(), (p) => {
      p.self.netMonthly = null;
    });
    const c = computeAll(d);
    assert.equal(c.resolved.ready, false);
    assert.ok(c.resolved.blocking.includes('本人の手取り月収'));
    assert.equal(c.rec.ready, false);
  });

  it('年金未入力は推計で補い、信頼度を下げて理由を示す', () => {
    const d = withPlan(household(), (p) => {
      p.self.pensionMonthly = null;
    });
    const a = computeAll(household()).resolved.confidence.score;
    const b = computeAll(d).resolved;
    assert.ok(b.confidence.score < a);
    assert.ok(b.assumed.some((x) => x.key === 'self-pension'));
  });
});

describe('働き方の変化', () => {
  it('育休: 給与0、給付は6か月まで67%・以降50%（手取り換算）', () => {
    const d = withPlan(household(), (p) => {
      p.work.push({ id: uid(), owner: 'spouse', type: 'leave', startYM: toYM(2028, 1), months: 12, endYM: null, ratio: 1, maternity: false, childId: null });
    });
    const r = resolvePlan(d.plan);
    const sim = simulate(r, null, scenarios(d.plan.assumptions).base);
    const row = (ym: number) => sim.rows[ym - r.start];
    const before = row(toYM(2027, 12));
    const m2 = row(toYM(2028, 2));
    const m8 = row(toYM(2028, 8));
    // 本人分の給与だけが残る
    assert.ok(m2.salary < before.salary);
    const spouseNet = 220_000 * Math.pow(1.01, 2); // 2027年4月, 2028年4月の昇給前後に注意して範囲で確認
    assert.ok(m2.benefit > 0);
    assert.ok(Math.abs(m2.benefit - (220_000 * 1.01 * LEAVE.leaveRateFirst) / LEAVE.netRatio) < 2);
    assert.ok(m8.benefit < m2.benefit);
    assert.ok(m8.benefit <= spouseNet);
    assert.equal(row(toYM(2029, 1)).benefit, 0);
  });

  it('時短: 給与は割合分、2歳未満の子がいれば10%の給付', () => {
    const d = withPlan(household({ children: 1 }), (p) => {
      p.work.push({ id: uid(), owner: 'spouse', type: 'short', startYM: toYM(2029, 1), months: 0, endYM: toYM(2031, 12), ratio: 0.5, maternity: false, childId: p.children[0].id });
    });
    const r = resolvePlan(d.plan);
    const sim = simulate(r, null, scenarios(d.plan.assumptions).base);
    const at = (ym: number) => sim.rows[ym - r.start];
    const noShort = simulate(resolvePlan(household({ children: 1 }).plan), null, scenarios(d.plan.assumptions).base).rows[toYM(2029, 2) - BASE];
    const s = at(toYM(2029, 2));
    const spouseFull = noShort.salary - s.salary; // 減った分 = 配偶者給与の半分
    assert.ok(spouseFull > 100_000 && spouseFull < 125_000, `${spouseFull}`);
    assert.ok(s.benefit > 0);
    // 子供が2歳になったら給付は終わる（2028年6月生まれ → 2030年6月）
    assert.equal(at(toYM(2030, 7)).benefit, 0);
  });

  it('退職: 退職月以降の給与は0、退職金は退職月に入る。年金は受給開始から', () => {
    const d = household({ spouse: false });
    const r = resolvePlan(d.plan);
    const sim = simulate(r, null, scenarios(d.plan.assumptions).base);
    const p = r.people[0];
    const at = (ym: number) => sim.rows[ym - r.start];
    assert.ok(at(p.retireYM - 1).salary > 0);
    assert.equal(at(p.retireYM).salary, 0);
    assert.equal(at(p.retireYM).retireBonus, 10_000_000);
    assert.equal(at(p.pensionYM - 1).pension, 0);
    assert.ok(at(p.pensionYM).pension > 0);
  });
});

describe('教育費', () => {
  it('生まれる前は0、大学費用は高3の2月の入学費用から', () => {
    const d = household({ children: 1 });
    const c = d.plan.children[0]; // 2028年6月生まれ → 小1は2035年4月、大1は2047年4月
    const living = d.plan.assumptions.childLiving;
    assert.equal(childMonth(c, toYM(2028, 5), living).edu, 0);
    near(childMonth(c, toYM(2035, 3), living).edu, (EDU_MEXT.kinder.public.school + EDU_MEXT.kinder.public.outside) / 12);
    near(childMonth(c, toYM(2035, 4), living).edu, (EDU_MEXT.elem.public.school + EDU_MEXT.elem.public.outside) / 12);
    near(childMonth(c, toYM(2047, 2), living).edu, (EDU_MEXT.high.public.school + EDU_MEXT.high.public.outside) / 12 + EDU_UNIV.national.entrance);
    near(childMonth(c, toYM(2047, 4), living).edu, EDU_UNIV.national.annual / 12);
    assert.equal(childMonth(c, toYM(2051, 4), living).edu, 0);
  });

  it('早生まれ（1〜3月生まれ）は同じ年の4月生まれより1年早く入学', () => {
    const d = household({ children: 1 });
    const living = d.plan.assumptions.childLiving;
    const jan = { ...d.plan.children[0], birthYM: toYM(2029, 1) };
    const apr = { ...d.plan.children[0], birthYM: toYM(2029, 4) };
    const elem = (EDU_MEXT.elem.public.school + EDU_MEXT.elem.public.outside) / 12;
    near(childMonth(jan, toYM(2035, 4), living).edu, elem);
    assert.ok(Math.abs(childMonth(apr, toYM(2035, 4), living).edu - elem) > 1);
    near(childMonth(apr, toYM(2036, 4), living).edu, elem);
  });

  it('教育費が増える（私立）と推奨額は下がる', () => {
    const pub = recTotal(household({ children: 1 }));
    const priv = recTotal(
      withPlan(household({ children: 1 }), (p) => {
        Object.assign(p.children[0], { elem: 'private', middle: 'private', high: 'private', univ: 'privateSci' });
      }),
    );
    assert.ok(priv < pub, `${priv} < ${pub}`);
  });

  it('児童手当: 3歳未満1.5万、3歳以上1万、第3子以降3万、18歳年度末で終了', () => {
    const d = household({ children: 3 }); // 2028/6, 2030/6, 2032/6
    const ch = d.plan.children;
    assert.equal(childAllowance(ch, toYM(2028, 7)), 15_000);
    assert.equal(childAllowance(ch, toYM(2031, 7)), 10_000 + 15_000);
    assert.equal(childAllowance(ch, toYM(2032, 7)), 10_000 + 15_000 + 30_000);
    // 第1子: 18歳到達後の最初の3月 = 2047年3月まで
    assert.ok(childAllowance([ch[0]], toYM(2047, 3)) > 0);
    assert.equal(childAllowance([ch[0]], toYM(2047, 4)), 0);
  });
});

describe('住宅費の切り替え（家賃とローンの重複防止）', () => {
  it('購入後は家賃が消え、移行期間（1か月）だけ重なる', () => {
    const d = household();
    const r = resolvePlan(d.plan);
    const ctx = makeContext(r);
    const t = tryLoan(ctx, 30_000_000, 'standard', ctx.sc.base);
    const p = r.purchaseYM - r.start;
    const rows = t.sim.rows;
    assert.ok(rows[p - 1].housing >= 90_000); // 購入前: 家賃
    assert.ok(rows[p].housing >= 90_000); // 購入月: 家賃（移行期間）
    assert.equal(rows[p].loanPayment, 0);
    const after = rows[p + 2];
    assert.ok(after.loanPayment > 0);
    // 購入後の住宅費 = ローン + 税・保険・修繕など（家賃は含まない）
    const upkeep = after.housing - after.loanPayment;
    assert.ok(upkeep > 0 && upkeep < 90_000, `${upkeep}`);
  });

  it('移行期間0か月なら購入月から家賃は0', () => {
    const d = withPlan(household(), (p) => {
      p.housing.overlapMonths = 0;
    });
    const r = resolvePlan(d.plan);
    const ctx = makeContext(r);
    const t = tryLoan(ctx, 30_000_000, 'standard', ctx.sc.base);
    const p = r.purchaseYM - r.start;
    assert.ok(t.sim.rows[p].housing < 90_000);
  });
});

describe('お金の流れの整合性', () => {
  const d = withPlan(household({ children: 2 }), (p) => {
    p.investments.push({ id: uid(), name: 'NISA', kind: 'nisaTsumitate', owner: 'self', balance: 2_000_000, basis: 1_500_000, monthly: 50_000, startYM: null, endYM: null, withdrawStartYM: toYM(2060, 1), withdrawMonthly: 100_000 });
    p.investments.push({ id: uid(), name: '特定口座', kind: 'taxable', owner: 'spouse', balance: 1_000_000, basis: 800_000, monthly: 10_000, startYM: null, endYM: toYM(2050, 12), withdrawStartYM: null, withdrawMonthly: 0 });
  });
  const r = resolvePlan(d.plan);
  const ctx = makeContext(r);
  const t = tryLoan(ctx, 35_000_000, 'standard', ctx.sc.base);
  const rows = t.sim.rows;

  it('現金の増減 = 収入 − 支出 − 積立（投資・目的別） + 取崩し − 税（毎月、円単位で一致）', () => {
    let prev = 4_000_000 + 1_000_000;
    for (const row of rows) {
      const expected = prev + incomeOf(row) - spendOf(row) - row.contrib - row.fundIn + row.withdraw + row.autoWithdraw - row.invTax;
      assert.equal(row.cash, expected, `ym ${row.ym}`);
      prev = row.cash;
    }
  });

  it('投資残高の増減 = 積立 + 運用益 − 取崩し（積立の二重計上なし）', () => {
    let prev = 3_000_000;
    for (const row of rows) {
      assert.equal(row.invest, prev + row.contrib + row.gain - row.withdraw - row.autoWithdraw, `ym ${row.ym}`);
      prev = row.invest;
    }
  });

  it('年次表は月次の合計と一致する', () => {
    const years = toYears(t.sim);
    const sumIncome = rows.reduce((s, x) => s + incomeOf(x), 0);
    const sumSpend = rows.reduce((s, x) => s + spendOf(x), 0);
    assert.equal(years.reduce((s, y) => s + y.income, 0), sumIncome);
    assert.equal(years.reduce((s, y) => s + y.spend, 0), sumSpend);
    assert.equal(years.reduce((s, y) => s + y.months, 0), rows.length);
    assert.equal(years[years.length - 1].cashEnd, rows[rows.length - 1].cash);
  });

  it('円グラフの内訳の合計は月平均の収入と一致する', () => {
    for (const y of toYears(t.sim)) {
      const pie = monthPie(y);
      assert.equal(pie.slices.reduce((s, x) => s + x.value, 0), pie.income);
    }
  });

  it('現金不足を投資の売却で勝手に補わない（現役中の補填は設定がオフ）', () => {
    const poor = withPlan(d, (p) => {
      p.living.push({ id: uid(), name: '大きな支出', icon: 'dots', monthly: 400_000, kind: 'fixed' });
    });
    const rr = resolvePlan(poor.plan);
    const sim = simulate(rr, null, scenarios(poor.plan.assumptions).base);
    const pre = sim.rows.filter((x) => x.ym < rr.retireAllYM);
    assert.ok(pre.some((x) => x.cash < 0));
    assert.ok(pre.every((x) => x.autoWithdraw === 0));
    assert.ok(sim.warnings.some((w) => w.code === 'cashShort'));
  });

  it('NISAのつみたて投資枠は年120万円を超えて積み立てない', () => {
    const big = withPlan(household(), (p) => {
      p.investments.push({ id: uid(), name: 'NISA', kind: 'nisaTsumitate', owner: 'self', balance: 0, basis: 0, monthly: 150_000, startYM: null, endYM: null, withdrawStartYM: null, withdrawMonthly: 0 });
    });
    const rr = resolvePlan(big.plan);
    const sim = simulate(rr, null, scenarios(big.plan.assumptions).base);
    const y2028 = sim.rows.filter((x) => x.ym >= toYM(2028, 1) && x.ym <= toYM(2028, 12)).reduce((s, x) => s + x.contrib, 0);
    assert.equal(y2028, 1_200_000);
    assert.ok(sim.warnings.some((w) => w.code === 'nisaAnnual'));
  });
});

describe('推奨額', () => {
  const d = withPlan(household({ children: 1 }), (p) => {
    p.housing.loan.borrower = 'pair';
  });
  const c = computeAll(d);

  it('安心 ≤ 標準 ≤ 注意 の順に予算が大きい', () => {
    const t = c.rec.tiers!;
    assert.ok(t.safe.total <= t.standard.total && t.standard.total <= t.caution.total);
  });

  it('目指す予算の借入額は審査の目安を超えない（家計上の借入目安とは別に表示）', () => {
    assert.ok(c.rec.final.loan <= c.rec.bank!.amount);
    assert.ok(c.rec.final.loan <= c.rec.loan);
  });

  it('審査目安が不合理に小さくならない（世帯額面940万円・35年）', () => {
    assert.ok(c.rec.bank!.amount >= 50_000_000, `${c.rec.bank!.amount}`);
  });

  it('推奨額の境目: 1万円多く借りると標準条件を満たさない（根拠が示される）', () => {
    const std = c.rec.tiers!.standard;
    if (std.maxLoan < 300_000_000) {
      assert.ok(std.binding);
      assert.ok(std.binding!.driver.length > 0);
    }
  });

  it('同じ入力なら結果は同じ（表示年などの画面状態に依存しない）', () => {
    const again = computeAll(d);
    assert.equal(again.rec.total, c.rec.total);
    assert.equal(again.rec.loan, c.rec.loan);
  });

  it('購入時期を変えると推奨額は再計算される', () => {
    const later = withPlan(d, (p) => {
      p.housing.purchaseYM = toYM(2030, 4);
    });
    assert.notEqual(recTotal(later), recTotal(d));
  });

  it('達成できる貯蓄目標は推奨額を変えない（支出として二重計上しない）', () => {
    const g = withPlan(d, (p) => {
      p.goals.push({ id: uid(), name: '旅行', target: 3_000_000, ym: toYM(2031, 10) });
    });
    const cg = computeAll(g);
    assert.equal(cg.rec.total, c.rec.total);
    const st = goalStatus(g.plan.goals, cg.fp!.sim);
    assert.equal(st[0].monthsLeft, 60);
    assert.equal(st[0].requiredMonthly, 50_000);
    const bigger = goalStatus([{ ...g.plan.goals[0], target: 900_000_000 }], cg.fp!.sim);
    assert.equal(bigger[0].achieved, false);
    assert.ok(bigger[0].shortfall > 0);
  });

  it('収入を増やすと推奨額は増える（入力が計算に反映される）', () => {
    const rich = withPlan(d, (p) => {
      p.self.netMonthly = 400_000;
    });
    assert.ok(recTotal(rich) > recTotal(d));
  });

  it('生活費が収入を大きく上回ると、推奨額は0で理由が示される', () => {
    const poor = withPlan(d, (p) => {
      p.living.push({ id: uid(), name: '大きな支出', icon: 'dots', monthly: 500_000, kind: 'fixed' });
    });
    const cp = computeAll(poor);
    assert.equal(cp.rec.loan, 0);
    assert.ok(cp.rec.tiers!.standard.zeroFail);
  });

  it('結果が突然0円にならない（標準的な世帯で主要な数値が正）', () => {
    const m = c.rec.metrics!;
    assert.ok(c.rec.total > 10_000_000);
    assert.ok(m.monthlyHousing > 0 && m.loanMonthly > 0 && m.savingsNow > 0);
  });

  it('住宅ローン控除は初期設定では計算に含めず、有効にすると翌年3月に入る', () => {
    const r = resolvePlan(d.plan);
    const ctx = makeContext(r);
    const off = tryLoan(ctx, 30_000_000, 'standard', ctx.sc.base).sim.rows.reduce((s, x) => s + x.deduction, 0);
    assert.equal(off, 0);
    const on = withPlan(d, (p) => {
      p.housing.deduction.enabled = true;
      p.housing.deduction.energy = 'zeh';
    });
    const r2 = resolvePlan(on.plan);
    const ctx2 = makeContext(r2);
    const rows = tryLoan(ctx2, 30_000_000, 'standard', ctx2.sc.base).sim.rows;
    const march = rows.find((x) => x.ym === toYM(2028, 3))!;
    assert.ok(march.deduction > 0 && march.deduction <= 30_000_000 * 0.007);
    assert.equal(rows.filter((x) => x.deduction > 0).length, 13);
  });
});
