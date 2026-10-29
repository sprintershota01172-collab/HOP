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
  /** 住宅費の合計 = rent + upkeep + loanPayment */
  housing: Yen;
  /** 家賃（購入前と移行期間） */
  rent: Yen;
  /** 住宅維持費（固定資産税・都市計画税・火災地震保険・修繕積立・管理費・駐車場） */
  upkeep: Yen;
  housingOnce: Yen;
  loanPayment: Yen;
  /** loanPayment のうちボーナス返済分 */
  loanBonus: Yen;
  loanInterest: Yen;
  education: Yen;
  /** education のうち一時的な費用（大学の入学費用） */
  educationOnce: Yen;
  insurance: Yen;
  debt: Yen;
  otherExpense: Yen;
  // 資産の移動
  contrib: Yen;
  /** 目的別の積立（旅行など。支出の時期から逆算して毎月積み立てる） */
  fundIn: Yen;
  /** 積立から払った支出（旅行など。現金からは払わない） */
  fundOut: Yen;
  withdraw: Yen;
  autoWithdraw: Yen;
  gain: Yen;
  invTax: Yen;
  // 残高（月末）
  cash: Yen;
  invest: Yen;
  /** 目的別の積立の残高（月末） */
  fund: Yen;
  loanBalance: Yen;
  /** 毎月かかる支出（予備資金の基準）。入学費用・ボーナス返済などの一時的な支出は含めない */
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
  /** 項目ごとの金額（detail を指定したときだけ） */
  parts?: Part[];
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

/** 教育費の内訳（childMonth の parts のキー） */
export const EDU_PART_LABEL = {
  nursery: '保育料',
  school: '学校の費用',
  outside: '習い事・塾など',
  univ: '大学の学費',
  away: '仕送り',
  other: 'その他の教育費',
  entrance: '大学の入学費用',
} as const;
export type EduPart = keyof typeof EDU_PART_LABEL;

/** 子供1人のその月の教育費と生活費加算（物価補正前の今の価値） */
export function childMonth(c: Child, m: YM, childLiving: Resolved['plan']['assumptions']['childLiving']): { edu: Yen; living: Yen; once: Yen; parts: Partial<Record<EduPart, number>> } {
  const parts: Partial<Record<EduPart, number>> = {};
  if (m < c.birthYM) return { edu: 0, living: 0, once: 0, parts };
  const add = (k: EduPart, v: number) => {
    if (v) parts[k] = (parts[k] ?? 0) + v;
  };
  const g = gradeAt(c.birthYM, m);
  const univEnd = 12 + (c.univ === 'none' ? 0 : c.univYears);
  const customOutside = c.lessonsMonthly != null || c.jukuMonthly != null;
  const outsideMonthly = (c.lessonsMonthly ?? 0) + (c.jukuMonthly ?? 0);
  let living = 0;
  if (g <= -3) {
    const months = m - c.birthYM;
    if (c.nurseryUse && months >= c.nurseryStartAge * 12) add('nursery', c.nurseryMonthly ?? ASSUME.nurseryMonthly);
    living = childLiving.preschool;
  } else if (g <= 0) {
    if (c.kinder !== 'none') {
      const row = EDU_MEXT.kinder[c.kinder];
      add('school', row.school / 12);
      add('outside', customOutside ? outsideMonthly : row.outside / 12);
    } else {
      add('outside', customOutside ? outsideMonthly : EDU_MEXT.kinder.public.outside / 12);
    }
    living = childLiving.preschool;
  } else if (g <= 12) {
    const stage = g <= 6 ? EDU_MEXT.elem : g <= 9 ? EDU_MEXT.middle : EDU_MEXT.high;
    const choice = g <= 6 ? c.elem : g <= 9 ? c.middle : c.high;
    const row = stage[choice];
    add('school', row.school / 12);
    add('outside', customOutside ? outsideMonthly : row.outside / 12);
    living = g <= 6 ? childLiving.elem : childLiving.middleHigh;
  } else if (g <= univEnd) {
    const u = EDU_UNIV[c.univ as Exclude<typeof c.univ, 'none'>];
    add('univ', u.annual / 12);
    add('away', c.univAwayMonthly);
    add('outside', c.lessonsMonthly ?? 0);
    living = childLiving.univ;
  }
  if (g >= -2 && g <= univEnd) add('other', c.otherAnnual / 12);
  // 大学の入学費用（受験料・併願校納付金を含む）は高3の2月に計上（一時的な支出）
  let once = 0;
  if (c.univ !== 'none') {
    const fy12 = elemStartFY(c.birthYM) + 11;
    if (m === toYM(fy12 + 1, 2)) once = EDU_UNIV[c.univ].entrance;
  }
  add('entrance', once);
  const edu = Object.values(parts).reduce((t, v) => t + (v ?? 0), 0);
  return { edu, living, once, parts };
}

