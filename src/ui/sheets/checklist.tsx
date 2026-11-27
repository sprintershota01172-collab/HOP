import React, { useState } from 'react';
import { CHECK_PAGES, MANUAL_CHECKS, checklistSummary, emptyChecklist, type AutoCheck, type CheckPage, type CheckStatus } from '../../engine/checklist';
import type { AppData } from '../../engine/types';
import { Sheet } from '../components/Sheet';
import { Switcher } from '../components/Switcher';
import { Icon } from '../icons';
import { useStore } from '../store';
import type { SheetProps } from './plan';

const STATUS_LABEL: Record<CheckStatus, string> = { ok: '問題なし', warn: '要確認', ng: '要注意', na: '判定なし' };

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);

/** チェックリストのどのページが済んだか（タブの印に使う） */
function pageState(page: CheckPage, d: AppData, auto: AutoCheck[]): 'done' | 'alert' | 'todo' {
  const c = d.checklist ?? emptyChecklist();
  if (page === 'auto') {
    const a = auto.filter((x) => x.status !== 'na');
    if (a.some((x) => x.status === 'ng' || x.status === 'warn')) return 'alert';
    return a.length ? 'done' : 'todo';
  }
  if (page === 'custom') return c.custom.length && c.custom.every((x) => x.done) ? 'done' : 'todo';
  return MANUAL_CHECKS.filter((m) => m.page === page).every((m) => c.done[m.id]) ? 'done' : 'todo';
}

/** 買う前のチェックリスト */
export function ChecklistSheet({ close, props }: SheetProps) {
  const s = useStore();
  const auto = s.vm?.buyChecks ?? [];
  const c = s.data.checklist ?? emptyChecklist();
  const sum = checklistSummary(s.data.checklist, auto);
  const [page, setPage] = useState<CheckPage>((props.page as CheckPage) ?? 'auto');
  const [dir, setDir] = useState(1);
  const idx = CHECK_PAGES.findIndex((p) => p.value === page);
  const edit = (fn: (x: NonNullable<AppData['checklist']>) => void) =>
    s.update((d) => {
      d.checklist ??= emptyChecklist();
      fn(d.checklist);
    });
  const go = (a: AutoCheck) => {
    if (a.to.tab) {
      close();
      s.setTab(a.to.tab);
    } else if (a.to.sheet) s.open({ kind: a.to.sheet, props: a.to.props ?? {} });
  };
  const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;
  return (
    <Sheet title="買う前のチェックリスト" onClose={close}>
      <div className="ck-sum">
        <div className="row between">
          <span>
            <b className="num">{sum.done}</b>
            <span className="micro"> / {sum.total} 済み</span>
          </span>
          {sum.alerts > 0 ? (
            <span className="chip tier-caution">家計の要確認 {sum.alerts}件</span>
          ) : (
            <span className="micro">{sum.done === sum.total ? 'すべて済みました' : `あと${sum.total - sum.done}項目`}</span>
          )}
        </div>
        <div className="ck-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="seg ck-tabs" role="group" aria-label="チェックリストのページ">
        {CHECK_PAGES.map((p, i) => {
          const st = pageState(p.value, s.data, auto);
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={p.value === page ? 'true' : 'false'}
              onClick={() => {
                setDir(i >= idx ? 1 : -1);
                setPage(p.value);
              }}
            >
              {p.label}
              {st !== 'todo' && <i className={`ck-mark ${st}`} aria-label={st === 'done' ? '済み' : '要確認あり'} />}
            </button>
          );
        })}
      </div>
      <Switcher k={page} dir={dir}>
        {page === 'auto' ? (
          <div className="ck-list">
            <div className="micro">入力した家計から自動で判定します。タップすると関係する画面を開きます</div>
            {auto.map((a) => (
              <button key={a.id} className={`ck-auto st-${a.status}`} onClick={() => go(a)}>
                <span className="ck-st" aria-label={STATUS_LABEL[a.status]}>
                  <Icon name={a.status === 'ok' ? 'check' : a.status === 'na' ? 'dots' : 'info'} />
                </span>
                <div className="grow">
                  <div className="t">
                    {a.title}
                    <small className={`ck-tag st-${a.status}`}>{STATUS_LABEL[a.status]}</small>
                  </div>
                  <div className="micro ck-detail">{a.detail}</div>
                </div>
                <Icon name="right" />
              </button>
            ))}
          </div>
        ) : page === 'custom' ? (
          <CustomPage list={c.custom} edit={edit} />
        ) : (
          <div className="ck-list">
            {MANUAL_CHECKS.filter((m) => m.page === page).map((m) => (
              <CheckRow key={m.id} done={!!c.done[m.id]} text={m.text} hint={m.hint} onToggle={() => edit((x) => void (x.done[m.id] = !x.done[m.id]))} />
            ))}
          </div>
        )}
      </Switcher>
    </Sheet>
  );
}

function CheckRow(props: { done: boolean; text: string; hint?: string; onToggle: () => void; onDelete?: () => void }) {
  return (
    <div className={`ck-row${props.done ? ' done' : ''}`}>
      <button className="ck-hit" role="checkbox" aria-checked={props.done ? 'true' : 'false'} onClick={props.onToggle}>
        <span className="check" aria-checked={props.done ? 'true' : 'false'}>
          {props.done && <Icon name="check" />}
        </span>
        <span className="grow">
          <span className="t">{props.text}</span>
          {props.hint && <span className="micro ck-hint">{props.hint}</span>}
        </span>
      </button>
      {props.onDelete && (
        <button className="iconbtn" onClick={props.onDelete} aria-label={`「${props.text}」を削除`}>
          <Icon name="trash" />
        </button>
      )}
    </div>
  );
}

function CustomPage({ list, edit }: { list: NonNullable<AppData['checklist']>['custom']; edit: (fn: (x: NonNullable<AppData['checklist']>) => void) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    edit((x) => void x.custom.push({ id: newId(), text: t.slice(0, 80), done: false }));
    setText('');
  };
  return (
    <div className="ck-list">
      <form
        className="row ck-add"
        onSubmit={(e: Event) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="inp grow">
          <input className="text" value={text} placeholder="例: 駐車場の幅を測った" enterKeyHint="done" aria-label="追加する項目" onInput={(e: Event) => setText((e.target as HTMLInputElement).value)} />
        </div>
        <button className="btn primary small" type="submit" disabled={!text.trim()}>
          <Icon name="plus" />
          追加
        </button>
      </form>
      {list.length === 0 ? (
        <div className="empty micro">自分たちで確かめたいことを追加できます（夫婦で共有中なら相手にも出ます）</div>
      ) : (
        <div className="ck-custom">
          {list.map((m) => (
            <CheckRow
              key={m.id}
              done={m.done}
              text={m.text}
              onToggle={() => edit((x) => {
                const it = x.custom.find((z) => z.id === m.id);
                if (it) it.done = !it.done;
              })}
              onDelete={() => edit((x) => void (x.custom = x.custom.filter((z) => z.id !== m.id)))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
