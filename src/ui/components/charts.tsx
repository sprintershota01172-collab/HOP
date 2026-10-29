import React from 'react';
import type { PieSlice, YearRow } from '../../engine/aggregate';
import { yen } from '../format';
import { useSize } from './fields';

export const SLICE_COLOR: Record<PieSlice['key'], string> = {
  living: 'var(--c-living)',
  housing: 'var(--green)',
  education: 'var(--c-edu)',
  insurance: 'var(--c-ins)',
  saving: 'var(--c-save)',
  other: 'var(--c-other)',
  rest: 'var(--c-rest)',
};

/** 月の収支の円グラフ。大きさは項目数に関係なく固定 */
export function Donut({ slices, income, size = 132, sel }: { slices: PieSlice[]; income: number; size?: number; sel?: PieSlice['key'] | null }) {
  const r = size / 2;
  const w = size * 0.17;
  const rr = r - w / 2;
  const C = 2 * Math.PI * rr;
  const rest = slices.find((s) => s.key === 'rest')!;
  const parts = slices.filter((s) => s.key !== 'rest' || s.value > 0).filter((s) => s.value > 0);
  const total = Math.max(1, parts.reduce((s, x) => s + x.value, 0));
  // 選んだ項目を強調する（赤字で残額の弧がないときは強調しない）
  const focus = sel && parts.some((x) => x.key === sel) ? sel : null;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`月の収入 ${yen(income)} の内訳`} style={{ flex: 'none' }}>
      <circle cx={r} cy={r} r={rr} fill="none" stroke="var(--surface-2)" strokeWidth={w} />
      {parts.map((s) => {
        const len = (s.value / total) * C;
        const el = (
          <circle
            key={s.key}
            cx={r}
            cy={r}
            r={rr}
            fill="none"
            stroke={SLICE_COLOR[s.key]}
            strokeWidth={w}
            strokeDasharray={`${Math.max(0, len - 1.2)} ${C}`}
            strokeDashoffset={-acc}
            transform={`rotate(-90 ${r} ${r})`}
            opacity={focus && focus !== s.key ? 0.3 : 1}
            style={{ transition: 'opacity 250ms ease' }}
          />
        );
        acc += len;
        return el;
      })}
      <text x={r} y={r - 6} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--font)">
        {rest.value < 0 ? '赤字' : '月の収入'}
      </text>
      <text x={r} y={r + 12} textAnchor="middle" fontSize="15" fontWeight="800" fill={rest.value < 0 ? 'var(--red)' : 'var(--ink)'} fontFamily="var(--num)">
        {rest.value < 0 ? yen(rest.value) : yen(income)}
      </text>
    </svg>
  );
}

