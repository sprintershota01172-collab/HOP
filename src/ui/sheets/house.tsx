import React, { useEffect, useRef, useState } from 'react';
import { newHouse } from '../../engine/defaults';
import type { Store } from '../store';
import { FINANCIAL_KEYS, PREFERENCE_KEYS, WEIGHT_LABEL } from '../../engine/houses';
import type { EnergyClass, House, WeightKey } from '../../engine/types';
import { ageAt, nowYM, ymYear } from '../../engine/ym';
import { FAIL_TEXT, Kpi, tierNote, TierChip } from '../components/bits';
import { MoneyField, NumField, Seg, Stars, TextField, Toggle, YMField } from '../components/fields';
import { Sheet, Steps } from '../components/Sheet';
import { ScoreBar } from '../screens/Compare';
import { yen, ymText } from '../format';
import { Icon } from '../icons';
import { useStore } from '../store';
import type { SheetProps } from './plan';

const THIS_YEAR = ymYear(nowYM());

/** 新しい住宅を作って登録シートを開く */
export function startNewHouse(s: Store) {
  const h = newHouse();
  s.update((d) => void d.houses.push(h));
  s.open({ kind: 'houseEdit', props: { id: h.id, isNew: true } });
}
const ENERGY_OPTS: { value: EnergyClass | ''; label: string }[] = [
  { value: '', label: '未確認' },
  { value: 'longlife', label: '長期優良等' },
  { value: 'zeh', label: 'ZEH水準' },
  { value: 'standard', label: '省エネ基準' },
  { value: 'other', label: 'その他' },
];

const STEP_TITLES = ['基本', '価格', '立地・間取り', '断熱・耐震', '設備・保証', '維持費', '評価'];

