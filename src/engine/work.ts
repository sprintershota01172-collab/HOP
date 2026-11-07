// 育休・時短の予定の重なり（同じ人の同じ種類の予定が2件以上、期間が重なっているもの）
import type { WorkChange, YM } from './types';

/** 予定の最後の月（時短で終わりなしは無限） */
export const workLast = (w: WorkChange): YM => (w.type === 'leave' ? w.startYM + w.months - 1 : w.endYM ?? Number.POSITIVE_INFINITY);

const overlaps = (a: WorkChange, b: WorkChange) => a.startYM <= workLast(b) && b.startYM <= workLast(a);

/** 重なっている予定のまとまり（同じ人・同じ種類で、期間が重なるもの）。2件以上のまとまりだけ返す */
export function workDupes(work: WorkChange[]): WorkChange[][] {
  const groups: WorkChange[][] = [];
  const seen = new Set<string>();
  for (const w of work) {
    if (seen.has(w.id)) continue;
    // つながっている予定をたどる
    const g = [w];
    seen.add(w.id);
    for (let i = 0; i < g.length; i++)
      for (const x of work)
        if (!seen.has(x.id) && x.owner === g[i].owner && x.type === g[i].type && overlaps(x, g[i])) {
          seen.add(x.id);
          g.push(x);
        }
    if (g.length > 1) groups.push(g);
  }
  return groups;
}

/**
 * 重なっている予定を1件にまとめる。残すのは産休を含む予定（なければ最初に始まる予定）で、
 * 期間は全部を合わせた期間、カット率は残す予定のもの（未設定ならほかの予定のもの）
 */
export function mergeWork(work: WorkChange[], group: WorkChange[], keepId?: string): WorkChange[] {
  const ids = new Set(group.map((x) => x.id));
  const keep = group.find((x) => x.id === keepId) ?? [...group].sort((a, b) => Number(b.maternity) - Number(a.maternity) || a.startYM - b.startYM)[0];
  const start = Math.min(...group.map((x) => x.startYM));
  const last = Math.max(...group.map(workLast));
  const merged: WorkChange = {
    ...keep,
    startYM: start,
    months: keep.type === 'leave' ? last - start + 1 : keep.months,
    endYM: keep.type === 'short' ? (Number.isFinite(last) ? last : null) : keep.endYM,
    payRate: keep.payRate ?? group.find((x) => x.payRate != null)?.payRate ?? null,
    childId: keep.childId ?? group.find((x) => x.childId)?.childId ?? null,
  };
  return work.filter((x) => !ids.has(x.id) || x.id === keep.id).map((x) => (x.id === keep.id ? merged : x));
}
