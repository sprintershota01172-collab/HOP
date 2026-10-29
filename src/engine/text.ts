/** 金額の文章表記（エンジン内の説明文用。画面の表示も同じ規則） */
export function yenText(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const neg = v < 0;
  const a = Math.abs(Math.round(v));
  let s: string;
  if (a < 10_000) s = `${a.toLocaleString('ja-JP')}円`;
  else if (a < 1_000_000) s = `${(Math.round(a / 1_000) / 10).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円`;
  else if (a < 100_000_000) s = `${Math.round(a / 10_000).toLocaleString('ja-JP')}万円`;
  else {
    const oku = Math.floor(a / 100_000_000);
    const man = Math.round((a % 100_000_000) / 10_000);
    s = man === 0 ? `${oku}億円` : man === 10_000 ? `${oku + 1}億円` : `${oku}億${man.toLocaleString('ja-JP')}万円`;
  }
  return neg ? `−${s}` : s;
}

/** 全角数字・記号を半角にし、桁区切りと空白を除く */
export const normalize = (s: string) =>
  s
    .replace(/[０-９．－]/g, (c) => (c === '－' ? '-' : String.fromCharCode(c.charCodeAt(0) - 0xfee0)))
    .replace(/[,，\s]/g, '');

/**
 * 金額の入力を円に変換する。入力の単位は「万円」に統一し、
 * 「8万」「80,000円」「1億2000万」のように単位を付けて入力した場合はその単位で読む。
 */
export function parseMoney(s: string): number | null {
  const t = normalize(s);
  if (t === '') return null;
  const oku = t.match(/^(-?\d+(?:\.\d+)?)億(?:(\d+(?:\.\d+)?)万?)?円?$/);
  if (oku) return Math.round(Number(oku[1]) * 100_000_000 + Number(oku[2] ?? 0) * 10_000);
  const yen = t.match(/^(-?\d+(?:\.\d+)?)円$/);
  if (yen) return Math.round(Number(yen[1]));
  const man = t.match(/^(-?\d+(?:\.\d+)?)(?:万円?)?$/);
  if (man) return Math.round(Number(man[1]) * 10_000);
  return null;
}