/** イベントが起きる月（start〜end の範囲） */
export function eventMonths(e: { pattern: string; startYM: YM; endYM: YM | null; everyYears: number }, start: YM, end: YM): YM[] {
  const out: YM[] = [];
  if (e.pattern === 'once') {
    if (e.startYM >= start && e.startYM <= end) out.push(e.startYM);
  } else if (e.pattern === 'repeat') {
    const every = Math.max(1, e.everyYears) * 12;
    const last = Math.min(end, e.endYM ?? end);
    for (let m = e.startYM; m <= last; m += every) if (m >= start) out.push(m);
  }
  return out;
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

/** 月の収支の内訳のカテゴリ（FP画面の円グラフと同じ） */
export type PartCat = 'income' | 'living' | 'housing' | 'education' | 'insurance' | 'saving' | 'other' | 'fundPaid';

/** 項目ごとの毎月の金額（丸める前）。FP画面の内訳表示に使う */
export interface Part {
  cat: PartCat;
  key: string;
  label: string;
  /** 値を変える入力画面 */
  sheet: string;
  props?: Record<string, string>;
  /** 一時的な支出・収入（購入時の頭金、入学費用、退職金など） */
  once?: boolean;
  /** 購入後の勤労収入（シナリオの収入倍率を掛ける） */
  work?: boolean;
  v: number[];
}

class Parts {
  map = new Map<string, Part>();
  constructor(readonly n: number) {}
  add(i: number, cat: PartCat, key: string, label: string, value: number, meta?: Partial<Pick<Part, 'sheet' | 'props' | 'once' | 'work'>>) {
    if (!value) return;
    const k = `${cat}:${key}`;
    let p = this.map.get(k);
    if (!p) {
      p = { cat, key, label, sheet: meta?.sheet ?? '', props: meta?.props, once: meta?.once, work: meta?.work, v: new Array<number>(this.n).fill(0) };
      this.map.set(k, p);
    }
    p.v[i] += value;
  }
  list(): Part[] {
    return [...this.map.values()];
  }
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
  educationOnce: number[];
  insurance: number[];
  debt: number[];
  otherExpense: number[];
  otherIncome: number[];
  fundIn: number[];
  fundOut: number[];
}

const preCache = new WeakMap<Resolved, Map<number, Pre>>();

function prepare(r: Resolved, inflationDelta: number, rec?: Parts): Pre {
  let byDelta = preCache.get(r);
  if (!byDelta) {
    byDelta = new Map();
    preCache.set(r, byDelta);
  }
  const hit = rec ? undefined : byDelta.get(inflationDelta);
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
    living: mk(), education: mk(), educationOnce: mk(), insurance: mk(), debt: mk(), otherExpense: mk(), otherIncome: mk(), fundIn: mk(), fundOut: mk(),
  };
  // 目的別の積立: 1回だけ・数年ごとの支出を、前回の支払いの翌月（初回は今月）から支払いの前月までに均等に積み立て、積立から払う
  const funded = new Set<string>();
  for (const e of plan.events) {
    if (!e.fund || e.kind !== 'expense' || e.pattern === 'monthly') continue;
    const occ = eventMonths(e, r.start, r.end);
    let from = r.start;
    for (const ym of occ) {
      const months = ym - from;
      if (months > 0) {
        const amount = Math.round(e.inflate ? e.amount * Math.pow(1 + infl, ymYear(ym) - baseYear) : e.amount);
        const per = Math.floor(amount / months);
        for (let m = from; m < ym; m++) {
          const v = m === ym - 1 ? amount - per * (months - 1) : per;
          pre.fundIn[m - r.start] += v;
          rec?.add(m - r.start, 'saving', `fund:${e.id}`, `${e.name}の積立`, v, { sheet: 'eventEdit', props: { id: e.id } });
        }
        pre.fundOut[ym - r.start] += amount;
        rec?.add(ym - r.start, 'fundPaid', e.id, e.name, amount, { sheet: 'eventEdit', props: { id: e.id }, once: true });
        funded.add(`${e.id}:${ym}`);
      }
      from = ym + 1;
    }
  }
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
      rec?.add(i, 'income', `salary:${p.id}`, `${p.name}の給与`, w.salary, { sheet: 'income', work: true });
      rec?.add(i, 'income', `benefit:${p.id}`, `${p.name}の育休・時短の給付`, w.benefit, { sheet: 'work', work: true });
      if ((mon === 6 || mon === 12) && p.bonus > 0 && m < p.retireYM) {
        const window = [...hist];
        while (window.length < 6) window.unshift(1);
        const avg = window.reduce((s, v) => s + v, 0) / 6;
        const b = (p.bonus / 2) * Math.pow(1 + p.raise, aprilsBetween(r.start, m)) * avg;
        bonus += b;
        rec?.add(i, 'income', `bonus:${p.id}`, `${p.name}の賞与`, b, { sheet: 'income', work: true });
      }
      if (m === p.retireYM) {
        retireBonus += p.retireBonus;
        rec?.add(i, 'income', `retire:${p.id}`, `${p.name}の退職金`, p.retireBonus, { sheet: 'income', once: true });
      }
      if (m >= p.pensionYM) {
        const pv = p.pension * Math.pow(1 + pensionGrowth, y - baseYear);
        pension += pv;
        rec?.add(i, 'income', `pension:${p.id}`, `${p.name}の年金`, pv, { sheet: 'income' });
      }
    }
    pre.salary[i] = salary;
    pre.benefit[i] = benefit;
    pre.bonus[i] = bonus;
    pre.pension[i] = Math.round(pension);
    pre.retireBonus[i] = Math.round(retireBonus);
    if (a.childAllowance) {
      pre.allowance[i] = childAllowance(plan.children, m);
      rec?.add(i, 'income', 'allowance', '児童手当', pre.allowance[i], { sheet: 'children' });
    }

    const retiredAll = m >= r.retireAllYM;
    let living = (retiredAll ? r.retireLiving : r.livingTotal) * f;
    if (rec) {
      if (retiredAll) rec.add(i, 'living', 'retire', '老後の生活費', r.retireLiving * f, { sheet: 'assumptions', props: { page: 'life' } });
      else {
        for (const x of plan.living) rec.add(i, 'living', `item:${x.id}`, x.name, x.monthly * f, { sheet: 'living' });
        const pk = plan.pocket;
        if (pk) {
          rec.add(i, 'living', 'pocket:self', `${r.people[0]?.name ?? '本人'}のお小遣い`, (pk.self ?? 0) * f, { sheet: 'living', props: { page: 'pocket' } });
          if (plan.spouse) rec.add(i, 'living', 'pocket:spouse', `${r.people[1]?.name ?? '配偶者'}のお小遣い`, (pk.spouse ?? 0) * f, { sheet: 'living', props: { page: 'pocket' } });
          rec.add(i, 'living', 'pocket:free', '自由費', (pk.free ?? 0) * f, { sheet: 'living', props: { page: 'pocket' } });
        }
      }
    }
    let edu = 0;
    let once = 0;
    for (const c of plan.children) {
      const cm = childMonth(c, m, a.childLiving);
      edu += (cm.edu - cm.once) * f;
      once += cm.once * f;
      living += cm.living * f;
      if (rec) {
        rec.add(i, 'living', `child:${c.id}`, `${c.name}の生活費（食費など）`, cm.living * f, { sheet: 'assumptions', props: { page: 'kids' } });
        for (const k of Object.keys(cm.parts) as EduPart[])
          rec.add(i, 'education', `${c.id}:${k}`, `${c.name} ${EDU_PART_LABEL[k]}`, (cm.parts[k] ?? 0) * f, { sheet: 'childEdit', props: { id: c.id }, once: k === 'entrance' });
      }
    }
    pre.living[i] = Math.round(living);
    pre.educationOnce[i] = Math.round(once);
    pre.education[i] = Math.round(edu) + pre.educationOnce[i];

    let ins = 0, insIn = 0;
    for (const x of r.insurances) {
      if ((x.startYM == null || m >= x.startYM) && (x.endYM == null || m <= x.endYM)) {
        ins += x.monthly;
        rec?.add(i, 'insurance', x.id, x.name, x.monthly, { sheet: 'insEdit', props: { id: x.id } });
      }
      for (const l of x.lumps) {
        if (l.ym !== m) continue;
        insIn += l.amount;
        rec?.add(i, 'income', `ins:${x.id}`, `${x.name}の受取`, l.amount, { sheet: 'insEdit', props: { id: x.id }, once: true });
      }
      const an = x.annuity;
      if (an && m >= an.startYM && m < an.startYM + an.months) {
        insIn += an.monthly;
        rec?.add(i, 'income', `ins:${x.id}`, `${x.name}の受取`, an.monthly, { sheet: 'insEdit', props: { id: x.id } });
      }
    }
    pre.insurance[i] = Math.round(ins);

    let debt = 0;
    for (const d of plan.debts)
      if (m <= d.endYM) {
        debt += d.monthly;
        rec?.add(i, 'other', `debt:${d.id}`, d.name, d.monthly, d.std === 'car' ? { sheet: 'living', props: { page: 'car' } } : { sheet: 'debtEdit', props: { id: d.id } });
      }
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
      if (!hit || funded.has(`${e.id}:${m}`)) continue;
      const amt = e.inflate ? e.amount * f : e.amount;
      const meta = { sheet: 'eventEdit', props: { id: e.id }, once: e.pattern !== 'monthly' };
      if (e.kind === 'expense') {
        evOut += amt;
        rec?.add(i, 'other', `ev:${e.id}`, e.name, amt, meta);
      } else {
        evIn += amt;
        rec?.add(i, 'income', `ev:${e.id}`, e.name, amt, meta);
      }
    }
    pre.otherExpense[i] = Math.round(evOut);
    pre.otherIncome[i] = Math.round(evIn + insIn);
  }
  if (!rec) byDelta.set(inflationDelta, pre);
  return pre;
}

