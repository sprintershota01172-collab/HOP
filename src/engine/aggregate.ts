import { homeValueAt, incomeOf, spendOf, type PartCat, type SimResult } from './simulate';
import type { Yen } from './types';
import { ymYear } from './ym';

export interface YearRow {
  year: number;
  months: number;
  income: Yen;
  salary: Yen;
  bonus: Yen;
  benefit: Yen;
  pension: Yen;
  allowance: Yen;
  otherIncome: Yen;
  living: Yen;
  housing: Yen;
  education: Yen;
  insurance: Yen;
  debt: Yen;
  otherExpense: Yen;
  spend: Yen;
  contrib: Yen;
  /** 目的別の積立（旅行など） */
  fund: Yen;
  /** 積立から払った支出 */
  fundOut: Yen;
  /** 先取り貯金 */
  save: Yen;
  withdraw: Yen;
  gain: Yen;
  invTax: Yen;
  /** 年間収支 = 収入 − 支出 − 積立 */
  net: Yen;
  cashEnd: Yen;
  investEnd: Yen;
  loanEnd: Yen;
  /** 住宅の参考評価額 */
  homeValue: Yen;
  netWorth: Yen;
}

/** 月次の結果を合計して年次表を作る（年次は必ず月次の合計） */
export function toYears(sim: SimResult): YearRow[] {
  const out: YearRow[] = [];
  let cur: YearRow | null = null;
  const p = sim.purchase;
  for (const r of sim.rows) {
    const y = ymYear(r.ym);
    if (!cur || cur.year !== y) {
      cur = {
        year: y, months: 0, income: 0, salary: 0, bonus: 0, benefit: 0, pension: 0, allowance: 0, otherIncome: 0,
        living: 0, housing: 0, education: 0, insurance: 0, debt: 0, otherExpense: 0, spend: 0, contrib: 0, fund: 0, fundOut: 0, save: 0, withdraw: 0,
        gain: 0, invTax: 0, net: 0, cashEnd: 0, investEnd: 0, loanEnd: 0, homeValue: 0, netWorth: 0,
      };
      out.push(cur);
    }
    cur.months++;
    cur.income += incomeOf(r);
    cur.salary += r.salary;
    cur.bonus += r.bonus;
    cur.benefit += r.benefit;
    cur.pension += r.pension;
    cur.allowance += r.allowance;
    cur.otherIncome += r.otherIncome + r.retireBonus + r.deduction + r.gift;
    cur.living += r.living;
    cur.housing += r.housing + r.housingOnce;
    cur.education += r.education;
    cur.insurance += r.insurance;
    cur.debt += r.debt;
    cur.otherExpense += r.otherExpense;
    cur.spend += spendOf(r);
    cur.contrib += r.contrib;
    cur.fund += r.fundIn;
    cur.fundOut += r.fundOut;
    cur.save += r.saveIn;
    cur.withdraw += r.withdraw + r.autoWithdraw;
    cur.gain += r.gain;
    cur.invTax += r.invTax;
    cur.net = cur.income - cur.spend - cur.contrib - cur.fund;
    // 現金には目的別の積立（銀行に置いたまま）を含めて表示する
    cur.cashEnd = r.cash + r.fund;
    cur.investEnd = r.invest;
    cur.loanEnd = r.loanBalance;
    if (p && r.ym >= p.ym && (sim.soldYM == null || r.ym < sim.soldYM)) cur.homeValue = homeValueAt(p.house, (r.ym - p.ym) / 12);
    else cur.homeValue = 0;
    cur.netWorth = cur.cashEnd + cur.investEnd + cur.homeValue - cur.loanEnd;
  }
  return out;
}

export interface PieSlice {
  key: 'living' | 'housing' | 'education' | 'insurance' | 'saving' | 'other' | 'rest';
  label: string;
  value: Yen;
}

/** その年の「平均的な1か月」の内訳。合計は必ず月平均の収入と一致する */
export function monthPie(y: YearRow): { income: Yen; slices: PieSlice[]; withdraw: Yen; fundOut: Yen } {
  const n = Math.max(1, y.months);
  const income = Math.round(y.income / n);
  const items: PieSlice[] = [
    { key: 'living', label: '生活費', value: Math.round(y.living / n) },
    { key: 'housing', label: '住宅費', value: Math.round(y.housing / n) },
    { key: 'education', label: '教育費', value: Math.round(y.education / n) },
    { key: 'insurance', label: '保険', value: Math.round(y.insurance / n) },
    { key: 'saving', label: '貯蓄・投資', value: Math.round((y.contrib + y.fund + y.save) / n) },
    { key: 'other', label: 'その他支出', value: Math.round((y.debt + y.otherExpense) / n) },
  ];
  const used = items.reduce((s, x) => s + x.value, 0);
  items.push({ key: 'rest', label: '残額', value: income - used });
  return { income, slices: items, withdraw: Math.round(y.withdraw / n), fundOut: Math.round(y.fundOut / n) };
}

/** 円グラフの項目の内訳の1行（月平均） */
export interface DetailRow {
  key: string;
  label: string;
  value: Yen;
  op?: '+' | '−';
  /** 値を変える入力画面 */
  sheet: string;
  props?: Record<string, string>;
  /** 一時的な支出・収入を12か月で平均したもの */
  once?: boolean;
  /** 年の途中から（まで）の項目: 「11月から」など */
  span?: string;
  /** span がある場合の、その期間の月額 */
  perMonth?: Yen;
}
/** fundPaid: その年に積立から払った支出（年の合計） */
export type PieDetail = Record<PieSlice['key'], DetailRow[]> & { fundPaid: DetailRow[] };

