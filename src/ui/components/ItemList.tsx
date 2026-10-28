import React from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../icons';
import { Pager, usePages, useSwipe } from './fields';

export interface Row {
  id: string;
  icon: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}

/** 編集用の一覧（ページ送り・スワイプ対応、スクロールしない） */
export function ItemList(props: { rows: Row[]; per?: number; onPick: (id: string) => void; onAdd?: () => void; addLabel?: string; empty?: string }) {
  const pg = usePages(props.rows, props.per ?? 5);
  const swipe = useSwipe(() => pg.setPage(Math.min(pg.pages - 1, pg.page + 1)), () => pg.setPage(Math.max(0, pg.page - 1)));
  return (
    <div className="stack" style={{ gap: 6 }}>
      {props.rows.length === 0 && props.empty && <div className="empty">{props.empty}</div>}
      <div className="list" {...swipe}>
        {pg.slice.map((r) => (
          <button key={r.id} className="item" onClick={() => props.onPick(r.id)}>
            <span className="ic">
              <Icon name={r.icon} />
            </span>
            <div className="grow">
              <div className="t ellipsis">{r.title}</div>
              {r.sub && <div className="micro ellipsis">{r.sub}</div>}
            </div>
            {r.right}
            <Icon name="right" size={16} />
          </button>
        ))}
      </div>
      <Pager {...pg} />
      {props.onAdd && (
        <button className="btn" onClick={props.onAdd}>
          <Icon name="plus" />
          {props.addLabel ?? '追加'}
        </button>
      )}
    </div>
  );
}
