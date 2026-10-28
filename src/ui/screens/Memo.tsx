import React, { useState } from 'react';
import type { Memo as MemoT, MemoCategory } from '../../engine/types';
import { Pager, useFit, usePages, useSwipe } from '../components/fields';
import { Icon } from '../icons';
import { useStore } from '../store';
import { SampleBanner } from './Home';

export const MEMO_CAT: Record<MemoCategory, { label: string; icon: string }> = {
  common: { label: '共通', icon: 'memo' },
  house: { label: '住宅ごと', icon: 'house' },
  meeting: { label: '打ち合わせ', icon: 'briefcase' },
  concern: { label: '気になる点', icon: 'info' },
  check: { label: '確認事項', icon: 'check' },
  next: { label: '次回予定', icon: 'calendar' },
};

const DATE_RE = /(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})|(\d{1,2})[/月](\d{1,2})日?/;

/** ワンタップ整理: 文面から分類を推定し、日付を取り出し、大事な順に並べる（端末内のルールで処理） */
export function organize(memos: MemoT[], now = new Date()): { memos: MemoT[]; changed: number } {
  let changed = 0;
  const out = memos.map((m) => {
    const text = `${m.title}\n${m.body}`;
    let cat = m.category;
    let date = m.date;
    if (m.category === 'common') {
      if (/[?？]|確認|聞く|問い合わせ/.test(text)) cat = 'check';
      else if (DATE_RE.test(text) && /予定|次回|訪問|見学|面談|打ち合わせ|打合せ|契約/.test(text)) cat = 'next';
      else if (/打ち合わせ|打合せ|商談|面談|見学/.test(text)) cat = 'meeting';
      else if (/気になる|不安|心配|懸念|デメリット/.test(text)) cat = 'concern';
      else if (m.houseId) cat = 'house';
    }
    if (!date) {
      const d = text.match(DATE_RE);
      if (d) {
        const y = d[1] ? Number(d[1]) : now.getFullYear();
        const mo = Number(d[2] ?? d[4]);
        const da = Number(d[3] ?? d[5]);
        if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) date = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
      }
    }
    if (cat !== m.category || date !== m.date) changed++;
    return { ...m, category: cat, date };
  });
  out.sort(memoOrder);
  return { memos: out, changed };
}

export function memoOrder(a: MemoT, b: MemoT): number {
  const w = (m: MemoT) => (m.pinned ? 0 : m.category === 'check' && !m.done ? 1 : m.category === 'next' && m.date ? 2 : m.done ? 4 : 3);
  if (w(a) !== w(b)) return w(a) - w(b);
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
  return b.updatedAt - a.updatedAt;
}

export function Memo() {
  const s = useStore();
  const [filter, setFilter] = useState<MemoCategory | 'all'>('all');
  const memos = s.data.memos.filter((m) => filter === 'all' || m.category === filter).sort(memoOrder);
  const fit = useFit<HTMLDivElement>(74, 6, 1);
  const pg = usePages(memos, fit.n);
  const swipe = useSwipe(() => pg.setPage(Math.min(pg.pages - 1, pg.page + 1)), () => pg.setPage(Math.max(0, pg.page - 1)));
  const houseName = (id: string | null) => (id ? s.data.houses.find((h) => h.id === id)?.name : null);
  return (
    <div className="screen">
      <SampleBanner />
      <div className="chips" role="group" aria-label="メモの種類で絞り込む">
        {(['all', ...Object.keys(MEMO_CAT)] as (MemoCategory | 'all')[]).map((k) => (
          <button key={k} className={`chip ${filter === k ? 'tier-safe' : ''}`} style={{ border: 0, height: 28 }} aria-pressed={filter === k ? 'true' : 'false'} onClick={() => setFilter(k)}>
            {k === 'all' ? `すべて ${s.data.memos.length}` : MEMO_CAT[k].label}
          </button>
        ))}
      </div>
      <div className="row" style={{ flex: 'none' }}>
        <button
          className="btn small"
          onClick={() => {
            const r = organize(s.data.memos);
            s.update((d) => void (d.memos = r.memos), r.changed ? `${r.changed}件を分類しました` : '並べ替えました');
          }}
        >
          <Icon name="sparkle" />
          ワンタップ整理
        </button>
        <span className="micro grow">種類と日付を読み取り、確認事項・予定を上へ</span>
        <button className="btn primary small" onClick={() => s.open({ kind: 'memoEdit', props: { category: filter === 'all' ? 'common' : filter } })}>
          <Icon name="plus" />
          メモ
        </button>
      </div>
      {memos.length === 0 ? (
        <div className="empty fill">
          <Icon name="memo" size={32} />
          <div>打ち合わせの内容、気になった点、確認したいことを残しておけます</div>
        </div>
      ) : (
        <div className="list fill" ref={fit.ref} {...swipe}>
          {pg.slice.map((m) => (
            <div key={m.id} className="memo">
              {m.category === 'check' ? (
                <button
                  className="check"
                  role="checkbox"
                  aria-checked={m.done ? 'true' : 'false'}
                  aria-label="確認済みにする"
                  onClick={() => s.update((d) => void (d.memos.find((x) => x.id === m.id)!.done = !m.done))}
                >
                  {m.done && <Icon name="check" />}
                </button>
              ) : (
                <span className="ic" style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', color: 'var(--green)' }}>
                  <Icon name={MEMO_CAT[m.category].icon} size={18} />
                </span>
              )}
              <button className="grow" style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', minWidth: 0 }} onClick={() => s.open({ kind: 'memoEdit', props: { id: m.id } })}>
                <div className="row" style={{ gap: 6 }}>
                  {m.pinned && <Icon name="pin" size={14} />}
                  <span className="t ellipsis" style={{ fontWeight: 700, textDecoration: m.done ? 'line-through' : 'none', color: m.done ? 'var(--ink-3)' : undefined }}>
                    {m.title || '（無題）'}
                  </span>
                </div>
                {m.body && <div className="body">{m.body}</div>}
                <div className="row micro" style={{ gap: 8, marginTop: 2 }}>
                  <span>{MEMO_CAT[m.category].label}</span>
                  {houseName(m.houseId) && <span className="ellipsis">住宅: {houseName(m.houseId)}</span>}
                  {m.date && <span className="num">{m.date.replace(/-/g, '/')}</span>}
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
      <Pager {...pg} />
    </div>
  );
}
