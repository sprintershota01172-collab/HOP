/**
 * 年ごとの「家計のゆとり」判定（緑＝ゆとり / 黄＝きつくなり始め / 赤＝きつい）。
 *
 * 一時的な支出（頭金・入学費用・イベント）や一時的な収入（退職金・援助）で1年の収支が大きく振れるため、
 * 一時的なものを除いた月平均の余りと、「現金がいちばん減った月」を分けて見る。
 *
 * 現役（全員が退職した年まで）
 *   赤: 月平均で赤字 / 現金がマイナス / 現金が予備資金（毎月の支出 × 予備資金の月数）を下回る
 *   黄: 余りが収入の10%未満 / ボーナスのない月が赤字 / 現金が予備資金の2倍未満 / 積立・投資まで含めると現金が減っていく
 * 老後（全員が退職する年から）: 年金などで足りない分は資産から払うのが前提なので、資産が持つかで見る
 *   赤: 資産（現金・積立・投資）が尽きる / 年末の資産が予備資金を下回る
 *   黄: いまのペースだと資産が10年以内に尽きる（計算の終わりまでに尽きる場合）/ 現金が足りず投資の取崩しが要る
 */
import { incomeOf, spendOf, type SimResult } from './simulate';
import { yenText } from './text';
import type { Yen, YM } from './types';
import { ymMonth, ymYear } from './ym';

export type HealthLevel = 'ok' | 'warn' | 'tight';

/** 判定のものさし */
export const HEALTH = {
  /** 黄: 月平均の余りが収入のこの割合未満 */
  warnRate: 0.1,
  /** 黄: 現金が予備資金のこの倍数未満 */
  warnReserve: 2,
  /** 黄（老後）: 資産が持つ年数がこれ未満 */
  warnRunway: 10,
} as const;

export interface HealthReason {
  level: HealthLevel;
  text: string;
}

