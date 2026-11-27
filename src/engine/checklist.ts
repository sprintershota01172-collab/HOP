/**
 * 買う前のチェックリスト。
 * - 家計: 計算から自動で判定する項目（家賃とローンが重なる時期・家計のゆとり・予算・退職時のローン残高・メモの確認事項）
 * - 価格・ローン / 費用 / 物件 / 契約: 自分でチェックを付ける項目
 * - 追加: 自分で追加した項目
 */
import type { YearHealth } from './health';
import { incomeOf, spendOf, type SimResult } from './simulate';
import { yenText } from './text';
import type { Tier } from './recommend';
import type { AppData, Checklist, YM } from './types';
import { ymMonth, ymYear } from './ym';

export type { Checklist };

export const emptyChecklist = (): Checklist => ({ done: {}, custom: [] });

export type CheckPage = 'auto' | 'price' | 'cost' | 'life' | 'contract' | 'custom';

export const CHECK_PAGES: { value: CheckPage; label: string }[] = [
  { value: 'auto', label: '家計' },
  { value: 'price', label: '価格' },
  { value: 'cost', label: '費用' },
  { value: 'life', label: '物件' },
  { value: 'contract', label: '契約' },
  { value: 'custom', label: '追加' },
];

/** 自分でチェックを付ける項目 */
export const MANUAL_CHECKS: { id: string; page: Exclude<CheckPage, 'auto' | 'custom'>; text: string; hint: string }[] = [
  { id: 'aiPrice', page: 'price', text: 'AIで値段を比較した', hint: '同じ地域・広さ・築年数の売り出し価格や成約価格と比べて高すぎないか' },
  { id: 'compare3', page: 'price', text: '似た条件の物件を3件以上比べた', hint: 'お家比較に登録すると、家計との相性で並べられる' },
  { id: 'nego', page: 'price', text: '値引き・条件の交渉をした', hint: '価格のほか、設備・引渡し日・諸費用の負担も交渉できる' },
  { id: 'banks', page: 'price', text: '複数の銀行で金利・手数料・団信を比べた', hint: '金利が低くても、手数料や保証料で総額が逆転することがある' },
  { id: 'preApproval', page: 'price', text: 'ローンの事前審査が通った', hint: '借りられる額と、無理なく返せる額は別' },
  { id: 'miscQuote', page: 'cost', text: '諸費用・引越し・家具家電・外構の見積もりを入れた', hint: '購入計画の「引越し・家具など」と諸費用に反映する' },
  { id: 'insurance', page: 'cost', text: '火災・地震保険の見積もりを取った', hint: '水害の補償を付けるかはハザードマップで決める' },
  { id: 'upkeep', page: 'cost', text: '固定資産税・管理費・修繕積立金の今後を確認した', hint: 'マンションは修繕積立金の値上げ予定、戸建ては外壁・屋根の修繕費' },
  { id: 'coverage', page: 'cost', text: '団信に合わせて生命保険を見直した', hint: '団信で住居費がなくなる分、保障を減らせることがある' },
  { id: 'hazard', page: 'life', text: 'ハザードマップ（洪水・土砂・地震）を確認した', hint: '国土交通省のハザードマップポータルで住所から調べられる' },
  { id: 'visit', page: 'life', text: '朝・夜・休日に現地と通勤・通学を確かめた', hint: '騒音・日当たり・人通り・駅までの実際の時間' },
  { id: 'area', page: 'life', text: '学区・病院・スーパー・保育園を確認した', hint: '子供の進学や、将来の車の要らない暮らしも想像する' },
  { id: 'agree', page: 'life', text: '夫婦で予算と優先順位に合意した', hint: '譲れない条件と、あきらめる条件を2人で決める' },
  { id: 'docs', page: 'contract', text: '重要事項説明と契約書を事前にもらって読んだ', hint: '当日に初めて読むのではなく、数日前にもらう' },
  { id: 'loanClause', page: 'contract', text: '住宅ローン特約（審査に落ちたら白紙解約）が入っている', hint: '特約の期限と、対象の銀行・金額も確認する' },
  { id: 'schedule', page: 'contract', text: '引渡し日と今の家の退去日を決めた', hint: '家賃とローンが重なる月数を、いまの住まいの入力に入れる' },
  { id: 'deposit', page: 'contract', text: '手付金と解約の条件を確認した', hint: '手付解除の期限、違約金の額' },
];

export type CheckStatus = 'ok' | 'warn' | 'ng' | 'na';

export interface AutoCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  /** タップしたときに開く場所 */
  to: { tab?: 'fp' | 'loan' | 'memo'; sheet?: string; props?: Record<string, unknown> };
}

