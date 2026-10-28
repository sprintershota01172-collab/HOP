import { buildSchedule, ratePath, type LoanSchedule } from './loan';
import { ASSUME, CHILD_ALLOWANCE, EDU_MEXT, EDU_UNIV, LEAVE } from './reference';
import type { Resolved, RPerson } from './resolve';
import { deductionLimit, estimateDeductibleTax, estimatePropertyTax } from './tax';
import type { Child, EnergyClass, Investment, LoanTerms, Rate, Yen, YM } from './types';
import { ageAt, elemStartFY, firstMarchAfterAge, gradeAt, toYM, ymMonth, ymYear } from './ym';

/** 購入する住宅（物件または予算から作った仮の住宅） */
export interface HouseModel {
  label: string;
  price: Yen;
  misc: Yen;
  kind: 'detached' | 'mansion';
  newBuild: boolean;
  landPrice: Yen;
  buildingPrice: Yen;
  floorArea: number | null;
  energy: EnergyClass;
  /** 固定資産税の手入力（年）。null = 推計 */
  propertyTaxAnnual: Yen | null;
  insuranceAnnual: Yen;
  /** 修繕積立相当、またはマンションの管理費＋修繕積立金（月・物価で増える） */
  maintenanceMonthly: Yen;
  parkingMonthly: Yen;
}

export interface Purchase {
  house: HouseModel;
  /** 借入額 */
  loan: Yen;
  /** 充当自己資金 = 住宅取得総額 − 借入額 */
  down: Yen;
  ym: YM;
  terms: LoanTerms;
}

export interface Scenario {
  key: string;
  /** 変動金利（固定期間後を含む）の上昇幅 */
  rateDelta: Rate;
  /** 購入後の勤労収入の倍率（0.9 = 1割減） */
  incomeFactor: number;
  inflationDelta: Rate;
  returnRate: Rate;
}

export interface MonthRow {
  ym: YM;
  // 収入
  salary: Yen;
  bonus: Yen;
  benefit: Yen;
  pension: Yen;
  allowance: Yen;
  otherIncome: Yen;
  retireBonus: Yen;
  deduction: Yen;
  gift: Yen;
  // 支出
  living: Yen;
  housing: Yen;
  housingOnce: Yen;
  loanPayment: Yen;
  loanInterest: Yen;
  education: Yen;
  insurance: Yen;
  debt: Yen;
  otherExpense: Yen;
  // 資産の移動
  contrib: Yen;
  withdraw: Yen;
  autoWithdraw: Yen;
  gain: Yen;
  invTax: Yen;
  // 残高（月末）
  cash: Yen;
  invest: Yen;
  loanBalance: Yen;
  /** 毎月かかる支出（予備資金の基準） */
  need: Yen;
}

export type WarningCode = 'nisaAnnual' | 'nisaLifetime' | 'idecoLocked' | 'cashShort';
export interface SimWarning {
  code: WarningCode;
  ym: YM;
  detail: string;
}

export interface SimResult {
  start: YM;
  end: YM;
  rows: MonthRow[];
  schedule: LoanSchedule | null;
  purchase: Purchase | null;
  warnings: SimWarning[];
  /** 購入月の行インデックス（購入なしは -1） */
  pIndex: number;
  retireIndex: number;
}

export const incomeOf = (r: MonthRow): Yen =>
  r.salary + r.bonus + r.benefit + r.pension + r.allowance + r.otherIncome + r.retireBonus + r.deduction + r.gift;
export const spendOf = (r: MonthRow): Yen =>
  r.living + r.housing + r.housingOnce + r.education + r.insurance + r.debt + r.otherExpense;

const aprilsBetween = (from: YM, to: YM): number => {
  // from < 4月 <= to となる4月の回数
  if (to <= from) return 0;
  let n = 0;
  for (let y = ymYear(from); y <= ymYear(to); y++) {
    const ap = toYM(y, 4);
    if (ap > from && ap <= to) n++;
  }
  return n;
};

interface InvState {
  src: Investment;
  bal: number;
  basis: number;
  unlockYM: YM;
}

