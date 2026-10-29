import { incomeOf, spendOf, type PartCat, type SimResult } from './simulate';
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
        living: 0, housing: 0, education: 0, insurance: 0, debt: 0, otherExpense: 0, spend: 0, contrib: 0, withdraw: 0,
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
    cur.withdraw += r.withdraw + r.autoWithdraw;
    cur.gain += r.gain;
    cur.invTax += r.invTax;
    cur.net = cur.income - cur.spend - cur.contrib;
    cur.cashEnd = r.cash;
    cur.investEnd = r.invest;
    cur.loanEnd = r.loanBalance;
    if (p && r.ym >= p.ym) {
      const yearsOwned = (r.ym - p.ym) / 12;
      const life = p.house.kind === 'mansion' ? 47 : 30;
      const bldg = p.house.buildingPrice * Math.max(0.1, 1 - yearsOwned / life);
      cur.homeValue = Math.round(p.house.landPrice + bldg);
    } else cur.homeValue = 0;
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
export function monthPie(y: YearRow): { income: Yen; slices: PieSlice[]; withdraw: Yen } {
  const n = Math.max(1, y.months);
  const income = Math.round(y.income / n);
  const items: PieSlice[] = [
    { key: 'living', label: '生活費', value: Math.round(y.living / n) },
    { key: 'housing', label: '住宅費', value: Math.round(y.housing / n) },
    { key: 'education', label: '教育費', value: Math.round(y.education / n) },
    { key: 'insurance', label: '保険', value: Math.round(y.insurance / n) },
    { key: 'saving', label: '貯蓄・投資', value: Math.round(y.contrib / n) },
    { key: 'other', label: 'その他支出', value: Math.round((y.debt + y.otherExpense) / n) },
  ];
  const used = items.reduce((s, x) => s + x.value, 0);
  items.push({ key: 'rest', label: '残額', value: income - used });
  return { income, slices: items, withdraw: Math.round(y.withdraw / n) };
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
}
export type PieDetail = Record<PieSlice['key'], DetailRow[]>;

const SLICE_CAT: Record<Exclude<PieSlice['key'], 'rest'>, PartCat> = {
  living: 'living', housing: 'housing', education: 'education', insurance: 'insurance', saving: 'saving', other: 'other',
};

/**
 * 年ごとの「平均的な1か月」の項目別内訳。各項目の合計は円グラフの値と円単位で一致させる
 * （月ごとの丸めの差は最も大きい行で調整する）。sim は detail 付きで計算したもの。
 */
export function pieDetails(sim: SimResult, years: YearRow[]): PieDetail[] {
  const parts = sim.parts ?? [];
  const out: PieDetail[] = [];
  let i0 = 0;
  for (const y of years) {
    const n = Math.max(1, y.months);
    const pie = monthPie(y);
    const sums = new Map<PartCat, DetailRow[]>();
    for (const pt of parts) {
      let v = 0;
      for (let i = i0; i < i0 + y.months; i++) v += pt.v[i];
      if (Math.abs(v) < 0.5) continue;
      const list = sums.get(pt.cat) ?? [];
      list.push({ key: pt.key, label: pt.label, value: v / n, sheet: pt.sheet, props: pt.props, once: pt.once });
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
    out.push(d);
    i0 += y.months;
  }
  return out;
}
