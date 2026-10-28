import React, { useEffect, useId, useRef, useState } from 'react';
import { toYM, ymMonth, ymYear } from '../../engine/ym';
import { Icon } from '../icons';

const parseNum = (s: string): number | null => {
  const t = s.replace(/[,，\s円万]/g, '').replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (t === '' || t === '-' || t === '.') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

/** 入力中は文字列で持ち、確定（入力が止まる・フォーカスが外れる）で数値として渡す */
function useDraft(value: number | null, toText: (v: number) => string) {
  const [text, setText] = useState(value == null ? '' : toText(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : toText(value));
  }, [value]);
  return { text, setText, focused };
}

export function MoneyField(props: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: 'yen' | 'man';
  hint?: string;
  nullable?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const [unit, setUnit] = useState<'yen' | 'man'>(props.unit ?? 'man');
  const k = unit === 'man' ? 10_000 : 1;
  const fmt = (v: number) => (unit === 'man' ? String(Math.round((v / 10_000) * 10_000) / 10_000) : String(Math.round(v)));
  const { text, setText, focused } = useDraft(props.value, fmt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoId = useId();
  const id = props.id ?? autoId;
  useEffect(() => {
    setText(props.value == null ? '' : fmt(props.value));
  }, [unit]);
  const commit = (s: string) => {
    const n = parseNum(s);
    const v = n == null ? (props.nullable === false ? 0 : null) : Math.round(n * k);
    if (v !== props.value) props.onChange(v);
  };
  return (
    <label className="field" htmlFor={id}>
      <span>
        {props.label}
        {props.hint && <span className="hint"> ・{props.hint}</span>}
      </span>
      <div className={`inp${props.value == null ? ' unset' : ''}`}>
        <input
          id={id}
          inputMode="decimal"
          enterKeyHint="done"
          value={text}
          placeholder={props.placeholder ?? '未設定'}
          onFocus={() => (focused.current = true)}
          onBlur={(e: FocusEvent) => {
            focused.current = false;
            if (timer.current) clearTimeout(timer.current);
            commit((e.target as HTMLInputElement).value);
          }}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onInput={(e: Event) => {
            const s = (e.target as HTMLInputElement).value;
            setText(s);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => commit(s), 700);
          }}
        />
        <button type="button" className="unitbtn" onClick={() => setUnit(unit === 'man' ? 'yen' : 'man')} aria-label="単位を切り替える">
          {unit === 'man' ? '万円' : '円'}
        </button>
      </div>
    </label>
  );
}

export function NumField(props: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  unit: string;
  /** 表示倍率（% のときは 100） */
  scale?: number;
  hint?: string;
  nullable?: boolean;
  step?: number;
  min?: number;
  max?: number;
  text?: boolean;
}) {
  const sc = props.scale ?? 1;
  const fmt = (v: number) => String(Math.round(v * sc * 1000) / 1000);
  const { text, setText, focused } = useDraft(props.value, fmt);
  const id = useId();
  const commit = (s: string) => {
    let n = parseNum(s);
    if (n != null) {
      if (props.min != null) n = Math.max(props.min, n);
      if (props.max != null) n = Math.min(props.max, n);
    }
    const v = n == null ? (props.nullable === false ? 0 : null) : n / sc;
    if (v !== props.value) props.onChange(v);
    setText(v == null ? '' : fmt(v));
  };
  return (
    <label className="field" htmlFor={id}>
      <span>
        {props.label}
        {props.hint && <span className="hint"> ・{props.hint}</span>}
      </span>
      <div className={`inp${props.value == null ? ' unset' : ''}`}>
        <input
          id={id}
          inputMode="decimal"
          enterKeyHint="done"
          value={text}
          placeholder="未設定"
          onFocus={() => (focused.current = true)}
          onBlur={(e: FocusEvent) => {
            focused.current = false;
            commit((e.target as HTMLInputElement).value);
          }}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
        />
        <span className="unit">{props.unit}</span>
      </div>
    </label>
  );
}

