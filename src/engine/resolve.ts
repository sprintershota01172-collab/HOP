import { ASSUME, PENSION, RETIRE_LIVING_COUPLE } from './reference';
import { yenText } from './text';
import type { Owner, Plan, Yen, YM } from './types';
import { ageAt, formatYM } from './ym';

export interface RPerson {
  id: Owner;
  name: string;
  birthYM: YM;
  net: Yen;
  bonus: Yen;
  gross: Yen;
  raise: number;
  retireYM: YM;
  retireAge: number;
  retireBonus: Yen;
  pensionYM: YM;
  pension: Yen;
  cash: Yen;
}

export interface Assumed {
  key: string;
  label: string;
  value: string;
  /** 推奨額への影響の大きさ */
  impact: 'high' | 'mid' | 'low';
  /** 値を入力する画面 */
  sheet: string;
}

export interface Resolved {
  plan: Plan;
  ready: boolean;
  blocking: string[];
  people: RPerson[];
  assumed: Assumed[];
  confidence: { score: number; level: '高' | '中' | '低'; reasons: string[] };
  start: YM;
  end: YM;
  retireAllYM: YM;
  purchaseYM: YM;
  rent: Yen;
  retireLiving: Yen;
  livingTotal: Yen;
}

const man = yenText;

/** 未設定（null）を、計算できる値に解決する。仮置きした項目は assumed に記録する。 */
export function resolvePlan(plan: Plan): Resolved {
  const blocking: string[] = [];
  const assumed: Assumed[] = [];
  const a = plan.assumptions;
  const members = [plan.self, ...(plan.spouse ? [plan.spouse] : [])];
  const people: RPerson[] = [];

  for (const p of members) {
    const who = p.id === 'self' ? '本人' : '配偶者';
    if (p.birthYM == null) blocking.push(`${who}の生まれた年月`);
    if (p.netMonthly == null) blocking.push(`${who}の手取り月収`);
    if (p.cash == null) blocking.push(`${who}の現金・預金`);
    const net = p.netMonthly ?? 0;
    const bonus = p.bonusNetAnnual ?? 0;
    if (p.bonusNetAnnual == null && net > 0) assumed.push({ key: `${p.id}-bonus`, label: `${who}の賞与`, value: 'なしとして計算', impact: 'mid', sheet: 'income' });
    let gross = p.grossAnnual ?? 0;
    if (p.grossAnnual == null && net > 0) {
      gross = Math.round((net * 12 + bonus) * ASSUME.grossFromNet);
      assumed.push({ key: `${p.id}-gross`, label: `${who}の額面年収`, value: `手取りから推計 ${man(gross)}`, impact: 'low', sheet: 'income' });
    }
    // 昇給率の初期値は物価上昇率と同じ（実質賃金は横ばい）。物価だけが上がり続ける前提にしない
    const raise = p.raiseRate ?? a.inflation;
    if (p.raiseRate == null && net > 0) assumed.push({ key: `${p.id}-raise`, label: `${who}の昇給率`, value: `物価上昇率と同じ 年${(raise * 100).toFixed(1)}%（実質横ばい）`, impact: 'mid', sheet: 'income' });
    const retireAge = p.retireAge ?? ASSUME.retireAge;
    if (p.retireAge == null && net > 0) assumed.push({ key: `${p.id}-retire`, label: `${who}の退職年齢`, value: `${retireAge}歳`, impact: 'mid', sheet: 'income' });
    const pensionStartAge = p.pensionStartAge ?? ASSUME.pensionStartAge;
    const birthYM = p.birthYM ?? plan.baseYM - 30 * 12;
    let pension = p.pensionMonthly ?? 0;
    if (p.pensionMonthly == null) {
      const months = Math.max(0, (retireAge - PENSION.workStartAge) * 12);
      const prop = (gross / 12) * PENSION.proportionalRate * months; // 年額
      pension = Math.round(((PENSION.basicMonthly * 12 + prop) * PENSION.netRatio) / 12);
      assumed.push({ key: `${p.id}-pension`, label: `${who}の年金`, value: `推計 月${man(pension)}（ねんきん定期便で確認を）`, impact: 'high', sheet: 'income' });
    }
    people.push({
      id: p.id,
      name: p.name || who,
      birthYM,
      net,
      bonus,
      gross,
      raise,
      retireAge,
      retireYM: birthYM + retireAge * 12,
      retireBonus: p.retireBonus ?? 0,
      pensionYM: birthYM + pensionStartAge * 12,
      pension,
      cash: p.cash ?? 0,
    });
  }

  const livingTotal = Math.round(plan.living.reduce((s, x) => s + x.monthly, 0));
  if (plan.living.length === 0 || livingTotal <= 0) blocking.push('毎月の生活費');

  const h = plan.housing;
  if (h.rentMonthly == null) assumed.push({ key: 'rent', label: '現在の家賃', value: '0円（持ち家・実家など）として計算', impact: 'mid', sheet: 'housing' });
  let purchaseYM = h.purchaseYM ?? plan.baseYM + 12;
  if (h.purchaseYM == null) assumed.push({ key: 'purchase', label: '住宅の購入時期', value: `${formatYM(purchaseYM)}（1年後）と仮定`, impact: 'high', sheet: 'housing' });
  if (purchaseYM < plan.baseYM) purchaseYM = plan.baseYM;

  // 老後の生活費の初期値は「いまの生活費と同じ」（子供の分を除く）。世帯の暮らしぶりを全国平均で置き換えない
  let retireLiving: Yen;
  if (a.retireLivingMonthly != null) retireLiving = a.retireLivingMonthly;
  else {
    retireLiving = livingTotal;
    assumed.push({
      key: 'retireLiving',
      label: '老後の生活費',
      value: `いまの生活費と同額 月${man(retireLiving)}${plan.spouse ? `（参考: 高齢夫婦無職世帯の平均 月${man(RETIRE_LIVING_COUPLE)}）` : ''}`,
      impact: 'high',
      sheet: 'assumptions',
    });
  }

  for (const c of plan.children) {
    if (c.nurseryUse && c.nurseryMonthly == null)
      assumed.push({ key: `nursery-${c.id}`, label: `${c.name || '子供'}の0〜2歳保育料`, value: `月${man(ASSUME.nurseryMonthly)}（自治体で確認を）`, impact: 'low', sheet: 'children' });
  }
  if (plan.children.length > 0)
    assumed.push({ key: 'childLiving', label: '子供の生活費（食費など）の加算', value: '年齢別の目安を使用', impact: 'mid', sheet: 'assumptions' });
  if (!a.childrenConfirmed && plan.children.length === 0)
    assumed.push({ key: 'children', label: '子供の予定', value: 'なしとして計算', impact: 'high', sheet: 'children' });
  if (h.maintenanceMonthly == null)
    assumed.push({ key: 'maint', label: h.kind === 'mansion' ? '管理費・修繕積立金' : '修繕費の積立', value: `月${man(h.kind === 'mansion' ? ASSUME.maintenanceMansion : ASSUME.maintenanceDetached)}（目安）`, impact: 'low', sheet: 'housing' });
  if (h.insuranceAnnual == null)
    assumed.push({ key: 'ins', label: '火災・地震保険', value: `年${man(h.kind === 'mansion' ? ASSUME.insuranceMansion : ASSUME.insuranceDetached)}（目安）`, impact: 'low', sheet: 'housing' });

  const start = plan.baseYM;
  const ends = people.map((p) => p.birthYM + a.endAge * 12);
  let end = Math.max(start + 12, ...ends);
  end = Math.min(end, start + 100 * 12);
  const retireAllYM = people.length ? Math.max(...people.map((p) => (p.net > 0 ? p.retireYM : start))) : start;

  // 信頼度: 影響の大きい仮置きほど下げる
  let score = 100;
  const reasons: string[] = [];
  for (const x of assumed) {
    const d = x.impact === 'high' ? 12 : x.impact === 'mid' ? 5 : 2;
    score -= d;
    if (x.impact !== 'low') reasons.push(`${x.label}: ${x.value}`);
  }
  score = Math.max(0, score);
  const level = blocking.length ? '低' : score >= 75 ? '高' : score >= 50 ? '中' : '低';

  const selfAge = plan.self.birthYM != null ? ageAt(plan.self.birthYM, start) : null;
  if (selfAge != null && (selfAge < 15 || selfAge > 90)) blocking.push('本人の生まれた年月（年齢が範囲外）');

  return {
    plan,
    ready: blocking.length === 0,
    blocking,
    people,
    assumed,
    confidence: { score, level, reasons },
    start,
    end,
    retireAllYM,
    purchaseYM,
    rent: Math.round(h.rentMonthly ?? 0),
    retireLiving,
    livingTotal,
  };
}