/** 子供1人のその月の教育費と生活費加算（物価補正前の今の価値） */
export function childMonth(c: Child, m: YM, childLiving: Resolved['plan']['assumptions']['childLiving']): { edu: Yen; living: Yen } {
  if (m < c.birthYM) return { edu: 0, living: 0 };
  const g = gradeAt(c.birthYM, m);
  const univEnd = 12 + (c.univ === 'none' ? 0 : c.univYears);
  const customOutside = c.lessonsMonthly != null || c.jukuMonthly != null;
  const outsideMonthly = (c.lessonsMonthly ?? 0) + (c.jukuMonthly ?? 0);
  let edu = 0;
  let living = 0;
  if (g <= -3) {
    const months = m - c.birthYM;
    if (c.nurseryUse && months >= c.nurseryStartAge * 12) edu += c.nurseryMonthly ?? ASSUME.nurseryMonthly;
    living = childLiving.preschool;
  } else if (g <= 0) {
    if (c.kinder !== 'none') {
      const row = EDU_MEXT.kinder[c.kinder];
      edu += row.school / 12 + (customOutside ? outsideMonthly : row.outside / 12);
    } else {
      edu += customOutside ? outsideMonthly : EDU_MEXT.kinder.public.outside / 12;
    }
    living = childLiving.preschool;
  } else if (g <= 12) {
    const stage = g <= 6 ? EDU_MEXT.elem : g <= 9 ? EDU_MEXT.middle : EDU_MEXT.high;
    const choice = g <= 6 ? c.elem : g <= 9 ? c.middle : c.high;
    const row = stage[choice];
    edu += row.school / 12 + (customOutside ? outsideMonthly : row.outside / 12);
    living = g <= 6 ? childLiving.elem : childLiving.middleHigh;
  } else if (g <= univEnd) {
    const u = EDU_UNIV[c.univ as Exclude<typeof c.univ, 'none'>];
    edu += u.annual / 12 + c.univAwayMonthly + (c.lessonsMonthly ?? 0);
    living = childLiving.univ;
  }
  if (g >= -2 && g <= univEnd) edu += c.otherAnnual / 12;
  // 大学の入学費用（受験料・併願校納付金を含む）は高3の2月に計上
  if (c.univ !== 'none') {
    const fy12 = elemStartFY(c.birthYM) + 11;
    if (m === toYM(fy12 + 1, 2)) edu += EDU_UNIV[c.univ].entrance;
  }
  return { edu, living };
}

/** 児童手当（月額） */
export function childAllowance(children: Child[], m: YM): Yen {
  const counted = children
    .filter((c) => m >= c.birthYM && m <= firstMarchAfterAge(c.birthYM, 22))
    .sort((x, y) => x.birthYM - y.birthYM);
  let sum = 0;
  counted.forEach((c, i) => {
    if (m > firstMarchAfterAge(c.birthYM, 18)) return;
    if (i >= 2) sum += CHILD_ALLOWANCE.third;
    else sum += ageAt(c.birthYM, m) < 3 ? CHILD_ALLOWANCE.under3 : CHILD_ALLOWANCE.over3;
  });
  return sum;
}

/** 本人の勤労収入（給与・給付）と、その月の勤務割合 */
function workIncome(r: Resolved, p: RPerson, m: YM): { salary: number; benefit: number; ratio: number } {
  if (p.net <= 0 || m >= p.retireYM) return { salary: 0, benefit: 0, ratio: 0 };
  const base = p.net * Math.pow(1 + p.raise, aprilsBetween(r.start, m));
  const plan = r.plan;
  const benefitsOn = plan.assumptions.leaveBenefits;
  let ratio = 1;
  let benefit = 0;
  for (const w of plan.work) {
    if (w.owner !== p.id) continue;
    if (w.type === 'leave' && m >= w.startYM && m < w.startYM + w.months) {
      ratio = 0;
      if (!benefitsOn) continue;
      const idx = m - w.startYM;
      if (w.maternity && idx < 3) {
        benefit = (base * LEAVE.maternityRate) / LEAVE.netRatio;
      } else {
        const j = w.maternity ? idx - 3 : idx;
        const rate = j < 6 ? LEAVE.leaveRateFirst : LEAVE.leaveRateLater;
        const cap = j < 6 ? LEAVE.capFirst : LEAVE.capLater;
        benefit = Math.min((base * rate) / LEAVE.netRatio, cap);
        if (j === 0) {
          // 出生後休業支援給付: 両親とも育休（配偶者が無収入・単身の場合は不要）
          const other = r.people.find((q) => q.id !== p.id);
          const otherLeave = plan.work.some((x) => x.owner !== p.id && x.type === 'leave');
          if (!other || other.net <= 0 || otherLeave) benefit += ((base * LEAVE.postBirthTopUp) / LEAVE.netRatio) * (28 / 30);
        }
      }
    } else if (w.type === 'short' && m >= w.startYM && (w.endYM == null || m <= w.endYM)) {
      ratio = Math.min(ratio, Math.max(0, Math.min(1, w.ratio)));
      const child = w.childId ? plan.children.find((c) => c.id === w.childId) : null;
      if (benefitsOn && child && m >= child.birthYM && ageAt(child.birthYM, m) < 2) {
        benefit = Math.min(base * ratio * LEAVE.shortTimeTopUp, base - base * ratio);
      }
    }
  }
  return { salary: base * ratio, benefit, ratio };
}