export function HouseEditSheet({ close, props }: SheetProps) {
  const s = useStore();
  const id = String(props.id);
  const created = useRef<string | null>(props.isNew ? id : null);
  const [step, setStep] = useState(typeof props.step === 'number' ? props.step : 0);
  const h = s.data.houses.find((x) => x.id === id);
  const hRef = useRef(h);
  hRef.current = h;
  useEffect(
    () => () => {
      // 何も入力せずに閉じた新規の住宅は残さない
      const cur = hRef.current;
      if (created.current && cur && !cur.name && cur.price == null && cur.landPrice == null) s.update((d) => void (d.houses = d.houses.filter((x) => x.id !== created.current)));
    },
    [],
  );
  if (!h) return null;
  const set = (fn: (x: House) => void) => s.update((d) => fn(d.houses.find((x) => x.id === id)!));
  const last = STEP_TITLES.length - 1;
  return (
    <Sheet
      title={h.name || '住宅を登録'}
      onClose={close}
      foot={
        <>
          {step > 0 ? (
            <button className="btn" onClick={() => setStep(step - 1)}>
              戻る
            </button>
          ) : (
            !created.current && (
              <button className="btn danger" onClick={() => { s.update((d) => void ((d.houses = d.houses.filter((x) => x.id !== id)), d.memos.forEach((m) => m.houseId === id && (m.houseId = null)))); close(); s.notify('住宅を削除しました', { label: '元に戻す', run: s.undo }); }}>
                <Icon name="trash" />
                削除
              </button>
            )
          )}
          {step < last ? (
            <button className="btn primary" onClick={() => setStep(step + 1)}>
              次へ（{STEP_TITLES[step + 1]}）
            </button>
          ) : (
            <button className="btn primary" onClick={close}>
              完了
            </button>
          )}
        </>
      }
    >
      <Steps n={STEP_TITLES.length} at={step} />
      <div className="row between">
        <span className="label" style={{ fontWeight: 700 }}>
          {step + 1}. {STEP_TITLES[step]}
        </span>
        <span className="micro">入力した内容はすぐ保存されます</span>
      </div>
      {step === 0 && (
        <>
          <TextField label="物件名" value={h.name} placeholder="例: A社 2階建て" onChange={(v) => set((x) => void (x.name = v))} />
          <div className="grid2">
            <TextField label="ハウスメーカー・会社" value={h.maker} onChange={(v) => set((x) => void (x.maker = v))} />
            <TextField label="所在地" value={h.address} onChange={(v) => set((x) => void (x.address = v))} />
          </div>
          <div className="grid2">
            <Seg label="種類" value={h.kind} onChange={(v) => set((x) => void (x.kind = v))} options={[{ value: 'detached', label: '戸建て' }, { value: 'mansion', label: 'マンション' }]} />
            <Seg label="新築・中古" value={h.newBuild ? 'new' : 'used'} onChange={(v) => set((x) => void (x.newBuild = v === 'new'))} options={[{ value: 'new', label: '新築' }, { value: 'used', label: '中古' }]} />
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <MoneyField label="物件価格（税込）" hint="土地＋建物" value={h.price} onChange={(v) => set((x) => void (x.price = v))} />
          <div className="grid2">
            <MoneyField label="うち土地" value={h.landPrice} onChange={(v) => set((x) => void (x.landPrice = v))} />
            <MoneyField label="うち建物" value={h.buildingPrice} onChange={(v) => set((x) => void (x.buildingPrice = v))} />
          </div>
          <div className="grid2">
            <MoneyField label="諸費用" hint="空欄は物件価格×諸費用率" value={h.misc} onChange={(v) => set((x) => void (x.misc = v))} />
            <YMField label="入居予定" value={h.moveInYM} onChange={(v) => set((x) => void (x.moveInYM = v))} from={THIS_YEAR} to={THIS_YEAR + 10} />
          </div>
          {h.price == null && h.landPrice != null && h.buildingPrice != null && <div className="micro">物件価格は 土地＋建物 = {yen(h.landPrice + h.buildingPrice)} として計算します。</div>}
        </>
      )}
      {step === 2 && (
        <>
          <div className="grid2">
            <TextField label="間取り" value={h.layout} placeholder="4LDK" onChange={(v) => set((x) => void (x.layout = v))} />
            <NumField label="駐車台数" unit="台" value={h.parking} onChange={(v) => set((x) => void (x.parking = v))} />
          </div>
          <div className="grid2">
            <NumField label="延床面積" unit="㎡" value={h.floorArea} onChange={(v) => set((x) => void (x.floorArea = v))} />
            <NumField label="土地面積" unit="㎡" value={h.landArea} onChange={(v) => set((x) => void (x.landArea = v))} />
          </div>
          <div className="grid3">
            <TextField label="最寄り駅" value={h.station} onChange={(v) => set((x) => void (x.station = v))} />
            <NumField label="駅徒歩" unit="分" value={h.walkMin} onChange={(v) => set((x) => void (x.walkMin = v))} />
            <NumField label="通勤" unit="分" value={h.commuteMin} onChange={(v) => set((x) => void (x.commuteMin = v))} />
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <Seg label="断熱等性能等級" value={h.perf.insulation ?? 0} onChange={(v) => set((x) => void (x.perf.insulation = v || null))} options={[{ value: 0, label: '未確認' }, { value: 4, label: '4' }, { value: 5, label: '5' }, { value: 6, label: '6' }, { value: 7, label: '7' }]} />
          <Seg label="耐震等級" value={h.perf.quake ?? 0} onChange={(v) => set((x) => void (x.perf.quake = v || null))} options={[{ value: 0, label: '未確認' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }]} />
          <div className="grid2">
            <NumField label="UA値" unit="W/㎡K" value={h.perf.ua} onChange={(v) => set((x) => void (x.perf.ua = v))} />
            <NumField label="気密（C値）" unit="c㎡/㎡" value={h.perf.cValue} onChange={(v) => set((x) => void (x.perf.cValue = v))} />
          </div>
          <Seg label="省エネ性能（ローン控除の区分）" value={h.perf.energy ?? ''} onChange={(v) => set((x) => void (x.perf.energy = (v || null) as EnergyClass | null))} options={ENERGY_OPTS} />
        </>
      )}
      {step === 4 && (
        <>
          <div className="grid2">
            <Toggle label="太陽光発電" value={h.perf.solar} onChange={(v) => set((x) => void (x.perf.solar = v))} />
            <Toggle label="蓄電池" value={h.perf.battery} onChange={(v) => set((x) => void (x.perf.battery = v))} />
          </div>
          <div className="grid2">
            <TextField label="構造" value={h.perf.structure} placeholder="木造（2×4）" onChange={(v) => set((x) => void (x.perf.structure = v))} />
            <TextField label="換気方式" value={h.perf.ventilation} placeholder="第1種" onChange={(v) => set((x) => void (x.perf.ventilation = v))} />
          </div>
          <div className="grid2">
            <NumField label="保証期間" unit="年" value={h.perf.warrantyYears} onChange={(v) => set((x) => void (x.perf.warrantyYears = v))} />
            <TextField label="メンテナンスの条件" value={h.perf.maintenanceNote} placeholder="10年ごとに有償点検" onChange={(v) => set((x) => void (x.perf.maintenanceNote = v))} />
          </div>
        </>
      )}
      {step === 5 && (
        <>
          <div className="micro">空欄は目安で計算します（固定資産税は価格から推計）。</div>
          <div className="grid2">
            <MoneyField label="固定資産税など（年）" unit="yen" value={h.costs.propertyTaxAnnual} onChange={(v) => set((x) => void (x.costs.propertyTaxAnnual = v))} />
            <MoneyField label="火災・地震保険（年）" unit="yen" value={h.costs.insuranceAnnual} onChange={(v) => set((x) => void (x.costs.insuranceAnnual = v))} />
          </div>
          {h.kind === 'mansion' ? (
            <div className="grid2">
              <MoneyField label="管理費（月）" unit="yen" nullable={false} value={h.costs.mgmtMonthly} onChange={(v) => set((x) => void (x.costs.mgmtMonthly = v ?? 0))} />
              <MoneyField label="修繕積立金（月）" unit="yen" nullable={false} value={h.costs.repairFundMonthly} onChange={(v) => set((x) => void (x.costs.repairFundMonthly = v ?? 0))} />
            </div>
          ) : (
            <MoneyField label="修繕費の積立（月）" unit="yen" value={h.costs.repairMonthly} onChange={(v) => set((x) => void (x.costs.repairMonthly = v))} />
          )}
          <MoneyField label="駐車場（月）" unit="yen" nullable={false} value={h.costs.parkingMonthly} onChange={(v) => set((x) => void (x.costs.parkingMonthly = v ?? 0))} />
        </>
      )}
      {step === 6 && (
        <>
          <div className="micro">あなたの好みで5段階評価します。家計との適合・維持費・性能はアプリが数字から評価します。</div>
          <div className="card stack" style={{ gap: 4 }}>
            <Stars label="立地" value={h.ratings.location} onChange={(v) => set((x) => void (x.ratings.location = v))} />
            <Stars label="間取り" value={h.ratings.layout} onChange={(v) => set((x) => void (x.ratings.layout = v))} />
            <Stars label="保証・アフター" value={h.ratings.warranty} onChange={(v) => set((x) => void (x.ratings.warranty = v))} />
            <Stars label="将来の売りやすさ" value={h.ratings.resale} onChange={(v) => set((x) => void (x.ratings.resale = v))} />
            <Stars label="総合満足度" value={h.ratings.satisfaction} onChange={(v) => set((x) => void (x.ratings.satisfaction = v))} />
          </div>
        </>
      )}
    </Sheet>
  );
}