/** 年間収支の棒グラフ（全期間、選んだ年を強調） */
export function YearBars({ years, year, onPick, retireYear }: { years: YearRow[]; year: number; onPick: (y: number) => void; retireYear?: number }) {
  const { ref, w, h } = useSize<HTMLDivElement>();
  const pad = { l: 46, r: 4, t: 6, b: 16 };
  const iw = Math.max(1, w - pad.l - pad.r);
  const ih = Math.max(1, h - pad.t - pad.b);
  const vals = years.map((y) => y.net);
  // 退職金などの突出した年に縮尺を合わせると通常の年が見えなくなるため、上位5%を超える分は切って描く
  const abs = vals.map(Math.abs).sort((a, b) => a - b);
  const cap = Math.max(1, (abs[Math.floor(abs.length * 0.95)] ?? 1) * 1.4);
  const max = Math.min(cap, Math.max(1, ...vals));
  const min = Math.max(-cap, Math.min(0, ...vals));
  const span = max - min || 1;
  const y0 = pad.t + (max / span) * ih;
  const bw = iw / Math.max(1, years.length);
  const ticks = niceTicks(min, max);
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {w > 0 && h > 0 && (
        <svg className="chart" width={w} height={h} role="img" aria-label="年間収支の推移"
          onClick={(e: MouseEvent) => {
            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
            const i = Math.floor((e.clientX - rect.left - pad.l) / bw);
            if (i >= 0 && i < years.length) onPick(years[i].year);
          }}
        >
          {ticks.map((t) => {
            const yy = pad.t + ((max - t) / span) * ih;
            return (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={yy} y2={yy} stroke="var(--line)" strokeWidth={t === 0 ? 1.2 : 0.6} />
                <text x={pad.l - 4} y={yy + 3} textAnchor="end">{short(t)}</text>
              </g>
            );
          })}
          {years.map((y, i) => {
            const raw = y.net;
            const v = Math.max(min, Math.min(max, raw));
            const top = v >= 0 ? y0 - (v / span) * ih : y0;
            const hh = Math.max(0.5, (Math.abs(v) / span) * ih);
            const on = y.year === year;
            const clipped = raw !== v;
            return (
              <g key={y.year}>
                <rect x={pad.l + i * bw + bw * 0.12} y={top} width={Math.max(1, bw * 0.76)} height={hh} rx={Math.min(2, bw / 4)}
                  fill={raw < 0 ? 'var(--red)' : 'var(--green-2)'} opacity={on ? 1 : 0.45} />
                {clipped && <rect x={pad.l + i * bw} y={raw > 0 ? top : top + hh - 2} width={bw} height={2} fill="var(--ink)" />}
              </g>
            );
          })}
          {years.map((y, i) =>
            (i % 10 === 0 && Math.abs(years.findIndex((z) => z.year === year) - i) > 3) || y.year === year ? (
              <text key={`l${y.year}`} x={pad.l + i * bw + bw / 2} y={h - 3} textAnchor="middle" fontWeight={y.year === year ? 700 : 400} fill={y.year === year ? 'var(--ink)' : 'var(--ink-3)'}>
                {y.year}
              </text>
            ) : null,
          )}
          {retireYear != null && (() => {
            const i = years.findIndex((y) => y.year === retireYear);
            if (i < 0) return null;
            const x = pad.l + i * bw;
            return <line x1={x} x2={x} y1={pad.t} y2={pad.t + ih} stroke="var(--ink-3)" strokeDasharray="2 3" />;
          })()}
        </svg>
      )}
    </div>
  );
}

/** 資産の推移（現金・投資・住宅を積み上げ、ローン残高と純資産を線で） */
export function AssetChart({ years, year, onPick }: { years: YearRow[]; year: number; onPick: (y: number) => void }) {
  const { ref, w, h } = useSize<HTMLDivElement>();
  const pad = { l: 46, r: 4, t: 6, b: 16 };
  const iw = Math.max(1, w - pad.l - pad.r);
  const ih = Math.max(1, h - pad.t - pad.b);
  const max = Math.max(1, ...years.map((y) => Math.max(Math.max(0, y.cashEnd) + y.investEnd + y.homeValue, y.loanEnd, y.netWorth)));
  const min = Math.min(0, ...years.map((y) => Math.min(y.cashEnd, y.netWorth)));
  const span = max - min || 1;
  const X = (i: number) => pad.l + (years.length <= 1 ? 0 : (i / (years.length - 1)) * iw);
  const Y = (v: number) => pad.t + ((max - v) / span) * ih;
  const area = (lo: (y: YearRow) => number, hi: (y: YearRow) => number) =>
    years.map((y, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(hi(y)).toFixed(1)}`).join('') +
    years.map((_, i) => `L${X(years.length - 1 - i).toFixed(1)},${Y(lo(years[years.length - 1 - i])).toFixed(1)}`).join('') + 'Z';
  const line = (f: (y: YearRow) => number) => years.map((y, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(f(y)).toFixed(1)}`).join('');
  const cash = (y: YearRow) => Math.max(0, y.cashEnd);
  const sel = years.findIndex((y) => y.year === year);
  const ticks = niceTicks(min, max);
  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0 }}>
      {w > 0 && h > 0 && years.length > 0 && (
        <svg className="chart" width={w} height={h} role="img" aria-label="資産と負債の推移"
          onClick={(e: MouseEvent) => {
            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - rect.left - pad.l) / iw) * (years.length - 1));
            if (i >= 0 && i < years.length) onPick(years[i].year);
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--line)" strokeWidth={t === 0 ? 1.2 : 0.6} />
              <text x={pad.l - 4} y={Y(t) + 3} textAnchor="end">{short(t)}</text>
            </g>
          ))}
          <path d={area(() => 0, cash)} fill="var(--green-2)" opacity="0.85" />
          <path d={area(cash, (y) => cash(y) + y.investEnd)} fill="var(--c-save)" opacity="0.85" />
          <path d={area((y) => cash(y) + y.investEnd, (y) => cash(y) + y.investEnd + y.homeValue)} fill="var(--c-home)" opacity="0.8" />
          <path d={line((y) => y.loanEnd)} fill="none" stroke="var(--orange)" strokeWidth="1.8" strokeDasharray="4 3" />
          <path d={line((y) => y.netWorth)} fill="none" stroke="var(--ink)" strokeWidth="1.6" />
          {sel >= 0 && <line x1={X(sel)} x2={X(sel)} y1={pad.t} y2={pad.t + ih} stroke="var(--ink)" strokeWidth="1" opacity="0.5" />}
          {sel >= 0 && <circle cx={X(sel)} cy={Y(years[sel].netWorth)} r="3.5" fill="var(--ink)" />}
          {years.map((y, i) => (i % 10 === 0 ? <text key={y.year} x={Math.max(pad.l + 12, Math.min(w - 14, X(i)))} y={h - 3} textAnchor="middle">{y.year}</text> : null))}
        </svg>
      )}
    </div>
  );
}