/** 住宅・シナリオに依存しない月々の値（物価上昇率の違いごとにキャッシュ） */
interface Pre {
  f: number[];
  salary: number[];
  benefit: number[];
  bonus: number[];
  pension: number[];
  retireBonus: number[];
  allowance: number[];
  living: number[];
  education: number[];
  insurance: number[];
  debt: number[];
  otherExpense: number[];
  otherIncome: number[];
}

const preCache = new WeakMap<Resolved, Map<number, Pre>>();

function prepare(r: Resolved, inflationDelta: number): Pre {
  let byDelta = preCache.get(r);
  if (!byDelta) {
    byDelta = new Map();
    preCache.set(r, byDelta);
  }
  const hit = byDelta.get(inflationDelta);
  if (hit) return hit;
  const plan = r.plan;
  const a = plan.assumptions;
  const infl = a.inflation + inflationDelta;
  const pensionGrowth = a.inflation + a.pensionAdjust;
  const baseYear = ymYear(r.start);
  const n = r.end - r.start + 1;
  const mk = () => new Array<number>(n).fill(0);
  const pre: Pre = {
    f: mk(), salary: mk(), benefit: mk(), bonus: mk(), pension: mk(), retireBonus: mk(), allowance: mk(),
    living: mk(), education: mk(), insurance: mk(), debt: mk(), otherExpense: mk(), otherIncome: mk(),
  };
  const ratioHist = new Map<string, number[]>();
  for (const p of r.people) ratioHist.set(p.id, []);

  for (let i = 0; i < n; i++) {
    const m = r.start + i;
    const y = ymYear(m);
    const mon = ymMonth(m);
    const f = Math.pow(1 + infl, y - baseYear);
    pre.f[i] = f;

    let salary = 0, bonus = 0, benefit = 0, pension = 0, retireBonus = 0;
    for (const p of r.people) {
      const w = workIncome(r, p, m);
      const hist = ratioHist.get(p.id)!;
      hist.push(w.ratio);
      if (hist.length > 6) hist.shift();
      salary += w.salary;
      benefit += w.benefit;
      if ((mon === 6 || mon === 12) && p.bonus > 0 && m < p.retireYM) {
        const window = [...hist];
        while (window.length < 6) window.unshift(1);
        const avg = window.reduce((s, v) => s + v, 0) / 6;
        bonus += (p.bonus / 2) * Math.pow(1 + p.raise, aprilsBetween(r.start, m)) * avg;
      }
      if (m === p.retireYM) retireBonus += p.retireBonus;
      if (m >= p.pensionYM) pension += p.pension * Math.pow(1 + pensionGrowth, y - baseYear);
    }
    pre.salary[i] = salary;
    pre.benefit[i] = benefit;
    pre.bonus[i] = bonus;
    pre.pension[i] = Math.round(pension);
    pre.retireBonus[i] = Math.round(retireBonus);
    if (a.childAllowance) pre.allowance[i] = childAllowance(plan.children, m);

    const retiredAll = m >= r.retireAllYM;
    let living = (retiredAll ? r.retireLiving : r.livingTotal) * f;
    let edu = 0;
    for (const c of plan.children) {
      const cm = childMonth(c, m, a.childLiving);
      edu += cm.edu * f;
      living += cm.living * f;
    }
    pre.living[i] = Math.round(living);
    pre.education[i] = Math.round(edu);

    let ins = 0, insIn = 0;
    for (const x of plan.insurances) {
      if (x.payEndYM == null || m <= x.payEndYM) ins += x.monthly;
      const po = x.payout;
      if (po.type === 'lump' && po.ym === m) insIn += po.amount;
      if (po.type === 'annuity' && m >= po.startYM && m < po.startYM + po.years * 12) insIn += po.annual / 12;
    }
    pre.insurance[i] = Math.round(ins);

    let debt = 0;
    for (const d of plan.debts) if (m <= d.endYM) debt += d.monthly;
    pre.debt[i] = Math.round(debt);

    let evOut = 0, evIn = 0;
    for (const e of plan.events) {
      let hit = false;
      if (e.pattern === 'once') hit = m === e.startYM;
      else if (e.pattern === 'monthly') hit = m >= e.startYM && (e.endYM == null || m <= e.endYM);
      else if (e.pattern === 'repeat') {
        const every = Math.max(1, e.everyYears) * 12;
        hit = m >= e.startYM && (m - e.startYM) % every === 0 && (e.endYM == null || m <= e.endYM);
      }
      if (!hit) continue;
      const amt = e.inflate ? e.amount * f : e.amount;
      if (e.kind === 'expense') evOut += amt;
      else evIn += amt;
    }
    pre.otherExpense[i] = Math.round(evOut);
    pre.otherIncome[i] = Math.round(evIn + insIn);
  }
  byDelta.set(inflationDelta, pre);
  return pre;
}