export function HouseDetailSheet({ close, props }: SheetProps) {
  const s = useStore();
  const [page, setPage] = useState<'money' | 'spec' | 'score'>('money');
  const h = s.data.houses.find((x) => x.id === props.id);
  const e = s.vm?.houses.find((x) => x.id === props.id);
  if (!h) return null;
  const self = s.vm?.people[0];
  return (
    <Sheet
      title={h.name || '名称未設定'}
      onClose={close}
      foot={
        <>
          <button className="btn" onClick={() => s.open({ kind: 'houseEdit', props: { id: h.id } })}>
            <Icon name="sliders" />
            編集
          </button>
          <button className="btn" onClick={() => s.open({ kind: 'memoEdit', props: { category: 'house', houseId: h.id } })}>
            <Icon name="memo" />
            メモ
          </button>
          <button className="btn primary" onClick={() => { s.update((d) => void ((d.plan.housing.fpBasis = 'house'), (d.plan.housing.houseId = h.id))); close(); s.setTab('fp'); }}>
            この家で試算
          </button>
        </>
      }
    >
      <Seg value={page} onChange={setPage} options={[{ value: 'money', label: 'お金' }, { value: 'spec', label: '性能・立地' }, { value: 'score', label: '評価' }]} />
      {!e ? (
        <div className="empty">計算中です</div>
      ) : page === 'money' ? (
        e.incomplete ? (
          <div className="empty">価格を入力すると、家計との相性を計算します</div>
        ) : (
          <>
            <div className="row">
              <TierChip tier={e.tier} />
              <span className="micro grow">{tierNote(e.tier, s.data.plan.assumptions.reserveMonths)}</span>
              <span className="chip">適合 {e.fit}</span>
            </div>
            <div className="card grid2">
              <Kpi label="住宅取得総額" v={e.total} sub={`物件 ${yen(e.price)}＋諸費用 ${yen(e.misc)}`} />
              <Kpi label="借入額" v={e.loan} sub={`自己資金 ${yen(e.down)}`} tone={e.bankOk ? undefined : 'neg'} />
              <Kpi label="月の住宅費" v={e.metrics.monthlyHousing} sub={`うち維持費 ${yen(e.upkeepMonthly)}`} />
              <Kpi label={`${e.cost35Years}年の住宅関連支出`} v={e.cost35} tone="interest" />
              <Kpi label="購入後の余力（月）" v={e.metrics.surplus5y} sign sub="購入後5年の平均" />
              <Kpi label="現金が最も減る時" v={e.metrics.minCashAfter} sub={`${ymText(e.metrics.minCashYM)}${self ? `（${ageAt(self.birthYM, e.metrics.minCashYM)}歳）` : ''}`} />
            </div>
            {(['safe', 'standard', 'caution'] as const).map((k) =>
              e.fails[k] ? (
                <div key={k} className="micro">
                  <TierChip tier={k} /> の条件では {ymText(e.fails[k]!.ym)}に{FAIL_TEXT[e.fails[k]!.kind]}（{e.fails[k]!.driver}）
                </div>
              ) : null,
            )}
            {!e.bankOk && <div className="micro neg">借入額が審査の目安（{yen(s.vm?.bank?.amount)}）を超えています。</div>}
          </>
        )
      ) : page === 'spec' ? (
        <div className="card" style={{ padding: '4px var(--pad)' }}>
          <table className="table">
            <tbody>
              {[
                ['会社', h.maker || '—'],
                ['所在地', h.address || '—'],
                ['種類', `${h.kind === 'mansion' ? 'マンション' : '戸建て'}・${h.newBuild ? '新築' : '中古'}`],
                ['間取り・延床', `${h.layout || '—'}・${h.floorArea ? `${h.floorArea}㎡` : '—'}`],
                ['土地・駐車', `${h.landArea ? `${h.landArea}㎡` : '—'}・${h.parking != null ? `${h.parking}台` : '—'}`],
                ['駅・徒歩', `${h.station || '—'}・${h.walkMin != null ? `${h.walkMin}分` : '—'}`],
                ['通勤', h.commuteMin != null ? `${h.commuteMin}分` : '—'],
                ['断熱・耐震', `${h.perf.insulation ? `等級${h.perf.insulation}` : '—'}・${h.perf.quake ? `等級${h.perf.quake}` : '—'}`],
                ['UA値・C値', `${h.perf.ua ?? '—'}・${h.perf.cValue ?? '—'}`],
                ['太陽光・蓄電池', `${h.perf.solar ? 'あり' : 'なし'}・${h.perf.battery ? 'あり' : 'なし'}`],
                ['構造・換気', `${h.perf.structure || '—'}・${h.perf.ventilation || '—'}`],
                ['保証', h.perf.warrantyYears ? `${h.perf.warrantyYears}年` : '—'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ fontFamily: 'var(--font)', color: 'var(--ink-2)' }}>{k}</td>
                  <td style={{ fontFamily: 'var(--font)', whiteSpace: 'normal' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="card stack" style={{ gap: 6 }}>
            <div className="row between">
              <span className="label">総合点</span>
              <b className="num" style={{ fontSize: 'var(--fs-xl)' }}>
                {e.totalScore}
              </b>
            </div>
            <ScoreBar fin={e.financial} pref={e.preference} />
            <div className="row micro between">
              <span>お金の評価 {e.financial != null ? Math.round(e.financial) : '—'}</span>
              <span>住み心地・好み {e.preference != null ? Math.round(e.preference) : '—'}</span>
            </div>
          </div>
          <div className="card stack" style={{ gap: 4 }}>
            {([...FINANCIAL_KEYS, ...PREFERENCE_KEYS] as WeightKey[]).map((k) => (
              <div key={k} className="row" style={{ gap: 8 }}>
                <span className="micro" style={{ width: 120, flex: 'none' }}>
                  {WEIGHT_LABEL[k]}
                </span>
                <div className="bar grow">
                  <i style={{ width: `${e.scores[k] ?? 0}%`, background: FINANCIAL_KEYS.includes(k) ? 'var(--green)' : 'var(--c-edu)' }} />
                </div>
                <b className="num micro" style={{ width: 28, textAlign: 'right' }}>
                  {e.scores[k] ?? '—'}
                </b>
              </div>
            ))}
          </div>
          {e.strengths.length > 0 && <div className="micro">◎ {e.strengths.join('・')}</div>}
          {e.weakness && <div className="micro neg">△ {e.weakness}</div>}
        </>
      )}
    </Sheet>
  );
}

export function WeightsSheet({ close }: SheetProps) {
  const s = useStore();
  const w = s.data.weights;
  const row = (k: WeightKey) => (
    <div key={k} className="slider" style={{ gridTemplateColumns: '1fr 120px 22px' }}>
      <span>{WEIGHT_LABEL[k]}</span>
      <input className="range" type="range" min={0} max={5} step={1} value={w[k]} aria-label={`${WEIGHT_LABEL[k]}の重み`} onChange={(e: Event) => s.update((d) => void (d.weights[k] = Number((e.target as HTMLInputElement).value)))} />
      <b>{w[k]}</b>
    </div>
  );
  return (
    <Sheet title="比較の重み付け" onClose={close} foot={<button className="btn primary" onClick={close}>完了</button>}>
      <div className="micro">大事にしたい項目ほど大きくします。0にすると順位の計算に使いません。資金不足（危険）の住宅は、重みに関係なく下位になります。</div>
      <div className="label" style={{ fontWeight: 700, color: 'var(--green)' }}>
        お金の評価
      </div>
      {FINANCIAL_KEYS.map(row)}
      <div className="label" style={{ fontWeight: 700, color: 'var(--orange)' }}>
        住み心地・好み
      </div>
      {PREFERENCE_KEYS.map(row)}
    </Sheet>
  );
}