function niceTicks(min: number, max: number): number[] {
  const span = max - min;
  if (span <= 0) return [0];
  const raw = span / 3;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-6; v += step) out.push(Math.round(v));
  if (!out.includes(0) && min <= 0 && max >= 0) out.push(0);
  return out;
}

/** 軸ラベル用の短い表記 */
export function short(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 100_000_000) return `${s}${(a / 100_000_000).toFixed(a % 100_000_000 === 0 ? 0 : 1)}億`;
  if (a >= 10_000) return `${s}${Math.round(a / 10_000).toLocaleString('ja-JP')}万`;
  return `${s}${a}`;
}

/**
 * 予算のものさし（安心・標準・注意の範囲と、推奨額の位置）。
 * cap: 審査の目安で借りられる上限（その先は「審査の目安を超える」範囲として灰色で示し、家計上の上限までは伸ばさない）
 */
export function Ruler({ safe, standard, caution, mark, desired, cap }: { safe: number; standard: number; caution: number; mark: number; desired?: number | null; cap?: number | null }) {
  const capped = cap != null && cap > 0 && cap < caution;
  const max = (capped ? cap * 1.25 : Math.max(caution, mark, desired ?? 0) * 1.18) || 1;
  const c = (v: number) => (capped ? Math.min(v, cap) : v);
  const pc = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const seg = (a: number, b: number, color: string, cls?: string) => <i className={cls} style={{ width: `${Math.max(0, ((b - a) / max) * 100)}%`, background: color }} />;
  const label = capped
    ? `借りられる上限 ${yen(cap)}。その範囲は${safe >= cap ? 'すべて安心' : standard >= cap ? '安心と標準' : '安心〜注意'}`
    : `安心 ${yen(safe)}まで、標準 ${yen(standard)}まで、注意 ${yen(caution)}まで`;
  return (
    <div className="ruler" aria-label={label}>
      <div className="track">
        {seg(0, c(safe), 'var(--green)')}
        {seg(c(safe), c(standard), 'var(--green-2)')}
        {seg(c(standard), c(caution), 'var(--warn)')}
        {capped && seg(cap, max, '', 'over')}
      </div>
      <div className="ticks" />
      <div className="mark" style={{ left: pc(mark) }}>
        <b />
      </div>
      {desired != null && desired > 0 && (
        <div className="mark" style={{ left: pc(desired) }}>
          <b style={{ background: 'var(--orange)', height: 22, marginTop: 4 }} />
        </div>
      )}
      <div className="lbls">
        {capped ? (
          <>
            {safe > 0 && safe < cap * 0.86 && <span style={{ left: pc(safe) }}>{short(safe)}</span>}
            {standard > safe && standard < cap * 0.86 && standard - safe > max * 0.14 && <span style={{ left: pc(standard) }}>{short(standard)}</span>}
            <span style={{ left: pc(cap) }}>上限 {short(cap)}</span>
          </>
        ) : (
          <>
            {safe > 0 && <span style={{ left: pc(safe) }}>{short(safe)}</span>}
            {standard - safe > max * 0.14 && <span style={{ left: pc(standard) }}>{short(standard)}</span>}
            {caution - standard > max * 0.12 && <span style={{ left: pc(caution) }}>{short(caution)}</span>}
          </>
        )}
      </div>
    </div>
  );
}