/**
 * 月次シミュレーション。
 * すべての金額は各月の項目ごとに円単位へ丸めてから足し合わせるため、
 * 月次 → 年次の集計と残高の増減は円単位で一致する。
 */
export function simulate(r: Resolved, purchase: Purchase | null, sc: Scenario, opts?: { detail?: boolean }): SimResult {
  const plan = r.plan;
  const rec = opts?.detail ? new Parts(r.end - r.start + 1) : undefined;
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
  let fund = 0;
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

  const pre = prepare(r, sc.inflationDelta, rec);
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
      living: 0, housing: 0, rent: 0, upkeep: 0, housingOnce: 0, loanPayment: 0, loanBonus: 0, loanInterest: 0, education: 0, educationOnce: 0,
      insurance: 0, debt: 0, otherExpense: 0, contrib: 0, fundIn: 0, fundOut: 0, withdraw: 0, autoWithdraw: 0, gain: 0, invTax: 0, cash: 0, invest: 0, fund: 0, loanBalance: 0, need: 0,
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
    row.educationOnce = pre.educationOnce[i];
    row.insurance = pre.insurance[i];
    row.debt = pre.debt[i];
    row.otherExpense = pre.otherExpense[i];
    row.otherIncome = pre.otherIncome[i];
    row.fundIn = pre.fundIn[i];
    row.fundOut = pre.fundOut[i];
    fund += row.fundIn - row.fundOut;
    row.fund = fund;
    const retiredAll = m >= r.retireAllYM;

    // ---------- 住まい ----------
    let upkeep = 0;
    const rentEnd = purchase ? purchase.ym + Math.max(0, hp.overlapMonths) : Infinity;
    if (m < rentEnd) {
      row.rent = r.rent;
      rec?.add(i, 'housing', 'rent', '家賃', r.rent, { sheet: 'housing', props: { page: 'now' } });
    }
    if (purchase) {
      const hm = purchase.house;
      if (m === purchase.ym) {
        row.housingOnce = Math.round(purchase.down + (hp.movingCost ?? 0));
        row.gift = Math.round(hp.gift);
        if (rec) {
          rec.add(i, 'housing', 'down', '頭金・諸費用（購入時に現金で払う分）', purchase.down, { sheet: 'housing', props: { page: 'plan' }, once: true });
          rec.add(i, 'housing', 'moving', '引越し・家具など', hp.movingCost ?? 0, { sheet: 'housing', props: { page: 'plan' }, once: true });
          rec.add(i, 'income', 'gift', '親などからの援助', hp.gift, { sheet: 'housing', props: { page: 'plan' }, once: true });
        }
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
        upkeep = tax / 12 + hm.insuranceAnnual / 12 + hm.maintenanceMonthly * f + hm.parkingMonthly;
        if (rec) {
          const cost = { sheet: 'housing', props: { page: 'cost' } };
          rec.add(i, 'housing', 'tax', '固定資産税・都市計画税', tax / 12, cost);
          rec.add(i, 'housing', 'fire', '火災・地震保険', hm.insuranceAnnual / 12, cost);
          rec.add(i, 'housing', 'maint', hm.kind === 'mansion' ? '管理費・修繕積立金' : '修繕費の積立', hm.maintenanceMonthly * f, cost);
          rec.add(i, 'housing', 'parking', '駐車場', hm.parkingMonthly, cost);
        }
      }
      if (schedule) {
        const k = m - purchase.ym;
        if (k >= 1 && k <= schedule.months) {
          row.loanPayment = schedule.monthly[k - 1] + schedule.bonus[k - 1];
          row.loanBonus = schedule.bonus[k - 1];
          if (rec) {
            rec.add(i, 'housing', 'loan', '住宅ローンの返済', schedule.monthly[k - 1], { sheet: 'loanTerms' });
            rec.add(i, 'housing', 'loanBonus', '住宅ローンのボーナス返済', schedule.bonus[k - 1], { sheet: 'loanTerms' });
          }
          row.loanInterest = schedule.interest[k - 1];
          row.loanBalance = schedule.balance[k - 1];
        } else if (k < 1) {
          row.loanBalance = k === 0 ? purchase.loan : 0;
        }
      }
      row.deduction = deductionByMarch.get(m) ?? 0;
      rec?.add(i, 'income', 'deduction', '住宅ローン控除', row.deduction, { sheet: 'housing', props: { page: 'tax' } });
    }
    row.upkeep = Math.round(upkeep);
    row.housing = row.rent + row.upkeep + row.loanPayment;

    // 予備資金の基準は「毎月かかる支出」。入学費用やボーナス月の返済のような一時的な支出で基準を跳ね上げない
    row.need = row.living + (row.housing - row.loanBonus) + (row.education - row.educationOnce) + row.insurance + row.debt;

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
        rec?.add(i, 'saving', x.id, x.name, c, { sheet: 'invEdit', props: { id: x.id } });
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
    cash += income - spend - contrib - row.fundIn + withdraw - invTax;

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

  let parts: Part[] | undefined;
  if (rec) {
    parts = rec.list();
    // 購入後の勤労収入には、シナリオの収入倍率を掛ける（行の値と同じ）
    if (purchase && sc.incomeFactor !== 1)
      for (const pt of parts) if (pt.work) for (let i = Math.max(0, purchase.ym - r.start); i < pt.v.length; i++) pt.v[i] *= sc.incomeFactor;
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
    parts,
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
