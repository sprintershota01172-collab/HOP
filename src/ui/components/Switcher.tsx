import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * 画面（または画面内のページ）の切り替え。
 *  - 新しい画面はわずかに横から、フェードインしながら手前に重なる（約300ms、ease-in-out）
 *  - 前の画面はその下で反対方向へ少し動き、新しい画面に覆われたら取り除く（点滅しない）
 *  - 切り替え途中に次の操作があっても、その時点の位置から次の動きへ続く（CSS の transition）
 *  - 前の画面は同じ部品のまま残すので、切り替え中に中身が初期状態に戻らない
 *  - 「視差効果を減らす」設定ではフェードだけにする（CSS 側）
 */
interface Out {
  id: number;
  dir: number;
  el: ReactNode;
}

const OUT_MS = 340;

export function Switcher(props: { k: string; dir?: number; children?: ReactNode; className?: string }) {
  const { k, children } = props;
  const dir = props.dir ?? 1;
  const seq = useRef(1);
  const lastChildren = useRef<ReactNode>(children);
  const [cur, setCur] = useState({ id: 0, k, dir: 0, first: true });
  const [out, setOut] = useState<Out[]>([]);
  if (cur.k !== k) {
    // 描画中の状態更新（直前の画面を「退出中」に移し、新しい画面を作る）
    const prev: Out = { id: cur.id, dir, el: lastChildren.current };
    setOut((o) => [...o.slice(-1), prev]);
    setCur({ id: seq.current++, k, dir, first: false });
  }
  lastChildren.current = children;

  useEffect(() => {
    if (!out.length) return;
    const t = setTimeout(() => setOut([]), OUT_MS);
    return () => clearTimeout(t);
  }, [out]);

  return (
    <div className={`switcher ${props.className ?? ''}`}>
      {out.map((p) => (
        <Pane key={p.id} dir={p.dir} exiting>
          {p.el}
        </Pane>
      ))}
      <Pane key={cur.id} dir={cur.dir} instant={cur.first}>
        {children}
      </Pane>
    </div>
  );
}

function Pane(props: { dir: number; exiting?: boolean; instant?: boolean; children?: ReactNode }) {
  const [phase, setPhase] = useState<'pre' | 'in'>(props.instant ? 'in' : 'pre');
  useLayoutEffect(() => {
    if (phase !== 'pre') return;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setPhase('in'));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [phase]);
  const cls = props.exiting ? 'out' : phase;
  return (
    <div className={`pane ${cls}`} style={{ '--dir': String(props.dir) }} aria-hidden={props.exiting ? 'true' : undefined} data-pane={cls}>
      {props.children}
    </div>
  );
}
