/**
 * ライフプランの入力。
 * 各入力は「セクション」（Section）として作り、初回の「かんたん入力」のステップと、後から開く編集シートの両方で
 * まったく同じ部品を使う（同じ項目・名称・単位・保存先）。初回専用のデータや計算はない。
 */
import type { ReactNode } from 'react';
import React, { useMemo, useState } from 'react';
import { emptyPerson, LIVING_PRESETS, LIVING_STD, newChild, uid } from '../../engine/defaults';
import { CHILD_COST, CHILD_COST_SOURCE, EDU_LUNCH, EDU_MEXT, EDU_UNIV, NISA_NOTE, RETIRE_LIVING_COUPLE, SOURCES } from '../../engine/reference';
import { NATIONAL, nurseryFee, REGION_KEYS, REGIONS, type RegionKey } from '../../engine/region';
import { resolvePlan } from '../../engine/resolve';
import { childCtxs, childMonth, eventMonths, householdIncomeTax, nurseryMonthlyOf } from '../../engine/simulate';
import { marginalTaxRate } from '../../engine/tax';
import { annuityPayment } from '../../engine/loan';
import type { Child, Debt, Insurance, Investment, LifeEvent, LivingItem, LivingStd, Owner, Person, Plan, WorkChange } from '../../engine/types';
import { ageAt, elemStartFY, nowYM, toYM, ymYear } from '../../engine/ym';
import { Kpi } from '../components/bits';
import { MoneyField, NumField, Pager, Seg, TextField, Toggle, useFit, usePages, YMField } from '../components/fields';
import { ItemList } from '../components/ItemList';
import { Sheet } from '../components/Sheet';
import { Switcher } from '../components/Switcher';
import { pct, yen, ymText } from '../format';
import { EVENT_ICONS, Icon, LIVING_ICONS } from '../icons';
import { useStore } from '../store';
import { LIVING_MARK, MARK } from '../emoji';

export type SheetProps = { close: () => void; props: Record<string, unknown> };

const THIS_YEAR = ymYear(nowYM());
export const usePlan = () => {
  const s = useStore();
  const up = (fn: (p: Plan) => void) => s.update((d) => void (fn(d.plan), (d.sample = false)));
  return { s, p: s.data.plan, up };
};
export const Done = ({ close }: { close: () => void }) => (
  <button className="btn primary" onClick={close}>
    完了
  </button>
);
const DeleteBtn = ({ onDelete }: { onDelete: () => void }) => (
  <button className="btn danger" onClick={onDelete} aria-label="削除">
    <Icon name="trash" />
    削除
  </button>
);

/** ページを持つセクション: 選択肢（Seg）は固定し、中身だけを滑らかに切り替える */
function Paged<T extends string>(props: { pages: { value: T; label: string }[]; initial?: T; children: (page: T) => ReactNode }) {
  const [page, setPage] = useState<T>(props.initial ?? props.pages[0].value);
  const idx = props.pages.findIndex((x) => x.value === page);
  const [dir, setDir] = useState(1);
  return (
    <>
      <Seg
        value={page}
        onChange={(v) => {
          setDir(props.pages.findIndex((x) => x.value === v) >= idx ? 1 : -1);
          setPage(v);
        }}
        options={props.pages}
      />
      <Switcher k={page} dir={dir}>
        {props.children(page)}
      </Switcher>
    </>
  );
}

/* ============================== 収入 ============================== */
export function IncomeSection() {
  const { s, p, up } = usePlan();
  const [who, setWho] = useState<Owner>('self');
  const person = who === 'self' ? p.self : p.spouse;
  const set = (fn: (x: Person) => void) =>
    up((pl) => {
      const x = who === 'self' ? pl.self : pl.spouse;
      if (x) fn(x);
    });
  return (
    <>
      <div className="seg" role="group" aria-label="誰の収入か">
        <button aria-pressed={who === 'self' ? 'true' : 'false'} onClick={() => setWho('self')}>
          {p.self.name || '本人'}
        </button>
        <button aria-pressed={who === 'spouse' ? 'true' : 'false'} onClick={() => setWho('spouse')}>
          {p.spouse ? p.spouse.name || '配偶者' : '＋ 配偶者'}
        </button>
      </div>
      <Switcher k={who} dir={who === 'spouse' ? 1 : -1}>
        {!person ? (
          <div className="empty fill">
            <div>配偶者（パートナー）を追加すると、2人分の収入・貯蓄・年金で計算します</div>
            <button className="btn primary" onClick={() => up((pl) => void (pl.spouse = { ...emptyPerson('spouse') }))}>
              配偶者を追加
            </button>
          </div>
        ) : (
          <Paged pages={[{ value: 'income', label: '収入' }, { value: 'change', label: '収入の変化' }, { value: 'retire', label: '退職・年金' }]}>
            {(page) =>
              page === 'change' ? (
                <IncomeChanges who={who} person={person} set={set} />
              ) : page === 'income' ? (
                <>
                  <div className="grid2">
                    <TextField label="呼び名" value={person.name} onChange={(v) => set((x) => void (x.name = v))} />
                    <YMField label="生まれた年月" value={person.birthYM} onChange={(v) => set((x) => void (x.birthYM = v))} from={THIS_YEAR - 80} to={THIS_YEAR - 15} required />
                  </div>
                  <MoneyField label="手取り月収" hint="賞与を除く" per="month" required value={person.netMonthly} onChange={(v) => set((x) => void (x.netMonthly = v))} />
                  <div className="grid2">
                    <MoneyField label="賞与（手取り・年合計）" required per="year" value={person.bonusNetAnnual} onChange={(v) => set((x) => void (x.bonusNetAnnual = v))} />
                    <MoneyField label="額面年収（賞与込み）" required hint="審査の目安・年金の推計" per="year" value={person.grossAnnual} onChange={(v) => set((x) => void (x.grossAnnual = v))} />
                  </div>
                  <div className="grid2">
                    <NumField label="昇給率（年）" unit="%" scale={100} value={person.raiseRate} onChange={(v) => set((x) => void (x.raiseRate = v))} hint="未入力は物価並み" />
                    <Seg label="賞与の計算" value={person.bonusSpread ? 'split' : 'months'} onChange={(v) => set((x) => void (x.bonusSpread = v === 'split'))} options={[{ value: 'months', label: '6・12月' }, { value: 'split', label: '月々に割る' }]} />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid2">
                    <NumField label="退職年齢" required unit="歳" value={person.retireAge} min={40} max={80} onChange={(v) => set((x) => void (x.retireAge = v))} hint="未入力は65歳" />
                    <MoneyField label="退職金（手取り）" value={person.retireBonus} onChange={(v) => set((x) => void (x.retireBonus = v))} />
                  </div>
                  <div className="grid2">
                    <NumField label="年金の受給開始" unit="歳" value={person.pensionStartAge} min={60} max={75} onChange={(v) => set((x) => void (x.pensionStartAge = v))} />
                    <MoneyField label="年金（手取り）" required hint="ねんきん定期便" per="month" value={person.pensionMonthly} onChange={(v) => set((x) => void (x.pensionMonthly = v))} />
                  </div>
                  <div className="card flat micro" style={{ lineHeight: 1.6 }}>
                    年金が未入力のときは、額面年収と加入年数から推計します（老齢基礎年金 月70,608円＋報酬比例部分）。ねんきん定期便の見込額を入れると信頼度が上がります。
                    {s.vm?.people.find((x) => x.id === who) && <> いまの推計: 月{yen(s.vm.people.find((x) => x.id === who)!.pension)}</>}
                  </div>
                  {who === 'spouse' && (
                    <button
                      className="btn danger small"
                      onClick={() => {
                        up((pl) => void ((pl.spouse = null), (pl.work = pl.work.filter((w) => w.owner !== 'spouse')), (pl.investments = pl.investments.map((i) => ({ ...i, owner: 'self' as Owner })))));
                        setWho('self');
                        s.notify('配偶者を削除しました', { label: '元に戻す', run: s.undo });
                      }}
                    >
                      配偶者を削除（単身で計算）
                    </button>
                  )}
                </>
              )
            }
          </Paged>
        )}
      </Switcher>
    </>
  );
}
/** 収入が途中で変わる予定（転職・昇進など）と、定年後の再雇用 */
function IncomeChanges({ who, person, set }: { who: Owner; person: Person; set: (fn: (x: Person) => void) => void }) {
  const { s, p, up } = usePlan();
  const list = p.incomeChanges.filter((c) => c.owner === who).sort((a, b) => a.ym - b.ym);
  const rh = person.rehire ?? null;
  return (
    <>
      <ItemList
        per={2}
        rows={list.map((c) => ({ id: c.id, icon: 'briefcase', title: `${ymText(c.ym)}から${c.note ? `（${c.note}）` : ''}`, sub: `賞与 ${c.bonusNetAnnual == null ? '変わらない' : `年${yen(c.bonusNetAnnual)}`}`, right: <b className="num">月{yen(c.netMonthly)}</b> }))}
        onPick={(id) => s.open({ kind: 'incomeChange', props: { id } })}
        onAdd={() => {
          const id = uid('inc');
          up((pl) => void pl.incomeChanges.push({ id, owner: who, ym: nowYM() + 36, netMonthly: Math.round(((person.netMonthly ?? 0) * 1.1) / 10_000) * 10_000, bonusNetAnnual: null, note: '' }));
          s.open({ kind: 'incomeChange', props: { id } });
        }}
        addLabel="手取りが変わる予定を追加"
        empty="転職・昇進・時短の終了などで、ある月から手取りが変わる予定を入れられます（その後は昇給率で増えます）"
      />
      <Toggle label="定年後に再雇用で働く" value={!!rh} onChange={(v) => set((x) => void (x.rehire = v ? { untilAge: 65, netMonthly: Math.round(((x.netMonthly ?? 200_000) * 0.6) / 10_000) * 10_000 } : null))} />
      {rh && (
        <div className="grid2">
          <MoneyField label="再雇用の手取り月収" per="month" nullable={false} value={rh.netMonthly} onChange={(v) => set((x) => void (x.rehire = { ...rh, netMonthly: v ?? 0 }))} />
          <NumField label="何歳まで" unit="歳" nullable={false} min={(person.retireAge ?? 65) + 1} max={80} value={rh.untilAge} onChange={(v) => set((x) => void (x.rehire = { ...rh, untilAge: Math.round(v ?? 65) }))} hint={`退職 ${person.retireAge ?? 65}歳から`} />
        </div>
      )}
    </>
  );
}

export function IncomeChangeSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const c = p.incomeChanges.find((x) => x.id === props.id);
  if (!c) return null;
  const set = (fn: (x: Plan['incomeChanges'][number]) => void) => up((pl) => fn(pl.incomeChanges.find((x) => x.id === c.id)!));
  return (
    <Sheet title="手取りが変わる予定" onClose={close} preview short foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.incomeChanges = pl.incomeChanges.filter((x) => x.id !== c.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <div className="grid2">
        <YMField label="いつから" nullable={false} value={c.ym} onChange={(v) => v != null && set((x) => void (x.ym = v))} from={THIS_YEAR} to={THIS_YEAR + 45} />
        <TextField label="メモ" value={c.note} placeholder="転職・昇進など" onChange={(v) => set((x) => void (x.note = v))} />
      </div>
      <div className="grid2">
        <MoneyField label="手取り月収" per="month" nullable={false} value={c.netMonthly} onChange={(v) => set((x) => void (x.netMonthly = v ?? 0))} />
        <MoneyField label="賞与（年合計）" hint="空欄は変えない" per="year" value={c.bonusNetAnnual} placeholder="変えない" onChange={(v) => set((x) => void (x.bonusNetAnnual = v))} />
      </div>
    </Sheet>
  );
}

export const IncomeSheet = ({ close }: SheetProps) => (
  <Sheet title="収入" onClose={close} preview foot={<Done close={close} />}>
    <IncomeSection />
  </Sheet>
);