export interface AutoCheckInput {
  data: AppData;
  sim: SimResult | null;
  health: YearHealth[];
  purchaseYM: YM | null;
  retireAllYM: YM;
  /** 最初に退職する人の退職月（収入が大きく減る時期） */
  firstRetireYM: YM | null;
  /** FPの前提にしている住宅の判定（候補の家を前提にしている場合） */
  basisHouse: { name: string; tier: Tier } | null;
}

const months = (v: number) => (v >= 10 ? `${Math.round(v)}` : `${Math.floor(Math.max(0, v) * 10) / 10}`);
const ymText = (ym: YM) => `${ymYear(ym)}年${ymMonth(ym)}月`;

/** 年の並びを「2031〜2034年、2040年」のようにまとめる */
export function yearRanges(years: number[]): string {
  const out: string[] = [];
  let a = -1, b = -1;
  for (const y of [...years].sort((x, z) => x - z)) {
    if (a < 0) a = b = y;
    else if (y === b + 1) b = y;
    else {
      out.push(a === b ? `${a}年` : `${a}〜${b}年`);
      a = b = y;
    }
  }
  if (a >= 0) out.push(a === b ? `${a}年` : `${a}〜${b}年`);
  return out.length > 3 ? `${out.slice(0, 3).join('、')} ほか` : out.join('、');
}

