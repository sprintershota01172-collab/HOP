import type { Rate, RepayMethod, Yen } from './types';

/** 元利均等の1回あたり返済額（端数処理なしの理論値） */
export function annuityPayment(principal: number, periodRate: number, periods: number): number {
  if (periods <= 0) return 0;
  if (principal <= 0) return 0;
  if (periodRate === 0) return principal / periods;
  const f = Math.pow(1 + periodRate, periods);
  return (principal * periodRate * f) / (f - 1);
}

/** 返済額から元金を逆算（審査目安の借入上限に使う） */
export function principalFromPayment(payment: number, periodRate: number, periods: number): number {
  if (periods <= 0 || payment <= 0) return 0;
  if (periodRate === 0) return payment * periods;
  const f = Math.pow(1 + periodRate, periods);
  return (payment * (f - 1)) / (periodRate * f);
}

export interface LoanSpec {
  principal: Yen;
  months: number;
  method: RepayMethod;
  /** ボーナス返済に回す元金の割合 0〜0.5 */
  bonusShare: Rate;
  /** 返済k回目（1始まり、借入翌月=1）の適用金利（年） */
  rateAt: (k: number) => Rate;
}

export interface LoanSchedule {
  months: number;
  /** k-1 番目 = k回目 */
  monthly: number[];
  bonus: number[];
  interest: number[];
  principalPaid: number[];
  balance: number[];
  rate: number[];
  totalPayment: Yen;
  totalInterest: Yen;
  totalPrincipal: Yen;
  firstMonthly: Yen;
  maxMonthly: Yen;
}

/**
 * 返済予定表を作る。
 *  - 毎月の利息 = 残高 × 年利 / 12（1円未満切り捨て）
 *  - 元利均等の返済額は 1円未満四捨五入、最終回で残高を精算
 *  - 金利が変わったら（12か月ごと、または固定期間終了時）残高・残期間で返済額を再計算
 *  - ボーナス返済部分は6か月ごと（6, 12, 18…回目）、半年分の利率 = 年利 / 2
 */
export function buildSchedule(spec: LoanSpec): LoanSchedule {
  const n = Math.max(0, Math.floor(spec.months));
  const out: LoanSchedule = {
    months: n,
    monthly: new Array(n).fill(0),
    bonus: new Array(n).fill(0),
    interest: new Array(n).fill(0),
    principalPaid: new Array(n).fill(0),
    balance: new Array(n).fill(0),
    rate: new Array(n).fill(0),
    totalPayment: 0,
    totalInterest: 0,
    totalPrincipal: 0,
    firstMonthly: 0,
    maxMonthly: 0,
  };
  const P = Math.max(0, Math.round(spec.principal));
  if (n === 0 || P === 0) return out;

  const bonusPeriods = Math.floor(n / 6);
  const share = bonusPeriods > 0 ? Math.min(0.5, Math.max(0, spec.bonusShare)) : 0;
  const Pb = Math.round(P * share);
  const Pm = P - Pb;

  let balM = Pm;
  let balB = Pb;
  let payM = 0;
  let payB = 0;
  let lastRateM = NaN;
  let lastRateB = NaN;
  const eqPrinM = Math.floor(Pm / n);
  const eqPrinB = bonusPeriods > 0 ? Math.floor(Pb / bonusPeriods) : 0;

  for (let k = 1; k <= n; k++) {
    const r = spec.rateAt(k);
    out.rate[k - 1] = r;
    let interest = 0;
    let principal = 0;
    let monthlyPay = 0;

    // --- 毎月返済部分 ---
    if (balM > 0) {
      const im = Math.floor((balM * r) / 12);
      let pm: number;
      if (spec.method === 'annuity') {
        if (Number.isNaN(lastRateM) || ((k - 1) % 12 === 0 && r !== lastRateM)) {
          payM = Math.round(annuityPayment(balM, r / 12, n - k + 1));
          lastRateM = r;
        }
        pm = Math.max(0, payM - im);
      } else {
        pm = eqPrinM;
      }
      if (k === n || pm >= balM) pm = balM;
      balM -= pm;
      interest += im;
      principal += pm;
      monthlyPay = im + pm;
    }

    // --- ボーナス返済部分 ---
    let bonusPay = 0;
    if (balB > 0 && k % 6 === 0) {
      const j = k / 6; // 何回目のボーナス返済か
      const ib = Math.floor((balB * r) / 2);
      let pb: number;
      if (spec.method === 'annuity') {
        if (Number.isNaN(lastRateB) || r !== lastRateB) {
          payB = Math.round(annuityPayment(balB, r / 2, bonusPeriods - j + 1));
          lastRateB = r;
        }
        pb = Math.max(0, payB - ib);
      } else {
        pb = eqPrinB;
      }
      if (j === bonusPeriods || pb >= balB) pb = balB;
      balB -= pb;
      interest += ib;
      principal += pb;
      bonusPay = ib + pb;
    }

    out.monthly[k - 1] = monthlyPay;
    out.bonus[k - 1] = bonusPay;
    out.interest[k - 1] = interest;
    out.principalPaid[k - 1] = principal;
    out.balance[k - 1] = balM + balB;
    out.totalPayment += monthlyPay + bonusPay;
    out.totalInterest += interest;
    out.totalPrincipal += principal;
    if (monthlyPay > out.maxMonthly) out.maxMonthly = monthlyPay;
  }
  out.firstMonthly = out.monthly[0];
  return out;
}

/** 金利の推移（シナリオ）を作る */
export function ratePath(
  type: 'variable' | 'fixed' | 'fixedPeriod',
  rate: Rate,
  opts: { fixedYears?: number; afterRate?: Rate; stressDelta?: Rate; rampMonths?: number },
): (k: number) => Rate {
  const delta = opts.stressDelta ?? 0;
  const ramp = Math.max(1, opts.rampMonths ?? 60);
  if (type === 'fixed') return () => rate;
  if (type === 'fixedPeriod') {
    const fm = Math.max(0, Math.round((opts.fixedYears ?? 10) * 12));
    const after = (opts.afterRate ?? rate) + delta;
    return (k) => (k <= fm ? rate : after);
  }
  // 変動: 借入時の金利から ramp か月かけて +delta まで上昇し、その後は一定
  return (k) => rate + delta * Math.min(1, (k - 1) / ramp);
}
