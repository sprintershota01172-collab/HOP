import React, { useEffect, useState } from 'react';
import type { LoanView } from '../../engine/view';
import { Diff, Kpi, Money, tierNote, TierChip } from '../components/bits';
import { Pager, useFit, usePages } from '../components/fields';
import { pct, yen, ymText } from '../format';
import { useStore } from '../store';
import { Loading, SampleBanner } from './Home';

const RATE_LABEL = { variable: '変動', fixed: '全期間固定', fixedPeriod: '固定期間選択' } as const;

export function Loan() {
  const s = useStore();
  const vm = s.vm;
  const h = s.data.plan.housing;
  const [mode, setMode] = useState<'result' | 'sim' | 'table'>('result');
  const [whatIf, setWhatIf] = useState({ rateDelta: 0, incomeCut: 0, years: null as number | null });
  const [draft, setDraft] = useState<number | null>(null);
  const [base, setBase] = useState<LoanView | null>(null);
  const [alt, setAlt] = useState<LoanView | null>(null);
  const target = draft ?? h.desiredLoan ?? vm?.rec.loan ?? 0;
  const isDesired = h.desiredLoan != null || draft != null;

  useEffect(() => {
    if (!vm?.ready || s.computing) return;
    let alive = true;
    const t = setTimeout(() => {
      s.loan({ loan: target, whatIf: { rateDelta: 0, incomeCut: 0, years: null } }).then((v) => alive && setBase(v));
      s.loan({ loan: target, whatIf }).then((v) => alive && setAlt(v));
    }, 80);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [vm, target, whatIf.rateDelta, whatIf.incomeCut, whatIf.years, s.computing]);

  if (!vm) return <div className="screen"><Loading /></div>;
  if (!vm.ready)
    return (
      <div className="screen">
        <div className="empty fill">
          <div>ライフプランを入力すると、無理なく返せる借入額を診断します</div>
          <button className="btn primary" onClick={() => s.open({ kind: 'wizard' })}>
            かんたん入力
          </button>
        </div>
      </div>
    );

  const commitDraft = () => {
    if (draft == null) return;
    const v = draft;
    s.update((d) => {
      d.plan.housing.desiredLoan = v;
    });
    setDraft(null);
  };
  const bank = vm.bank!;
  const maxSlider = Math.max(bank.amount * 1.2, vm.rec.loan * 1.5, 10_000_000);
  const r = mode === 'sim' ? alt : base;
  const t = h.loan;
  return (
    <div className="screen">
      <SampleBanner />
      <div className="three">
        <div className="card flat">
          <div className="label">① 借りられる目安</div>
          <Money v={bank.amount} />
          <div className="micro">審査の参考値</div>
        </div>
        <div className="card main-n">
          <div className="label">② 無理なく返せる</div>
          <Money v={vm.rec.loan} className="xl" />
          <div className="micro">ライフプランから算出</div>
        </div>
        <button className="card want" style={{ border: 0, textAlign: 'left' }} onClick={() => s.open({ kind: 'loanTerms', props: { focus: 'desired' } })}>
          <div className="label">③ 希望</div>
          {h.desiredLoan != null ? <Money v={h.desiredLoan} /> : <span className="value" style={{ color: 'var(--ink-3)' }}>未設定</span>}
          <div className="micro">タップで入力</div>
        </button>
      </div>

      <div className="card" style={{ padding: '8px var(--pad)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="row between">
          <span className="label">試算する借入額{isDesired ? '（希望）' : '（推奨）'}</span>
          <b className="num" style={{ color: isDesired ? 'var(--orange)' : 'var(--green)', fontSize: 'var(--fs-l)' }}>
            {yen(target)}
          </b>
        </div>
        <input
          className="range"
          type="range"
          min={0}
          max={Math.round(maxSlider / 100_000) * 100_000}
          step={100_000}
          value={target}
          aria-label="試算する借入額"
          onChange={(e: Event) => setDraft(Number((e.target as HTMLInputElement).value))}
          onPointerUp={commitDraft}
          onTouchEnd={commitDraft}
          onKeyUp={commitDraft}
          onBlur={commitDraft}
        />
        <div className="row" style={{ gap: 6 }}>
          <button className="grow ellipsis micro" style={{ border: 0, background: 'transparent', padding: '4px 0', textAlign: 'left', color: 'var(--ink-2)' }} onClick={() => s.open({ kind: 'loanTerms', props: {} })}>
            <b style={{ color: 'var(--ink)' }}>
              {RATE_LABEL[t.rateType]} {(t.rate * 100).toFixed(2)}%・{r?.years ?? t.years}年・{t.method === 'annuity' ? '元利均等' : '元金均等'}
            </b>
            ・購入 {ymText(vm.purchaseYM)}・自己資金 {yen(r?.down ?? vm.rec.down)}
          </button>
          {isDesired && (
            <button className="btn ghost small" style={{ minHeight: 28, padding: '0 4px' }} onClick={() => s.update((d) => void (d.plan.housing.desiredLoan = null))}>
              推奨に戻す
            </button>
          )}
          <button className="btn small" style={{ minHeight: 28 }} onClick={() => s.open({ kind: 'loanTerms', props: {} })}>
            条件
          </button>
        </div>
      </div>

      <div className="seg">
        <button aria-pressed={mode === 'result' ? 'true' : 'false'} onClick={() => setMode('result')}>
          診断結果
        </button>
        <button aria-pressed={mode === 'sim' ? 'true' : 'false'} onClick={() => setMode('sim')}>
          金利・収入の変化
        </button>
        <button aria-pressed={mode === 'table' ? 'true' : 'false'} onClick={() => setMode('table')}>
          返済予定表
        </button>
      </div>

      {!r ? (
        <div className="card fill" style={{ opacity: 0.5 }} />
      ) : mode === 'result' ? (
        <Result r={r} gross={bank.gross} />
      ) : mode === 'sim' ? (
        <Sim base={base} alt={alt} whatIf={whatIf} setWhatIf={setWhatIf} maxYears={bank.years || 35} />
      ) : (
        <Table r={r} />
      )}
    </div>
  );
}

function Result({ r, gross }: { r: LoanView; gross: number }) {
  const m = r.metrics;
  const months = useStore().data.plan.assumptions.reserveMonths;
  return (
    <div className="card fill stack" style={{ gap: 6 }}>
      <div className="row">
        <TierChip tier={r.tier} />
        <span className="micro grow tier-note">{tierNote(r.tier, months)}</span>
        <span className="micro" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          完済 <b className="num" style={{ color: 'var(--ink)', fontSize: 'var(--fs-m)' }}>{m.payoffAge}</b>歳
        </span>
      </div>
      <div className="res r3">
        <Kpi label="毎月の返済" v={m.loanMonthly} sub={r.bonusFirst > 0 ? `賞与月 +${yen(r.bonusFirst)}` : '初回'} />
        <Kpi label="住宅費込み" v={m.monthlyHousing} sub="税・保険・修繕" />
        <Kpi label="購入後の残り" v={m.surplus5y} sign sub="月・5年平均" />
        <Kpi label="総返済額" v={m.totalPayment} tone="interest" />
        <Kpi label="うち利息" v={m.totalInterest} tone="interest" />
        <div className="kpi">
          <div className="label ellipsis">返済負担率</div>
          <span className={`value ${m.burden > 0.35 ? 'neg' : ''}`}>{pct(m.burden)}</span>
          <div className="micro ellipsis">額面{yen(gross)}比</div>
        </div>
      </div>
    </div>
  );
}

function Sim(props: {
  base: LoanView | null;
  alt: LoanView | null;
  whatIf: { rateDelta: number; incomeCut: number; years: number | null };
  setWhatIf: (w: { rateDelta: number; incomeCut: number; years: number | null }) => void;
  maxYears: number;
}) {
  const s = useStore();
  const w = props.whatIf;
  const b = props.base?.metrics;
  const a = props.alt?.metrics;
  const years = w.years ?? s.data.plan.housing.loan.years;
  const changed = !!(w.rateDelta || w.incomeCut || w.years);
  const fit = useFit<HTMLDivElement>(66, 2, 0);
  return (
    <div className="card fill stack" style={{ gap: 6 }}>
      <div className="row between">
        <span className="micro hide-short">金利は5年かけて上昇（変動・固定期間後）／収入減は購入後に反映</span>
        {changed && (
          <button className="btn ghost small" style={{ minHeight: 28, padding: '0 4px' }} onClick={() => props.setWhatIf({ rateDelta: 0, incomeCut: 0, years: null })}>
            元に戻す
          </button>
        )}
      </div>
      <div className="slider">
        <span>金利の上昇</span>
        <input className="range" type="range" min={0} max={0.03} step={0.0025} value={w.rateDelta} aria-label="金利の上昇幅"
          onChange={(e: Event) => props.setWhatIf({ ...w, rateDelta: Number((e.target as HTMLInputElement).value) })} />
        <b>+{(w.rateDelta * 100).toFixed(2)}%</b>
      </div>
      <div className="slider">
        <span>収入の減少</span>
        <input className="range" type="range" min={0} max={0.3} step={0.05} value={w.incomeCut} aria-label="収入の減少率"
          onChange={(e: Event) => props.setWhatIf({ ...w, incomeCut: Number((e.target as HTMLInputElement).value) })} />
        <b>{w.incomeCut ? `−${Math.round(w.incomeCut * 100)}%` : '0%'}</b>
      </div>
      <div className="slider">
        <span>返済期間</span>
        <input className="range" type="range" min={10} max={Math.max(10, props.maxYears)} step={1} value={Math.min(years, props.maxYears)} aria-label="返済期間"
          onChange={(e: Event) => props.setWhatIf({ ...w, years: Number((e.target as HTMLInputElement).value) })} />
        <b>{Math.min(years, props.maxYears)}年</b>
      </div>
      <div className="fill" ref={fit.ref}>
        {a && b && props.alt && (
          <div className="res r3">
            {[
              <div className="kpi" key="t">
                <div className="label">判定</div>
                <TierChip tier={props.alt.tier} />
              </div>,
              <Row key="m" label="毎月の返済" v={a.loanMonthly} d={a.loanMonthly - b.loanMonthly} invert />,
              <Row key="s" label="購入後の余力" v={a.surplus5y} d={a.surplus5y - b.surplus5y} />,
              <Row key="x" label="最大の月返済" v={maxMonthly(props.alt)} d={maxMonthly(props.alt) - maxMonthly(props.base!)} invert />,
              <Row key="p" label="総返済額" v={a.totalPayment} d={a.totalPayment - b.totalPayment} invert interest />,
              <Row key="a" label="完済の年齢" v={a.payoffAge} d={a.payoffAge - b.payoffAge} invert age />,
            ].slice(0, Math.min(2, fit.n) * 3)}
          </div>
        )}
        {a && b && props.alt && fit.n === 0 && (
          <div className="row micro" style={{ gap: 6 }}>
            <TierChip tier={props.alt.tier} />
            <span>毎月 {yen(a.loanMonthly)}</span>
            <Diff v={a.loanMonthly - b.loanMonthly} invert />
            <span>余力 {yen(a.surplus5y)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const maxMonthly = (v: LoanView) => Math.max(0, ...v.schedule.map((y) => Math.round(y.payment / 12)));

function Row({ label, v, d, invert, interest, age }: { label: string; v: number; d: number; invert?: boolean; interest?: boolean; age?: boolean }) {
  return (
    <div className="kpi">
      <div className="label ellipsis">{label}</div>
      <div className="stack" style={{ gap: 0 }}>
        {age ? (
          <span className="value">
            {v}
            <small>歳</small>
          </span>
        ) : (
          <Money v={v} className={interest ? 'interest' : v < 0 ? 'neg' : ''} />
        )}
        {age ? <span className={`diff ${d > 0 ? 'neg' : 'pos'}`}>{d === 0 ? '±0' : `${d > 0 ? '+' : ''}${d}歳`}</span> : <Diff v={d} invert={invert} />}
      </div>
    </div>
  );
}

function Table({ r }: { r: LoanView }) {
  const fit = useFit<HTMLDivElement>(29, 0, 3);
  const pg = usePages(r.schedule, Math.max(3, fit.n - 1));
  return (
    <div className="card fill stack" style={{ gap: 4 }}>
      <div className="fill" ref={fit.ref}>
        <table className="table">
          <thead>
            <tr>
              <th>年目</th>
              <th>返済</th>
              <th>うち利息</th>
              <th>年末残高</th>
              <th>金利</th>
            </tr>
          </thead>
          <tbody>
            {pg.slice.map((y) => (
              <tr key={y.index}>
                <td>
                  {y.index}
                  <span className="micro"> ({y.year})</span>
                </td>
                <td>{yen(y.payment)}</td>
                <td className="interest">{yen(y.interest)}</td>
                <td>{yen(y.balanceEnd)}</td>
                <td>{(y.rateEnd * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pg} />
    </div>
  );
}