/* ============================== 貯蓄・借入 ============================== */
export function SavingsSection() {
  const { s, p, up } = usePlan();
  return (
    <>
      <div className="grid2">
        <MoneyField label={`${p.self.name || '本人'}の現金・預金`} required value={p.self.cash} onChange={(v) => up((pl) => void ((pl.self.cash = v), (pl.baseYM = nowYM())))} />
        {p.spouse && <MoneyField label={`${p.spouse.name || '配偶者'}の現金・預金`} required value={p.spouse.cash} onChange={(v) => up((pl) => void ((pl.spouse!.cash = v), (pl.baseYM = nowYM())))} />}
      </div>
      <div className="grid2">
        <MoneyField mark={MARK.saved} label="毎月の貯金" hint="先取り" per="month" value={p.saving.monthly} placeholder="未設定" onChange={(v) => up((pl) => void (pl.saving = { ...pl.saving, monthly: v }))} />
        <MoneyField mark={MARK.gift} label="ボーナス月の貯金" hint="1回あたり" value={p.saving.bonus} placeholder="未設定" onChange={(v) => up((pl) => void (pl.saving = { ...pl.saving, bonus: v }))} />
      </div>
      <div className="micro">貯金は預金として現金に残ります（円グラフでは「貯蓄・投資」、残額は使えるお金）。NISAなどは「NISA・投資」に分けて入力します。基準: {ymText(p.baseYM)}</div>
      <div className="label" style={{ fontWeight: 700 }}>
        いまある借入（車のローンなど）
      </div>
      <ItemList
        per={3}
        rows={p.debts.map((d) => ({ id: d.id, icon: 'coins', title: d.name || '借入', sub: `${ymText(d.endYM)}まで`, right: <b className="num">月{yen(d.monthly)}</b> }))}
        onPick={(id) => s.open({ kind: 'debtEdit', props: { id } })}
        onAdd={() => {
          const id = uid('debt');
          up((pl) => void pl.debts.push({ id, name: '車のローン', monthly: 10_000, endYM: nowYM() + 36 }));
          s.open({ kind: 'debtEdit', props: { id } });
        }}
        addLabel="借入を追加"
      />
    </>
  );
}
export const SavingsSheet = ({ close }: SheetProps) => (
  <Sheet title="貯蓄・借入" onClose={close} preview foot={<Done close={close} />}>
    <SavingsSection />
  </Sheet>
);

export function DebtEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const d = p.debts.find((x) => x.id === props.id);
  if (!d) return null;
  const set = (fn: (x: Plan['debts'][number]) => void) => up((pl) => fn(pl.debts.find((x) => x.id === d.id)!));
  return (
    <Sheet title="借入" onClose={close} short foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.debts = pl.debts.filter((x) => x.id !== d.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <TextField label="名前" value={d.name} onChange={(v) => set((x) => void (x.name = v))} />
      <div className="grid2">
        <MoneyField label="毎月の返済" per="month" nullable={false} value={d.monthly} onChange={(v) => set((x) => void (x.monthly = v ?? 0))} />
        <YMField label="返済の終わり" value={d.endYM} nullable={false} onChange={(v) => v != null && set((x) => void (x.endYM = v))} from={THIS_YEAR} to={THIS_YEAR + 40} />
      </div>
      <DebtBonusFields d={d} set={set} />
    </Sheet>
  );
}

/* ============================== 子供・教育 ============================== */
const UNIV_LABEL: Record<Child['univ'], string> = { none: '進学しない', national: '国公立', privateArts: '私立文系', privateSci: '私立理系' };
const SCHOOL_OPTS = [
  { value: 'public' as const, label: '公立' },
  { value: 'private' as const, label: '私立' },
];

/** 大学卒業までの教育費（いまの物価・概算） */
function eduTotal(c: Child, p: Plan): number {
  let t = 0;
  const r = resolvePlan(p);
  const region = p.assumptions.region ? REGIONS[p.assumptions.region] : null;
  for (let m = c.birthYM; m < c.birthYM + 24 * 12; m++) t += childMonth(c, m, p.assumptions.childLiving, 1, childCtxs(r, m, region).get(c.id) ?? null).edu;
  return Math.round(t);
}

export function ChildrenSection() {
  const { s, p, up } = usePlan();
  return (
    <>
      {p.children.length === 0 && (
        <Toggle label="子供の予定はない" hint="オンにすると「子供なし」を確定として計算し、信頼度を下げません" value={p.assumptions.childrenConfirmed} onChange={(v) => up((pl) => void (pl.assumptions.childrenConfirmed = v))} />
      )}
      <ItemList
        per={4}
        rows={p.children.map((c) => ({
          id: c.id,
          icon: 'child',
          title: c.name,
          sub: `${ymText(c.birthYM)}生まれ${c.birthYM > nowYM() ? '（予定）' : `・${ageAt(c.birthYM, nowYM())}歳`}・大学 ${UNIV_LABEL[c.univ]}`,
          right: <span className="micro">{eduTotal(c, p) ? `約${yen(eduTotal(c, p))}` : ''}</span>,
        }))}
        onPick={(id) => s.open({ kind: 'childEdit', props: { id } })}
        onAdd={() => {
          const last = p.children[p.children.length - 1];
          const c = newChild(last ? last.birthYM + 24 : nowYM() + 18, p.children.length + 1);
          up((pl) => void (pl.children.push(c), (pl.assumptions.childrenConfirmed = true)));
          s.open({ kind: 'childEdit', props: { id: c.id } });
        }}
        addLabel="子供を追加（予定も可）"
      />
      <div className="micro" style={{ lineHeight: 1.6 }}>
        教育費の初期値は文部科学省「令和5年度 子供の学習費調査」と日本政策金融公庫「教育費負担の実態調査」。学年（4月始まり・早生まれ対応）に合わせて計上し、生まれる前の年には計上しません。
      </div>
    </>
  );
}
export const ChildrenSheet = ({ close }: SheetProps) => (
  <Sheet title="子供・教育費" onClose={close} preview foot={<Done close={close} />}>
    <ChildrenSection />
  </Sheet>
);

