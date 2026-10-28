import React, { useState } from 'react';
import type { HouseView } from '../../engine/view';
import { TierChip } from '../components/bits';
import { Pager, useFit, usePages, useSwipe } from '../components/fields';
import { yen } from '../format';
import { Icon } from '../icons';
import { useStore } from '../store';
import { startNewHouse } from '../sheets/house';
import { Loading, SampleBanner } from './Home';

export function Compare() {
  const s = useStore();
  const [mode, setMode] = useState<'side' | 'rank'>('side');
  const vm = s.vm;
  return (
    <div className="screen">
      <SampleBanner />
      <div className="row" style={{ flex: 'none' }}>
        <div className="seg grow">
          <button aria-pressed={mode === 'side' ? 'true' : 'false'} onClick={() => setMode('side')}>
            並べて比較
          </button>
          <button aria-pressed={mode === 'rank' ? 'true' : 'false'} onClick={() => setMode('rank')}>
            ランキング
          </button>
        </div>
        <button className="iconbtn" onClick={() => s.open({ kind: 'weights' })} aria-label="評価の重み付け">
          <Icon name="sliders" />
        </button>
        <button className="btn primary small" onClick={() => startNewHouse(s)}>
          <Icon name="plus" />
          追加
        </button>
      </div>
      {!vm ? (
        <Loading />
      ) : !vm.ready ? (
        <div className="empty fill">ライフプランを入力すると、住宅ごとに家計との相性を判定します</div>
      ) : vm.houses.length === 0 ? (
        <div className="empty fill">
          <Icon name="house" size={36} />
          <div>
            候補の住宅やハウスメーカーを登録すると、
            <br />
            総額・月々の負担・家計との相性を並べて比べられます
          </div>
          <button className="btn primary" onClick={() => startNewHouse(s)}>
            住宅を追加
          </button>
        </div>
      ) : mode === 'side' ? (
        <Side houses={[...vm.houses].sort((a, b) => a.rank - b.rank)} />
      ) : (
        <Ranking houses={[...vm.houses].sort((a, b) => a.rank - b.rank)} />
      )}
    </div>
  );
}

function Side({ houses }: { houses: HouseView[] }) {
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const n = houses.length;
  const ia = Math.min(a, n - 1);
  const ib = n > 1 ? Math.min(b, n - 1) : -1;
  return (
    <div className="hcards">
      <HouseCol h={houses[ia]} idx={ia} n={n} onMove={(d) => setA((ia + d + n) % n)} />
      {ib >= 0 ? <HouseCol h={houses[ib]} idx={ib} n={n} onMove={(d) => setB((ib + d + n) % n)} /> : <div className="empty">2件目を追加すると並べて比べられます</div>}
    </div>
  );
}

function HouseCol({ h, idx, n, onMove }: { h: HouseView; idx: number; n: number; onMove: (d: number) => void }) {
  const s = useStore();
  const src = s.data.houses.find((x) => x.id === h.id);
  const swipe = useSwipe(() => onMove(1), () => onMove(-1));
  const perf = [src?.perf.insulation ? `断熱${src.perf.insulation}` : null, src?.perf.quake ? `耐震${src.perf.quake}` : null].filter(Boolean).join('・') || '未入力';
  const access = src?.walkMin != null ? `徒歩${src.walkMin}分` : src?.commuteMin != null ? `通勤${src.commuteMin}分` : '—';
  const fit = useFit<HTMLDivElement>(25, 4, 3);
  const rows: [string, string, ('interest' | 'neg')?][] = [
    ['住宅取得総額', h.incomplete ? '価格未入力' : yen(h.total)],
    ['月の住宅費', yen(h.metrics.monthlyHousing)],
    ['購入後の余力', yen(h.metrics.surplus5y), h.metrics.surplus5y < 0 ? 'neg' : undefined],
    [`${h.cost35Years}年の住宅費`, yen(h.cost35), 'interest'],
    ['性能', perf],
    ['アクセス', access],
    ['うち維持費', yen(h.upkeepMonthly)],
    ['借入額', yen(h.loan), h.bankOk ? undefined : 'neg'],
    ['間取り', [src?.layout, src?.floorArea ? `${src.floorArea}㎡` : null].filter(Boolean).join('・') || '—'],
    ['保証', src?.perf.warrantyYears ? `${src.perf.warrantyYears}年` : '—'],
  ];
  return (
    <div className="card hcard" {...swipe}>
      <div className="row" style={{ gap: 4 }}>
        {n > 2 && (
          <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => onMove(-1)} aria-label="前の住宅">
            <Icon name="left" />
          </button>
        )}
        <span className="rank" data-r={String(h.rank)} style={{ width: 24, height: 24, fontSize: 12 }}>
          {h.rank}
        </span>
        <span className="micro grow" style={{ textAlign: 'right' }}>
          {n > 2 ? `${idx + 1}/${n}` : ''}
        </span>
        {n > 2 && (
          <button className="iconbtn" style={{ width: 28, height: 28 }} onClick={() => onMove(1)} aria-label="次の住宅">
            <Icon name="right" />
          </button>
        )}
      </div>
      <button style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left' }} onClick={() => s.open({ kind: 'houseDetail', props: { id: h.id } })}>
        <div className="nm ellipsis">{h.name}</div>
        <div className="micro ellipsis">{src?.maker || src?.layout || '詳細を見る'}</div>
      </button>
      <div>
        <TierChip tier={h.incomplete ? 'danger' : h.tier} prefix="家計: " />
      </div>
      <div className="fill" ref={fit.ref} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.slice(0, fit.n).map(([k, v, tone]) => (
          <KV key={k} k={k} v={v} interest={tone === 'interest'} neg={tone === 'neg'} />
        ))}
        {fit.n > rows.length && h.strengths[0] && <div className="micro ellipsis">◎ {h.strengths[0]}</div>}
      </div>
      <div className="kv" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <div className="row between">
          <span className="micro">総合点</span>
          <b className="num">{h.totalScore}</b>
        </div>
        <ScoreBar fin={h.financial} pref={h.preference} />
      </div>
    </div>
  );
}

