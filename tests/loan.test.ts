import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { annuityPayment, buildSchedule, principalFromPayment, ratePath } from '../src/engine/loan';

const fixed = (r: number) => () => r;

/** 検算用: 端数処理をしない独立した実装（浮動小数で残高を追う） */
function referenceAnnuity(P: number, annual: number, n: number) {
  const r = annual / 12;
  const pay = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
  let bal = P;
  let interest = 0;
  for (let k = 0; k < n; k++) {
    const i = bal * r;
    interest += i;
    bal -= pay - i;
  }
  return { pay, interest, endBalance: bal };
}

describe('住宅ローン 返済予定表', () => {
  it('借入額0円: すべて0', () => {
    const s = buildSchedule({ principal: 0, months: 420, method: 'annuity', bonusShare: 0, rateAt: fixed(0.01) });
    assert.equal(s.totalPayment, 0);
    assert.equal(s.totalInterest, 0);
    assert.equal(s.firstMonthly, 0);
  });

  it('金利0%: 毎月 = 元金 ÷ 回数、利息0、総返済 = 元金', () => {
    const s = buildSchedule({ principal: 42_000_000, months: 420, method: 'annuity', bonusShare: 0, rateAt: fixed(0) });
    assert.equal(s.firstMonthly, 100_000);
    assert.equal(s.totalInterest, 0);
    assert.equal(s.totalPayment, 42_000_000);
    assert.equal(s.balance[419], 0);
  });

  it('一般的な金利（3,000万円・1%・35年）: 毎月84,686円で、独立計算と一致', () => {
    const s = buildSchedule({ principal: 30_000_000, months: 420, method: 'annuity', bonusShare: 0, rateAt: fixed(0.01) });
    const ref = referenceAnnuity(30_000_000, 0.01, 420);
    assert.equal(s.firstMonthly, 84_686);
    assert.equal(Math.round(ref.pay), 84_686);
    assert.equal(s.totalPrincipal, 30_000_000);
    assert.equal(s.balance[419], 0);
    assert.equal(s.totalPayment, s.totalPrincipal + s.totalInterest);
    // 1円未満切り捨て420回分の差だけ許容
    assert.ok(Math.abs(s.totalInterest - ref.interest) < 420 + 100, `${s.totalInterest} vs ${ref.interest}`);
  });

  it('高金利（5,000万円・8%・35年）: 利息が元金を上回り、残高は0で終わる', () => {
    const s = buildSchedule({ principal: 50_000_000, months: 420, method: 'annuity', bonusShare: 0, rateAt: fixed(0.08) });
    const ref = referenceAnnuity(50_000_000, 0.08, 420);
    assert.equal(s.firstMonthly, Math.round(ref.pay));
    assert.ok(s.totalInterest > 50_000_000);
    assert.equal(s.balance[419], 0);
    assert.ok(Math.abs(s.totalInterest - ref.interest) < 1000);
  });

  it('返済期間の変更: 短いほど毎月は増え、総利息は減る', () => {
    const a = buildSchedule({ principal: 30_000_000, months: 240, method: 'annuity', bonusShare: 0, rateAt: fixed(0.015) });
    const b = buildSchedule({ principal: 30_000_000, months: 420, method: 'annuity', bonusShare: 0, rateAt: fixed(0.015) });
    assert.ok(a.firstMonthly > b.firstMonthly);
    assert.ok(a.totalInterest < b.totalInterest);
  });

  it('元金均等: 初回 = 元金/回数 + 初月利息、返済額は減っていき、総利息は理論値と一致', () => {
    const P = 36_000_000;
    const n = 360;
    const r = 0.012;
    const s = buildSchedule({ principal: P, months: n, method: 'equalPrincipal', bonusShare: 0, rateAt: fixed(r) });
    assert.equal(s.firstMonthly, P / n + Math.floor((P * r) / 12));
    assert.ok(s.monthly[100] < s.monthly[0]);
    assert.ok(s.monthly[359] < s.monthly[100]);
    const theory = ((P * r) / 12) * ((n + 1) / 2);
    assert.ok(Math.abs(s.totalInterest - theory) <= n, `${s.totalInterest} vs ${theory}`);
    assert.equal(s.totalPrincipal, P);
    // 元利均等より総利息が少ない
    const eq = buildSchedule({ principal: P, months: n, method: 'annuity', bonusShare: 0, rateAt: fixed(r) });
    assert.ok(s.totalInterest < eq.totalInterest);
  });

  it('ボーナス返済: 毎月部分とボーナス部分に分かれ、元金合計は借入額と一致', () => {
    const P = 40_000_000;
    const s = buildSchedule({ principal: P, months: 420, method: 'annuity', bonusShare: 0.4, rateAt: fixed(0.012) });
    assert.equal(s.firstMonthly, Math.round(annuityPayment(P * 0.6, 0.012 / 12, 420)));
    assert.equal(s.bonus[0], 0);
    assert.equal(s.bonus[5], Math.round(annuityPayment(P * 0.4, 0.012 / 2, 70)));
    assert.equal(s.bonus.filter((v) => v > 0).length, 70);
    assert.equal(s.totalPrincipal, P);
    assert.equal(s.balance[419], 0);
  });

  it('変動金利の上昇: 12か月ごとに返済額が見直され、完済する', () => {
    const path = ratePath('variable', 0.01, { stressDelta: 0.02, rampMonths: 60 });
    const s = buildSchedule({ principal: 30_000_000, months: 420, method: 'annuity', bonusShare: 0, rateAt: path });
    assert.equal(s.monthly[0], s.monthly[11]);
    assert.ok(s.monthly[12] > s.monthly[11]);
    assert.ok(s.monthly[72] > s.monthly[12]);
    assert.equal(s.balance[419], 0);
    assert.equal(s.totalPrincipal, 30_000_000);
    const flat = buildSchedule({ principal: 30_000_000, months: 420, method: 'annuity', bonusShare: 0, rateAt: fixed(0.01) });
    assert.ok(s.totalInterest > flat.totalInterest);
  });

  it('固定期間選択型: 固定期間の終了時に返済額が切り替わる', () => {
    const path = ratePath('fixedPeriod', 0.015, { fixedYears: 10, afterRate: 0.025 });
    const s = buildSchedule({ principal: 30_000_000, months: 420, method: 'annuity', bonusShare: 0, rateAt: path });
    assert.equal(s.monthly[0], s.monthly[119]);
    assert.ok(s.monthly[120] > s.monthly[119]);
    assert.equal(s.balance[419], 0);
  });

  it('全期間固定は上昇シナリオの影響を受けない', () => {
    const path = ratePath('fixed', 0.0383, { stressDelta: 0.02 });
    assert.equal(path(1), 0.0383);
    assert.equal(path(400), 0.0383);
  });

  it('返済額からの逆算は元の借入額に戻る', () => {
    const pay = annuityPayment(30_000_000, 0.035 / 12, 420);
    assert.ok(Math.abs(principalFromPayment(pay, 0.035 / 12, 420) - 30_000_000) < 1);
    assert.equal(principalFromPayment(100_000, 0, 420), 42_000_000);
  });
});