/**
 * 月次シミュレーション。
 * すべての金額は各月の項目ごとに円単位へ丸めてから足し合わせるため、
 * 月次 → 年次の集計と残高の増減は円単位で一致する。
 */
export function simulate(r: Resolved, purchase: Purchase | null, sc: Scenario): SimResult {
  const plan = r.plan;
  const a = plan.assumptions;
  const rm = Math.pow(1 + sc.returnRate, 1 / 12) - 1;
  const rows: MonthRow[] = [];
  const warnings: SimWarning[] = [];
  const warned = new Set<string>();
  const warn = (code: WarningCode, ym: YM, detail: string) => {
    const key = `${code}:${detail}`;
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push({ code, ym, detail });
  };

  let cash = r.people.reduce((s, p) => s + p.cash, 0);
  const invs: InvState[] = plan.investments.map((x) => {
    const owner = r.people.find((p) => p.id === x.owner) ?? r.people[0];
    return {
      src: x,
      bal: Math.max(0, Math.round(x.balance)),
      basis: Math.max(0, Math.round(x.basis ?? x.balance)),
      unlockYM: x.kind === 'ideco' && owner ? owner.birthYM + 60 * 12 : -Infinity,
    };
  });

  // --- ローン ---
  let schedule: LoanSchedule | null = null;
  const pYM = purchase ? purchase.ym : Infinity;
  const deductionByMarch = new Map<YM, number>();
  if (purchase && purchase.loan > 0) {
    const t = purchase.terms;
    schedule = buildSchedule({
      principal: purchase.loan,
      months: t.years * 12,
      method: t.method,
      bonusShare: t.bonusShare,
      rateAt: ratePath(t.rateType, t.rate, {
        fixedYears: t.fixedYears,
        afterRate: t.afterRate,
        stressDelta: sc.rateDelta,
        rampMonths: ASSUME.rampMonths,
      }),
    });
    // 住宅ローン控除（年末残高 × 0.7%、税額の範囲内）を翌年3月に受け取る
    const d = plan.housing.deduction;
    if (d.enabled) {
      const { limit, years } = deductionLimit(purchase.house.energy, d.family);
      if (limit > 0 && years > 0) {
        let cap = d.taxCapAnnual;
        if (cap == null) {
          const borrowers = plan.housing.loan.borrower === 'pair' ? r.people : r.people.filter((p) => p.id === 'self');
          cap = borrowers.reduce((s, p) => s + estimateDeductibleTax(p.gross), 0);
        }
        const py = ymYear(purchase.ym);
        for (let i = 0; i < years; i++) {
          const dec = toYM(py + i, 12);
          const k = dec - purchase.ym; // 12月時点の返済回数
          const bal = k <= 0 ? purchase.loan : k > schedule.months ? 0 : schedule.balance[k - 1];
          const credit = Math.floor(Math.min(Math.min(bal, limit) * 0.007, cap));
          if (credit > 0) deductionByMarch.set(toYM(py + i + 1, 3), credit);
        }
      }
    }
  }

  const pre = prepare(r, sc.inflationDelta);
  const nisaYear = new Map<string, { y: number; ts: number; gr: number }>();
  const hp = plan.housing;
  const reserveMonths = a.reserveMonths;
  const taxByYear: number[] = [];

  for (let m = r.start; m <= r.end; m++) {
    const i = m - r.start;
    const y = ymYear(m);
    const f = pre.f[i];
    const row: MonthRow = {
      ym: m, salary: 0, bonus: 0, benefit: 0, pension: 0, allowance: 0, otherIncome: 0, retireBonus: 0, deduction: 0, gift: 0,
      living: 0, housing: 0, housingOnce: 0, loanPayment: 0, loanInterest: 0, education: 0, insurance: 0, debt: 0, otherExpense: 0,
      contrib: 0, withdraw: 0, autoWithdraw: 0, gain: 0, invTax: 0, cash: 0, invest: 0, loanBalance: 0, need: 0,
    };
    const incF = m >= pYM ? sc.incomeFactor : 1;

    // ---------- 収入・生活費・教育費など（住宅に依存しない部分は事前計算） ----------
    row.salary = Math.round(pre.salary[i] * incF);
    row.benefit = Math.round(pre.benefit[i] * incF);
    row.bonus = Math.round(pre.bonus[i] * incF);
    row.pension = pre.pension[i];
    row.retireBonus = pre.retireBonus[i];
    row.allowance = pre.allowance[i];
    row.living = pre.living[i];
    row.education = pre.education[i];
    row.insurance = pre.insurance[i];
    row.debt = pre.debt[i];
    row.otherExpense = pre.otherExpense[i];
    row.otherIncome = pre.otherIncome[i];
    const retiredAll = m >= r.retireAllYM;

    // ---------- 住まい ----------
    let housing = 0;
    const rentEnd = purchase ? purchase.ym + Math.max(0, hp.overlapMonths) : Infinity;
    if (m < rentEnd) housing += r.rent;
    if (purchase) {
      const hm = purchase.house;
      if (m === purchase.ym) {
        row.housingOnce = Math.round(purchase.down + (hp.movingCost ?? 0));
        row.gift = Math.round(hp.gift);
      }
      if (m > purchase.ym) {
        const yi = Math.floor((m - purchase.ym - 1) / 12);
        if (taxByYear[yi] === undefined) {
          taxByYear[yi] = hm.propertyTaxAnnual ?? estimatePropertyTax(
            { kind: hm.kind, newBuild: hm.newBuild, landPrice: hm.landPrice, buildingPrice: hm.buildingPrice, floorArea: hm.floorArea, energy: hm.energy, cutEnabled: hp.newBuildTaxCut },
            yi,
          );
        }
        const tax = taxByYear[yi];
        housing += tax / 12 + hm.insuranceAnnual / 12 + hm.maintenanceMonthly * f + hm.parkingMonthly;
      }
      if (schedule) {
        const k = m - purchase.ym;
        if (k >= 1 && k <= schedule.months) {
          row.loanPayment = schedule.monthly[k - 1] + schedule.bonus[k - 1];
          row.loanInterest = schedule.interest[k - 1];
          row.loanBalance = schedule.balance[k - 1];
        } else if (k < 1) {
          row.loanBalance = k === 0 ? purchase.loan : 0;
        }
      }
      row.deduction = deductionByMarch.get(m) ?? 0;
    }
    row.housing = Math.round(housing) + row.loanPayment;

    row.need = row.living + row.housing + row.education + row.insurance + row.debt;

    // ---------- 投資（運用益 → 積立 → 計画どおりの取崩し） ----------
    let contrib = 0, withdraw = 0, gain = 0, invTax = 0;
    for (const s of invs) {
      const g = Math.round(s.bal * rm);
      s.bal += g;
      gain += g;
      const x = s.src;
      const active = (x.startYM == null || m >= x.startYM) && (x.endYM == null || m <= x.endYM);
      if (active && x.monthly > 0) {
        let c = x.monthly;
        if (x.kind === 'nisaTsumitate' || x.kind === 'nisaGrowth') {
          const key = x.owner;
          let ny = nisaYear.get(key);
          if (!ny || ny.y !== y) { ny = { y, ts: 0, gr: 0 }; nisaYear.set(key, ny); }
          const used = invs.filter((q) => q.src.owner === x.owner && (q.src.kind === 'nisaTsumitate' || q.src.kind === 'nisaGrowth')).reduce((t, q) => t + q.basis, 0);
          const usedGrowth = invs.filter((q) => q.src.owner === x.owner && q.src.kind === 'nisaGrowth').reduce((t, q) => t + q.basis, 0);
          const annualRoom = x.kind === 'nisaTsumitate' ? 1_200_000 - ny.ts : 2_400_000 - ny.gr;
          const lifeRoom = 18_000_000 - used;
          const growthRoom = x.kind === 'nisaGrowth' ? 12_000_000 - usedGrowth : Infinity;
          const room = Math.max(0, Math.min(annualRoom, lifeRoom, growthRoom));
          if (c > room) {
            warn(lifeRoom < c ? 'nisaLifetime' : 'nisaAnnual', m, x.name);
            c = room;
          }
          if (x.kind === 'nisaTsumitate') ny.ts += c; else ny.gr += c;
        }
        s.bal += c;
        s.basis += c;
        contrib += c;
      }
      if (x.withdrawStartYM != null && m >= x.withdrawStartYM && x.withdrawMonthly > 0 && s.bal > 0) {
        if (m < s.unlockYM) {
          warn('idecoLocked', m, x.name);
        } else {
          const w = Math.min(x.withdrawMonthly, s.bal);
          const t = sell(s, w);
          withdraw += w;
          invTax += t;
        }
      }
    }
    row.contrib = contrib;
    row.withdraw = withdraw;
    row.gain = gain;

    // ---------- 現金 ----------
    const income = incomeOf(row);
    const spend = spendOf(row);
    cash += income - spend - contrib + withdraw - invTax;

    // ---------- 取崩しルール（設定で明示されている場合のみ） ----------
    const ruleOn = retiredAll ? a.withdrawAfterRetire : a.withdrawBeforeRetire;
    if (ruleOn) {
      const floor = reserveMonths * row.need;
      if (cash < floor) {
        let short = floor - cash;
        const order: Investment['kind'][] = ['taxable', 'nisaGrowth', 'nisaTsumitate', 'ideco'];
        for (const kind of order) {
          for (const s of invs) {
            if (short <= 0) break;
            if (s.src.kind !== kind || s.bal <= 0 || m < s.unlockYM) continue;
            const gainRatio = s.src.kind === 'taxable' ? Math.max(0, (s.bal - s.basis) / s.bal) : 0;
            const gross = Math.min(s.bal, Math.ceil(short / (1 - gainRatio * 0.20315)));
            const t = sell(s, gross);
            row.autoWithdraw += gross;
            invTax += t;
            cash += gross - t;
            short -= gross - t;
          }
        }
      }
    }
    row.invTax = invTax;
    row.cash = Math.round(cash);
    cash = row.cash;
    row.invest = invs.reduce((s, x) => s + x.bal, 0);
    if (row.cash < 0) warn('cashShort', m, '現金残高がマイナス');
    rows.push(row);
  }

  return {
    start: r.start,
    end: r.end,
    rows,
    schedule,
    purchase,
    warnings,
    pIndex: purchase ? purchase.ym - r.start : -1,
    retireIndex: Math.max(0, r.retireAllYM - r.start),
  };
}

/** 売却: 課税口座は利益部分に20.315%。取得原価は売却割合に応じて減らす。返り値は税額 */
function sell(s: InvState, amount: number): number {
  if (amount <= 0 || s.bal <= 0) return 0;
  const share = amount / s.bal;
  const basisOut = Math.round(s.basis * share);
  let tax = 0;
  if (s.src.kind === 'taxable') {
    const gainPart = Math.max(0, amount - basisOut);
    tax = Math.floor(gainPart * 0.20315);
  }
  s.bal -= amount;
  s.basis -= basisOut;
  return tax;
}
