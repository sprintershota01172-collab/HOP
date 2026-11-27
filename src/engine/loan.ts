import type { LoanTerms, Rate, RepayMethod, Yen } from './types';

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
  /** ボーナス返済1回あたりの額（指定したときは割合の代わりに、この額になる元金をボーナス返済に回す。上限は借入額の50%） */
  bonusPay?: Yen;
  /** 借入した月（1〜12）。指定するとボーナス返済は bonusMonths の月に行う（未指定なら借入から6か月ごと） */
  startMonth?: number;
  /** ボーナス返済をする月（既定 6月・12月） */
  bonusMonths?: number[];
  /** 返済k回目（1始まり、借入翌月=1）の適用金利（年） */
  rateAt: (k: number) => Rate;
  /** 繰上返済（k回目の返済の後に、毎月返済部分の元金へ充てる） */
  prepay?: { k: number; amount: Yen; mode: 'shorten' | 'reduce' }[];
  /** 変動金利の5年ルール・125%ルール（返済額の見直しは5年ごと、上限は前の1.25倍。払いきれない利息は未払利息として持ち越し、最終回に精算） */
  rule125?: boolean;
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
  /** k-1 番目 = k回目の後に繰上返済した額 */
  prepaid: number[];
  totalPayment: Yen;
  totalInterest: Yen;
  totalPrincipal: Yen;
  totalPrepaid: Yen;
  firstMonthly: Yen;
  maxMonthly: Yen;
  /** 実際に完済する回（繰上返済で早まる） */
  lastK: number;
  /** ボーナス返済に回した元金 */
  bonusPrincipal: Yen;
  /** 初回のボーナス返済額（なければ0） */
  firstBonus: Yen;
}

/** ボーナス返済をする回（k = 1始まり）の一覧 */
export function bonusKs(n: number, startMonth?: number, months: number[] = [6, 12]): number[] {
  const out: number[] = [];
  for (let k = 1; k <= n; k++) {
    if (startMonth == null ? k % 6 === 0 : months.includes(((startMonth - 1 + k) % 12) + 1)) out.push(k);
  }
  return out;
}

/** ボーナス払いの方式（以前のデータは割合が0より大きければ「割合」） */
export const bonusModeOf = (t: Pick<LoanTerms, 'bonusMode' | 'bonusShare'>): 'none' | 'share' | 'amount' => t.bonusMode ?? (t.bonusShare > 0 ? 'share' : 'none');

/** ローン条件から、返済予定表に渡すボーナス返済の指定を作る */
export function bonusSpec(t: LoanTerms, startYM?: number): Pick<LoanSpec, 'bonusShare' | 'bonusPay' | 'startMonth' | 'bonusMonths'> {
  const mode = bonusModeOf(t);
  const startMonth = startYM == null ? undefined : (((startYM % 12) + 12) % 12) + 1;
  const bonusMonths = t.bonusMonths ?? [6, 12];
  if (mode === 'amount') return { bonusShare: 0, bonusPay: Math.max(0, t.bonusAmount ?? 0), startMonth, bonusMonths };
  if (mode === 'share') return { bonusShare: t.bonusShare, startMonth, bonusMonths };
  return { bonusShare: 0, startMonth, bonusMonths };
}

