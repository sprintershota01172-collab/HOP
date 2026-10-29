// 住宅購入予算（① 返済余力 → ② 借入目安 → ③ 購入予算）の検証
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { uid } from '../src/engine/defaults';
import { breakdown, levers, scenarioChecks } from '../src/engine/explain';
import { computeAll } from '../src/engine/index';
import { annuityPayment } from '../src/engine/loan';
import { makeContext, tryLoan } from '../src/engine/recommend';
import { resolvePlan } from '../src/engine/resolve';
import { simulate } from '../src/engine/simulate';
import { parseMoney } from '../src/engine/text';
import type { AppData } from '../src/engine/types';
import { toYM } from '../src/engine/ym';
import { household, withPlan } from './helpers';

const pair = (o: Parameters<typeof household>[0] = {}) =>
  withPlan(household(o), (p) => {
    p.housing.loan.borrower = 'pair';
  });
const std = (d: AppData) => computeAll(d).rec.tiers!.standard;
const signed = (b: NonNullable<ReturnType<typeof breakdown>>) => b.lines.reduce((s, l) => s + (l.op === '+' ? l.value : -l.value), 0);

describe('通常のケース（共働き・子供1人）', () => {
  const d = pair({ children: 1 });
  const c = computeAll(d);
  const rec = c.rec;
  const t = rec.ctx!.terms;

  it('① 返済余力 → ② 借入目安 → ③ 購入予算 がそろって正の値になる', () => {
    assert.ok(rec.payment > 50_000, `① ${rec.payment}`);
    assert.ok(rec.loan > 20_000_000, `② ${rec.loan}`);
    assert.ok(rec.total >= rec.loan, `③ ${rec.total} ≥ ② ${rec.loan}`);
  });

  it('② は ① を金利・返済期間で逆算した額（元利均等の初回返済が ① と一致）', () => {
    const monthlyPart = rec.loan * (1 - t.bonusShare);
    const expected = annuityPayment(monthlyPart, t.rate / 12, t.years * 12);
    assert.ok(Math.abs(rec.payment - expected) <= 1, `${rec.payment} ≈ ${expected}`);
  });

  it('③ = ② + 充当する自己資金 = 物件価格 + 諸費用', () => {
    assert.equal(rec.total, rec.loan + rec.down);
    const b = breakdown(rec)!;
    assert.equal(b.price + b.misc, b.total);
  });

  it('計算の内訳: 収入 − 支出 − 積立 − 将来への備え の合計が、返済余力（期間平均）と円単位で一致する', () => {
    const b = breakdown(rec)!;
    assert.ok(b.months > 0);
    assert.ok(Math.abs(signed(b) - b.payment) < 0.5, `${signed(b)} vs ${b.payment}`);
    assert.ok(b.lines.some((l) => l.key === 'income' && l.sheet === 'income'), '収入の行から収入の入力を開ける');
    assert.ok(b.lines.some((l) => l.key === 'upkeep'), '住宅維持費は返済余力とは別に差し引く');
    assert.ok(b.limit && b.limit.text.length > 0, '最も制限している要因が示される');
  });

  it('実際に目指す予算は、家計上の借入目安と審査の目安の小さい方', () => {
    assert.equal(rec.final.loan, Math.min(rec.loan, rec.bank!.amount));
    assert.equal(rec.overBank, rec.loan > rec.bank!.amount);
  });

  it('購入後は家賃を払わない（重複期間の後は家賃0、ローンと家賃を二重に数えない）', () => {
    const sim = rec.hhSim!;
    const after = sim.rows.slice(sim.pIndex + 1 + d.plan.housing.overlapMonths);
    assert.ok(after.length > 0);
    assert.ok(after.every((x) => x.rent === 0));
  });

  it('条件の変化を検証できる（金利上昇・収入減・育休・教育費）', () => {
    const keys = scenarioChecks(rec).map((x) => x.key);
    for (const k of ['base', 'rate1', 'income10', 'rate2', 'edu', 'leave']) assert.ok(keys.includes(k), k);
    const base = scenarioChecks(rec).find((x) => x.key === 'base')!;
    assert.equal(base.ok, true, '推奨額は想定どおりなら破綻しない');
  });

  it('どの入力を変えると予算が動くか: 生活費を減らす・手取りを増やすと借入目安は増え、購入を遅らせると変わる', () => {
    const lv = levers(rec);
    const by = (k: string) => lv.find((x) => x.key === k)!;
    assert.ok(by('living').deltaLoan > 0, `living ${by('living').deltaLoan}`);
    assert.ok(by('income').deltaLoan > 0, `income ${by('income').deltaLoan}`);
    assert.ok(by('gift').deltaTotal > 0, `gift ${by('gift').deltaTotal}`);
    assert.ok(lv.every((x) => x.sheet.length > 0), 'どの入力を開けばよいかが示される');
  });
});