const SLICE_CAT: Record<Exclude<PieSlice['key'], 'rest'>, PartCat> = {
  living: 'living', housing: 'housing', education: 'education', insurance: 'insurance', saving: 'saving', other: 'other',
};

/**
 * 年ごとの「平均的な1か月」の項目別内訳。各項目の合計は円グラフの値と円単位で一致させる
 * （月ごとの丸めの差は最も大きい行で調整する）。sim は detail 付きで計算したもの。
 */
export function pieDetails(sim: SimResult, years: YearRow[]): PieDetail[] {
  const out: PieDetail[] = [];
  let i0 = 0;
  for (const y of years) {
    out.push(detailOf(sim, Array.from({ length: y.months }, (_, k) => i0 + k), y));
    i0 += y.months;
  }
  return out;
}

/** 指定した月（行の番号）の平均の内訳。y はその月だけを合計した YearRow */
function detailOf(sim: SimResult, idx: number[], y: YearRow): PieDetail {
  const parts = sim.parts ?? [];
  const n = Math.max(1, y.months);
  const pie = monthPie(y);
  const sums = new Map<PartCat, DetailRow[]>();
  for (const pt of parts) {
    let v = 0;
    const act: number[] = [];
    for (const i of idx) {
      v += pt.v[i];
      if (Math.abs(pt.v[i]) >= 0.5) act.push(i);
    }
    if (Math.abs(v) < 0.5) continue;
    const row: DetailRow = { key: pt.key, label: pt.label, value: v / n, sheet: pt.sheet, props: pt.props, once: pt.once };
    // 毎月の項目が、選んだ期間の途中から始まる（途中で終わる）場合は、その月額も示す
    if (!pt.once && act.length > 0 && act.length < idx.length && act[act.length - 1] - act[0] + 1 === act.length) {
      const mon = (i: number) => (sim.rows[i].ym % 12) + 1;
      const starts = act[0] !== idx[0];
      const ends = act[act.length - 1] !== idx[idx.length - 1];
      if (starts !== ends) {
        row.span = starts ? `${mon(act[0])}月から` : `${mon(act[act.length - 1])}月まで`;
        row.perMonth = Math.round(v / act.length);
      }
    }
    const list = sums.get(pt.cat) ?? [];
    list.push(row);
    sums.set(pt.cat, list);
  }
  const fit = (rows: DetailRow[] | undefined, total: Yen): DetailRow[] => {
    const list = (rows ?? []).map((r) => ({ ...r, value: Math.round(r.value) })).filter((r) => r.value !== 0);
    list.sort((a, b) => b.value - a.value);
    const diff = total - list.reduce((t, r) => t + r.value, 0);
    if (diff !== 0) {
      if (list.length) list[0].value += diff;
      else list.push({ key: 'rounding', label: 'その他', value: diff, sheet: '' });
    }
    return list.filter((r) => r.value !== 0);
  };
  const d = {} as PieDetail;
  for (const sl of pie.slices) {
    if (sl.key === 'rest') continue;
    d[sl.key] = fit(sums.get(SLICE_CAT[sl.key]), sl.value).map((r) => ({ ...r, op: '−' as const }));
  }
  const rest = pie.slices.find((x) => x.key === 'rest')!;
  const income = fit(sums.get('income'), pie.income).map((r) => ({ ...r, op: '+' as const }));
  d.rest = [...income, { key: 'spent', label: '支出と積立の合計', value: pie.income - rest.value, op: '−', sheet: '' }];
  d.fundPaid = (sums.get('fundPaid') ?? []).map((r) => ({ ...r, value: Math.round(r.value * n) }));
  return d;
}

export type PieKind = 'avg' | 'normal' | 'bonus';
export interface MonthPie {
  kind: PieKind;
  months: number;
  income: Yen;
  slices: PieSlice[];
  withdraw: Yen;
  fundOut: Yen;
  detail: PieDetail;
}

/**
 * 年ごとの「月の収支」。賞与を6・12月に受け取る年は、
 * ふだんの月（6・12月以外）とボーナス月（6・12月）を分けて出す（年平均だと賞与が毎月に割られて見えるため）
 */
export function monthPies(sim: SimResult, years: YearRow[]): MonthPie[][] {
  const out: MonthPie[][] = [];
  let i0 = 0;
  for (const y of years) {
    const all = Array.from({ length: y.months }, (_, k) => i0 + k);
    const make = (kind: PieKind, idx: number[]): MonthPie => {
      const yy = toYears({ ...sim, rows: idx.map((i) => sim.rows[i]) })[0];
      const p = monthPie(yy);
      return { kind, months: idx.length, ...p, detail: detailOf(sim, idx, yy) };
    };
    const isBonusMonth = (i: number) => {
      const mon = (sim.rows[i].ym % 12) + 1;
      return mon === 6 || mon === 12;
    };
    const bonusIdx = all.filter(isBonusMonth);
    const normalIdx = all.filter((i) => !isBonusMonth(i));
    // 6・12月にだけ賞与がある（ほかの月にはない）年だけ分ける
    const special = bonusIdx.some((i) => sim.rows[i].bonus > 0) && normalIdx.every((i) => sim.rows[i].bonus === 0);
    const list: MonthPie[] = [];
    if (special && normalIdx.length) list.push(make('normal', normalIdx));
    if (special) list.push(make('bonus', bonusIdx));
    list.push(make('avg', all));
    out.push(list);
    i0 += y.months;
  }
  return out;
}
