import { DEFAULT_WEIGHTS } from '../engine/houses';
import { defaultAssumptions, defaultHousing, emptyPerson, emptyPlan, SCHEMA_VERSION } from '../engine/defaults';
import type { AppData, Plan } from '../engine/types';

export const APP_ID = 'hoppo-san';

export interface ExportFile {
  app: typeof APP_ID;
  schema: number;
  exportedAt: string;
  data: AppData;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** 既定値に、保存データの値を重ねる（未知のキーは捨て、型が違う値は既定値のまま） */
function merge<T>(base: T, src: unknown): T {
  if (!isObj(src) || !isObj(base)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(out)) {
    const b = out[k];
    const v = src[k];
    if (v === undefined) continue;
    if (b === null) out[k] = v;
    else if (Array.isArray(b)) out[k] = Array.isArray(v) ? v : b;
    else if (isObj(b)) out[k] = isObj(v) ? merge(b, v) : b;
    else if (typeof b === typeof v || v === null) out[k] = v;
  }
  return out as T;
}

export class DataError extends Error {}

/**
 * 読み込んだデータを現在の形式に合わせる。
 * - schema が新しすぎる（新しい版で保存された）場合は読み込まない
 * - 足りない項目は既定値で補う（保存データが更新で消えないように）
 */
export function migrate(raw: unknown): AppData {
  let src: unknown = raw;
  if (isObj(raw) && raw.app === APP_ID && isObj(raw.data)) src = raw.data;
  if (!isObj(src) || !isObj(src.plan)) throw new DataError('ほっぽさんのデータではありません');
  const schema = typeof src.schema === 'number' ? src.schema : 0;
  if (schema > SCHEMA_VERSION) throw new DataError('新しい版のアプリで保存されたデータです。アプリを更新してください');

  const p = src.plan as Record<string, unknown>;
  const base = emptyPlan(typeof p.baseYM === 'number' ? p.baseYM : 0);
  const plan: Plan = {
    ...merge(base, p),
    self: merge(emptyPerson('self'), p.self),
    spouse: p.spouse ? merge(emptyPerson('spouse'), p.spouse) : null,
    housing: merge(defaultHousing(), p.housing),
    assumptions: merge(defaultAssumptions(), p.assumptions),
  };
  plan.self.id = 'self';
  // 以前の版のデータは諸費用を「物件価格×諸費用率」で計算していたので、そのままにする（内訳での計算は住まいの画面で切り替え）
  if (isObj(p.housing) && !('miscMode' in p.housing)) plan.housing.miscMode = 'rate';
  // 以前の版の「自由費」はお小遣いと同じものとして、本人・配偶者のお小遣いに半分ずつ（100円未満は本人へ）まとめる
  const pk = plan.pocket;
  if (pk && pk.free) {
    if (plan.spouse) {
      const half = Math.floor(pk.free / 2 / 100) * 100;
      pk.spouse = (pk.spouse ?? 0) + half;
      pk.self = (pk.self ?? 0) + (pk.free - half);
    } else pk.self = (pk.self ?? 0) + pk.free;
  }
  if (pk) pk.free = null;
  if (plan.spouse) plan.spouse.id = 'spouse';
  for (const k of ['debts', 'children', 'living', 'insurances', 'investments', 'goals', 'events', 'work', 'incomeChanges'] as const) {
    if (!Array.isArray(plan[k])) (plan as unknown as Record<string, unknown[]>)[k] = [];
  }
  return {
    schema: SCHEMA_VERSION,
    plan,
    houses: Array.isArray(src.houses) ? (src.houses as AppData['houses']) : [],
    memos: Array.isArray(src.memos) ? (src.memos as AppData['memos']) : [],
    weights: merge({ ...DEFAULT_WEIGHTS }, src.weights),
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : Date.now(),
    sample: src.sample === true,
  };
}

export function toExport(data: AppData): ExportFile {
  return { app: APP_ID, schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}
