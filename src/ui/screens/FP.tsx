import React, { useState } from 'react';
import type { DetailRow, PieSlice } from '../../engine/aggregate';
import { ageAt, elemStartFY, toYM, ymYear } from '../../engine/ym';
import { AssetChart, Donut, SLICE_COLOR, YearBars } from '../components/charts';
import { Kpi, Money } from '../components/bits';
import { useFit, usePages, useSwipe } from '../components/fields';
import { Switcher } from '../components/Switcher';
import { yen } from '../format';
import { Icon } from '../icons';
import { useStore } from '../store';
import { Loading, SampleBanner } from './Home';

type View = 'month' | 'year' | 'asset';

export function FP() {
  const s = useStore();
  const [mode, setMode] = useState<'result' | 'input'>('result');
  return (
    <div className="screen">
      <SampleBanner />
      <div className="seg" role="group" aria-label="表示の切り替え">
        <button aria-pressed={mode === 'result' ? 'true' : 'false'} onClick={() => setMode('result')}>
          将来の家計
        </button>
        <button aria-pressed={mode === 'input' ? 'true' : 'false'} onClick={() => setMode('input')}>
          ライフプランを入力
        </button>
      </div>
      <Switcher k={mode} dir={mode === 'input' ? 1 : -1}>
        {mode === 'result' ? s.vm?.fp ? <Result /> : s.vm && !s.vm.ready ? <NeedInput /> : <Loading /> : <Inputs />}
      </Switcher>
    </div>
  );
}

function NeedInput() {
  const s = useStore();
  return (
    <div className="empty fill">
      <div>
        {s.vm?.blocking.join('、')}
        を入力すると、将来の家計を計算します
      </div>
      <button className="btn primary" onClick={() => s.open({ kind: 'wizard' })}>
        かんたん入力
      </button>
    </div>
  );
}