describe('住宅に回せる余力がない', () => {
  const d = withPlan(pair({ children: 1 }), (p) => {
    p.living.push({ id: uid(), name: '大きな支出', icon: 'dots', monthly: 600_000, kind: 'fixed' });
  });
  const rec = computeAll(d).rec;
  it('① ② ③ はすべて0で、理由（いつ・何が足りないか）が示される', () => {
    assert.equal(rec.loan, 0);
    assert.equal(rec.total, 0);
    assert.equal(rec.final.total, 0);
    assert.ok(rec.tiers!.standard.zeroFail);
    const b = breakdown(rec)!;
    assert.ok(b.limit);
    assert.ok(b.limit!.text.includes('年'));
  });
});

describe('金利0%', () => {
  const d0 = withPlan(pair(), (p) => {
    p.housing.loan.rateType = 'fixed';
    p.housing.loan.rate = 0;
    p.housing.loan.bonusShare = 0;
  });
  const d1 = withPlan(d0, (p) => {
    p.housing.loan.rate = 0.01;
  });
  const r0 = computeAll(d0).rec;
  const r1 = computeAll(d1).rec;
  it('毎月の返済 = 借入額 ÷ 回数（利息0）', () => {
    const n = r0.ctx!.terms.years * 12;
    assert.ok(Math.abs(r0.payment - r0.loan / n) <= 1, `${r0.payment} vs ${r0.loan / n}`);
    const b = breakdown(r0)!;
    assert.equal(Math.round(b.interest), 0);
  });
  it('同じ家計なら、金利0%のほうが借入目安は大きい', () => {
    assert.ok(r0.loan > r1.loan, `${r0.loan} > ${r1.loan}`);
  });
});

describe('頭金0', () => {
  const d = withPlan(pair(), (p) => {
    p.housing.downMode = 'manual';
    p.housing.downPayment = 0;
  });
  const rec = computeAll(d).rec;
  it('自己資金0なら ③ 購入予算 = ② 借入目安（諸費用も借入で払う）', () => {
    assert.equal(rec.down, 0);
    assert.equal(rec.total, rec.loan);
    assert.ok(rec.loan > 0);
  });
  it('頭金を入れても、借入目安（毎月の返済から決まる額）はほぼ変わらず、購入予算が増える', () => {
    const withDown = computeAll(withPlan(d, (p) => void (p.housing.downPayment = 3_000_000))).rec;
    assert.equal(withDown.down, 3_000_000);
    assert.ok(withDown.total > rec.total);
  });
});