describe('ボーナス払い（ボーナス併用払い）', () => {
  const base = { principal: 30_000_000, months: 420, method: 'annuity' as const, rateAt: fixed(0.01) };

  it('6・12月を指定すると、借入月に関係なくその月にボーナス返済する', () => {
    // 3月に借入 → 1回目は4月。6月は3回目、12月は9回目
    const s = buildSchedule({ ...base, bonusShare: 0.2, startMonth: 3, bonusMonths: [6, 12] });
    const ks = s.bonus.map((v, i) => (v > 0 ? i + 1 : 0)).filter((k) => k > 0);
    assert.equal(ks[0], 3);
    assert.equal(ks[1], 9);
    assert.ok(ks.every((k) => [6, 12].includes(((3 - 1 + k) % 12) + 1)));
    assert.equal(s.balance[s.months - 1], 0, '完済する');
    assert.equal(s.totalPrincipal, 30_000_000);
    assert.equal(s.firstBonus, s.bonus[2]);
  });

  it('ボーナス払いにすると毎月の返済は下がり、利息の合計は少し増える', () => {
    const none = buildSchedule({ ...base, bonusShare: 0, startMonth: 6 });
    const with20 = buildSchedule({ ...base, bonusShare: 0.2, startMonth: 6 });
    assert.ok(with20.firstMonthly < none.firstMonthly);
    assert.ok(with20.totalInterest > none.totalInterest);
    assert.equal(with20.bonusPrincipal, 6_000_000);
  });

  it('1回あたりの額で指定すると、ボーナス返済はほぼその額になる', () => {
    const s = buildSchedule({ ...base, bonusShare: 0, bonusPay: 100_000, startMonth: 6 });
    // 初回以外（半年ごと）のボーナス返済が指定額に近い
    const second = s.bonus.filter((v) => v > 0)[1];
    assert.ok(Math.abs(second - 100_000) <= 1, `2回目 ${second}`);
    assert.equal(s.balance[s.months - 1], 0);
    assert.ok(s.bonusPrincipal > 0 && s.bonusPrincipal <= 15_000_000);
  });

  it('1回あたりの額が大きすぎても、ボーナス返済の元金は借入額の50%まで', () => {
    const s = buildSchedule({ ...base, bonusShare: 0, bonusPay: 5_000_000, startMonth: 1 });
    assert.equal(s.bonusPrincipal, 15_000_000);
    assert.equal(s.balance[s.months - 1], 0);
  });

  it('元金均等でもボーナス返済の元金を返しきる', () => {
    const s = buildSchedule({ ...base, method: 'equalPrincipal', bonusShare: 0.3, startMonth: 10, bonusMonths: [7, 12] });
    assert.equal(s.balance[s.months - 1], 0);
    assert.equal(s.totalPrincipal, 30_000_000);
  });

  it('月の指定がなければ、これまでどおり借入から6か月ごと', () => {
    const s = buildSchedule({ ...base, bonusShare: 0.2 });
    assert.ok(s.bonus[5] > 0 && s.bonus[4] === 0 && s.bonus[11] > 0);
  });
});
