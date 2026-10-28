import React from 'react';
import type { ReactNode } from 'react';
import { TIER_LABEL, type Tier } from '../../engine/recommend';
import { yen, yenParts } from '../format';

export function Money({ v, className, sign }: { v: number | null | undefined; className?: string; sign?: boolean }) {
  const p = yenParts(v);
  const s = sign && v != null && v > 0 ? '+' : '';
  return (
    <span className={`value ${className ?? ''}`}>
      {s}
      {p.num}
      <small>{p.unit}</small>
    </span>
  );
}

export function Kpi({ label, v, sub, tone, sign, xl }: { label: string; v: number | null | undefined; sub?: ReactNode; tone?: 'neg' | 'pos' | 'interest'; sign?: boolean; xl?: boolean }) {
  const auto = tone ?? (v != null && v < 0 ? 'neg' : undefined);
  return (
    <div className="kpi">
      <div className="label ellipsis">{label}</div>
      <Money v={v} className={`${auto ?? ''} ${xl ? 'xl' : ''}`} sign={sign} />
      {sub && <div className="micro ellipsis">{sub}</div>}
    </div>
  );
}

export function TierChip({ tier, prefix }: { tier: Tier; prefix?: string }) {
  return (
    <span className={`chip tier-${tier}`}>
      {prefix}
      {TIER_LABEL[tier]}
    </span>
  );
}

export const TIER_NOTE: Record<Tier, string> = {
  safe: '金利+2%・収入1割減でも、生活費6か月分の予備資金を保てる',
  standard: '金利+1%でも、生活費3か月分の予備資金と老後の予備資金を保てる',
  caution: '想定どおりなら破綻しないが、予備資金を取り崩す時期がある',
  danger: '想定どおりでも、どこかで現金が足りなくなる',
};

export function Diff({ v, invert, unit }: { v: number; invert?: boolean; unit?: 'yen' | 'pct' }) {
  if (Math.abs(v) < (unit === 'pct' ? 0.0005 : 1)) return <span className="diff micro">±0</span>;
  const good = invert ? v < 0 : v > 0;
  const text = unit === 'pct' ? `${v > 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}pt` : yen(v, { sign: true });
  return <span className={`diff ${good ? 'pos' : 'neg'}`}>{text}</span>;
}

export const FAIL_TEXT = { reserve: '予備資金を下回ります', short: '現金が足りなくなります', depleted: '老後の資金が足りなくなります' } as const;

/** 段階の説明（予備資金の月数は設定に合わせる） */
export function tierNote(tier: Tier, months: number): string {
  switch (tier) {
    case 'safe':
      return `金利+2%・収入1割減でも、生活費${months * 2}か月分の予備資金を保てる`;
    case 'standard':
      return `金利+1%でも、生活費${months}か月分の予備資金と老後の予備資金を保てる`;
    default:
      return TIER_NOTE[tier];
  }
}
