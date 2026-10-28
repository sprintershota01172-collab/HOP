import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../icons';

export function Sheet(props: {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  foot?: ReactNode;
  short?: boolean;
  head?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  // 下にスワイプして閉じる（つまみ部分）
  const startY = useRef<number | null>(null);
  return (
    <>
      <div className="scrim" onClick={props.onClose} />
      <div className={`sheet${props.short ? ' short' : ''}`} role="dialog" aria-modal="true" aria-label={props.title} ref={ref} tabIndex={-1}>
        <div
          className="grab"
          onTouchStart={(e: TouchEvent) => (startY.current = e.touches[0].clientY)}
          onTouchEnd={(e: TouchEvent) => {
            if (startY.current != null && e.changedTouches[0].clientY - startY.current > 60) props.onClose();
            startY.current = null;
          }}
        />
        <div className="sheet-head">
          <h2>{props.title}</h2>
          {props.head}
          <button className="iconbtn" onClick={props.onClose} aria-label="閉じる">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{props.children}</div>
        {props.foot && <div className="sheet-foot">{props.foot}</div>}
      </div>
    </>
  );
}

/** 何段階かに分けて入力するシート */
export function Steps({ n, at }: { n: number; at: number }) {
  return (
    <div className="steps" aria-label={`${n}段階中${at + 1}段階目`}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} data-on={i <= at ? 'true' : 'false'} />
      ))}
    </div>
  );
}