export interface YearHealth {
  year: number;
  level: HealthLevel;
  /** 全員が退職する年とその後（資産が持つかで判定） */
  retired: boolean;
  /** 判定の理由（重い順。ゆとりの年は良い点） */
  reasons: HealthReason[];
  months: number;
  /** 収入（月平均。退職金・援助などの一時的な収入を除く） */
  income: Yen;
  /** 支出（月平均。頭金・入学費用・イベントなどの一時的な支出を除く） */
  spend: Yen;
  /** 月の余り（月平均）= 収入 − 支出。投資の積立・目的別の積立の前 */
  surplus: Yen;
  /** ボーナスのない月の余り（ボーナスのある年だけ） */
  noBonus: Yen | null;
  /** 余りの割合（収入に対して）。収入がなければ null */
  rate: number | null;
  /** 投資の積立・目的別の積立（月平均） */
  saving: Yen;
  /** 一時的な支出（年の合計） */
  once: Yen;
  /** 一時的な収入（年の合計） */
  onceIncome: Yen;
  /** 年間収支（収入 − 支出 − 積立。年の収支と同じ） */
  net: Yen;
  /** 年内で現金がいちばん少ない月と額 */
  cashMin: Yen;
  cashMinYM: YM;
  /** その月の予備資金の目安（毎月かかる支出 × 予備資金の月数） */
  reserve: Yen;
  reserveMonths: number;
  /** 現金がいちばん少ない月に、毎月の支出の何か月分あるか */
  cashMonths: number | null;
  /** 年末の資産（現金・目的別の積立・投資） */
  assets: Yen;
  /** 老後: いまのペースで資産が持つ年数（足りない分がなければ null） */
  runway: number | null;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const mo = (v: number) => (v >= 10 ? `${Math.round(v)}` : `${Math.floor(v * 10) / 10}`);

/** 年ごとの家計のゆとり */
export function yearHealth(sim: SimResult, opt: { reserveMonths: number; retireAllYM: YM }): YearHealth[] {
  const byYear = new Map<number, typeof sim.rows>();
  for (const r of sim.rows) {
    const y = ymYear(r.ym);
    const list = byYear.get(y);
    if (list) list.push(r);
    else byYear.set(y, [r]);
  }
  const lastYear = ymYear(sim.rows[sim.rows.length - 1]?.ym ?? 0);
  const retireYear = ymYear(opt.retireAllYM);
  const rm = Math.max(0, opt.reserveMonths);
  const out: YearHealth[] = [];
  for (const [year, rows] of byYear) {
    const n = rows.length;
    let inc = 0, onceIn = 0, spend = 0, once = 0, contrib = 0, fund = 0;
    // ボーナスのない月だけの収支（一時的なものを除く）
    let nbInc = 0, nbSpend = 0, nb = 0;
    let cashMin = Infinity, cashMinYM = rows[0].ym, reserve = 0, ratioMin = Infinity, assetsMin = Infinity;
    for (const r of rows) {
      const oi = r.retireBonus + r.gift;
      inc += incomeOf(r) - oi;
      onceIn += oi;
      const os = r.housingOnce + r.educationOnce + r.otherExpense;
      spend += spendOf(r) - os;
      once += os;
      contrib += r.contrib;
      fund += r.fundIn;
      if (r.bonus === 0) {
        nbInc += incomeOf(r) - oi;
        nbSpend += spendOf(r) - os;
        nb++;
      }
      if (r.cash < cashMin) {
        cashMin = r.cash;
        cashMinYM = r.ym;
        reserve = Math.round(rm * r.need);
      }
      if (r.need > 0) ratioMin = Math.min(ratioMin, r.cash / r.need);
      assetsMin = Math.min(assetsMin, r.cash + r.fund + r.invest);
    }
    const last = rows[n - 1];
    const assets = last.cash + last.fund + last.invest;
    const income = Math.round(inc / n);
    const spendM = Math.round(spend / n);
    const surplus = income - spendM;
    const rate = income > 0 ? surplus / income : null;
    const saving = Math.round((contrib + fund) / n);
    const net = inc + onceIn - spend - once - contrib - fund;
    const cashMonths = Number.isFinite(ratioMin) ? ratioMin : null;
    // ボーナスのある年に、ボーナスのない月が赤字（ボーナス頼み）
    const noBonus = nb > 0 && nb < n ? Math.round(nbInc / nb) - Math.round(nbSpend / nb) : null;
    // 全員が退職する年からは、資産が持つかで見る（退職の年は給与が途中で止まり、月平均が赤字になるのが普通のため）
    const retired = year >= retireYear;
    const reasons: HealthReason[] = [];
    const add = (level: HealthLevel, text: string) => reasons.push({ level, text });
    const minMonth = `${ymMonth(cashMinYM)}月`;
    let runway: number | null = null;

    if (!retired) {
      // ---------- 現役 ----------
      if (surplus < 0) add('tight', `月平均で赤字（一時的な支出を除いても月${yenText(-surplus)}足りない）`);
      if (cashMin < 0) add('tight', `${minMonth}に現金がマイナス（${yenText(-cashMin)}足りない）`);
      else if (cashMonths != null && cashMonths < rm)
        add('tight', `${minMonth}に現金が生活費の${mo(cashMonths)}か月分まで減る（予備資金${rm}か月分を下回る）${once > 0 ? '。一時的な支出の影響' : ''}`);
      if (surplus >= 0 && rate != null && rate < HEALTH.warnRate) add('warn', `余りが収入の${Math.floor(rate * 100)}%だけ（目安は${pct(HEALTH.warnRate)}以上）`);
      if (cashMin >= 0 && cashMonths != null && cashMonths >= rm && cashMonths < rm * HEALTH.warnReserve)
        add('warn', `${minMonth}に現金が生活費の${mo(cashMonths)}か月分まで減る（目安は${rm * HEALTH.warnReserve}か月分以上）`);
      if (surplus >= 0 && noBonus != null && noBonus < 0) add('warn', `ボーナスのない月は月${yenText(-noBonus)}の赤字（ボーナス頼み）`);
      if (surplus >= 0 && surplus - saving < 0)
        add('warn', `積立・投資（月${yenText(saving)}）まで入れると、毎月${yenText(saving - surplus)}ずつ現金が減る`);
      if (!reasons.length) {
        add('ok', `月平均で${yenText(surplus)}の余り${rate != null ? `（収入の${pct(rate)}）` : ''}`);
        if (cashMonths != null) add('ok', `現金はいちばん少ない月でも生活費の${mo(cashMonths)}か月分`);
      }
    } else {
      // ---------- 老後 ----------
      const short = -(surplus * 12); // 一時的なものを除いて1年に足りない分
      runway = short > 0 ? Math.max(0, assets) / short : null;
      const remain = lastYear - year;
      if (assetsMin < 0) add('tight', `資産（現金・投資）が尽きる（${yenText(-assetsMin)}足りない）`);
      else if (last.need > 0 && assets / last.need < rm)
        add('tight', `年末の資産が生活費の${mo(Math.max(0, assets / Math.max(1, last.need)))}か月分しか残らない`);
      else if (runway != null && runway < HEALTH.warnRunway && runway < remain)
        add('warn', `いまのペースだと約${Math.max(1, Math.round(runway))}年で資産が尽きる（年金などで月${yenText(-surplus)}足りない）`);
      if (assetsMin >= 0 && cashMin < 0) add('warn', `${minMonth}に現金が足りない（投資の取崩しが必要）`);
      if (!reasons.length) {
        if (surplus >= 0) add('ok', `年金などで毎月の支出をまかなえている（月${yenText(surplus)}の余り）`);
        else add('ok', `毎月の不足${yenText(-surplus)}は資産でまかなえる${runway != null && runway < remain + 1 ? `（約${Math.round(runway)}年分）` : '（計算の終わりまで持つ）'}`);
      }
    }
    const level: HealthLevel = reasons.some((x) => x.level === 'tight') ? 'tight' : reasons.some((x) => x.level === 'warn') ? 'warn' : 'ok';
    reasons.sort((a, b) => rank(b.level) - rank(a.level));
    out.push({
      year, level, retired, reasons, months: n, income, spend: spendM, surplus, noBonus, rate, saving, once, onceIncome: onceIn, net,
      cashMin, cashMinYM, reserve, reserveMonths: rm, cashMonths, assets, runway,
    });
  }
  return out;
}

const rank = (l: HealthLevel) => (l === 'tight' ? 2 : l === 'warn' ? 1 : 0);

/** 同じ判定が続く期間（その年を含む） */
export function healthSpan(list: YearHealth[], year: number): { from: number; to: number } | null {
  const i = list.findIndex((x) => x.year === year);
  if (i < 0) return null;
  let a = i, b = i;
  while (a > 0 && list[a - 1].level === list[i].level) a--;
  while (b < list.length - 1 && list[b + 1].level === list[i].level) b++;
  return { from: list[a].year, to: list[b].year };
}
