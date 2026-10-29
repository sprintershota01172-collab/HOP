import React, { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { yen } from '../format';
import { Icon } from '../icons';
import { useStore } from '../store';

/** 開いているシートが閉じるアニメーション中か（App が各シートに渡す） */
export const SheetState = createContext<{ closing: boolean }>({ closing: false });

export function Sheet(props: {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  foot?: ReactNode;
  short?: boolean;
  head?: ReactNode;
  /** 入力シート: 予算のプレビューを下に出す */
  preview?: boolean;
}) {
  const { closing } = useContext(SheetState);
  const ref = useRef<HTMLDivElement>(null);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || closing) return;
      // 重なっているときは一番上のシートだけを閉じる
      const top = [...document.querySelectorAll('.sheet:not(.closing)')].pop();
      if (top === ref.current) onClose.current();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [closing]);

  // 下にスワイプして閉じる（つまみ部分）
  const startY = useRef<number | null>(null);
  const close = () => {
    if (!closing) onClose.current();
  };
  return (
    <>
      <div className={`scrim${closing ? ' closing' : ''}`} onClick={close} />
      <div className={`sheet${props.short ? ' short' : ''}${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={ref} tabIndex={-1}>
        <div
          className="grab"
          onTouchStart={(e: TouchEvent) => (startY.current = e.touches[0].clientY)}
          onTouchEnd={(e: TouchEvent) => {
            if (startY.current != null && e.changedTouches[0].clientY - startY.current > 60) close();
            startY.current = null;
          }}
        />
        <div className="sheet-head">
          <h2>{props.title}</h2>
          {props.head}
          <button className="iconbtn" onClick={close} aria-label="閉じる">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{props.children}</div>
        {(props.foot || props.preview) && (
          <div className="sheet-foot" style={{ flexDirection: 'column' }}>
            {props.preview && <BudgetPreview />}
            {props.foot && <div className="row" style={{ gap: 8 }}>{props.foot}</div>}
          </div>
        )}
      </div>
    </>
  );
}

/** 入力を変えると、その場で住宅購入予算がどれだけ動いたかを表示する（シートを開いた時点との差） */
export function BudgetPreview() {
  const s = useStore();
  const vm = s.vm;
  const v = vm?.ready && vm.tiers?.standard.ok ? vm.rec.final.total : vm?.ready ? 0 : null;
  const base = useRef<number | null>(null);
  if (base.current == null && v != null) base.current = v;
  const diff = v != null && base.current != null ? v - base.current : 0;
  return (
    <button className="preview" onClick={() => s.open({ kind: 'basis' })} aria-label="住宅購入予算の内訳を見る">
      <span className="label grow">住宅購入予算</span>
      {v == null ? (
        <span className="micro">入力が必要です</span>
      ) : (
        <>
          <span className="value num">{s.computing ? '計算中…' : yen(v)}</span>
          {!s.computing && Math.abs(diff) >= 10_000 && <span className={`diff ${diff > 0 ? 'pos' : 'neg'}`}>{yen(diff, { sign: true })}</span>}
        </>
      )}
      <Icon name="right" size={16} />
    </button>
  );
}

/** 何段階かに分けて入力するシート */
export function Steps({ n, at, onPick }: { n: number; at: number; onPick?: (i: number) => void }) {
  return (
    <div className="steps" role="tablist" aria-label={`${n}段階中${at + 1}段階目`}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} data-on={i <= at ? 'true' : 'false'} onClick={() => onPick?.(i)} style={{ cursor: onPick ? 'pointer' : undefined, height: 6 }} />
      ))}
    </div>
  );
}