describe('育休による収入減', () => {
  const base = pair({ children: 1 });
  const child = base.plan.children[0];
  const leave = withPlan(base, (p) => {
    p.work.push({ id: uid(), owner: 'spouse', type: 'leave', startYM: child.birthYM, months: 24, endYM: null, ratio: 1, maternity: true, childId: child.id });
  });
  it('育休を入れると、その期間の収入が減り、借入目安は下がる（または同じ）', () => {
    const a = std(base);
    const b = std(leave);
    assert.ok(b.maxLoan <= a.maxLoan, `${b.maxLoan} ≤ ${a.maxLoan}`);
    const sa = simulate(resolvePlan(base.plan), null, makeContext(resolvePlan(base.plan)).sc.base);
    const sb = simulate(resolvePlan(leave.plan), null, makeContext(resolvePlan(leave.plan)).sc.base);
    const i = child.birthYM + 6 - sa.rows[0].ym;
    assert.ok(sb.rows[i].salary + sb.rows[i].benefit < sa.rows[i].salary + sa.rows[i].benefit);
  });
  it('長い育休（2年）は、短い育休（6か月）より借入目安が小さい（または同じ）', () => {
    const short = withPlan(leave, (p) => void (p.work[0].months = 6));
    assert.ok(std(leave).maxLoan <= std(short).maxLoan);
  });
});

describe('教育費の時期', () => {
  const d = pair({ children: 1 });
  it('子供の誕生（教育費の時期）を変えると予算は再計算される', () => {
    const later = withPlan(d, (p) => void (p.children[0].birthYM += 60));
    assert.notEqual(std(later).maxLoan, std(d).maxLoan);
  });
  it('大学の入学費用（一時金）は、その月に一度だけ支出され、予備資金の基準（毎月の支出）を膨らませない', () => {
    const r = resolvePlan(d.plan);
    const ctx = makeContext(r);
    const t = tryLoan(ctx, 30_000_000, 'standard', ctx.sc.base);
    const lump = t.sim.rows.filter((x) => x.educationOnce > 0);
    assert.ok(lump.length >= 1, '入学費用の月がある');
    for (const x of lump) {
      const need = x.living + (x.housing - x.loanBonus) + (x.education - x.educationOnce) + x.insurance + x.debt;
      assert.ok(Math.abs(x.need - need) < 1);
      assert.ok(x.need < x.education + x.living, '一時金が毎月の支出の基準に入っていない');
    }
  });
  it('私立（教育費の増加）にすると借入目安は下がる', () => {
    const priv = withPlan(d, (p) => {
      p.children[0].high = 'private';
      p.children[0].univ = 'privateSci';
    });
    assert.ok(std(priv).maxLoan < std(d).maxLoan);
  });
});

describe('貯蓄目標', () => {
  const d = pair({ children: 1 });
  it('達成できる目標は予算を変えない（支出として二重に差し引かない）', () => {
    const g = withPlan(d, (p) => void p.goals.push({ id: uid(), name: '旅行', target: 1_000_000, ym: toYM(2031, 10) }));
    assert.equal(std(g).maxLoan, std(d).maxLoan);
  });
  it('届かない目標があると、その目標を守れる額まで予算が下がり、理由に目標が示される', () => {
    const g = withPlan(d, (p) => void p.goals.push({ id: uid(), name: '車の買い替え', target: 12_000_000, ym: toYM(2032, 4) }));
    const s = std(g);
    assert.ok(s.maxLoan < std(d).maxLoan, `${s.maxLoan} < ${std(d).maxLoan}`);
    assert.equal((s.ok ? s.binding : s.zeroFail)?.kind, 'goal');
  });
});

describe('入力の単位', () => {
  it('金額は万円で入力し、単位を付ければその単位で読む', () => {
    assert.equal(parseMoney('35'), 350_000);
    assert.equal(parseMoney('35.5'), 355_000);
    assert.equal(parseMoney('８万'), 80_000);
    assert.equal(parseMoney('80,000円'), 80_000);
    assert.equal(parseMoney('1億2000万'), 120_000_000);
    assert.equal(parseMoney('３５'), 350_000);
  });
  it('未入力（null）と0円を区別する', () => {
    assert.equal(parseMoney(''), null);
    assert.equal(parseMoney('  '), null);
    assert.equal(parseMoney('0'), 0);
    assert.equal(parseMoney('abc'), null);
  });
});