/** ボーナス返済に回す元金（概算用。年2回・半年ごとの利率で計算） */
export function bonusPrincipalOf(t: LoanTerms, loan: Yen): Yen {
  if (loan <= 0) return 0;
  const mode = bonusModeOf(t);
  const periods = Math.floor(t.years * 2);
  if (mode === 'share') return Math.round(loan * Math.min(0.5, Math.max(0, t.bonusShare)));
  if (mode === 'amount') return Math.min(Math.round(loan * 0.5), Math.round(principalFromPayment(Math.max(0, t.bonusAmount ?? 0), t.rate / 2, periods)));
  return 0;
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
    prepaid: new Array(n).fill(0),
    totalPayment: 0,
    totalInterest: 0,
    totalPrincipal: 0,
    totalPrepaid: 0,
    firstMonthly: 0,
    maxMonthly: 0,
    lastK: n,
    bonusPrincipal: 0,
    firstBonus: 0,
  };
  const P = Math.max(0, Math.round(spec.principal));
  if (n === 0 || P === 0) return out;

  const ks = bonusKs(n, spec.startMonth, spec.bonusMonths);
  const bonusPeriods = ks.length;
  const lastBonusK = ks[bonusPeriods - 1] ?? 0;
  let Pb: number;
  if (bonusPeriods === 0) Pb = 0;
  else if (spec.bonusPay != null && spec.bonusPay > 0) {
    // 1回あたりの額から元金を逆算（元利均等は年2回の返済、元金均等は初回の額で合わせる）
    const r1 = spec.rateAt(1);
    const raw = spec.method === 'annuity' ? principalFromPayment(spec.bonusPay, r1 / 2, bonusPeriods) : spec.bonusPay / (1 / bonusPeriods + r1 / 2);
    Pb = Math.min(Math.round(P * 0.5), Math.round(raw));
  } else Pb = Math.round(P * Math.min(0.5, Math.max(0, spec.bonusShare)));
  const Pm = P - Pb;
  out.bonusPrincipal = Pb;

  let balM = Pm;
  let balB = Pb;
  let payM = 0;
  let payB = 0;
  let lastRateM = NaN;
  let lastRateB = NaN;
  const eqPrinM = Math.floor(Pm / n);
  const eqPrinB = bonusPeriods > 0 ? Math.floor(Pb / bonusPeriods) : 0;

  const rule = !!spec.rule125 && spec.method === 'annuity';
  let unpaid = 0; // 125%ルールで持ち越した未払利息
  let recalc = false; // 返済額軽減型の繰上返済の後は、翌月に返済額を計算し直す
  let eqM = eqPrinM;
  const isBonus = new Set(ks);
  let prevBonusK = 0;
  let bonusNo = 0;
  const prepays = new Map<number, { amount: number; mode: 'shorten' | 'reduce' }[]>();
  for (const x of spec.prepay ?? []) if (x.k >= 1 && x.k < n && x.amount > 0) prepays.set(x.k, [...(prepays.get(x.k) ?? []), x]);

  for (let k = 1; k <= n; k++) {
    const r = spec.rateAt(k);
    out.rate[k - 1] = r;
    let interest = 0;
    let principal = 0;
    let monthlyPay = 0;

    // --- 毎月返済部分 ---
    if (balM > 0 || unpaid > 0) {
      const im = Math.floor((balM * r) / 12);
      let pm: number;
      if (spec.method === 'annuity') {
        const due = rule ? (k - 1) % 60 === 0 : (k - 1) % 12 === 0;
        if (Number.isNaN(lastRateM) || recalc || (due && r !== lastRateM)) {
          let next = Math.round(annuityPayment(balM, r / 12, n - k + 1));
          if (rule && !Number.isNaN(lastRateM) && !recalc) next = Math.min(next, Math.floor(payM * 1.25));
          payM = next;
          lastRateM = r;
          recalc = false;
        }
        if (rule) {
          const owe = im + unpaid;
          if (k === n) {
            pm = balM;
            interest += owe;
            unpaid = 0;
          } else if (payM >= owe) {
            pm = Math.min(balM, payM - owe);
            interest += owe;
            unpaid = 0;
          } else {
            pm = 0;
            interest += payM;
            unpaid = owe - payM;
          }
          balM -= pm;
          principal += pm;
          monthlyPay = interest + pm;
        } else {
          pm = Math.max(0, payM - im);
          if (k === n || pm >= balM) pm = balM;
          balM -= pm;
          interest += im;
          principal += pm;
          monthlyPay = im + pm;
        }
      } else {
        pm = eqM;
        if (k === n || pm >= balM) pm = balM;
        balM -= pm;
        interest += im;
        principal += pm;
        monthlyPay = im + pm;
      }
    }

    // --- ボーナス返済部分 ---
    let bonusPay = 0;
    if (balB > 0 && isBonus.has(k)) {
      const j = ++bonusNo; // 何回目のボーナス返済か
      const gap = k - prevBonusK; // 前回のボーナス返済（初回は借入）からの月数
      prevBonusK = k;
      const ib = Math.floor((balB * r * gap) / 12);
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
      if (j === bonusPeriods || k === lastBonusK || pb >= balB) pb = balB;
      balB -= pb;
      interest += ib;
      principal += pb;
      bonusPay = ib + pb;
    }

    // --- 繰上返済（この回の返済の後） ---
    for (const x of prepays.get(k) ?? []) {
      const amt = Math.min(x.amount, balM);
      if (amt <= 0) continue;
      balM -= amt;
      out.prepaid[k - 1] += amt;
      out.totalPrepaid += amt;
      principal += amt;
      if (x.mode === 'reduce') {
        recalc = true;
        if (spec.method !== 'annuity') eqM = Math.floor(balM / Math.max(1, n - k));
      }
    }

    out.monthly[k - 1] = monthlyPay;
    out.bonus[k - 1] = bonusPay;
    out.interest[k - 1] = interest;
    out.principalPaid[k - 1] = principal;
    out.balance[k - 1] = balM + balB + unpaid;
    out.totalPayment += monthlyPay + bonusPay;
    out.totalInterest += interest;
    out.totalPrincipal += principal;
    if (monthlyPay > out.maxMonthly) out.maxMonthly = monthlyPay;
    if (balM + balB + unpaid <= 0 && out.lastK === n && k < n) out.lastK = k;
  }
  out.firstMonthly = out.monthly[0];
  out.firstBonus = out.bonus.find((v) => v > 0) ?? 0;
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
