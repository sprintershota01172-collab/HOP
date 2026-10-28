import { ymMonth, ymYear } from '../engine/ym';

/**
 * 金額の表示（計算とは分離。内部は円の整数）
 *   8,500円 / 12.5万円 / 180万円 / 3,800万円 / 1億2,000万円
 */
export function yen(v: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const neg = v < 0;
  const a = Math.abs(Math.round(v));
  let s: string;
  if (a < 10_000) s = `${a.toLocaleString('ja-JP')}円`;
  else if (a < 1_000_000) {
    const man = Math.round(a / 1_000) / 10; // 0.1万円単位
    s = `${man.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円`;
  } else if (a < 100_000_000) s = `${Math.round(a / 10_000).toLocaleString('ja-JP')}万円`;
  else {
    const oku = Math.floor(a / 100_000_000);
    const man = Math.round((a % 100_000_000) / 10_000);
    s = man === 0 ? `${oku}億円` : man === 10_000 ? `${oku + 1}億円` : `${oku}億${man.toLocaleString('ja-JP')}万円`;
  }
  if (neg) return `−${s}`;
  return opts.sign && a > 0 ? `+${s}` : s;
}

/** 数字と単位を分けて返す（大きな数字の表示用） */
export function yenParts(v: number | null | undefined): { num: string; unit: string } {
  const s = yen(v);
  const m = s.match(/^(−?[\d,.億]+)(万円|円|億円)$/);
  if (!m) return { num: s, unit: '' };
  return { num: m[1], unit: m[2] };
}

export const pct = (v: number, digits = 1): string => `${(v * 100).toFixed(digits)}%`;
export const ymText = (v: number): string => `${ymYear(v)}年${ymMonth(v)}月`;
export const ymShort = (v: number): string => `${ymYear(v)}.${String(ymMonth(v)).padStart(2, '0')}`;
