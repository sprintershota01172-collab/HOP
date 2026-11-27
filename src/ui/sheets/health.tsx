import React, { useState } from 'react';
import { HEALTH, healthSpan, type HealthLevel } from '../../engine/health';
import { ymMonth } from '../../engine/ym';
import { Kpi } from '../components/bits';
import { HEALTH_LABEL } from '../components/charts';
import { Sheet } from '../components/Sheet';
import { yen } from '../format';
import { Icon } from '../icons';
import { useHappenings } from '../screens/FP';
import { useStore } from '../store';
import type { SheetProps } from './plan';

/** その年の家計のゆとり（緑・黄・赤）の理由と数字。前後の年に切り替えられる */
export function YearHealthSheet({ close, props }: SheetProps) {
  const s = useStore();
  const list = s.vm?.fp?.health ?? [];
  const [year, setYearState] = useState<number>(Number(props.year) || list[0]?.year || 0);
  const i = list.findIndex((x) => x.year === year);
  const h = list[i];
  const setYear = (y: number) => {
    setYearState(y);
    s.setViewYear(y);
  };
  const happen = useHappenings(year);
  if (!h) {
    return (
      <Sheet title="家計のゆとり" onClose={close} short>
        <div className="empty">この年のデータがありません</div>
      </Sheet>
    );
  }
  const span = healthSpan(list, year);
  const spanText = span && span.to > span.from ? `${span.from}〜${span.to}年の${span.to - span.from + 1}年間` : 'この年だけ';
  // 次に色が変わる年（ゆとりの年なら次に黄・赤になる年、黄・赤の年ならその状態が終わる年）
  const jump = h.level === 'ok' ? list.find((x) => x.year > year && x.level !== 'ok') : span ? list.find((x) => x.year > span.to) : undefined;
  const jumpText = !jump ? null : h.level === 'ok' ? `次に「${HEALTH_LABEL[jump.level]}」になる年` : `「${HEALTH_LABEL[jump.level]}」に変わる年`;
  return (
    <Sheet
      title={`${year}年の家計のゆとり`}
      onClose={close}
      short
      head={
        <span className="minipager">
          <button disabled={i <= 0} onClick={() => setYear(list[i - 1].year)} aria-label="前の年">
            <Icon name="left" />
          </button>
          <button disabled={i >= list.length - 1} onClick={() => setYear(list[i + 1].year)} aria-label="次の年">
            <Icon name="right" />
          </button>
        </span>
      }
    >
      <div className={`hl-hero hl-${h.level}`}>
        <i className="hl-dot" />
        <b>{HEALTH_LABEL[h.level]}</b>
        <span className="micro grow ellipsis">{spanText}{h.retired ? '・老後' : ''}</span>
      </div>
      <div className="hl-reasons">
        {h.reasons.map((r, k) => (
          <div key={k} className="hl-r">
            <i className={`hl-dot hl-${r.level}`} />
            <span>{r.text}</span>
          </div>
        ))}
      </div>
      <div className="card grid2 hl-nums">
        <Kpi label="収入（月平均）" v={h.income} sub={h.onceIncome > 0 ? `ほかに一時的な収入 ${yen(h.onceIncome)}` : '一時的な収入を除く'} />
        <Kpi label="支出（月平均）" v={h.spend} sub={h.once > 0 ? `ほかに一時的な支出 ${yen(h.once)}` : '一時的な支出を除く'} />
        <Kpi label="月の余り（積立の前）" v={h.surplus} sign sub={h.noBonus != null ? `ボーナスのない月 ${yen(h.noBonus, { sign: true })}` : h.rate != null ? `収入の${Math.round(h.rate * 100)}%` : undefined} />
        <Kpi label="積立・投資（月）" v={h.saving} sub={`年間収支 ${yen(h.net, { sign: true })}`} />
        {h.retired ? (
          <Kpi label="年末の資産" v={h.assets} sub={h.runway != null ? `いまのペースで約${Math.round(h.runway)}年分` : '取り崩さずに暮らせる'} />
        ) : (
          <Kpi label="現金が最も少ない月" v={h.cashMin} sub={`${ymMonth(h.cashMinYM)}月・${h.cashMonths != null ? `生活費${Math.floor(h.cashMonths * 10) / 10}か月分` : ''}`} />
        )}
        <Kpi label={`予備資金の目安（${h.reserveMonths}か月）`} v={h.reserve} sub={h.retired ? '年末の資産と比べる' : '現金と比べる'} />
      </div>
      {happen.length > 0 && (
        <div className="happen" title={happen.map((x) => x.text).join('、')}>
          <Icon name={happen[0].icon} />
          <span className="ellipsis">この年: {happen.map((x) => x.text).join('、')}</span>
        </div>
      )}
      {jump && jumpText && (
        <button className="item" onClick={() => setYear(jump.year)}>
          <span className={`hl-dot hl-${jump.level}`} />
          <div className="grow">
            <div className="t">
              {jumpText}: {jump.year}年
            </div>
          </div>
          <Icon name="right" />
        </button>
      )}
      <div className="micro hl-rule">{rule(h.retired, h.reserveMonths)}</div>
    </Sheet>
  );
}

/** 判定のものさし（画面の下に小さく出す） */
function rule(retired: boolean, rm: number): string {
  const L = (k: HealthLevel) => HEALTH_LABEL[k];
  return retired
    ? `老後は年金などで足りない分を資産から払う前提で判定。${L('tight')}＝資産が尽きる・生活費${rm}か月分を下回る／${L('warn')}＝いまのペースだと${HEALTH.warnRunway}年以内に資産が尽きる`
    : `頭金・入学費用・イベントなどの一時的な支出は月平均から除き、現金の減り方で見ます。${L('tight')}＝月平均で赤字・現金が生活費${rm}か月分（予備資金）を下回る／${L('warn')}＝余りが収入の${HEALTH.warnRate * 100}%未満・ボーナスのない月が赤字・現金が${rm * HEALTH.warnReserve}か月分未満・積立まで入れると現金が減る`;
}