function KV({ k, v, interest, neg }: { k: string; v: string; interest?: boolean; neg?: boolean }) {
  return (
    <div className="kv">
      <span className="ellipsis">{k}</span>
      <b className={interest ? 'interest' : neg ? 'neg' : ''}>{v}</b>
    </div>
  );
}

export function ScoreBar({ fin, pref }: { fin: number | null; pref: number | null }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      <div className="bar grow" title="お金の評価">
        <i style={{ width: `${fin ?? 0}%`, background: 'var(--green)' }} />
      </div>
      <div className="bar grow" title="住み心地・好み">
        <i style={{ width: `${pref ?? 0}%`, background: 'var(--c-edu)' }} />
      </div>
    </div>
  );
}

function Ranking({ houses }: { houses: HouseView[] }) {
  const s = useStore();
  const fit = useFit<HTMLDivElement>(86, 6, 1);
  const pg = usePages(houses, fit.n);
  const swipe = useSwipe(() => pg.setPage(Math.min(pg.pages - 1, pg.page + 1)), () => pg.setPage(Math.max(0, pg.page - 1)));
  return (
    <>
      <div className="row micro" style={{ gap: 12, flex: 'none' }}>
        <span className="row" style={{ gap: 4 }}>
          <i style={{ width: 10, height: 6, borderRadius: 3, background: 'var(--green)', display: 'inline-block' }} />
          お金の評価（家計との適合・維持費）
        </span>
        <span className="row" style={{ gap: 4 }}>
          <i style={{ width: 10, height: 6, borderRadius: 3, background: 'var(--c-edu)', display: 'inline-block' }} />
          住み心地・好み
        </span>
      </div>
      <div className="list fill" ref={fit.ref} {...swipe}>
        {pg.slice.map((h) => (
          <button key={h.id} className="item" style={{ alignItems: 'flex-start' }} onClick={() => s.open({ kind: 'houseDetail', props: { id: h.id } })}>
            <span className="rank" data-r={String(h.rank)}>
              {h.rank}
            </span>
            <div className="grow stack" style={{ gap: 3 }}>
              <div className="row">
                <span className="t ellipsis grow">{h.name}</span>
                <b className="num" style={{ fontSize: 'var(--fs-l)' }}>
                  {h.totalScore}
                </b>
              </div>
              <ScoreBar fin={h.financial} pref={h.preference} />
              <div className="micro ellipsis">{h.strengths.length ? `◎ ${h.strengths.join('・')}` : '評価を入力すると理由が表示されます'}</div>
              {h.weakness && <div className="micro ellipsis neg">△ {h.weakness}</div>}
            </div>
            <TierChip tier={h.incomplete ? 'danger' : h.tier} />
          </button>
        ))}
      </div>
      <Pager {...pg} />
    </>
  );
}
