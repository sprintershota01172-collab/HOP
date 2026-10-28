import { classify, houseModel, metricsOf, TIER_LABEL, tryHouse, type Context, type Metrics, type Tier, type TierKey, type TierResult, type Trial } from './recommend';
import type { HouseModel } from './simulate';
import type { House, WeightKey, Weights, Yen } from './types';

export const WEIGHT_LABEL: Record<WeightKey, string> = {
  price: '価格（家計との適合）',
  location: '立地',
  layout: '間取り',
  performance: '住宅性能',
  upkeep: '維持費',
  warranty: '保証',
  resale: '将来の売却',
  satisfaction: '総合満足度',
};
export const FINANCIAL_KEYS: WeightKey[] = ['price', 'upkeep'];
export const PREFERENCE_KEYS: WeightKey[] = ['location', 'layout', 'performance', 'warranty', 'resale', 'satisfaction'];

export const DEFAULT_WEIGHTS: Weights = { price: 3, location: 2, layout: 2, performance: 2, upkeep: 1, warranty: 1, resale: 1, satisfaction: 2 };

export interface HouseEval {
  id: string;
  name: string;
  model: HouseModel;
  total: Yen;
  loan: Yen;
  down: Yen;
  tier: Tier;
  trials: Record<TierKey, Trial>;
  base: Trial;
  metrics: Metrics;
  bankOk: boolean;
  upkeepMonthly: Yen;
  cost35: Yen;
  cost35Years: number;
  fit: number;
  scores: Record<WeightKey, number | null>;
  financial: number | null;
  preference: number | null;
  totalScore: number;
  rank: number;
  strengths: string[];
  weakness: string | null;
  incomplete: boolean;
}

const rating = (v: number | undefined): number | null => (v == null || v <= 0 ? null : Math.round(((v - 1) / 4) * 100));

export function performanceScore(h: House): number | null {
  const parts: number[] = [];
  const ins = h.perf.insulation;
  if (ins != null) parts.push(ins >= 7 ? 100 : ins === 6 ? 80 : ins === 5 ? 60 : ins === 4 ? 40 : 20);
  const q = h.perf.quake;
  if (q != null) parts.push(q >= 3 ? 100 : q === 2 ? 70 : 40);
  const c = h.perf.cValue;
  if (c != null) parts.push(c <= 0.5 ? 100 : c <= 1 ? 80 : c <= 2 ? 60 : 40);
  if (!parts.length) return null;
  const bonus = (h.perf.solar ? 5 : 0) + (h.perf.battery ? 3 : 0);
  return Math.min(100, Math.round(parts.reduce((s, v) => s + v, 0) / parts.length + bonus));
}

export function warrantyScore(h: House): number | null {
  const r = rating(h.ratings.warranty);
  if (r != null) return r;
  const y = h.perf.warrantyYears;
  if (y == null) return null;
  return y >= 60 ? 100 : y >= 35 ? 90 : y >= 30 ? 80 : y >= 20 ? 60 : y >= 10 ? 40 : 20;
}

/**
 * 家計との適合度（0〜100）。
 * 段階（安心/標準/注意/危険）を住宅ごとの試算で判定し、
 * 段階の中での位置は「予算の境目（安心・標準・注意の上限額）」との距離で決める。
 */
export function fitScore(tier: Tier, total: Yen, bounds: { safe: Yen; standard: Yen; caution: Yen }): number {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const { safe, standard, caution } = bounds;
  switch (tier) {
    case 'safe':
      return Math.round(85 + 15 * (safe > 0 ? clamp(1 - total / safe) : 0));
    case 'standard':
      return Math.round(65 + 20 * (standard > safe ? clamp((standard - total) / (standard - safe)) : 0));
    case 'caution':
      return Math.round(35 + 30 * (caution > standard ? clamp((caution - total) / (caution - standard)) : 0));
    default:
      return Math.round(35 * (caution > 0 ? clamp(1 - (total - caution) / caution) : 0));
  }
}