export function ChildEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const c = p.children.find((x) => x.id === props.id);
  const total = useMemo(() => (c ? eduTotal(c, p) : 0), [c, p]);
  if (!c) return null;
  const set = (fn: (x: Child) => void) => up((pl) => fn(pl.children.find((x) => x.id === c.id)!));
  return (
    <Sheet
      title={c.name}
      onClose={close}
      preview
      foot={<><DeleteBtn onDelete={() => { up((pl) => void ((pl.children = pl.children.filter((x) => x.id !== c.id)), (pl.work = pl.work.map((w) => (w.childId === c.id ? { ...w, childId: null } : w))), (pl.insurances = pl.insurances.filter((x) => !(x.kind === 'education' && x.child?.childId === c.id))))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}
    >
      <div className="card flat row between">
        <span className="label">大学卒業までの教育費（いまの物価）</span>
        <b className="num">{yen(total)}</b>
      </div>
      <Paged initial={(props.page as 'basic' | 'path' | 'cost' | 'edu' | 'basis') ?? 'basic'} pages={[{ value: 'basic', label: '基本' }, { value: 'path', label: '進路' }, { value: 'cost', label: '習い事' }, { value: 'edu', label: '学資' }, { value: 'basis', label: '根拠' }]}>
        {(page) =>
          page === 'basic' ? (
            <>
              <div className="grid2">
                <TextField label="呼び名" value={c.name} onChange={(v) => set((x) => void (x.name = v))} />
                <YMField label="生まれた（予定）年月" value={c.birthYM} nullable={false} onChange={(v) => v != null && set((x) => void (x.birthYM = v))} from={THIS_YEAR - 25} to={THIS_YEAR + 15} />
              </div>
              <Toggle label="0〜2歳で保育園に通う" value={c.nurseryUse} onChange={(v) => set((x) => void (x.nurseryUse = v))} />
              {c.nurseryUse && (
                <div className="grid2">
                  <NumField label="通い始める年齢" unit="歳" min={0} max={2} nullable={false} value={c.nurseryStartAge} onChange={(v) => set((x) => void (x.nurseryStartAge = Math.round(v ?? 1)))} />
                  <MoneyField label="保育料" per="month" hint={p.assumptions.region ? `${REGIONS[p.assumptions.region].name}の表` : '自治体で確認'} value={c.nurseryMonthly} placeholder={p.assumptions.region ? '空欄は市の表で自動' : '未確認（3万円で仮置き）'} onChange={(v) => set((x) => void (x.nurseryMonthly = v))} />
                </div>
              )}
              <div className="micro">3〜5歳の保育料は無償化の対象です。児童手当（3歳未満 月1.5万円、高校生年代まで 月1万円、第3子以降 月3万円）は自動で収入に入ります。</div>
            </>
          ) : page === 'path' ? (
            <>
              <Seg label="幼稚園（3〜5歳）" value={c.kinder} onChange={(v) => set((x) => void (x.kinder = v))} options={[{ value: 'public', label: '公立' }, { value: 'private', label: '私立' }, { value: 'none', label: '保育園など' }]} />
              <Seg label="小学校" value={c.elem} onChange={(v) => set((x) => void (x.elem = v))} options={SCHOOL_OPTS} />
              <Seg label="中学校" value={c.middle} onChange={(v) => set((x) => void (x.middle = v))} options={SCHOOL_OPTS} />
              <Seg label="高校" value={c.high} onChange={(v) => set((x) => void (x.high = v))} options={SCHOOL_OPTS} />
              <Seg label="大学" value={c.univ} onChange={(v) => set((x) => void (x.univ = v))} options={(Object.keys(UNIV_LABEL) as Child['univ'][]).map((k) => ({ value: k, label: UNIV_LABEL[k] }))} />
              {c.univ !== 'none' && (
                <div className="grid2">
                  <NumField label="在学年数" unit="年" min={2} max={6} nullable={false} value={c.univYears} onChange={(v) => set((x) => void (x.univYears = Math.round(v ?? 4)))} />
                  <MoneyField label="仕送り" per="month" nullable={false} value={c.univAwayMonthly} onChange={(v) => set((x) => void (x.univAwayMonthly = v ?? 0))} />
                </div>
              )}
            </>
          ) : page === 'edu' ? (
            <ChildEduIns c={c} />
          ) : page === 'basis' ? (
            <ChildCostBasis c={c} />
          ) : (
            <>
              <div className="micro" style={{ lineHeight: 1.6 }}>
                空欄のときは、学校ごとの統計平均（学校外活動費: 例 公立小 年{yen(EDU_MEXT.elem.public.outside)}）を使います。入力すると、その金額に置き換えます。
              </div>
              <div className="grid2">
                <MoneyField label="習い事" per="month" value={c.lessonsMonthly} placeholder="統計平均" onChange={(v) => set((x) => void (x.lessonsMonthly = v))} />
                <MoneyField label="塾" per="month" value={c.jukuMonthly} placeholder="統計平均" onChange={(v) => set((x) => void (x.jukuMonthly = v))} />
              </div>
              <MoneyField label="その他の教育費" per="year" nullable={false} value={c.otherAnnual} onChange={(v) => set((x) => void (x.otherAnnual = v ?? 0))} />
              <Toggle label="小1〜小3で学童保育を使う" value={!!c.afterSchool} onChange={(v) => set((x) => void (x.afterSchool = v))} />
              {c.afterSchool && (
                <MoneyField label="学童保育" per="month" value={c.afterSchoolMonthly ?? null} placeholder={p.assumptions.region && REGIONS[p.assumptions.region].afterSchool.annual != null ? '空欄は市の額で自動' : '月額を入力'} onChange={(v) => set((x) => void (x.afterSchoolMonthly = v))} />
              )}
              <div className="micro">大学の費用: 国公立 入学{yen(EDU_UNIV.national.entrance)}・年{yen(EDU_UNIV.national.annual)}、私立文系 入学{yen(EDU_UNIV.privateArts.entrance)}・年{yen(EDU_UNIV.privateArts.annual)}、私立理系 入学{yen(EDU_UNIV.privateSci.entrance)}・年{yen(EDU_UNIV.privateSci.annual)}</div>
            </>
          )
        }
      </Paged>
    </Sheet>
  );
}

/** 子供ごとの学資保険 */
function ChildEduIns({ c }: { c: Child }) {
  const { s, p, up } = usePlan();
  const list = p.insurances.filter((x) => x.kind === 'education' && x.child?.childId === c.id);
  return (
    <ItemList
      per={3}
      rows={list.map((x) => ({ id: x.id, icon: 'child', title: x.name, sub: insSub(x, p), right: <b className="num">月{yen(x.monthly)}</b> }))}
      onPick={(id) => s.open({ kind: 'insEdit', props: { id } })}
      onAdd={() => {
        const it = newEduInsurance(c);
        up((pl) => void pl.insurances.push(it));
        s.open({ kind: 'insEdit', props: { id: it.id } });
      }}
      addLabel="学資保険を追加"
      empty="保険料は生まれた月から払込の年齢まで、祝い金・満期金は子供がその年齢になる月に収入として計算します"
    />
  );
}

/* ============================== 住む地域・費用の根拠 ============================== */
/** 円単位でそのまま（保育料・給食費など、表の額と照らし合わせられるように） */
const exact = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}円`;
const srcUrl = (id: string) => SOURCES.find((x) => x.id === id)?.url ?? null;
const SRC_MEXT = 'mext-r5';
const SRC_JFC = 'jfc-r3';

/** 根拠の1行（項目・金額・説明・出典へのリンク） */
function BasisRow({ label, value, note, src }: { label: string; value: string; note?: string; src?: string | null }) {
  const url = src ? srcUrl(src) : null;
  return (
    <div className="basis-row">
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="t ellipsis">{label}</div>
        {note && <div className="micro ellipsis2">{note}</div>}
      </div>
      <div className="v">
        <b className="num">{value}</b>
        {url && (
          <a className="micro" href={url} target="_blank" rel="noopener noreferrer">
            出典
          </a>
        )}
      </div>
    </div>
  );
}

/** いま（とある月）の世帯の所得割額と、子供ごとの状況 */
function useKidsCtx(p: Plan, m: number) {
  return useMemo(() => {
    const r = resolvePlan(p);
    const region = p.assumptions.region ? REGIONS[p.assumptions.region] : null;
    return { r, ctx: childCtxs(r, m, region), region };
  }, [p, m]);
}

/** 住む地域の選択と、地域で変わる費用の一覧 */
function RegionSection() {
  const { p, up } = usePlan();
  const key = p.assumptions.region ?? null;
  const { r, region } = useKidsCtx(p, nowYM());
  const incomeTax = householdIncomeTax(r, nowYM());
  const set = (k: RegionKey | null) => up((pl) => void (pl.assumptions.region = k));
  const chip = (v: RegionKey | null, label: string) => (
    <button key={label} className={`chip${key === v ? ' on' : ''}`} aria-pressed={key === v ? 'true' : 'false'} onClick={() => set(v)}>
      {label}
    </button>
  );
  const b = region ? nurseryFee(region, incomeTax) : null;
  const fit = useFit<HTMLDivElement>(56, 0, 2);
  const rows = region
    ? [
        <BasisRow key="n" label="0〜2歳の保育料（第1子）" value={`月${exact(b!.fee)}`} note={`${b!.code}階層・世帯の所得割 約${exact(incomeTax)}（額面年収から概算）。${region.nursery.second === 'free' ? '第2子以降は無料' : '2人目は半額・3人目は無料'}`} src={region.nursery.source} />,
        <BasisRow key="m" label="3〜5歳 保育園の給食費" value={`月${exact(region.preschoolMeal.monthly)}`} note={region.preschoolMeal.note} src={region.preschoolMeal.source} />,
        <BasisRow key="e" label="公立小学校の給食費" value="0円" note="国の負担軽減（2026年4月〜・月5,200円まで）" src="mext-lunch-relief" />,
        <BasisRow key="j" label="公立中学校の給食費" value={`年${exact(region.middleLunch.annual)}`} note={region.middleLunch.note} src={region.middleLunch.source} />,
        <BasisRow key="g" label="学童保育（小1〜小3）" value={region.afterSchool.annual == null ? '要入力' : `年${exact(region.afterSchool.annual)}`} note={region.afterSchool.note} src={region.afterSchool.source} />,
        <BasisRow key="t" label="都市計画税" value={`${(region.cityPlanRate * 100).toFixed(2)}%`} note="固定資産税1.4%と合わせて計算" src={region.cityPlanSource} />,
      ]
    : [
        <BasisRow key="n" label="0〜2歳の保育料" value="月3万円" note="仮置き（市の保育料表は地域を選ぶと使います）" />,
        <BasisRow key="m" label="3〜5歳 保育園の給食費" value={`月${exact(NATIONAL.preschoolMeal)}`} note="国の副食費の目安" src="cfa-fukushoku" />,
        <BasisRow key="e" label="公立小学校の給食費" value="0円" note="国の負担軽減（2026年4月〜・月5,200円まで）" src="mext-lunch-relief" />,
        <BasisRow key="j" label="公立中学校の給食費" value={`年${exact(NATIONAL.middleLunch)}`} note="子供の学習費調査の全国平均" src={SRC_MEXT} />,
        <BasisRow key="t" label="都市計画税" value="0.30%" note="上限の税率" src="property-tax" />,
      ];
  const pg = usePages(rows, Math.max(2, fit.n));
  return (
    <>
      <div className="field">
        <span>住む予定の地域</span>
        <div className="chips">
          {chip(null, '全国平均')}
          {REGION_KEYS.map((k) => chip(k, REGIONS[k].name))}
        </div>
      </div>
      <div className="fill stack" ref={fit.ref} style={{ gap: 0 }}>
        {pg.slice}
      </div>
      <Pager page={pg.page} pages={pg.pages} setPage={pg.setPage} />
      <div className="micro">地域を選ぶと、保育料・給食費・学童・都市計画税をその市の額で計算します（確認日 2026-10-30）。</div>
    </>
  );
}

/** 子供1人の教育費の根拠（段階ごとの年額と出典） */
function ChildCostBasis({ c }: { c: Child }) {
  const { p } = usePlan();
  const { r, region } = useKidsCtx(p, nowYM());
  // 保育料は通い始める年齢の月の状況で示す（兄弟の順番が反映される）
  const at = c.birthYM + c.nurseryStartAge * 12;
  const ctxAt = childCtxs(r, Math.max(at, nowYM()), region).get(c.id) ?? null;
  const nursery = nurseryMonthlyOf(c, ctxAt);
  const pub = (k: 'elem' | 'middle' | 'high') => c[k] === 'public';
  const mext = (k: 'elem' | 'middle' | 'high') => EDU_MEXT[k][c[k]];
  const outsideNote = c.lessonsMonthly != null || c.jukuMonthly != null ? `入力した習い事・塾 月${yen((c.lessonsMonthly ?? 0) + (c.jukuMonthly ?? 0))}` : '習い事・塾は学習費調査の平均';
  const rows = [
    c.nurseryUse && <BasisRow key="n" label={`0〜2歳 保育料（${c.nurseryStartAge}歳から）`} value={`月${exact(nursery.fee)}`} note={nursery.how} src={c.nurseryMonthly != null ? null : region?.nursery.source} />,
    c.kinder === 'none' ? (
      c.nurseryUse && <BasisRow key="k" label="3〜5歳 保育園" value={`給食 月${exact(region ? region.preschoolMeal.monthly : NATIONAL.preschoolMeal)}`} note="保育料は無償化で0円。給食費（主食・副食）は実費" src={region ? region.preschoolMeal.source : 'cfa-fukushoku'} />
    ) : (
      <BasisRow key="k" label={`3〜5歳 ${c.kinder === 'public' ? '公立' : '私立'}幼稚園`} value={`年${exact(EDU_MEXT.kinder[c.kinder].school)}`} note={`学校の費用（給食費を含む）。${outsideNote}`} src={SRC_MEXT} />
    ),
    <BasisRow key="e" label={`小学校（${pub('elem') ? '公立' : '私立'}）`} value={`年${exact(pub('elem') ? mext('elem').school - EDU_LUNCH.elemPublic : mext('elem').school)}`} note={pub('elem') ? '学校の費用。給食費は国の負担軽減で0円' : '学校の費用（給食費を含む）'} src={SRC_MEXT} />,
    <BasisRow key="m" label={`中学校（${pub('middle') ? '公立' : '私立'}）`} value={`年${exact(pub('middle') ? mext('middle').school - EDU_LUNCH.middlePublic + (region ? region.middleLunch.annual : NATIONAL.middleLunch) : mext('middle').school)}`} note={pub('middle') ? `学校の費用 年${yen(mext('middle').school - EDU_LUNCH.middlePublic)}＋給食費 年${yen(region ? region.middleLunch.annual : NATIONAL.middleLunch)}${region ? `（${region.name}）` : ''}` : '学校の費用（給食費を含む）'} src={pub('middle') && region ? region.middleLunch.source : SRC_MEXT} />,
    <BasisRow key="h" label={`高校（${pub('high') ? '公立' : '私立'}）`} value={`年${exact(mext('high').school)}`} note="学校の費用（授業料の支援は反映していない・多めの見積もり）" src={SRC_MEXT} />,
    c.univ !== 'none' && <BasisRow key="u" label={`大学（${UNIV_LABEL[c.univ]}）`} value={`年${exact(EDU_UNIV[c.univ].annual)}`} note={`入学費用 ${yen(EDU_UNIV[c.univ].entrance)}（高3の2月）・${c.univYears}年`} src={SRC_JFC} />,
    c.afterSchool && <BasisRow key="g" label="学童保育（小1〜小3）" value={c.afterSchoolMonthly != null ? `月${exact(c.afterSchoolMonthly)}` : region?.afterSchool.annual != null ? `年${exact(region.afterSchool.annual)}` : '未入力'} note={c.afterSchoolMonthly != null ? '入力した額' : region ? region.afterSchool.note : '地域を選ぶか月額を入力'} src={c.afterSchoolMonthly != null ? null : region?.afterSchool.source} />,
    <BasisRow key="o" label="習い事・塾など" value={`公立小 年${yen(mext('elem').outside)}`} note={outsideNote} src={SRC_MEXT} />,
  ].filter(Boolean) as ReactNode[];
  const fit = useFit<HTMLDivElement>(56, 0, 2);
  const pg = usePages(rows, Math.max(2, fit.n));
  return (
    <>
      <div className="micro">地域: {region ? region.name : '全国平均'}（「前提条件 → 住む地域」で変更）。金額はいまの物価で、毎年の物価上昇率で増やします。</div>
      <div className="fill stack" ref={fit.ref} style={{ gap: 0 }}>
        {pg.slice}
      </div>
      <Pager page={pg.page} pages={pg.pages} setPage={pg.setPage} />
    </>
  );
}

/** 子供の生活費（全国調査の平均・月額）を年齢・学年ごとに示す */
function ChildCostTable({ scale }: { scale: number }) {
  // 表の行: 調査の年齢・学年（CHILD_COST の行番号の範囲）
  const rows: [string, number, number][] = [['0歳', 0, 0], ['1〜2歳', 1, 2], ['3〜6歳', 3, 6], ['小学生', 7, 12], ['中学生', 13, 15], ['高校生', 16, 18]];
  const avg = (from: number, to: number, f: (r: (typeof CHILD_COST)[number]) => number) => {
    let t = 0;
    for (let k = from; k <= to; k++) t += f(CHILD_COST[k]);
    return (t / (to - from + 1) / 12) * scale;
  };
  const all = (r: (typeof CHILD_COST)[number]) => r.food + r.clothes + r.goods + r.medical + r.phone + r.allowance + r.events + r.leisure;
  return (
    <div className="card flat stack" style={{ gap: 2 }}>
      <div className="row between micro">
        <span>子供1人の生活費（月・平均）</span>
        <span>うち食費</span>
      </div>
      {rows.map(([l, from, to]) => (
        <div key={l} className="row between" style={{ fontSize: 'var(--fs-s)' }}>
          <span>{l}</span>
          <span>
            <b className="num">{yen(avg(from, to, all))}</b>
            <span className="micro"> / {yen(avg(from, to, (r) => r.food))}</span>
          </span>
        </div>
      ))}
      <div className="micro" style={{ lineHeight: 1.5 }}>食費・衣類・日用品・医療・携帯・おこづかい・行事・レジャー（教育費と貯金は別に計算）。出典: {CHILD_COST_SOURCE}</div>
    </div>
  );
}

/* ============================== 生活費 ============================== */
/** 「まとめて入力」の項目か（以前の版の「生活費（合計）」も同じ扱い） */
export const isLump = (x: LivingItem) => !!x.lump || x.name === '生活費（合計）';

export function LivingSection({ initial }: { initial?: 'base' | 'pocket' | 'car' } = {}) {
  return (
    <Paged initial={initial ?? 'base'} pages={[{ value: 'base', label: '生活費' }, { value: 'pocket', label: 'お小遣い・自由費' }, { value: 'car', label: '車のローン' }]}>
      {(page) => (page === 'base' ? <LivingBase /> : page === 'pocket' ? <PocketSection /> : <CarLoanSection />)}
    </Paged>
  );
}

/** 自動車ローン（以前の版で「車のローン」などの名前で入れた借入も同じものとして扱う） */
const findCar = (ds: Debt[]) => ds.find((d) => d.std === 'car') ?? ds.find((d) => !d.std && /車|カー/.test(d.name));

/** 借入のボーナス払い（1回あたり）と、月々に割って計算するか */
function DebtBonusFields({ d, set }: { d: Debt; set: (fn: (x: Debt) => void) => void }) {
  return (
    <div className="grid2">
      <MoneyField label="ボーナス払い" hint="1回あたり" value={d.bonus ?? null} placeholder="なし" onChange={(v) => set((x) => void (x.bonus = v ?? 0))} />
      {(d.bonus ?? 0) > 0 ? (
        <Seg label="払い方の計算" value={d.bonusSplit ? 'split' : 'months'} onChange={(v) => set((x) => void (x.bonusSplit = v === 'split'))} options={[{ value: 'months', label: '6・12月' }, { value: 'split', label: '月々に割る' }]} />
      ) : (
        <div />
      )}
    </div>
  );
}

export function CarLoanSection() {
  const { s, p, up } = usePlan();
  const car = findCar(p.debts);
  const others = p.debts.filter((d) => d !== car);
  const set = (fn: (d: Debt) => void, create = false) =>
    up((pl) => {
      let d = findCar(pl.debts);
      if (!d && create) {
        d = { id: uid('debt'), name: '自動車ローン', monthly: 0, endYM: nowYM() + 60, std: 'car' };
        pl.debts.push(d);
      }
      if (d) fn(d);
    });
  return (
    <>
      <div className="grid2">
        <MoneyField
          mark={MARK.car}
          label="自動車ローン"
          hint="毎月の返済"
          per="month"
          value={car ? car.monthly : null}
          placeholder="なし"
          onChange={(v) => (v == null ? up((pl) => void (pl.debts = pl.debts.filter((d) => d !== findCar(pl.debts)))) : set((d) => void ((d.monthly = v), (d.std = 'car')), true))}
        />
        {car ? <YMField label="返済の終わり" nullable={false} value={car.endYM} onChange={(v) => v != null && set((d) => void (d.endYM = v))} from={THIS_YEAR} to={THIS_YEAR + 15} /> : <div />}
      </div>
      {car && <DebtBonusFields d={car} set={(fn) => set(fn)} />}
      <div className="micro" style={{ lineHeight: 1.6 }}>
        ガソリン・保険・車検などは「生活費」の「そのほかの項目」に入れます。
      </div>
      <button className="item" style={{ minHeight: 0 }} onClick={() => s.open({ kind: 'savings' })}>
        <span className="ic">
          <Icon name="coins" />
        </span>
        <div className="grow">
          <div className="t ellipsis">ほかの借入（奨学金など）</div>
          <div className="micro ellipsis">{others.length ? `${others.length}件・月${yen(others.reduce((t, d) => t + d.monthly, 0))}` : 'なし'}</div>
        </div>
        <Icon name="right" size={16} />
      </button>
    </>
  );
}

/** 毎月のお小遣い・自由費（生活費に加えて計算する） */
export function PocketSection() {
  const { p, up } = usePlan();
  const pk = p.pocket;
  const set = (k: keyof typeof pk, v: number | null) => up((pl) => void (pl.pocket = { ...pl.pocket, [k]: v }));
  const total = (pk.self ?? 0) + (p.spouse ? pk.spouse ?? 0 : 0) + (pk.free ?? 0);
  return (
    <>
      <div className="grid2">
        <MoneyField mark={MARK.pocket} label={`${p.self.name || '本人'}のお小遣い`} required per="month" value={pk.self} placeholder="0円" onChange={(v) => set('self', v)} />
        {p.spouse && <MoneyField mark={MARK.pocket} label={`${p.spouse.name || '配偶者'}のお小遣い`} required per="month" value={pk.spouse} placeholder="0円" onChange={(v) => set('spouse', v)} />}
      </div>
      <MoneyField mark={MARK.free} label="自由費" hint="外食・レジャー・趣味など家族で使うお金" per="month" value={pk.free} placeholder="0円" onChange={(v) => set('free', v)} />
      <div className="card flat row between">
        <span className="label">お小遣い・自由費の合計</span>
        <b className="num">月{yen(total)}</b>
      </div>
      <div className="micro" style={{ lineHeight: 1.6 }}>
        生活費と同じく物価に合わせて増やし、老後は「老後の生活費」に切り替えます。「生活費」にまとめて含めている場合は、ここは空欄のままにしてください（二重に数えません）。
      </div>
    </>
  );
}

/** 決まった入力欄の項目を探す（以前の版で同じ名前で作った項目も同じものとして扱う） */
const findStd = (items: LivingItem[], std: LivingStd) => {
  const def = LIVING_STD.find((x) => x.std === std)!;
  return items.find((x) => x.std === std) ?? items.find((x) => !x.std && !isLump(x) && x.name === def.name);
};
const isStdItem = (items: LivingItem[], x: LivingItem) => LIVING_STD.some((d) => findStd(items, d.std) === x);

/** 生活費: 食費・電気代・水道代・ガス代・携帯代は個別の欄、そのほかは項目を追加するか「その他」にまとめて入力 */
function LivingBase() {
  const { s, p, up } = usePlan();
  const items = p.living;
  const lump = items.find(isLump);
  const others = items.filter((x) => !isLump(x) && !isStdItem(items, x));
  const total = items.reduce((t, x) => t + x.monthly, 0);
  const setStd = (std: LivingStd, v: number | null) =>
    up((pl) => {
      const def = LIVING_STD.find((x) => x.std === std)!;
      const cur = findStd(pl.living, std);
      if (v == null) pl.living = pl.living.filter((x) => x !== cur);
      else if (cur) Object.assign(cur, { monthly: v, std });
      else pl.living.push({ id: uid('liv'), name: def.name, icon: def.icon, monthly: v, kind: def.kind, std });
    });
  const setLump = (v: number | null) =>
    up((pl) => {
      const cur = pl.living.find(isLump);
      if (v == null) pl.living = pl.living.filter((x) => x !== cur);
      else if (cur) cur.monthly = v;
      else pl.living.push({ id: uid('liv'), name: 'その他の生活費', icon: 'basket', monthly: v, kind: 'variable', lump: true });
    });
  return (
    <>
      <div className="grid2">
        {LIVING_STD.map((d) => (
          <MoneyField key={d.std} mark={LIVING_MARK[d.std]} label={d.name} required per="month" value={findStd(items, d.std)?.monthly ?? null} placeholder="未入力" onChange={(v) => setStd(d.std, v)} />
        ))}
        <MoneyField mark={LIVING_MARK.other} label="その他の生活費" hint="まとめて" per="month" value={lump ? lump.monthly : null} placeholder="未入力" onChange={setLump} />
      </div>
      <button className="item" style={{ minHeight: 0 }} onClick={() => s.open({ kind: 'livingItems' })}>
        <span className="ic">
          <Icon name="plus" />
        </span>
        <div className="grow">
          <div className="t ellipsis">そのほかの項目（日用品・車関連など）</div>
          <div className="micro ellipsis">{others.length ? `${others.length}件・月${yen(others.reduce((t, x) => t + x.monthly, 0))}` : '項目ごとに分けたいときに追加'}</div>
        </div>
        <Icon name="right" size={16} />
      </button>
      <div className="row between">
        <span className="micro">生活費の合計</span>
        <b className="num">月{yen(total)}</b>
      </div>
      <div className="micro" style={{ lineHeight: 1.5 }}>
        大人の分を入力します。子供の食費・衣類・おこづかいなどは年齢に合わせて自動で加えます。家賃・ローン・保険・教育費・積立は別の画面で入力します（ここに入れると二重に数えます）。
      </div>
    </>
  );
}

/** そのほかの生活費の項目 */
export function LivingItemsSheet({ close }: SheetProps) {
  const { s, p } = usePlan();
  const items = p.living.filter((x) => !isLump(x) && !isStdItem(p.living, x));
  return (
    <Sheet title="そのほかの生活費の項目" onClose={close} preview foot={<Done close={close} />}>
      <ItemList
        per={5}
        rows={items.map((x) => ({ id: x.id, icon: x.icon, title: x.name, sub: x.kind === 'fixed' ? '固定費' : '変動費', right: <b className="num">{yen(x.monthly)}</b> }))}
        onPick={(id) => s.open({ kind: 'livingEdit', props: { id } })}
        onAdd={() => s.open({ kind: 'livingAdd' })}
        addLabel="項目を追加"
        empty="日用品・車関連費・ガソリン・被服費など、項目ごとに分けて入力できます"
      />
    </Sheet>
  );
}

export const LivingSheet = ({ close, props }: SheetProps) => (
  <Sheet title="毎月の生活費" onClose={close} preview foot={<Done close={close} />}>
    <LivingSection initial={props?.page === 'pocket' || props?.page === 'car' ? props.page : 'base'} />
  </Sheet>
);

export function LivingAddSheet({ close }: SheetProps) {
  const { s, p, up } = usePlan();
  const add = (name: string, icon: string, kind: LivingItem['kind']) => {
    const id = uid('liv');
    up((pl) => void pl.living.push({ id, name, icon, monthly: 0, kind }));
    close();
    s.open({ kind: 'livingEdit', props: { id } });
  };
  const have = new Set(p.living.map((x) => x.name));
  return (
    <Sheet title="項目を追加" onClose={close}>
      <div className="grid3">
        {LIVING_PRESETS.filter((x) => !have.has(x.name)).map((x) => (
          <button key={x.name} className="tile" style={{ minHeight: 64 }} onClick={() => add(x.name, x.icon, x.kind)}>
            <span className="ic">
              <Icon name={x.icon} />
            </span>
            <span className="t">{x.name}</span>
          </button>
        ))}
        <button className="tile" style={{ minHeight: 64 }} onClick={() => add('新しい項目', 'dots', 'variable')}>
          <span className="ic">
            <Icon name="plus" />
          </span>
          <span className="t">自由に追加</span>
        </button>
      </div>
    </Sheet>
  );
}

export function LivingEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const it = p.living.find((x) => x.id === props.id);
  if (!it) return null;
  const set = (fn: (x: LivingItem) => void) => up((pl) => fn(pl.living.find((x) => x.id === it.id)!));
  return (
    <Sheet title={it.name} onClose={close} short foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.living = pl.living.filter((x) => x.id !== it.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <div className="grid2">
        <TextField label="名前" value={it.name} onChange={(v) => set((x) => void (x.name = v))} />
        <MoneyField label="金額" per="month" nullable={false} value={it.monthly} onChange={(v) => set((x) => void (x.monthly = v ?? 0))} />
      </div>
      <Seg label="種類" value={it.kind} onChange={(v) => set((x) => void (x.kind = v))} options={[{ value: 'fixed', label: '固定費' }, { value: 'variable', label: '変動費' }]} />
      <div className="field">
        <span>アイコン</span>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {LIVING_ICONS.map((ic) => (
            <button key={ic} className="iconbtn" style={{ background: ic === it.icon ? 'var(--green-soft)' : 'var(--surface)', color: ic === it.icon ? 'var(--green)' : 'var(--ink-2)' }} aria-pressed={ic === it.icon ? 'true' : 'false'} onClick={() => set((x) => void (x.icon = ic))}>
              <Icon name={ic} />
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/* ============================== 保険 ============================== */
const INS_LABEL: Record<Insurance['kind'], string> = { life: '生命', medical: '医療', cancer: 'がん', education: '学資', annuity: '個人年金', other: 'その他' };
/** 学資保険の初期値（払込総額と同額の受取。保険証券・設計書の金額に置き換える前提） */
export const newEduInsurance = (c: Child): Insurance => ({
  id: uid('ins'),
  name: `学資保険（${c.name}）`,
  kind: 'education',
  monthly: 10_000,
  payEndYM: null,
  payout: { type: 'none' },
  child: { childId: c.id, payUntilAge: 10, payouts: [{ age: 18, amount: 1_200_000 }] },
});

const insSub = (x: Insurance, p: Plan): string => {
  if (x.kind === 'education' && x.child) {
    const ch = p.children.find((c) => c.id === x.child!.childId);
    if (!ch) return '学資・対象の子供が見つかりません（計算に入れていません）';
    const n = x.child.payouts.filter((po) => po.amount > 0).length;
    return `学資・${ch.name}・${x.child.payUntilAge}歳まで払込・受取${n}回`;
  }
  return `${INS_LABEL[x.kind]}・${x.payEndYM ? `${ymText(x.payEndYM)}まで` : '終身払い'}${x.payout.type !== 'none' ? '・受取あり' : ''}`;
};

export function InsuranceSection() {
  const { s, p, up } = usePlan();
  const addEdu = () => {
    const c = p.children[0];
    if (!c) return;
    const it = newEduInsurance(c);
    up((pl) => void pl.insurances.push(it));
    s.open({ kind: 'insEdit', props: { id: it.id } });
  };
  return (
    <>
      <ItemList
        per={4}
        rows={p.insurances.map((x) => ({ id: x.id, icon: x.kind === 'education' ? 'child' : 'shield', title: x.name, sub: insSub(x, p), right: <b className="num">月{yen(x.monthly)}</b> }))}
        onPick={(id) => s.open({ kind: 'insEdit', props: { id } })}
        onAdd={() => {
          const id = uid('ins');
          up((pl) => void pl.insurances.push({ id, name: '保険', kind: 'medical', monthly: 3_000, payEndYM: null, payout: { type: 'none' } }));
          s.open({ kind: 'insEdit', props: { id } });
        }}
        addLabel="保険を追加"
        empty="保険料は「保険料」として、受取金は受け取る月の収入として計算します（貯蓄型でも二重に数えません）"
      />
      {p.children.length > 0 && (
        <button className="btn" onClick={addEdu}>
          <Icon name="child" />
          学資保険を追加
        </button>
      )}
    </>
  );
}
export const InsuranceSheet = ({ close }: SheetProps) => (
  <Sheet title="保険" onClose={close} preview foot={<Done close={close} />}>
    <InsuranceSection />
  </Sheet>
);

export function InsEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const it = p.insurances.find((x) => x.id === props.id);
  if (!it) return null;
  const set = (fn: (x: Insurance) => void) => up((pl) => fn(pl.insurances.find((x) => x.id === it.id)!));
  const po = it.payout;
  const setKind = (v: Insurance['kind']) =>
    set((x) => {
      x.kind = v;
      if (v === 'education' && !x.child && p.children[0]) x.child = newEduInsurance(p.children[0]).child;
      if (v !== 'education') x.child = null;
    });
  return (
    <Sheet title={it.name} onClose={close} preview foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.insurances = pl.insurances.filter((x) => x.id !== it.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <TextField label="名前" value={it.name} onChange={(v) => set((x) => void (x.name = v))} />
      <Seg label="種類" value={it.kind} onChange={setKind} options={(Object.keys(INS_LABEL) as Insurance['kind'][]).map((k) => ({ value: k, label: INS_LABEL[k] }))} />
      {it.kind === 'education' && it.child ? (
        <EduInsFields it={it} set={set} />
      ) : it.kind === 'education' ? (
        <div className="empty">
          <div>子供を追加すると、子供の年齢に合わせて払込と受取（祝い金・満期金）を計算します</div>
          <button className="btn primary" onClick={() => s.open({ kind: 'children' })}>
            子供を追加
          </button>
        </div>
      ) : (
        <>
          <div className="grid2">
            <MoneyField label="保険料" per="month" nullable={false} value={it.monthly} onChange={(v) => set((x) => void (x.monthly = v ?? 0))} />
            <YMField label="払込の終わり" hint="空欄は終身" value={it.payEndYM} onChange={(v) => set((x) => void (x.payEndYM = v))} from={THIS_YEAR} to={THIS_YEAR + 60} />
          </div>
          <Seg label="受取金" value={po.type} onChange={(v) => set((x) => void (x.payout = v === 'none' ? { type: 'none' } : v === 'lump' ? { type: 'lump', ym: nowYM() + 120, amount: 1_000_000 } : { type: 'annuity', startYM: nowYM() + 360, years: 10, annual: 600_000 }))} options={[{ value: 'none', label: 'なし' }, { value: 'lump', label: '一時金' }, { value: 'annuity', label: '年金形式' }]} />
          {po.type === 'lump' && (
            <div className="grid2">
              <MoneyField label="受取額" nullable={false} value={po.amount} onChange={(v) => set((x) => void (x.payout = { ...po, amount: v ?? 0 }))} />
              <YMField label="受取時期" nullable={false} value={po.ym} onChange={(v) => v != null && set((x) => void (x.payout = { ...po, ym: v }))} from={THIS_YEAR} to={THIS_YEAR + 60} />
            </div>
          )}
          {po.type === 'annuity' && (
            <div className="grid3">
              <MoneyField label="受取額" per="year" nullable={false} value={po.annual} onChange={(v) => set((x) => void (x.payout = { ...po, annual: v ?? 0 }))} />
              <YMField label="開始" nullable={false} value={po.startYM} onChange={(v) => v != null && set((x) => void (x.payout = { ...po, startYM: v }))} from={THIS_YEAR} to={THIS_YEAR + 60} />
              <NumField label="期間" unit="年" nullable={false} min={1} max={40} value={po.years} onChange={(v) => set((x) => void (x.payout = { ...po, years: Math.round(v ?? 10) }))} />
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

/** 学資保険: 対象の子供・保険料・払込の年齢・受取（祝い金・満期金） */
function EduInsFields({ it, set }: { it: Insurance; set: (fn: (x: Insurance) => void) => void }) {
  const { p } = usePlan();
  const e = it.child!;
  const ch = p.children.find((c) => c.id === e.childId);
  const setE = (fn: (x: NonNullable<Insurance['child']>) => void) =>
    set((x) => {
      const c = { ...x.child!, payouts: x.child!.payouts.map((po) => ({ ...po })) };
      fn(c);
      x.child = c;
    });
  const paidTotal = it.monthly * e.payUntilAge * 12;
  const getTotal = e.payouts.reduce((t, po) => t + po.amount, 0);
  return (
    <>
      {p.children.length > 1 || !ch ? (
        <Seg label="対象の子供" value={ch ? e.childId : ''} onChange={(v) => setE((x) => void (x.childId = v))} options={p.children.map((c) => ({ value: c.id, label: c.name }))} />
      ) : (
        <div className="micro">対象: {ch.name}（{ymText(ch.birthYM)}生まれ{ch.birthYM > nowYM() ? '・予定' : ''}）。生まれた月から払い込みます。</div>
      )}
      <div className="grid2">
        <MoneyField label="保険料" per="month" nullable={false} value={it.monthly} onChange={(v) => set((x) => void (x.monthly = v ?? 0))} />
        <NumField label="払込は子供が" unit="歳まで" nullable={false} min={1} max={22} value={e.payUntilAge} onChange={(v) => setE((x) => void (x.payUntilAge = Math.round(v ?? 10)))} />
      </div>
      <div className="row between">
        <span className="label" style={{ fontWeight: 700 }}>受取（祝い金・満期金）</span>
        {e.payouts.length < 4 && (
          <button className="btn ghost small" onClick={() => setE((x) => void x.payouts.push({ age: Math.min(22, (x.payouts[x.payouts.length - 1]?.age ?? 15) + 3), amount: 0 }))}>
            <Icon name="plus" />
            追加
          </button>
        )}
      </div>
      {e.payouts.map((po, i) => (
        <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <div style={{ width: 96, flex: 'none' }}>
            <NumField label="受取" unit="歳" nullable={false} min={0} max={25} value={po.age} onChange={(v) => setE((x) => void (x.payouts[i].age = Math.round(v ?? 18)))} />
          </div>
          <div className="grow">
            <MoneyField label="受取額" hint="設計書の金額" nullable={false} value={po.amount} onChange={(v) => setE((x) => void (x.payouts[i].amount = v ?? 0))} />
          </div>
          <button className="iconbtn" aria-label="この受取を削除" onClick={() => setE((x) => void x.payouts.splice(i, 1))}>
            <Icon name="close" />
          </button>
        </div>
      ))}
      <div className="card flat micro" style={{ lineHeight: 1.6 }}>
        払込総額 <b className="num">{yen(paidTotal)}</b> → 受取 <b className="num">{yen(getTotal)}</b>
        {paidTotal > 0 && <>（返戻率 <b className="num">{Math.round((getTotal / paidTotal) * 1000) / 10}%</b>）</>}
        。保険料は「保険」、受取は受け取る月の収入として計算します。
      </div>
    </>
  );
}

/* ============================== NISA・投資 ============================== */
const INV_LABEL: Record<Investment['kind'], string> = { nisaTsumitate: 'NISA つみたて', nisaGrowth: 'NISA 成長', ideco: 'iDeCo', taxable: '課税口座' };
export function InvestSection() {
  const { s, p, up } = usePlan();
  const a = p.assumptions;
  return (
    <>
      <ItemList
        per={3}
        rows={p.investments.map((x) => ({ id: x.id, icon: 'chart', title: x.name, sub: `${INV_LABEL[x.kind]}・残高 ${yen(x.balance)}`, right: <b className="num">月{yen(x.monthly)}</b> }))}
        onPick={(id) => s.open({ kind: 'invEdit', props: { id } })}
        onAdd={() => {
          const id = uid('inv');
          up((pl) => void pl.investments.push({ id, name: 'NISA つみたて', kind: 'nisaTsumitate', owner: 'self', balance: 0, basis: null, monthly: 30_000, startYM: null, endYM: null, withdrawStartYM: null, withdrawMonthly: 0 }));
          s.open({ kind: 'invEdit', props: { id } });
        }}
        addLabel="口座を追加"
        empty="積立は返済余力の計算で「必要な積立」として差し引きます"
      />
      <div className="card flat micro" style={{ lineHeight: 1.6 }}>
        運用利回りは保証されません。予算は「悲観 {pct(a.returnLow)}・標準 {pct(a.returnMid)}」で確かめます。{NISA_NOTE}
      </div>
      <Toggle label="退職後は、現金が不足する分だけ投資を売る" hint="課税口座→NISA成長→つみたて→iDeCoの順に売却" value={a.withdrawAfterRetire} onChange={(v) => up((pl) => void (pl.assumptions.withdrawAfterRetire = v))} />
      <Toggle label="現役中も同じように売る" hint="オフなら、現役中の現金不足は「不足」として表示します" value={a.withdrawBeforeRetire} onChange={(v) => up((pl) => void (pl.assumptions.withdrawBeforeRetire = v))} />
    </>
  );
}
export const InvestSheet = ({ close }: SheetProps) => (
  <Sheet title="NISA・投資" onClose={close} preview foot={<Done close={close} />}>
    <InvestSection />
  </Sheet>
);

export function InvEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const it = p.investments.find((x) => x.id === props.id);
  if (!it) return null;
  const set = (fn: (x: Investment) => void) => up((pl) => fn(pl.investments.find((x) => x.id === it.id)!));
  return (
    <Sheet title={it.name} onClose={close} preview foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.investments = pl.investments.filter((x) => x.id !== it.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <Paged pages={[{ value: 'save', label: '残高・積立' }, { value: 'draw', label: '取崩し' }]}>
        {(page) =>
          page === 'save' ? (
            <>
              <div className="grid2">
                <TextField label="名前" value={it.name} onChange={(v) => set((x) => void (x.name = v))} />
                {p.spouse ? <Seg label="名義" value={it.owner} onChange={(v) => set((x) => void (x.owner = v))} options={[{ value: 'self', label: p.self.name || '本人' }, { value: 'spouse', label: p.spouse.name || '配偶者' }]} /> : <div />}
              </div>
              <Seg label="口座" value={it.kind} onChange={(v) => set((x) => void (x.kind = v))} options={(Object.keys(INV_LABEL) as Investment['kind'][]).map((k) => ({ value: k, label: INV_LABEL[k].replace('NISA ', '') }))} />
              {it.kind === 'ideco' && (
                <div className="micro" style={{ lineHeight: 1.5 }}>
                  掛金は全額が所得控除。年の掛金 × 税率（目安 {Math.round(marginalTaxRate(s.vm?.people.find((q) => q.id === it.owner)?.gross ?? 0) * 1000) / 10}%）が12月の年末調整で戻る計算です。60歳まで引き出せません。
                </div>
              )}
              <div className="grid2">
                <MoneyField label="いまの残高" nullable={false} value={it.balance} onChange={(v) => set((x) => void (x.balance = v ?? 0))} />
                <MoneyField label="毎月の積立" per="month" nullable={false} value={it.monthly} onChange={(v) => set((x) => void (x.monthly = v ?? 0))} />
              </div>
              <div className="grid2">
                <YMField label="積立の終わり" hint="空欄は続ける" value={it.endYM} onChange={(v) => set((x) => void (x.endYM = v))} from={THIS_YEAR} to={THIS_YEAR + 60} />
                <MoneyField label="元本（取得額）" hint="空欄は残高と同額" value={it.basis} onChange={(v) => set((x) => void (x.basis = v))} />
              </div>
            </>
          ) : (
            <>
              <div className="micro" style={{ lineHeight: 1.6 }}>計画して取り崩す場合に入力します。現金が足りないときに勝手に売却することはありません（退職後のルールは前の画面で設定）。</div>
              <div className="grid2">
                <YMField label="取崩しの開始" value={it.withdrawStartYM} onChange={(v) => set((x) => void (x.withdrawStartYM = v))} from={THIS_YEAR} to={THIS_YEAR + 70} />
                <MoneyField label="毎月の取崩し" per="month" nullable={false} value={it.withdrawMonthly} onChange={(v) => set((x) => void (x.withdrawMonthly = v ?? 0))} />
              </div>
              {it.kind === 'ideco' && <div className="micro">iDeCoは60歳まで引き出せません。それより前の取崩しは計算に入れません。</div>}
              {it.kind === 'taxable' && <div className="micro">課税口座は、売却時の利益に20.315%の税金がかかるものとして計算します。</div>}
            </>
          )
        }
      </Paged>
    </Sheet>
  );
}

/* ============================== 貯蓄目標 ============================== */
export function GoalsSection() {
  const { s, p, up } = usePlan();
  const st = s.vm?.fp?.goals ?? [];
  return (
    <>
      <div className="micro">目標の時期の前月末に「現金＋投資」が目標額以上あることを、予算（安心・標準）の条件にします。</div>
      <ItemList
        per={4}
        rows={p.goals.map((g) => {
          const x = st.find((y) => y.id === g.id);
          return {
            id: g.id,
            icon: 'flag',
            title: `${g.name}  ${yen(g.target)}`,
            sub: `${ymText(g.ym)}まで・毎月${yen(Math.ceil(g.target / Math.max(1, g.ym - nowYM())))}`,
            right: x ? <span className={`chip ${x.achieved ? 'tier-safe' : 'tier-danger'}`}>{x.achieved ? '届く' : '不足'}</span> : undefined,
          };
        })}
        onPick={(id) => s.open({ kind: 'goalEdit', props: { id } })}
        onAdd={() => {
          const id = uid('goal');
          up((pl) => void pl.goals.push({ id, name: '目標', target: 3_000_000, ym: nowYM() + 60 }));
          s.open({ kind: 'goalEdit', props: { id } });
        }}
        addLabel="目標を追加"
      />
    </>
  );
}
export const GoalsSheet = ({ close }: SheetProps) => (
  <Sheet title="貯蓄目標" onClose={close} preview foot={<Done close={close} />}>
    <GoalsSection />
  </Sheet>
);

export function GoalEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const g = p.goals.find((x) => x.id === props.id);
  if (!g) return null;
  const set = (fn: (x: Plan['goals'][number]) => void) => up((pl) => fn(pl.goals.find((x) => x.id === g.id)!));
  const months = Math.max(1, g.ym - nowYM());
  const st = s.vm?.fp?.goals.find((x) => x.id === g.id);
  return (
    <Sheet title={g.name} onClose={close} short foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.goals = pl.goals.filter((x) => x.id !== g.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <TextField label="名前" value={g.name} onChange={(v) => set((x) => void (x.name = v))} />
      <div className="grid2">
        <MoneyField label="目標の金額" nullable={false} value={g.target} onChange={(v) => set((x) => void (x.target = v ?? 0))} />
        <YMField label="いつまでに" nullable={false} value={g.ym} onChange={(v) => v != null && set((x) => void (x.ym = v))} from={THIS_YEAR} to={THIS_YEAR + 60} />
      </div>
      <div className="card flat grid2">
        <Kpi label={`毎月の積立（${months}か月）`} v={Math.ceil(g.target / months)} />
        <Kpi label="その時点の見込み（現金＋投資）" v={st?.projected ?? null} sub={st ? (st.achieved ? 'いまの計画で届きます' : `あと ${yen(st.shortfall)}`) : undefined} />
      </div>
    </Sheet>
  );
}

/* ============================== ライフイベント ============================== */
/** 逆算した積立（次の支出まで、毎月いくら積み立てるか。物価の上昇を含む目安） */
export function fundInfo(e: LifeEvent, p: Plan): { next: number; months: number; amount: number; monthly: number } | null {
  if (!e.fund || e.kind !== 'expense' || e.pattern === 'monthly') return null;
  const now = nowYM();
  const all = eventMonths(e, Math.min(now, e.startYM), now + 12 * 80);
  const next = all.find((m) => m > now);
  if (next == null) return null;
  const prev = [...all].reverse().find((m) => m <= now);
  const from = prev != null ? prev + 1 : now;
  const months = Math.max(1, next - from);
  const amount = e.inflate ? e.amount * Math.pow(1 + p.assumptions.inflation, ymYear(next) - ymYear(now)) : e.amount;
  return { next, months, amount, monthly: Math.round(amount / months) };
}

const EVENT_PRESETS: { name: string; icon: string; pattern: LifeEvent['pattern']; amount: number; every?: number }[] = [
  { name: '結婚式', icon: 'ring', pattern: 'once', amount: 3_000_000 },
  { name: '新婚旅行', icon: 'plane', pattern: 'once', amount: 800_000 },
  { name: '出産費用', icon: 'baby', pattern: 'once', amount: 100_000 },
  { name: '車の購入', icon: 'car', pattern: 'repeat', amount: 2_500_000, every: 8 },
  { name: 'リフォーム', icon: 'tool', pattern: 'once', amount: 3_000_000 },
  { name: '家族旅行', icon: 'plane', pattern: 'repeat', amount: 300_000, every: 1 },
];
export function EventsSection() {
  const { s, p, up } = usePlan();
  const add = (x: (typeof EVENT_PRESETS)[number] | null) => {
    const id = uid('ev');
    up((pl) => void pl.events.push({ id, name: x?.name ?? 'イベント', icon: x?.icon ?? 'flag', kind: 'expense', pattern: x?.pattern ?? 'once', amount: x?.amount ?? 500_000, startYM: nowYM() + 12, endYM: null, everyYears: x?.every ?? 5, inflate: true, fund: true }));
    s.open({ kind: 'eventEdit', props: { id } });
  };
  return (
    <>
      <ItemList
        per={4}
        rows={p.events.map((e) => ({ id: e.id, icon: e.icon, title: e.name, sub: `${ymText(e.startYM)}${e.pattern === 'repeat' ? `から${e.everyYears}年ごと` : e.pattern === 'monthly' ? 'から毎月' : ''}${fundInfo(e, p) ? `・月${yen(fundInfo(e, p)!.monthly)}積立` : ''}`, right: <b className={`num ${e.kind === 'income' ? 'pos' : ''}`}>{e.kind === 'income' ? '+' : ''}{yen(e.amount)}</b> }))}
        onPick={(id) => s.open({ kind: 'eventEdit', props: { id } })}
      />
      <div className="label" style={{ fontWeight: 700 }}>
        追加する
      </div>
      <div className="grid3">
        {EVENT_PRESETS.map((x) => (
          <button key={x.name} className="btn small" onClick={() => add(x)}>
            {x.name}
          </button>
        ))}
      </div>
      <div className="grid2">
        <button className="btn small" onClick={() => add(null)}>
          その他
        </button>
        <button className="btn small" onClick={() => s.open({ kind: 'work' })}>
          育休・時短 →
        </button>
      </div>
    </>
  );
}
export const EventsSheet = ({ close }: SheetProps) => (
  <Sheet title="ライフイベント" onClose={close} preview foot={<Done close={close} />}>
    <EventsSection />
  </Sheet>
);

export function EventEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const e = p.events.find((x) => x.id === props.id);
  if (!e) return null;
  const set = (fn: (x: LifeEvent) => void) => up((pl) => fn(pl.events.find((x) => x.id === e.id)!));
  return (
    <Sheet title={e.name} onClose={close} preview foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.events = pl.events.filter((x) => x.id !== e.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <Paged initial={(props.page as 'basic' | 'loan' | 'more') ?? 'basic'} pages={[{ value: 'basic', label: '内容' }, ...(e.kind === 'expense' && e.pattern !== 'monthly' ? [{ value: 'loan' as const, label: 'ローン' }] : []), { value: 'more', label: '物価・アイコン' }]}>
        {(page) =>
          page === 'loan' ? (
            <EventLoan e={e} set={set} />
          ) : page === 'basic' ? (
            <>
            <div className="grid2">
              <TextField label="名前" value={e.name} onChange={(v) => set((x) => void (x.name = v))} />
              <Seg label="お金の向き" value={e.kind} onChange={(v) => set((x) => void (x.kind = v))} options={[{ value: 'expense', label: '支出' }, { value: 'income', label: '収入' }]} />
            </div>
            <Seg label="時期" value={e.pattern} onChange={(v) => set((x) => void (x.pattern = v))} options={[{ value: 'once', label: '1回だけ' }, { value: 'repeat', label: '数年ごと' }, { value: 'monthly', label: '毎月' }]} />
            <div className="grid2">
              <MoneyField label="金額" per={e.pattern === 'monthly' ? 'month' : 'once'} hint={e.pattern === 'monthly' ? undefined : '1回あたり'} nullable={false} value={e.amount} onChange={(v) => set((x) => void (x.amount = v ?? 0))} />
              <YMField label={e.pattern === 'once' ? 'いつ' : '始まり'} nullable={false} value={e.startYM} onChange={(v) => v != null && set((x) => void (x.startYM = v))} from={THIS_YEAR} to={THIS_YEAR + 70} />
            </div>
            {e.pattern !== 'once' && (
              <div className="grid2">
                {e.pattern === 'repeat' ? <NumField label="間隔" unit="年ごと" nullable={false} min={1} max={30} value={e.everyYears} onChange={(v) => set((x) => void (x.everyYears = Math.round(v ?? 1)))} /> : <div />}
                <YMField label="終わり" hint="空欄は続ける" value={e.endYM} onChange={(v) => set((x) => void (x.endYM = v))} from={THIS_YEAR} to={THIS_YEAR + 70} />
              </div>
            )}
            {e.kind === 'expense' && e.pattern !== 'monthly' && (
              <>
                <Toggle label="時期から逆算して毎月積み立てる" hint="積立から払うので、その月の家計が赤字になりません" value={!!e.fund} onChange={(v) => set((x) => void (x.fund = v))} />
                {(() => {
                  const f = fundInfo(e, p);
                  return f ? (
                    <div className="card flat row between" style={{ gap: 8 }}>
                      <span className="micro" style={{ lineHeight: 1.5 }}>
                        次は {ymText(f.next)}（あと{f.months}か月・{yen(f.amount)}）
                      </span>
                      <b className="num" style={{ whiteSpace: 'nowrap' }}>毎月 {yen(f.monthly)}</b>
                    </div>
                  ) : null;
                })()}
              </>
            )}
            </>
          ) : (
            <>
            <Toggle label="物価の上昇に合わせて増やす" value={e.inflate} onChange={(v) => set((x) => void (x.inflate = v))} />
            <div className="field">
              <span>アイコン</span>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {EVENT_ICONS.map((ic) => (
                  <button key={ic} className="iconbtn" style={{ background: ic === e.icon ? 'var(--green-soft)' : 'var(--surface)', color: ic === e.icon ? 'var(--green)' : 'var(--ink-2)' }} aria-pressed={ic === e.icon ? 'true' : 'false'} onClick={() => set((x) => void (x.icon = ic))}>
                    <Icon name={ic} />
                  </button>
                ))}
              </div>
            </div>
            </>
          )
        }
      </Paged>
    </Sheet>
  );
}

/** 大きな支出のローン（車のローンなど）: 借入額・年数・金利 → 毎月の返済。残りは現金か積立で払う */
function EventLoan({ e, set }: { e: LifeEvent; set: (fn: (x: LifeEvent) => void) => void }) {
  const L = e.loan ?? null;
  const pay = L ? Math.round(annuityPayment(Math.min(L.amount, e.amount), L.rate / 12, L.years * 12)) : 0;
  return (
    <>
      <Toggle label="この支出はローンを組む" hint="車・リフォームなど。翌月から毎月返済します" value={!!L} onChange={(v) => set((x) => void (x.loan = v ? { amount: Math.round((x.amount * 0.8) / 10_000) * 10_000, years: 5, rate: 0.025 } : null))} />
      {L && (
        <>
          <div className="grid2">
            <MoneyField label="借入額" nullable={false} value={L.amount} onChange={(v) => set((x) => void (x.loan = { ...L, amount: v ?? 0 }))} />
            <NumField label="返済期間" unit="年" nullable={false} min={1} max={15} value={L.years} onChange={(v) => set((x) => void (x.loan = { ...L, years: Math.round(v ?? 5) }))} />
          </div>
          <NumField label="金利（年）" unit="%" scale={100} nullable={false} min={0} max={15} value={L.rate} onChange={(v) => set((x) => void (x.loan = { ...L, rate: v ?? 0 }))} hint="マイカーローンは年2〜4%程度が多い" />
          <div className="card flat stack" style={{ gap: 4 }}>
            <div className="row between">
              <span className="micro">毎月の返済（{L.years * 12}回）</span>
              <b className="num">{yen(pay)}</b>
            </div>
            <div className="row between">
              <span className="micro">支払いの月に現金{e.fund ? '（積立）' : ''}で払う分</span>
              <b className="num">{yen(Math.max(0, e.amount - L.amount))}</b>
            </div>
            <div className="row between">
              <span className="micro">利息の合計</span>
              <b className="num interest">{yen(pay * L.years * 12 - Math.min(L.amount, e.amount))}</b>
            </div>
          </div>
          {e.pattern === 'repeat' && <div className="micro">数年ごとの支出は、そのたびに同じ条件でローンを組む計算です。</div>}
        </>
      )}
    </>
  );
}

/* ============================== 育休・時短 ============================== */
export function WorkSection() {
  const { s, p, up } = usePlan();
  const nm = (o: Owner) => (o === 'self' ? p.self.name || '本人' : p.spouse?.name || '配偶者');
  const add = (type: WorkChange['type']) => {
    const id = uid('work');
    const child = p.children[0];
    const owner: Owner = p.spouse ? 'spouse' : 'self';
    const leave = p.work.find((w) => w.type === 'leave' && w.childId === child?.id);
    const start = type === 'short' && leave ? leave.startYM + leave.months : child ? child.birthYM : nowYM() + 12;
    up((pl) => void pl.work.push({ id, owner, type, startYM: start, months: 12, endYM: child ? child.birthYM + 36 : nowYM() + 48, ratio: 0.75, maternity: type === 'leave', childId: child?.id ?? null }));
    s.open({ kind: 'workEdit', props: { id } });
  };
  return (
    <Paged initial={p.children.length ? 'quick' : 'list'} pages={[{ value: 'quick', label: 'かんたん設定' }, { value: 'list', label: `登録した予定 ${p.work.length}件` }]}>
      {(page) => (page === 'quick' ? <WorkQuick /> : <WorkList nm={nm} add={add} />)}
    </Paged>
  );
}

/** 子供ごとに、産休・育休・時短をボタンで設定する（給付は自動で計算） */
function WorkQuick() {
  const { s, p, up } = usePlan();
  const [cid, setCid] = useState(p.children[0]?.id ?? '');
  const child = p.children.find((c) => c.id === cid) ?? p.children[0];
  const [mom, setMom] = useState<Owner>(p.spouse ? 'spouse' : 'self');
  if (!child) {
    return (
      <div className="empty fill">
        <div>先に子供（予定）を登録すると、生まれる月に合わせて育休・時短を設定できます</div>
        <button className="btn primary" onClick={() => s.open({ kind: 'children' })}>
          子供を登録
        </button>
      </div>
    );
  }
  const other: Owner = mom === 'self' ? 'spouse' : 'self';
  const nm = (o: Owner) => (o === 'self' ? p.self.name || '本人' : p.spouse?.name || '配偶者');
  const find = (o: Owner, type: WorkChange['type'], mat?: boolean) => p.work.find((w) => w.childId === child.id && w.owner === o && w.type === type && (mat == null || w.maternity === mat));
  const matLeave = find(mom, 'leave', true);
  const pLeave = p.spouse ? find(other, 'leave', false) : undefined;
  const short = find(mom, 'short');
  // 産休＋育休: 出産の前月から、子供が指定の月齢になるまで
  const setMat = (untilMonths: number | null) =>
    up((pl) => {
      pl.work = pl.work.filter((w) => !(w.childId === child.id && w.owner === mom && w.type === 'leave' && w.maternity));
      if (untilMonths != null) pl.work.push({ id: uid('work'), owner: mom, type: 'leave', startYM: child.birthYM - 1, months: untilMonths + 1, endYM: null, ratio: 1, maternity: true, childId: child.id });
      fixShort(pl);
    });
  const setPLeave = (months: number | null) =>
    up((pl) => {
      pl.work = pl.work.filter((w) => !(w.childId === child.id && w.owner === other && w.type === 'leave' && !w.maternity));
      if (months != null) pl.work.push({ id: uid('work'), owner: other, type: 'leave', startYM: child.birthYM, months, endYM: null, ratio: 1, maternity: false, childId: child.id });
    });
  // 時短: 育休が終わった月から、指定の時期まで。勤務時間（1日8時間に対する割合）で給与の割合を決める
  const leaveEnd = (pl: Plan) => {
    const l = pl.work.find((w) => w.childId === child.id && w.owner === mom && w.type === 'leave' && w.maternity);
    return l ? l.startYM + l.months : child.birthYM + 12;
  };
  const fixShort = (pl: Plan) => {
    const sw = pl.work.find((w) => w.childId === child.id && w.owner === mom && w.type === 'short');
    if (sw) sw.startYM = leaveEnd(pl);
  };
  const setShort = (until: 'none' | 'age3' | 'school', hours?: number) =>
    up((pl) => {
      const cur = pl.work.find((w) => w.childId === child.id && w.owner === mom && w.type === 'short');
      const h = hours ?? (cur ? Math.round(cur.ratio * 8) : 6);
      pl.work = pl.work.filter((w) => w !== cur);
      if (until === 'none') return;
      const end = until === 'age3' ? child.birthYM + 36 - 1 : toYM(elemStartFY(child.birthYM), 3);
      pl.work.push({ id: uid('work'), owner: mom, type: 'short', startYM: leaveEnd(pl), months: 0, endYM: end, ratio: h / 8, maternity: false, childId: child.id });
    });
  const matMonths = matLeave ? matLeave.months - 1 : null;
  const shortUntil = !short ? 'none' : short.endYM != null && short.endYM <= child.birthYM + 36 ? 'age3' : 'school';
  const chip = (on: boolean, label: string, run: () => void) => (
    <button key={label} className={`chip${on ? ' on' : ''}`} aria-pressed={on ? 'true' : 'false'} onClick={run}>
      {label}
    </button>
  );
  return (
    <>
      {p.children.length > 1 && <Seg label="対象の子供" value={child.id} onChange={setCid} options={p.children.map((c) => ({ value: c.id, label: c.name }))} />}
      {p.spouse && <Seg label="出産する人" value={mom} onChange={setMom} options={[{ value: 'spouse', label: nm('spouse') }, { value: 'self', label: nm('self') }]} />}
      <div className="field">
        <span>{nm(mom)}の産休＋育休（子供が何か月まで）</span>
        <div className="chips">
          {[[null, 'なし'], [6, '6か月'], [12, '1歳'], [18, '1歳半'], [24, '2歳']].map(([v, l]) => chip(matMonths === v || (v === null && matMonths === null), l as string, () => setMat(v as number | null)))}
        </div>
      </div>
      {p.spouse && (
        <div className="field">
          <span>{nm(other)}の育休（生まれた月から）</span>
          <div className="chips">
            {[[null, 'なし'], [1, '1か月'], [3, '3か月'], [6, '6か月'], [12, '1年']].map(([v, l]) => chip((pLeave?.months ?? null) === v, l as string, () => setPLeave(v as number | null)))}
          </div>
        </div>
      )}
      <div className="field">
        <span>{nm(mom)}の復帰後の時短勤務</span>
        <div className="chips">
          {chip(shortUntil === 'none', 'なし', () => setShort('none'))}
          {chip(shortUntil === 'age3', '3歳まで', () => setShort('age3'))}
          {chip(shortUntil === 'school', '小学校入学まで', () => setShort('school'))}
        </div>
      </div>
      {short && (
        <Seg label="時短の勤務時間（給与はフルタイム8時間に対する割合）" value={Math.round(short.ratio * 8)} onChange={(h) => setShort(shortUntil, h)} options={[{ value: 4, label: '4時間 50%' }, { value: 5, label: '5時間 63%' }, { value: 6, label: '6時間 75%' }, { value: 7, label: '7時間 88%' }]} />
      )}
      <div className="micro" style={{ lineHeight: 1.5 }}>給付は自動で計算: 産休は給与の2/3、育休は6か月まで67%・以降50%（両親とも育休なら最初の28日は+13%）、時短は2歳まで賃金の10%。</div>
    </>
  );
}

function WorkList({ nm, add }: { nm: (o: Owner) => string; add: (type: WorkChange['type']) => void }) {
  const { s, p, up } = usePlan();
  return (
    <>
      <ItemList
        per={3}
        rows={p.work.map((w) => ({ id: w.id, icon: w.type === 'leave' ? 'baby' : 'briefcase', title: `${nm(w.owner)}の${w.type === 'leave' ? '育児休業' : '時短勤務'}`, sub: w.type === 'leave' ? `${ymText(w.startYM)}から${w.months}か月${w.maternity ? '（産休含む）' : ''}` : `${ymText(w.startYM)}〜${w.endYM ? ymText(w.endYM) : ''}・勤務${Math.round(w.ratio * 100)}%` }))}
        onPick={(id) => s.open({ kind: 'workEdit', props: { id } })}
        empty="育休・時短の予定があれば登録します（収入の減少と給付を月ごとに計算）"
      />
      <div className="grid2">
        <button className="btn" onClick={() => add('leave')}>
          <Icon name="plus" />
          育休・産休
        </button>
        <button className="btn" onClick={() => add('short')}>
          <Icon name="plus" />
          時短勤務
        </button>
      </div>
      <Toggle label="育児休業給付などを収入に入れる" hint="育休: 6か月まで67%・以降50%、出生後休業支援13%、時短: 賃金の10%（2歳未満）" value={p.assumptions.leaveBenefits} onChange={(v) => up((pl) => void (pl.assumptions.leaveBenefits = v))} />
    </>
  );
}
export const WorkSheet = ({ close }: SheetProps) => (
  <Sheet title="育休・時短" onClose={close} preview foot={<Done close={close} />}>
    <WorkSection />
  </Sheet>
);

export function WorkEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const w = p.work.find((x) => x.id === props.id);
  if (!w) return null;
  const set = (fn: (x: WorkChange) => void) => up((pl) => fn(pl.work.find((x) => x.id === w.id)!));
  return (
    <Sheet title={w.type === 'leave' ? '育児休業' : '時短勤務'} onClose={close} preview foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.work = pl.work.filter((x) => x.id !== w.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      {p.spouse && <Seg label="誰が" value={w.owner} onChange={(v) => set((x) => void (x.owner = v))} options={[{ value: 'self', label: p.self.name || '本人' }, { value: 'spouse', label: p.spouse.name || '配偶者' }]} />}
      <Seg label="種類" value={w.type} onChange={(v) => set((x) => void (x.type = v))} options={[{ value: 'leave', label: '育休・産休' }, { value: 'short', label: '時短勤務' }]} />
      <div className="grid2">
        <YMField label="始まり" nullable={false} value={w.startYM} onChange={(v) => v != null && set((x) => void (x.startYM = v))} from={THIS_YEAR - 1} to={THIS_YEAR + 30} />
        {w.type === 'leave' ? (
          <NumField label="期間" unit="か月" nullable={false} min={1} max={36} value={w.months} onChange={(v) => set((x) => void (x.months = Math.round(v ?? 12)))} />
        ) : (
          <YMField label="終わり" value={w.endYM} onChange={(v) => set((x) => void (x.endYM = v))} from={THIS_YEAR - 1} to={THIS_YEAR + 40} />
        )}
      </div>
      {w.type === 'leave' ? (
        <Toggle label="産前産後休業を含む" hint="最初の3か月を出産手当金（賃金の2/3）として計算" value={w.maternity} onChange={(v) => set((x) => void (x.maternity = v))} />
      ) : (
        <>
          <Seg label="1日の勤務時間（フルタイム8時間）" value={Math.round(w.ratio * 8 * 2) / 2} onChange={(h) => set((x) => void (x.ratio = h / 8))} options={[4, 5, 6, 7].map((h) => ({ value: h, label: `${h}時間` }))} />
          <NumField label="給与の割合（自動）" unit="%" scale={100} nullable={false} min={10} max={100} value={w.ratio} onChange={(v) => set((x) => void (x.ratio = v ?? 1))} hint="勤務時間から計算。直接も変えられます" />
        </>
      )}
      {p.children.length > 0 && (
        <Seg label="対象の子供" value={w.childId ?? ''} onChange={(v) => set((x) => void (x.childId = v || null))} options={[{ value: '', label: 'なし' }, ...p.children.map((c) => ({ value: c.id, label: c.name }))]} />
      )}
    </Sheet>
  );
}

/* ============================== 住まい・購入計画 ============================== */
export function HousingSection({ initial }: { initial?: 'now' | 'plan' | 'cost' | 'tax' }) {
  const { p, up } = usePlan();
  const h = p.housing;
  const set = (fn: (x: Plan['housing']) => void) => up((pl) => fn(pl.housing));
  return (
    <Paged
      initial={initial ?? 'now'}
      pages={[
        { value: 'now', label: 'いまの住まい' },
        { value: 'plan', label: '購入計画' },
        { value: 'cost', label: '維持費' },
        { value: 'tax', label: '税の優遇' },
      ]}
    >
      {(page) =>
        page === 'now' ? (
          <>
            <MoneyField label="家賃" required hint="駐車場・共益費込み" per="month" value={h.rentMonthly} placeholder="持ち家・実家なら 0" onChange={(v) => set((x) => void (x.rentMonthly = v))} />
            <NumField label="家賃と住宅費が重なる期間" unit="か月" nullable={false} min={0} max={12} value={h.overlapMonths} onChange={(v) => set((x) => void (x.overlapMonths = Math.round(v ?? 0)))} hint="引越しまでの二重払い" />
            <div className="micro">購入後は家賃を計上しません（重なる期間だけ両方を払います）。</div>
          </>
        ) : page === 'plan' ? (
          <>
            <div className="grid2">
              <YMField label="購入の予定" required value={h.purchaseYM} onChange={(v) => set((x) => void (x.purchaseYM = v))} from={THIS_YEAR} to={THIS_YEAR + 30} />
              <Seg label="種類" value={h.kind} onChange={(v) => set((x) => void ((x.kind = v), (x.landShare = v === 'mansion' ? 0.2 : 0.35)))} options={[{ value: 'detached', label: '戸建て' }, { value: 'mansion', label: 'マンション' }]} />
            </div>
            <Seg label="自己資金（頭金＋現金で払う諸費用）" value={h.downMode} onChange={(v) => set((x) => void (x.downMode = v))} options={[{ value: 'auto', label: '予備資金を残して自動' }, { value: 'manual', label: '金額を決める' }]} />
            {h.downMode === 'manual' && <MoneyField label="自己資金" value={h.downPayment} placeholder="0円（頭金なし）" onChange={(v) => set((x) => void (x.downPayment = v))} />}
            <div className="grid2">
              <MoneyField label="親などからの援助" nullable={false} value={h.gift} onChange={(v) => set((x) => void (x.gift = v ?? 0))} />
              <MoneyField label="引越し・家具など" value={h.movingCost} onChange={(v) => set((x) => void (x.movingCost = v))} />
            </div>
          </>
        ) : page === 'cost' ? (
          <>
            <div className="micro">登録した住宅に値がない場合と、予算の計算に使う目安です。</div>
            <div className="grid2">
              <NumField label="諸費用（物件価格に対して）" unit="%" scale={100} nullable={false} min={0} max={20} value={h.miscRate} onChange={(v) => set((x) => void (x.miscRate = v ?? 0.07))} />
              <NumField label="土地の割合" unit="%" scale={100} nullable={false} min={0} max={90} value={h.landShare} onChange={(v) => set((x) => void (x.landShare = v ?? 0.35))} />
            </div>
            <div className="grid2">
              <MoneyField label={h.kind === 'mansion' ? '管理費＋修繕積立金' : '修繕費の積立'} per="month" value={h.maintenanceMonthly} onChange={(v) => set((x) => void (x.maintenanceMonthly = v))} />
              <MoneyField label="火災・地震保険" per="year" value={h.insuranceAnnual} onChange={(v) => set((x) => void (x.insuranceAnnual = v))} />
            </div>
            <MoneyField label="駐車場" per="month" nullable={false} value={h.parkingMonthly} onChange={(v) => set((x) => void (x.parkingMonthly = v ?? 0))} />
          </>
        ) : (
          <>
            <Toggle label="住宅ローン控除を計算に入れる" hint="初期設定はオフ（条件の確認が必要なため）" value={h.deduction.enabled} onChange={(v) => set((x) => void (x.deduction.enabled = v))} />
            <Seg label="住宅の省エネ性能" value={h.deduction.energy} onChange={(v) => set((x) => void (x.deduction.energy = v))} options={[{ value: 'longlife', label: '長期優良等' }, { value: 'zeh', label: 'ZEH水準' }, { value: 'standard', label: '省エネ基準' }, { value: 'other', label: 'その他' }]} />
            <Seg label="世帯" value={h.deduction.family} onChange={(v) => set((x) => void (x.deduction.family = v))} options={[{ value: 'kosodate', label: '子育て・若者夫婦' }, { value: 'normal', label: 'その他' }]} />
            <MoneyField label="控除に使える税額" hint="空欄は額面年収から推計" per="year" value={h.deduction.taxCapAnnual} onChange={(v) => set((x) => void (x.deduction.taxCapAnnual = v))} />
            <Toggle label="新築住宅の固定資産税の減額" hint="3年間（長期優良住宅は5年間）建物分を1/2" value={h.newBuildTaxCut} onChange={(v) => set((x) => void (x.newBuildTaxCut = v))} />
          </>
        )
      }
    </Paged>
  );
}
export const HousingSheet = ({ close, props }: SheetProps) => (
  <Sheet title="住まい・購入計画" onClose={close} preview foot={<Done close={close} />}>
    <HousingSection initial={(props.page as 'now' | 'plan' | 'cost' | 'tax') ?? 'plan'} />
  </Sheet>
);

/* ============================== 前提条件 ============================== */
export function AssumptionsSection({ initial }: { initial?: 'eco' | 'life' | 'kids' | 'region' }) {
  const { s, p, up } = usePlan();
  const a = p.assumptions;
  const set = (fn: (x: Plan['assumptions']) => void) => up((pl) => fn(pl.assumptions));
  const current = p.living.reduce((t, x) => t + x.monthly, 0);
  return (
    <Paged initial={initial ?? 'life'} pages={[{ value: 'life', label: '老後・予備' }, { value: 'eco', label: '物価・運用' }, { value: 'region', label: '住む地域' }, { value: 'kids', label: '子供の生活費' }]}>
      {(page) =>
        page === 'region' ? (
          <RegionSection />
        ) : page === 'eco' ? (
          <>
            <div className="grid2">
              <NumField label="物価の上昇率（年）" unit="%" scale={100} nullable={false} value={a.inflation} onChange={(v) => set((x) => void (x.inflation = v ?? 0))} />
              <NumField label="年金の改定率の差" unit="%" scale={100} nullable={false} value={a.pensionAdjust} onChange={(v) => set((x) => void (x.pensionAdjust = v ?? 0))} hint="物価との差" />
            </div>
            <div className="grid3">
              <NumField label="運用 悲観" unit="%" scale={100} nullable={false} value={a.returnLow} onChange={(v) => set((x) => void (x.returnLow = v ?? 0))} />
              <NumField label="標準" unit="%" scale={100} nullable={false} value={a.returnMid} onChange={(v) => set((x) => void (x.returnMid = v ?? 0))} />
              <NumField label="楽観" unit="%" scale={100} nullable={false} value={a.returnHigh} onChange={(v) => set((x) => void (x.returnHigh = v ?? 0))} />
            </div>
            <div className="micro" style={{ lineHeight: 1.6 }}>生活費・教育費は物価の上昇率で毎年1月に増やします。昇給率が未入力の人は、物価と同じ率で昇給します。運用利回りは名目で入力します。</div>
          </>
        ) : page === 'life' ? (
          <>
            <div className="grid2">
              <NumField label="何歳まで計算するか" unit="歳" nullable={false} min={80} max={105} value={a.endAge} onChange={(v) => set((x) => void (x.endAge = Math.round(v ?? 95)))} />
              <NumField label="予備資金" unit="か月分" nullable={false} min={0} max={24} value={a.reserveMonths} onChange={(v) => set((x) => void (x.reserveMonths = v ?? 3))} hint="生活費の" />
            </div>
            <MoneyField label="老後の生活費（いまの物価）" per="month" hint={`空欄はいまの生活費 ${yen(current)}`} value={a.retireLivingMonthly} onChange={(v) => set((x) => void (x.retireLivingMonthly = v))} />
            {p.spouse && <div className="micro">参考: 65歳以上の夫婦のみの無職世帯の消費支出は月{yen(RETIRE_LIVING_COUPLE)}（総務省 家計調査 2025年）。</div>}
            <Toggle label="児童手当を収入に入れる" value={a.childAllowance} onChange={(v) => set((x) => void (x.childAllowance = v))} />
            <div className="micro">「標準」は生活費の{a.reserveMonths}か月分、「安心」はその2倍の予備資金を、購入から退職まで保てるかを確かめます。</div>
            {s.vm && <div className="micro">老後の生活費が未入力の場合は、平均並みだった場合の結果を「計算の内訳 → 条件の検証」で確認できます。</div>}
          </>
        ) : (
          <>
            <div className="micro">子供が増えると、年齢・学年に合わせて食費・日用品などを自動で足します（1人あたり・全国調査の平均）。家計に合わせて水準を変えられます。</div>
            <ChildCostTable scale={a.childCostScale ?? 1} />
              <NumField label="子供の生活費の水準" unit="%" scale={100} nullable={false} min={30} max={200} value={a.childCostScale ?? 1} onChange={(v) => set((x) => void (x.childCostScale = v ?? 1))} hint="全国平均を100%" />
          </>
        )
      }
    </Paged>
  );
}
export const AssumptionsSheet = ({ close, props }: SheetProps) => (
  <Sheet title="前提条件" onClose={close} preview foot={<Done close={close} />}>
    <AssumptionsSection initial={props.page as 'eco' | 'life' | 'kids' | 'region' | undefined} />
  </Sheet>
);
