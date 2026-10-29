import React from 'react';
import { Ruler } from '../components/charts';
import { Kpi, TierChip } from '../components/bits';
import { useFit } from '../components/fields';
import { yen } from '../format';
import { Icon, RoofMark } from '../icons';
import { useStore } from '../store';
import { startNewHouse } from '../sheets/house';
import { emptyData } from '../../engine/defaults';
import { nowYM } from '../../engine/ym';

export function SampleBanner() {
  const s = useStore();
  if (!s.data.sample) return null;
  return (
    <div className="banner" role="status">
      <span>
        <b>サンプル</b>の家計を表示中
      </span>
      <button
        className="btn small"
        onClick={() => s.open({ kind: 'confirm', props: { title: 'サンプルを消して始めますか？', body: 'サンプルの家計・住宅・メモを消して、空の状態から入力します。', ok: '消して入力する', danger: true, run: () => {
          s.replace({ ...emptyData(nowYM()), sample: false }, 'サンプルを消しました');
          s.open({ kind: 'wizard' });
        } } })}
      >
        自分の家計で始める
      </button>
    </div>
  );
}

export function Home() {
  const s = useStore();
  const vm = s.vm;
  const fit = useFit<HTMLDivElement>(52, 6, 0);
  if (!vm) return <Loading />;
  if (!vm.ready) {
    return (
      <div className="screen">
        <SampleBanner />
        <div className="card hero">
          <RoofMark />
          <div className="label">あなたの適正住宅予算</div>
          <div className="hero-amount" style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>
            入力が必要です
          </div>
          <div className="micro">足りない項目</div>
          <div className="chips">
            {vm.blocking.map((b) => (
              <span key={b} className="chip tier-caution">
                {b}
              </span>
            ))}
          </div>
          <button className="btn primary" onClick={() => s.open({ kind: 'wizard' })}>
            かんたん入力をはじめる
          </button>
        </div>
        <div className="card flat micro" style={{ lineHeight: 1.6 }}>
          収入・貯蓄・生活費がわかると、教育費や老後までの家計を月ごとに計算し、無理なく返せる住宅予算を出します。入力は端末の中にだけ保存されます。
        </div>
      </div>
    );
  }
  const t = vm.tiers!;
  const r = vm.rec;
  const f = r.final;
  const m = r.metrics;
  const ranked = vm.houses.filter((h) => !h.incomplete).sort((a, b) => a.rank - b.rank);
  return (
    <div className="screen">
      <SampleBanner />
      <div className="card hero">
        <RoofMark />
        <div className="row">
          <span className="label">あなたの住宅購入予算</span>
          <button className="chip" style={{ marginLeft: 'auto', position: 'relative' }} onClick={() => s.open({ kind: 'basis' })} aria-label="計算の内訳を見る">
            <Icon name="info" />
            計算の内訳・信頼度 {vm.confidence.level}
          </button>
        </div>
        {t.standard.ok ? (
          <>
            <Amount v={f.total} />
            <button className="flowline" onClick={() => s.open({ kind: 'basis', props: { page: 'lines' } })} aria-label="返済余力の内訳を見る">
              <span>
                ① 毎月 <b className="num">{yen(r.payment)}</b>
              </span>
              <span className="arr">→</span>
              <span>
                ② 借入 <b className="num">{yen(r.loan)}</b>
              </span>
              {r.overBank ? (
                <>
                  <span className="arr">→</span>
                  <span>
                    ③ 家計上 <b className="num">{yen(r.total)}</b>
                  </span>
                </>
              ) : (
                <span>
                  ＋ 自己資金 <b className="num">{yen(r.down)}</b>
                </span>
              )}
            </button>
            {r.overBank ? (
              <button className="chip tier-caution" style={{ alignSelf: 'flex-start' }} onClick={() => s.open({ kind: 'basis', props: { page: 'flow' } })}>
                審査の目安 {yen(vm.bank!.amount)} が上限（家計上は ③ まで返せます）
              </button>
            ) : (
              <div className="micro hide-tiny">
                物件 {yen(f.price)} ＋ 諸費用 {yen(f.total - f.price)}（{s.computing ? '再計算中…' : '標準の条件で算出'}）
              </div>
            )}
            <Ruler safe={t.safe.ok ? t.safe.total : 0} standard={t.standard.total} caution={t.caution.ok ? t.caution.total : t.standard.total} mark={f.total} desired={null} />
            <div className="row hide-tiny" style={{ gap: 10, flexWrap: 'wrap' }}>
              <Legend color="var(--green)" text="安心" />
              <Legend color="var(--green-2)" text="標準" />
              <Legend color="var(--warn)" text="注意" />
              <Legend color="var(--red-soft)" text="危険" />
            </div>
          </>
        ) : (
          <button style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left' }} onClick={() => s.open({ kind: 'basis', props: { page: 'limit' } })}>
            <div className="hero-amount neg" style={{ fontSize: 'var(--fs-xl)', fontWeight: 800 }}>
              {t.standard.zeroFail && t.standard.zeroFail.ym >= vm.retireAllYM ? '老後の資金が足りない計画です' : '住宅費に充てられる金額がありません'}
            </div>
            <div className="micro" style={{ lineHeight: 1.6 }}>
              {vm.breakdown?.limit ? `${vm.breakdown.limit.text}。` : ''}どの入力を変えると良いかを、計算の内訳で確認できます。
            </div>
          </button>
        )}
      </div>

      {m && (
        <div className="card kpis">
          <Kpi label="借入額" v={f.loan} sub={`自己資金 ${yen(f.down)}`} />
          <Kpi label="毎月の住宅関連支出" v={m.monthlyHousing} sub={`うち返済 ${yen(m.loanMonthly)}`} />
          <Kpi label="購入後の生活余力（月）" v={m.surplus5y} sign sub="購入後5年の平均" />
          <Kpi label="貯蓄（現金＋投資）" v={m.savingsNow} sub={<>10年後 {yen(m.savings10y)}</>} />
        </div>
      )}

      <div className="card stack fill cands-card" style={{ gap: 6 }}>
        <div className="row between">
          <span className="label" style={{ fontWeight: 700 }}>
            候補の住宅{ranked.length > 0 && <span className="micro"> {ranked.length}件</span>}
          </span>
          {vm.houses.length > 0 && (
            <button className="btn ghost small" onClick={() => s.setTab('compare')}>
              すべて比較 <Icon name="right" />
            </button>
          )}
        </div>
        {ranked.length === 0 ? (
          <div className="empty fill">住宅を登録すると、家計との相性を判定します</div>
        ) : (
          <div className="cands fill" ref={fit.ref}>
            {ranked.slice(0, Math.min(3, fit.n)).map((h) => (
              <button key={h.id} className="item" onClick={() => s.open({ kind: 'houseDetail', props: { id: h.id } })}>
                <span className="rank" data-r={String(h.rank)}>
                  {h.rank}
                </span>
                <div className="grow">
                  <div className="t ellipsis">{h.name}</div>
                  <div className="micro ellipsis">
                    総額 {yen(h.total)} ・ 月 {yen(h.metrics.monthlyHousing)}
                  </div>
                </div>
                <TierChip tier={h.tier} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="quick">
        <button className="btn" onClick={() => startNewHouse(s)}>
          <Icon name="plus" />
          住宅を追加
        </button>
        <button className="btn" onClick={() => s.setTab('fp')}>
          <Icon name="fp" />
          ライフプラン
        </button>
        <button className="btn" onClick={() => s.setTab('loan')}>
          <Icon name="loan" />
          ローン試算
        </button>
      </div>
    </div>
  );
}

function Amount({ v }: { v: number }) {
  const parts = yen(v).match(/^(.*?)(万円|円)$/);
  return (
    <div className="amount" aria-live="polite">
      {parts ? (
        <>
          {parts[1]}
          <small>{parts[2]}</small>
        </>
      ) : (
        yen(v)
      )}
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="micro row" style={{ gap: 4 }}>
      <i style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
      {text}
    </span>
  );
}

export function Loading() {
  return (
    <div className="screen" aria-busy="true">
      <div className="card hero" style={{ height: 160, opacity: 0.6 }}>
        <div className="label">計算しています…</div>
      </div>
      <div className="card" style={{ height: 120, opacity: 0.4 }} />
      <div className="card fill" style={{ opacity: 0.3 }} />
    </div>
  );
}