export function evaluateHouses(ctx: Context, houses: House[], weights: Weights, tiers: Record<TierKey, TierResult> | null): HouseEval[] {
  const r = ctx.r;
  const evals: HouseEval[] = houses.map((h) => {
    const model = houseModel(r, h);
    const { tier, trials } = classify((t) => tryHouse(ctx, model, t));
    const base = tryHouse(ctx, model, 'standard', ctx.sc.base);
    const metrics = metricsOf(ctx, base.sim);
    const rows = base.sim.rows;
    const p = Math.max(0, base.sim.pIndex);
    const span = rows.slice(p, p + 420);
    const cost35 = span.reduce((s, x) => s + x.housing + x.housingOnce, 0);
    const upkeepMonthly = Math.round(metrics.monthlyHousing - (base.sim.schedule ? (base.sim.schedule.monthly.slice(0, 12).reduce((s, v) => s + v, 0) + base.sim.schedule.bonus.slice(0, 12).reduce((s, v) => s + v, 0)) / 12 : 0));
    const bounds = {
      safe: tiers?.safe.ok ? tiers.safe.total : 0,
      standard: tiers?.standard.ok ? tiers.standard.total : 0,
      caution: tiers?.caution.ok ? tiers.caution.total : 0,
    };
    const fit = fitScore(tier, base.total, bounds);
    const incomplete = !(h.price || (h.landPrice && h.buildingPrice));
    return {
      id: h.id,
      name: h.name || '名称未設定',
      model,
      total: base.total,
      loan: base.loan,
      down: base.down,
      tier,
      trials,
      base,
      metrics,
      bankOk: base.loan <= ctx.bank.amount,
      upkeepMonthly,
      cost35,
      cost35Years: Math.round(span.length / 12),
      fit,
      scores: {
        price: incomplete ? null : fit,
        upkeep: null,
        location: rating(h.ratings.location),
        layout: rating(h.ratings.layout),
        performance: performanceScore(h),
        warranty: warrantyScore(h),
        resale: rating(h.ratings.resale),
        satisfaction: rating(h.ratings.satisfaction),
      },
      financial: null,
      preference: null,
      totalScore: 0,
      rank: 0,
      strengths: [],
      weakness: null,
      incomplete,
    };
  });

  // 維持費は「最も安い候補を100」とした相対評価
  const ups = evals.filter((e) => !e.incomplete && e.upkeepMonthly > 0).map((e) => e.upkeepMonthly);
  const minUp = ups.length ? Math.min(...ups) : 0;
  for (const e of evals) {
    if (!e.incomplete && e.upkeepMonthly > 0 && minUp > 0) e.scores.upkeep = Math.round((100 * minUp) / e.upkeepMonthly);
  }

  const wavg = (e: HouseEval, keys: WeightKey[]): number | null => {
    let sw = 0;
    let s = 0;
    for (const k of keys) {
      const v = e.scores[k];
      const w = weights[k] ?? 0;
      if (v == null || w <= 0) continue;
      sw += w;
      s += v * w;
    }
    return sw > 0 ? s / sw : null;
  };
  const all = [...FINANCIAL_KEYS, ...PREFERENCE_KEYS];
  for (const e of evals) {
    e.financial = wavg(e, FINANCIAL_KEYS);
    e.preference = wavg(e, PREFERENCE_KEYS);
    e.totalScore = Math.round(wavg(e, all) ?? 0);
    const contrib = all
      .filter((k) => e.scores[k] != null && (weights[k] ?? 0) > 0)
      .map((k) => ({ k, v: e.scores[k] as number, w: weights[k] }));
    const strong = [...contrib].sort((x, y) => y.v * y.w - x.v * x.w).filter((x) => x.v >= 60).slice(0, 2);
    e.strengths = strong.map((x) => reasonText(x.k, e, houses.find((h) => h.id === e.id)!));
    const weak = [...contrib].sort((x, y) => x.v - y.v)[0];
    if (e.tier === 'danger') {
      const f = e.trials.caution.fail;
      e.weakness = f ? `資金不足のリスク: ${f.driver}` : '資金不足のリスク';
    } else if (!e.bankOk) e.weakness = '借入額が審査の目安を超える可能性';
    else if (weak && weak.v < 60) e.weakness = `${WEIGHT_LABEL[weak.k]}の評価が低い`;
  }

  // 危険（資金不足）の住宅は、点数に関係なく後ろに回す
  const order = [...evals].sort((x, y) => {
    const dx = x.tier === 'danger' || x.incomplete ? 1 : 0;
    const dy = y.tier === 'danger' || y.incomplete ? 1 : 0;
    if (dx !== dy) return dx - dy;
    return y.totalScore - x.totalScore;
  });
  order.forEach((e, i) => (e.rank = i + 1));
  return evals;
}

function reasonText(k: WeightKey, e: HouseEval, h: House): string {
  switch (k) {
    case 'price':
      return `家計との適合: ${TIER_LABEL[e.tier]}`;
    case 'upkeep':
      return '維持費が安い';
    case 'performance': {
      const parts: string[] = [];
      if (h.perf.insulation) parts.push(`断熱等級${h.perf.insulation}`);
      if (h.perf.quake) parts.push(`耐震等級${h.perf.quake}`);
      if (h.perf.cValue != null) parts.push(`C値${h.perf.cValue}`);
      return parts.length ? parts.join('・') : '住宅性能が高い';
    }
    case 'warranty':
      return h.perf.warrantyYears ? `保証${h.perf.warrantyYears}年` : '保証が手厚い';
    case 'location':
      return h.walkMin != null ? `立地の評価が高い（駅徒歩${h.walkMin}分）` : '立地の評価が高い';
    case 'layout':
      return h.layout ? `間取りの評価が高い（${h.layout}）` : '間取りの評価が高い';
    case 'resale':
      return '売却しやすさの評価が高い';
    case 'satisfaction':
      return '総合満足度が高い';
  }
}