function Result() {
  const s = useStore();
  const vm = s.vm!;
  const fp = vm.fp!;
  const [view, setViewState] = useState<View>('month');
  const [vdir, setVdir] = useState(1);
  const VIEWS: View[] = ['month', 'year', 'asset'];
  const setView = (v: View) => {
    setVdir(VIEWS.indexOf(v) >= VIEWS.indexOf(view) ? 1 : -1);
    setViewState(v);
  };
  const startY = ymYear(vm.start);
  const endY = fp.years[fp.years.length - 1].year;
  const retireY = ymYear(vm.retireAllYM);
  const year = Math.min(endY, Math.max(startY, s.viewYear ?? ymYear(vm.purchaseYM) + 1));
  const self = vm.people[0];
  const age = self ? ageAt(self.birthYM, toYM(year, 12)) : null;
  const setYear = (y: number) => s.setViewYear(Math.min(endY, Math.max(startY, y)));
  const quick: [string, number][] = [
    ['5年後', startY + 5],
    ['10年後', startY + 10],
    ['20年後', startY + 20],
    ['30年後', startY + 30],
    ['退職時', retireY],
    ['老後', Math.min(endY, retireY + 10)],
  ];
  const swipe = useSwipe(() => setYear(year + 1), () => setYear(year - 1));
  const yr = fp.years.find((y) => y.year === year)!;
  const pie = fp.pies.find((p) => p.year === year)!;
  // 内訳を表示する項目（未選択なら、いちばん大きい支出）
  const [sel, setSel] = useState<PieSlice['key'] | null>(null);
  const biggest = [...pie.slices].filter((x) => x.key !== 'rest').sort((a, b) => b.value - a.value)[0]?.key ?? 'living';
  const cur: PieSlice['key'] = sel ?? biggest;
  return (
    <>
      <div className="row" style={{ flex: 'none' }}>
        <button className="chip" onClick={() => s.open({ kind: 'fpBasis' })}>
          <Icon name="house" />
          前提: {fp.basis}
          <Icon name="right" />
        </button>
        {fp.warnings.length > 0 && (
          <span className="chip tier-caution" title={fp.warnings.map((w) => w.detail).join('、')}>
            注意 {fp.warnings.length}件
          </span>
        )}
      </div>
      <div className="yearbar">
        <button className="iconbtn" onClick={() => setYear(year - 1)} aria-label="前の年">
          <Icon name="left" />
        </button>
        <div className="y">
          <b>{year}年</b>
          {age != null && <span className="micro"> {self.name} {age}歳</span>}
        </div>
        <button className="iconbtn" onClick={() => setYear(year + 1)} aria-label="次の年">
          <Icon name="right" />
        </button>
      </div>
      <div className="quickyears">
        {quick.map(([l, y]) => (
          <button key={l} aria-pressed={y === year ? 'true' : 'false'} onClick={() => setYear(y)}>
            {l}
          </button>
        ))}
      </div>
      <div className="seg">
        {(['month', 'year', 'asset'] as View[]).map((v) => (
          <button key={v} aria-pressed={view === v ? 'true' : 'false'} onClick={() => setView(v)}>
            {v === 'month' ? '月の収支' : v === 'year' ? '年の収支' : '資産の推移'}
          </button>
        ))}
      </div>
      <div className="card fill stack" {...swipe}>
        <Switcher k={view} dir={vdir}>
        {view === 'month' && (
          <>
            <div className="donut-wrap">
              <Donut slices={pie.slices} income={pie.income} sel={cur} size={typeof window !== 'undefined' && window.innerHeight <= 700 ? 108 : 132} />
              <div className="legend" role="tablist" aria-label="内訳を見る項目">
                {pie.slices.map((x) => (
                  <button className="li" key={x.key} role="tab" aria-selected={cur === x.key ? 'true' : 'false'} onClick={() => setSel(x.key)}>
                    <i style={{ background: x.key === 'rest' && x.value < 0 ? 'var(--red)' : SLICE_COLOR[x.key] }} />
                    <span className="ellipsis">{x.label}</span>
                    <span className={`num ${x.key === 'rest' && x.value < 0 ? 'neg' : ''}`}>{yen(x.value)}</span>
                  </button>
                ))}
              </div>
            </div>
            <Detail key={`${cur}-${year}`} slice={pie.slices.find((x) => x.key === cur)!} rows={pie.detail[cur]} income={pie.income} months={yr.months} year={year} />
            <Happenings year={year} />
            {pie.detail.fundPaid.length > 0 && (
              <div className="micro ellipsis" style={{ flex: 'none' }}>
                積立から支払い: {pie.detail.fundPaid.map((x) => `${x.label} ${yen(x.value)}`).join('、')}（この年の家計からは払いません）
              </div>
            )}
            {pie.withdraw > 0 && <div className="micro">投資の取崩し 月{yen(pie.withdraw)}（残額には含めていません）</div>}
          </>
        )}
        {view === 'year' && (
          <>
            <div className="grid2">
              <Kpi label="収入" v={yr.income} />
              <Kpi label="支出" v={yr.spend} />
              <Kpi label="貯蓄・投資の積立" v={yr.contrib + yr.fund} />
              <Kpi label="年間収支" v={yr.net} sign />
            </div>
            <YearBars years={fp.years} year={year} onPick={setYear} retireYear={retireY} />
            {fp.goals.length > 0 && (
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {fp.goals.slice(0, 3).map((g) => (
                  <span key={g.id} className={`chip ${g.achieved ? 'tier-safe' : 'tier-danger'}`}>
                    {g.name}: {g.achieved ? '達成見込み' : `不足 ${yen(g.shortfall)}`}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {view === 'asset' && (
          <>
            <div className="grid3">
              <Kpi label="現金" v={yr.cashEnd} />
              <Kpi label="投資" v={yr.investEnd} />
              <Kpi label="純資産" v={yr.netWorth} />
              <Kpi label="ローン残高" v={yr.loanEnd} tone="interest" />
              <Kpi label="住宅（参考評価）" v={yr.homeValue} />
              <div className="kpi">
                <div className="label">運用益（年）</div>
                <Money v={yr.gain} />
              </div>
            </div>
            <AssetChart years={fp.years} year={year} onPick={setYear} />
            <div className="row micro" style={{ gap: 10, flexWrap: 'wrap' }}>
              <LegendDot c="var(--green-2)" t="現金" />
              <LegendDot c="var(--c-save)" t="投資" />
              <LegendDot c="var(--c-home)" t="住宅" />
              <LegendDot c="var(--orange)" t="ローン残高" line />
              <LegendDot c="var(--ink)" t="純資産" line />
            </div>
          </>
        )}
        </Switcher>
      </div>
    </>
  );
}

/** その年のできごと（購入・誕生・入学・育休・退職・イベント） */
function Happenings({ year }: { year: number }) {
  const s = useStore();
  const p = s.data.plan;
  const vm = s.vm!;
  const list: { icon: string; text: string }[] = [];
  if (p.housing.fpBasis !== 'none' && ymYear(vm.purchaseYM) === year) list.push({ icon: 'house', text: '住宅を購入' });
  for (const c of p.children) {
    if (ymYear(c.birthYM) === year) list.push({ icon: 'baby', text: `${c.name} 誕生` });
    const fy = elemStartFY(c.birthYM);
    const stages: [number, string][] = [[fy, '小学校'], [fy + 6, '中学校'], [fy + 9, '高校'], ...(c.univ !== 'none' ? ([[fy + 12, '大学']] as [number, string][]) : [])];
    for (const [y, n] of stages) if (y === year) list.push({ icon: 'child', text: `${c.name} ${n}入学` });
  }
  for (const w of p.work) {
    if (ymYear(w.startYM) === year) list.push({ icon: 'briefcase', text: `${w.owner === 'self' ? p.self.name || '本人' : p.spouse?.name || '配偶者'} ${w.type === 'leave' ? '育休' : '時短勤務'}` });
  }
  for (const x of vm.people) {
    if (ymYear(x.retireYM) === year && x.net > 0) list.push({ icon: 'flag', text: `${x.name} 退職` });
  }
  for (const e of p.events) {
    const hit =
      e.pattern === 'once'
        ? ymYear(e.startYM) === year
        : e.pattern === 'repeat'
          ? ymYear(e.startYM) <= year && (year - ymYear(e.startYM)) % Math.max(1, e.everyYears) === 0 && (e.endYM == null || ymYear(e.endYM) >= year)
          : ymYear(e.startYM) === year;
    if (hit) list.push({ icon: e.icon, text: e.name });
  }
  if (!list.length) return null;
  return (
    <div className="happen hide-short" title={list.map((x) => x.text).join('、')}>
      <Icon name={list[0].icon} />
      <span className="ellipsis">
        {year}年: {list.map((x) => x.text).join('、')}
      </span>
    </div>
  );
}

/** 選んだ項目の内訳（月平均）。行をタップすると、その金額の入力画面を開く */
function Detail({ slice, rows, income, months, year }: { slice: PieSlice; rows: DetailRow[]; income: number; months: number; year: number }) {
  const s = useStore();
  const rest = slice.key === 'rest';
  const short = typeof window !== 'undefined' && window.innerHeight <= 700;
  const fit = useFit<HTMLDivElement>(short ? 25.5 : 29.5, 3, 1);
  const pg = usePages(rows, Math.max(1, fit.n));
  return (
    <div className="stack fill detail" style={{ gap: 2 }}>
      <div className="row" style={{ gap: 6 }}>
        <span className="label ellipsis grow" style={{ fontWeight: 700 }}>
          {rest ? `残額の計算（収入 ${yen(income)}）` : `${slice.label}の内訳`}
          <small className="micro" style={{ fontWeight: 400 }}>
            {' '}
            {year}年・月平均{months < 12 ? `（${months}か月）` : ''}
            {rows.some((r) => r.once) ? `・一時＝年の合計÷${months}` : ''}
          </small>
        </span>
        {pg.pages > 1 && (
          <span className="minipager">
            <button disabled={pg.page === 0} onClick={() => pg.setPage(pg.page - 1)} aria-label="前のページ">
              <Icon name="left" />
            </button>
            <span className="num">
              {pg.page + 1}/{pg.pages}
            </span>
            <button disabled={pg.page >= pg.pages - 1} onClick={() => pg.setPage(pg.page + 1)} aria-label="次のページ">
              <Icon name="right" />
            </button>
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="empty fill">{year}年は{slice.label}がありません</div>
      ) : (
        <div className="wf fill" ref={fit.ref}>
          {pg.slice.map((r) => (
            <button key={r.key} className={`ln${rest ? '' : ' noop'}`} disabled={!r.sheet} onClick={() => r.sheet && s.open({ kind: r.sheet, props: r.props ?? {} })}>
              {rest && <span className={`op${r.op === '+' ? ' plus' : ''}`}>{r.op}</span>}
              <span className="nm ellipsis">{r.label}</span>
              <span className="v">
                {r.once && <em className="once">一時</em>}
                {yen(r.value)}
              </span>
              {r.sheet ? <Icon name="right" /> : <span />}
            </button>
          ))}
        </div>
      )}
      {rest && (
        <div className="wf">
          <div className="total" style={{ paddingTop: 2 }}>
            <span className="op">=</span>
            <span className="nm" style={{ fontWeight: 800 }}>{slice.value < 0 ? '赤字' : '残額'}</span>
            <span className={`v${slice.value < 0 ? ' neg' : ''}`}>{yen(slice.value)}</span>
            <span />
          </div>
        </div>
      )}
    </div>
  );
}

function LegendDot({ c, t, line }: { c: string; t: string; line?: boolean }) {
  return (
    <span className="row" style={{ gap: 4 }}>
      <i style={{ width: line ? 12 : 8, height: line ? 2 : 8, borderRadius: 2, background: c, display: 'inline-block' }} />
      {t}
    </span>
  );
}

function Inputs() {
  const s = useStore();
  const p = s.data.plan;
  const people = [p.self, ...(p.spouse ? [p.spouse] : [])];
  const net = people.reduce((t, x) => t + (x.netMonthly ?? 0), 0);
  const cash = people.reduce((t, x) => t + (x.cash ?? 0), 0);
  const inv = p.investments.reduce((t, x) => t + x.balance, 0);
  const livingItems = p.living.reduce((t, x) => t + x.monthly, 0);
  const living = livingItems + (p.pocket.self ?? 0) + (p.spouse ? p.pocket.spouse ?? 0 : 0) + (p.pocket.free ?? 0);
  const need = (cond: boolean) => (cond ? 'true' : 'false');
  const tiles: { k: string; icon: string; t: string; v: string; need?: boolean }[] = [
    { k: 'income', icon: 'person', t: '収入', v: net ? `月${yen(net)}` : '未入力', need: people.some((x) => x.netMonthly == null || x.birthYM == null) },
    { k: 'savings', icon: 'wallet', t: '貯蓄・借入', v: `現金 ${yen(cash)}`, need: people.some((x) => x.cash == null) },
    { k: 'children', icon: 'child', t: '子供・教育', v: p.children.length ? `${p.children.length}人` : p.assumptions.childrenConfirmed ? 'なし' : '未確認', need: !p.assumptions.childrenConfirmed && !p.children.length },
    { k: 'living', icon: 'basket', t: '生活費・お小遣い', v: living ? `月${yen(living)}` : '未入力', need: !livingItems },
    { k: 'insurance', icon: 'shield', t: '保険', v: p.insurances.length ? `月${yen(p.insurances.reduce((t, x) => t + x.monthly, 0))}` : 'なし' },
    { k: 'invest', icon: 'chart', t: 'NISA・投資', v: inv ? yen(inv) : 'なし' },
    { k: 'goals', icon: 'flag', t: '貯蓄目標', v: p.goals.length ? `${p.goals.length}件` : 'なし' },
    { k: 'events', icon: 'calendar', t: 'イベント', v: p.events.length ? `${p.events.length}件` : 'なし' },
    { k: 'work', icon: 'briefcase', t: '育休・時短', v: p.work.length ? `${p.work.length}件` : 'なし' },
    { k: 'housing', icon: 'house', t: '住まい・購入', v: p.housing.rentMonthly != null ? `家賃 ${yen(p.housing.rentMonthly)}` : '未入力' },
    { k: 'assumptions', icon: 'sliders', t: '前提条件', v: `物価 ${(p.assumptions.inflation * 100).toFixed(1)}%` },
    { k: 'basis', icon: 'info', t: '推奨額の根拠', v: s.vm ? `信頼度 ${s.vm.confidence.level}` : '' },
  ];
  return (
    <>
      <div className="card grid3" style={{ flex: 'none' }}>
        <Kpi label="世帯の手取り（月）" v={net} />
        <Kpi label="現金" v={cash} />
        <Kpi label="投資" v={inv} />
      </div>
      <div className="tiles">
        {tiles.map((x) => (
          <button key={x.k} className="tile" data-need={need(!!x.need)} onClick={() => s.open({ kind: x.k })}>
            <span className="ic">
              <Icon name={x.icon} />
            </span>
            <span className="t">{x.t}</span>
            <span className="v">{x.need ? '入力してください' : x.v}</span>
          </button>
        ))}
      </div>
    </>
  );
}