export function TextField(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(props.value);
  const id = useId();
  useEffect(() => setText(props.value), [props.value]);
  return (
    <label className="field" htmlFor={id}>
      <span>{props.label}</span>
      <div className="inp">
        <input
          id={id}
          className="text"
          value={text}
          placeholder={props.placeholder}
          enterKeyHint="done"
          onInput={(e: Event) => setText((e.target as HTMLInputElement).value)}
          onBlur={() => text !== props.value && props.onChange(text)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
    </label>
  );
}

/** 年月の入力（年と月の選択） */
export function YMField(props: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  from: number;
  to: number;
  hint?: string;
  nullable?: boolean;
}) {
  const id = useId();
  const y = props.value != null ? ymYear(props.value) : '';
  const m = props.value != null ? ymMonth(props.value) : '';
  const years: number[] = [];
  for (let i = props.from; i <= props.to; i++) years.push(i);
  return (
    <div className="field">
      <span>
        {props.label}
        {props.hint && <span className="hint"> ・{props.hint}</span>}
      </span>
      <div className={`inp${props.value == null ? ' unset' : ''}`}>
        <select
          id={id}
          aria-label={`${props.label}（年）`}
          value={String(y)}
          onChange={(e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v === '') props.onChange(null);
            else props.onChange(toYM(Number(v), m === '' ? 4 : Number(m)));
          }}
        >
          {props.nullable !== false && <option value="">未設定</option>}
          {years.map((v) => (
            <option key={v} value={v}>
              {v}年
            </option>
          ))}
        </select>
        <select
          aria-label={`${props.label}（月）`}
          value={String(m)}
          disabled={props.value == null}
          onChange={(e: Event) => props.value != null && props.onChange(toYM(Number(y), Number((e.target as HTMLSelectElement).value)))}
          style={{ width: '5.2em', flex: 'none' }}
        >
          {props.value == null && <option value="">—</option>}
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}月
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function Seg<T extends string | number>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="field">
      {props.label && <span>{props.label}</span>}
      <div className="seg" role="group" aria-label={props.label}>
        {props.options.map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={o.value === props.value ? 'true' : 'false'} onClick={() => props.onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="toggle">
      <div className="grow">
        <div className="lbl">{props.label}</div>
        {props.hint && <div className="micro">{props.hint}</div>}
      </div>
      <button type="button" role="switch" className="switch" aria-checked={props.value ? 'true' : 'false'} aria-label={props.label} onClick={() => props.onChange(!props.value)} />
    </div>
  );
}

export function Stars(props: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div className="row between">
      <span className="label" style={{ fontWeight: 600 }}>
        {props.label}
      </span>
      <div className="stars" role="radiogroup" aria-label={props.label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={props.value === n ? 'true' : 'false'}
            aria-label={`${n}`}
            data-on={(props.value ?? 0) >= n ? 'true' : 'false'}
            onClick={() => props.onChange(props.value === n ? undefined : n)}
          >
            <Icon name="star" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** 一覧のページ送り（スクロールの代わり） */
export function usePages<T>(items: T[], per: number) {
  const pages = Math.max(1, Math.ceil(items.length / per));
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [pages, page]);
  const p = Math.min(page, pages - 1);
  return { page: p, pages, slice: items.slice(p * per, p * per + per), setPage };
}

export function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="前のページ">
        <Icon name="left" />
      </button>
      <div className="dots" aria-label={`${pages}ページ中${page + 1}ページ目`}>
        {Array.from({ length: pages }, (_, i) => (
          <i key={i} data-on={i === page ? 'true' : 'false'} />
        ))}
      </div>
      <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="次のページ">
        <Icon name="right" />
      </button>
    </div>
  );
}

/** 横スワイプでページを送る */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }),
    onTouchEnd: (e: TouchEvent) => {
      if (!start.current) return;
      const dx = e.changedTouches[0].clientX - start.current.x;
      const dy = e.changedTouches[0].clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onLeft : onRight)();
    },
  };
}

/** 要素の大きさ（グラフを実寸で描くため）。要素が後から現れても測れるようにコールバック ref を使う */
export function useSize<T extends Element>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      setSize((s) => (s.w === Math.round(r.width) && s.h === Math.round(r.height) ? s : { w: Math.round(r.width), h: Math.round(r.height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref: setEl as (el: T | null) => void, ...size };
}

/** 決まった高さの行が、いまの高さにいくつ入るか（スクロールさせずに件数で調整する） */
export function useFit<T extends Element>(rowHeight: number, gap = 6, min = 1) {
  const { ref, h } = useSize<T>();
  const n = h > 0 ? Math.max(min, Math.floor((h + gap) / (rowHeight + gap))) : min;
  return { ref, n, h };
}