/** 家計から自動で判定する項目 */
export function autoChecks(x: AutoCheckInput): AutoCheck[] {
  const { data, sim } = x;
  const hp = data.plan.housing;
  const rm = data.plan.assumptions.reserveMonths;
  const buying = hp.fpBasis !== 'none' && x.purchaseYM != null && !!sim;
  const out: AutoCheck[] = [];

  // ---------- 家賃とローンが重なる時期 ----------
  {
    const to = { sheet: 'housing', props: { page: 'now' } };
    if (!buying) {
      out.push({ id: 'overlap', title: '家賃とローンが重なる時期', status: 'na', detail: 'FPの前提が「購入しない」になっています。買う家（または予算）を前提にすると判定します', to: { sheet: 'fpBasis' } });
    } else {
      const rows = sim!.rows;
      const p = rows.findIndex((r) => r.ym === x.purchaseYM);
      const both = rows.filter((r) => r.rent > 0 && r.loanPayment > 0);
      // 購入の月から、重なる期間と不動産取得税（半年後）が過ぎるまで
      const win = p < 0 ? [] : rows.slice(p, p + Math.max(hp.overlapMonths, 1) + 7);
      let min = win[0];
      for (const r of win) if (r.cash < min.cash) min = r;
      const need = Math.max(1, min?.need ?? 1);
      const ratio = min ? min.cash / need : 0;
      const rent = Math.round(hp.rentMonthly ?? 0);
      let status: CheckStatus = !min || min.cash < 0 || ratio < rm ? 'ng' : ratio < rm * 2 ? 'warn' : 'ok';
      let detail: string;
      const cashText = min ? `この時期の現金はいちばん少ない${ymText(min.ym)}で${yenText(Math.max(0, min.cash))}（生活費${months(ratio)}か月分）` : '';
      if (both.length > 0) {
        const pay = Math.round(both.reduce((a, r) => a + r.loanPayment, 0) / both.length);
        // 一時的な支出（不動産取得税など）を除いた、その月の収入 − 支出
        const bal = Math.round(both.reduce((a, r) => a + incomeOf(r) - (spendOf(r) - r.housingOnce - r.educationOnce - r.otherExpense), 0) / both.length);
        detail = `${both.length}か月、家賃${yenText(rent)}と返済${yenText(pay)}が重なり、その月は${bal < 0 ? `毎月${yenText(-bal)}の赤字` : `毎月${yenText(bal)}の余り`}。${cashText}`;
      } else if (rent > 0) {
        // 重なりなしで入力されている: 退去が2か月遅れた場合も確かめる
        const extra = rent * 2;
        const after = min ? min.cash - extra : 0;
        if (status === 'ok' && after / need < rm * 2) status = 'warn';
        detail = `重なる月は0か月で計算中。${cashText}。退去が2か月遅れて家賃${yenText(extra)}が増えると、生活費${months(after / need)}か月分になる`;
      } else {
        detail = `いまの家賃がないため重なりません。${cashText}`;
      }
      if (status !== 'ok') detail += `。予備資金の目安は${rm}か月分、ゆとりを見るなら${rm * 2}か月分`;
      out.push({ id: 'overlap', title: '家賃とローンが重なる時期', status, detail, to });
    }
  }

  // ---------- 家計のゆとり ----------
  {
    const work = x.health.filter((h) => !h.retired);
    const old = x.health.filter((h) => h.retired);
    const tight = work.filter((h) => h.level === 'tight').map((h) => h.year);
    const warn = work.filter((h) => h.level === 'warn').map((h) => h.year);
    const oldTight = old.filter((h) => h.level === 'tight').map((h) => h.year);
    const oldWarn = old.filter((h) => h.level === 'warn').map((h) => h.year);
    let status: CheckStatus;
    let detail: string;
    if (!x.health.length) {
      status = 'na';
      detail = '入力が足りないため、まだ判定できません';
    } else if (tight.length || oldTight.length) {
      status = 'ng';
      detail = [tight.length ? `きつい（赤）年: ${yearRanges(tight)}` : '', oldTight.length ? `老後に資産が尽きる: ${yearRanges(oldTight)}` : ''].filter(Boolean).join('。');
    } else if (warn.length || oldWarn.length) {
      status = 'warn';
      detail = `きつくなり始め（黄）の年: ${yearRanges([...warn, ...oldWarn])}`;
    } else {
      status = 'ok';
      detail = '計算の終わりまで、すべての年が「ゆとり」（緑）';
    }
    out.push({ id: 'health', title: '家計がきつくなる年がない', status, detail, to: { tab: 'fp' } });
  }

  // ---------- 予算 ----------
  {
    const b = x.basisHouse;
    const TIER: Record<Tier, string> = { safe: '安心', standard: '標準', caution: '注意', danger: '危険' };
    if (hp.fpBasis === 'house' && b) {
      const status: CheckStatus = b.tier === 'safe' || b.tier === 'standard' ? 'ok' : b.tier === 'caution' ? 'warn' : 'ng';
      const why = b.tier === 'safe' ? '金利+2%と収入−10%が重なっても予備資金を保てる' : b.tier === 'standard' ? '想定どおりなら予備資金を保てる' : b.tier === 'caution' ? '金利上昇や収入減があると予備資金を割る' : '想定どおりでも予備資金を保てない';
      out.push({ id: 'budget', title: '買う家が予算の中', status, detail: `${b.name}: 家計との相性は「${TIER[b.tier]}」（${why}）`, to: { sheet: 'fpBasis' } });
    } else {
      out.push({
        id: 'budget', title: '買う家が予算の中', status: 'na',
        detail: hp.fpBasis === 'none' ? 'FPの前提が「購入しない」になっています' : '買う家をお家比較に登録し、FPの前提にすると判定します',
        to: { sheet: 'fpBasis' },
      });
    }
  }

  // ---------- 退職時のローン残高 ----------
  if (buying && x.firstRetireYM != null) {
    const rows = sim!.rows;
    const r = rows.find((z) => z.ym === x.firstRetireYM) ?? rows[rows.length - 1];
    const bal = r.loanBalance;
    const assets = r.cash + r.fund + r.invest;
    // 残っていても、貯蓄の2割以内なら一括で返せる
    const status: CheckStatus = bal <= 0 || bal <= assets * 0.2 ? 'ok' : bal <= assets * 0.5 ? 'warn' : 'ng';
    const when = `退職（${ymText(x.firstRetireYM)}）`;
    const detail = bal <= 0
      ? `${when}までに返し終わる`
      : `${when}のときの残高${yenText(bal)}、貯蓄（現金・投資）${yenText(assets)}。${status === 'ok' ? '貯蓄で一括返済できる' : status === 'warn' ? '一括返済すると貯蓄が2割以上減る' : '一括返済すると貯蓄の半分以上がなくなる'}`;
    out.push({ id: 'retireLoan', title: '退職時のローン残高を返せる', status, detail, to: { tab: 'loan' } });
  }

  // ---------- メモの確認事項 ----------
  {
    const open = data.memos.filter((m) => m.category === 'check' && !m.done);
    out.push({
      id: 'memoCheck', title: 'メモの確認事項が済んだ', status: open.length ? 'warn' : 'ok',
      detail: open.length ? `未完了 ${open.length}件: ${open.slice(0, 2).map((m) => m.title).join('、')}${open.length > 2 ? ' ほか' : ''}` : '未完了の確認事項はありません',
      to: { tab: 'memo' },
    });
  }
  return out;
}

export interface ChecklistSummary {
  /** 済んだ項目（自動は「問題なし」、手動・追加はチェック済み） */
  done: number;
  total: number;
  /** 自動判定で「要注意」「問題あり」の項目 */
  alerts: number;
}

export function checklistSummary(list: Checklist | undefined, auto: AutoCheck[]): ChecklistSummary {
  const c = list ?? emptyChecklist();
  const a = auto.filter((x) => x.status !== 'na');
  const done = a.filter((x) => x.status === 'ok').length + MANUAL_CHECKS.filter((m) => c.done[m.id]).length + c.custom.filter((m) => m.done).length;
  return { done, total: a.length + MANUAL_CHECKS.length + c.custom.length, alerts: a.filter((x) => x.status === 'warn' || x.status === 'ng').length };
}
