import React, { useMemo, useState } from 'react';
import { emptyPerson, LIVING_PRESETS, newChild, uid } from '../../engine/defaults';
import { EDU_MEXT, EDU_UNIV, NISA_NOTE } from '../../engine/reference';
import { childMonth } from '../../engine/simulate';
import type { Child, Insurance, Investment, LifeEvent, LivingItem, Owner, Person, Plan, WorkChange } from '../../engine/types';
import { ageAt, nowYM, ymYear } from '../../engine/ym';
import { Sheet } from '../components/Sheet';
import { ItemList } from '../components/ItemList';
import { MoneyField, NumField, Seg, TextField, Toggle, YMField } from '../components/fields';
import { Kpi } from '../components/bits';
import { pct, yen, ymText } from '../format';
import { EVENT_ICONS, Icon, LIVING_ICONS } from '../icons';
import { useStore } from '../store';

export type SheetProps = { close: () => void; props: Record<string, unknown> };

const THIS_YEAR = ymYear(nowYM());
const usePlan = () => {
  const s = useStore();
  const up = (fn: (p: Plan) => void) => s.update((d) => fn(d.plan));
  return { s, p: s.data.plan, up };
};
const Done = ({ close }: { close: () => void }) => (
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

/* ---------- 収入 ---------- */
export function IncomeSheet({ close }: SheetProps) {
  const { s, p, up } = usePlan();
  const [who, setWho] = useState<Owner>('self');
  const [page, setPage] = useState<'income' | 'retire'>('income');
  const person = who === 'self' ? p.self : p.spouse;
  const set = (fn: (x: Person) => void) =>
    up((pl) => {
      const x = who === 'self' ? pl.self : pl.spouse;
      if (x) fn(x);
    });
  return (
    <Sheet title="収入" onClose={close} foot={<Done close={close} />}>
      <div className="row">
        <div className="seg grow">
          <button aria-pressed={who === 'self' ? 'true' : 'false'} onClick={() => setWho('self')}>
            {p.self.name || '本人'}
          </button>
          <button aria-pressed={who === 'spouse' ? 'true' : 'false'} onClick={() => setWho('spouse')}>
            {p.spouse ? p.spouse.name || '配偶者' : '配偶者'}
          </button>
        </div>
      </div>
      {!person ? (
        <div className="empty">
          <div>配偶者（パートナー）を追加すると、2人分の収入・貯蓄・年金で計算します</div>
          <button className="btn primary" onClick={() => up((pl) => void (pl.spouse = { ...emptyPerson('spouse') }))}>
            配偶者を追加
          </button>
        </div>
      ) : (
        <>
          <Seg value={page} onChange={setPage} options={[{ value: 'income', label: '収入' }, { value: 'retire', label: '退職・年金' }]} />
          {page === 'income' ? (
            <>
              <div className="grid2">
                <TextField label="呼び名" value={person.name} onChange={(v) => set((x) => void (x.name = v))} />
                <YMField label="生まれた年月" value={person.birthYM} onChange={(v) => set((x) => void (x.birthYM = v))} from={THIS_YEAR - 80} to={THIS_YEAR - 15} />
              </div>
              <MoneyField label="手取り月収" hint="賞与を除く" unit="man" value={person.netMonthly} onChange={(v) => set((x) => void (x.netMonthly = v))} />
              <div className="grid2">
                <MoneyField label="賞与（年・手取り）" value={person.bonusNetAnnual} onChange={(v) => set((x) => void (x.bonusNetAnnual = v))} />
                <MoneyField label="額面年収" hint="賞与込み" value={person.grossAnnual} onChange={(v) => set((x) => void (x.grossAnnual = v))} />
              </div>
              <NumField label="昇給率（年）" unit="%" scale={100} value={person.raiseRate} onChange={(v) => set((x) => void (x.raiseRate = v))} hint="未入力は1%" />
            </>
          ) : (
            <>
              <div className="grid2">
                <NumField label="退職年齢" unit="歳" value={person.retireAge} min={40} max={80} onChange={(v) => set((x) => void (x.retireAge = v))} hint="未入力は65歳" />
                <MoneyField label="退職金（手取り）" value={person.retireBonus} onChange={(v) => set((x) => void (x.retireBonus = v))} />
              </div>
              <div className="grid2">
                <NumField label="年金の受給開始" unit="歳" value={person.pensionStartAge} min={60} max={75} onChange={(v) => set((x) => void (x.pensionStartAge = v))} />
                <MoneyField label="年金（月・手取り）" value={person.pensionMonthly} onChange={(v) => set((x) => void (x.pensionMonthly = v))} />
              </div>
              <div className="card flat micro" style={{ lineHeight: 1.6 }}>
                年金が未入力のときは、額面年収と加入年数から推計します（老齢基礎年金 月70,608円＋報酬比例部分）。ねんきん定期便の見込額を入れると信頼度が上がります。
                {s.vm && (
                  <>
                    <br />
                    いまの推計: 月{yen(s.vm.people.find((x) => x.id === who)?.pension)}
                  </>
                )}
              </div>
              {who === 'spouse' && (
                <button className="btn danger small" onClick={() => up((pl) => void ((pl.spouse = null), (pl.work = pl.work.filter((w) => w.owner !== 'spouse')), (pl.investments = pl.investments.map((i) => ({ ...i, owner: 'self' as Owner })))))}>
                  配偶者を削除（単身で計算）
                </button>
              )}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ---------- 貯蓄・借入 ---------- */
export function SavingsSheet({ close }: SheetProps) {
  const { s, p, up } = usePlan();
  return (
    <Sheet title="貯蓄・借入" onClose={close} foot={<Done close={close} />}>
      <div className="grid2">
        <MoneyField label={`${p.self.name || '本人'}の現金・預金`} value={p.self.cash} onChange={(v) => up((pl) => void ((pl.self.cash = v), (pl.baseYM = nowYM())))} />
        {p.spouse && <MoneyField label={`${p.spouse.name || '配偶者'}の現金・預金`} value={p.spouse.cash} onChange={(v) => up((pl) => void ((pl.spouse!.cash = v), (pl.baseYM = nowYM())))} />}
      </div>
      <div className="micro">投資（NISAなど）は「NISA・投資」に分けて入力します。現金と投資は別々に計算します。残高を変えると、今月からの計算になります（基準: {ymText(p.baseYM)}）。</div>
      <div className="label" style={{ fontWeight: 700 }}>
        いまある借入（車のローンなど）
      </div>
      <ItemList
        per={3}
        rows={p.debts.map((d) => ({ id: d.id, icon: 'coins', title: d.name || '借入', sub: `${ymText(d.endYM)}まで`, right: <b className="num">月{yen(d.monthly)}</b> }))}
        onPick={(id) => s.open({ kind: 'debtEdit', props: { id } })}
        onAdd={() => {
          const id = uid('debt');
          up((pl) => void pl.debts.push({ id, name: '借入', monthly: 10_000, endYM: nowYM() + 36 }));
          s.open({ kind: 'debtEdit', props: { id } });
        }}
        addLabel="借入を追加"
      />
    </Sheet>
  );
}

export function DebtEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const d = p.debts.find((x) => x.id === props.id);
  if (!d) return null;
  const set = (fn: (x: Plan['debts'][number]) => void) => up((pl) => fn(pl.debts.find((x) => x.id === d.id)!));
  return (
    <Sheet title="借入" onClose={close} short foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.debts = pl.debts.filter((x) => x.id !== d.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <TextField label="名前" value={d.name} onChange={(v) => set((x) => void (x.name = v))} />
      <div className="grid2">
        <MoneyField label="毎月の返済" unit="yen" nullable={false} value={d.monthly} onChange={(v) => set((x) => void (x.monthly = v ?? 0))} />
        <YMField label="返済の終わり" value={d.endYM} nullable={false} onChange={(v) => v != null && set((x) => void (x.endYM = v))} from={THIS_YEAR} to={THIS_YEAR + 40} />
      </div>
    </Sheet>
  );
}

/* ---------- 子供・教育 ---------- */
export function ChildrenSheet({ close }: SheetProps) {
  const { s, p, up } = usePlan();
  return (
    <Sheet title="子供・教育費" onClose={close} foot={<Done close={close} />}>
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
          const c = newChild(nowYM() + 12, p.children.length + 1);
          up((pl) => void (pl.children.push(c), (pl.assumptions.childrenConfirmed = true)));
          s.open({ kind: 'childEdit', props: { id: c.id } });
        }}
        addLabel="子供を追加（予定も可）"
      />
      <div className="micro" style={{ lineHeight: 1.6 }}>
        教育費の初期値は文部科学省「令和5年度 子供の学習費調査」と日本政策金融公庫「教育費負担の実態調査」。子供の年齢と学年（4月始まり・早生まれ対応）に合わせて計上し、生まれる前の年には計上しません。
      </div>
    </Sheet>
  );
}

const UNIV_LABEL: Record<Child['univ'], string> = { none: '進学しない', national: '国公立', privateArts: '私立文系', privateSci: '私立理系' };
const SCHOOL_OPTS = [
  { value: 'public' as const, label: '公立' },
  { value: 'private' as const, label: '私立' },
];

/** 大学卒業までの教育費（いまの物価・概算） */
function eduTotal(c: Child, p: Plan): number {
  let t = 0;
  for (let m = c.birthYM; m < c.birthYM + 24 * 12; m++) t += childMonth(c, m, p.assumptions.childLiving).edu;
  return Math.round(t);
}

export function ChildEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const [page, setPage] = useState<'basic' | 'path' | 'cost'>('basic');
  const c = p.children.find((x) => x.id === props.id);
  const total = useMemo(() => (c ? eduTotal(c, p) : 0), [c, p]);
  if (!c) return null;
  const set = (fn: (x: Child) => void) => up((pl) => fn(pl.children.find((x) => x.id === c.id)!));
  return (
    <Sheet
      title={c.name}
      onClose={close}
      foot={<><DeleteBtn onDelete={() => { up((pl) => void ((pl.children = pl.children.filter((x) => x.id !== c.id)), (pl.work = pl.work.map((w) => (w.childId === c.id ? { ...w, childId: null } : w))))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}
    >
      <div className="card flat row between" style={{ flex: 'none' }}>
        <span className="label">大学卒業までの教育費（いまの物価）</span>
        <b className="num">{yen(total)}</b>
      </div>
      <Seg value={page} onChange={setPage} options={[{ value: 'basic', label: '基本' }, { value: 'path', label: '進路' }, { value: 'cost', label: '習い事・塾' }]} />
      {page === 'basic' && (
        <>
          <div className="grid2">
            <TextField label="呼び名" value={c.name} onChange={(v) => set((x) => void (x.name = v))} />
            <YMField label="生まれた（予定）年月" value={c.birthYM} nullable={false} onChange={(v) => v != null && set((x) => void (x.birthYM = v))} from={THIS_YEAR - 25} to={THIS_YEAR + 15} />
          </div>
          <Toggle label="0〜2歳で保育園に通う" value={c.nurseryUse} onChange={(v) => set((x) => void (x.nurseryUse = v))} />
          {c.nurseryUse && (
            <div className="grid2">
              <NumField label="通い始める年齢" unit="歳" min={0} max={2} nullable={false} value={c.nurseryStartAge} onChange={(v) => set((x) => void (x.nurseryStartAge = Math.round(v ?? 1)))} />
              <MoneyField label="保育料（月）" unit="yen" hint="自治体で確認" value={c.nurseryMonthly} placeholder="未確認（3万円で仮置き）" onChange={(v) => set((x) => void (x.nurseryMonthly = v))} />
            </div>
          )}
          <div className="micro">3〜5歳の保育料は無償化の対象です。児童手当（3歳未満 月1.5万円、高校生年代まで 月1万円、第3子以降 月3万円）は自動で収入に入ります。</div>
        </>
      )}
      {page === 'path' && (
        <>
          <Seg label="幼稚園（3〜5歳）" value={c.kinder} onChange={(v) => set((x) => void (x.kinder = v))} options={[{ value: 'public', label: '公立' }, { value: 'private', label: '私立' }, { value: 'none', label: '保育園など' }]} />
          <Seg label="小学校" value={c.elem} onChange={(v) => set((x) => void (x.elem = v))} options={SCHOOL_OPTS} />
          <Seg label="中学校" value={c.middle} onChange={(v) => set((x) => void (x.middle = v))} options={SCHOOL_OPTS} />
          <Seg label="高校" value={c.high} onChange={(v) => set((x) => void (x.high = v))} options={SCHOOL_OPTS} />
          <Seg label="大学" value={c.univ} onChange={(v) => set((x) => void (x.univ = v))} options={(Object.keys(UNIV_LABEL) as Child['univ'][]).map((k) => ({ value: k, label: UNIV_LABEL[k] }))} />
          {c.univ !== 'none' && (
            <div className="grid2">
              <NumField label="在学年数" unit="年" min={2} max={6} nullable={false} value={c.univYears} onChange={(v) => set((x) => void (x.univYears = Math.round(v ?? 4)))} />
              <MoneyField label="仕送り（月）" unit="yen" nullable={false} value={c.univAwayMonthly} onChange={(v) => set((x) => void (x.univAwayMonthly = v ?? 0))} />
            </div>
          )}
        </>
      )}
      {page === 'cost' && (
        <>
          <div className="micro" style={{ lineHeight: 1.6 }}>
            空欄のときは、学校ごとの統計平均（学校外活動費: 例 公立小 年{yen(EDU_MEXT.elem.public.outside)}）を使います。入力すると、その金額に置き換えます。
          </div>
          <div className="grid2">
            <MoneyField label="習い事（月）" unit="yen" value={c.lessonsMonthly} placeholder="統計平均" onChange={(v) => set((x) => void (x.lessonsMonthly = v))} />
            <MoneyField label="塾（月）" unit="yen" value={c.jukuMonthly} placeholder="統計平均" onChange={(v) => set((x) => void (x.jukuMonthly = v))} />
          </div>
          <MoneyField label="その他の教育費（年）" nullable={false} value={c.otherAnnual} onChange={(v) => set((x) => void (x.otherAnnual = v ?? 0))} />
          <div className="micro">大学の費用: 国公立 入学{yen(EDU_UNIV.national.entrance)}・年{yen(EDU_UNIV.national.annual)}、私立文系 入学{yen(EDU_UNIV.privateArts.entrance)}・年{yen(EDU_UNIV.privateArts.annual)}、私立理系 入学{yen(EDU_UNIV.privateSci.entrance)}・年{yen(EDU_UNIV.privateSci.annual)}</div>
        </>
      )}
    </Sheet>
  );
}

/* ---------- 生活費 ---------- */
export function LivingSheet({ close }: SheetProps) {
  const { s, p } = usePlan();
  const fixed = p.living.filter((x) => x.kind === 'fixed').reduce((t, x) => t + x.monthly, 0);
  const variable = p.living.filter((x) => x.kind === 'variable').reduce((t, x) => t + x.monthly, 0);
  return (
    <Sheet title="毎月の生活費" onClose={close} foot={<Done close={close} />}>
      <div className="card flat grid3" style={{ flex: 'none' }}>
        <Kpi label="固定費" v={fixed} />
        <Kpi label="変動費" v={variable} />
        <Kpi label="合計（月）" v={fixed + variable} />
      </div>
      <ItemList
        per={5}
        rows={p.living.map((x) => ({ id: x.id, icon: x.icon, title: x.name, sub: x.kind === 'fixed' ? '固定費' : '変動費', right: <b className="num">{yen(x.monthly)}</b> }))}
        onPick={(id) => s.open({ kind: 'livingEdit', props: { id } })}
        onAdd={() => s.open({ kind: 'livingAdd' })}
        addLabel="項目を追加"
        empty="家賃・住宅ローン・保険・教育費・投資の積立は、それぞれの画面で入力します（ここに入れると二重になります）"
      />
    </Sheet>
  );
}

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
        <MoneyField label="毎月" unit="yen" nullable={false} value={it.monthly} onChange={(v) => set((x) => void (x.monthly = v ?? 0))} />
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

/* ---------- 保険 ---------- */
const INS_LABEL: Record<Insurance['kind'], string> = { life: '生命', medical: '医療', cancer: 'がん', education: '学資', annuity: '個人年金', other: 'その他' };
export function InsuranceSheet({ close }: SheetProps) {
  const { s, p, up } = usePlan();
  return (
    <Sheet title="保険" onClose={close} foot={<Done close={close} />}>
      <ItemList
        per={5}
        rows={p.insurances.map((x) => ({ id: x.id, icon: 'shield', title: x.name, sub: `${INS_LABEL[x.kind]}・${x.payEndYM ? `${ymText(x.payEndYM)}まで` : '終身払い'}${x.payout.type !== 'none' ? '・受取あり' : ''}`, right: <b className="num">月{yen(x.monthly)}</b> }))}
        onPick={(id) => s.open({ kind: 'insEdit', props: { id } })}
        onAdd={() => {
          const id = uid('ins');
          up((pl) => void pl.insurances.push({ id, name: '保険', kind: 'medical', monthly: 3_000, payEndYM: null, payout: { type: 'none' } }));
          s.open({ kind: 'insEdit', props: { id } });
        }}
        addLabel="保険を追加"
        empty="保険料は「保険」として、受取金は受け取る月の収入として計算します（貯蓄型でも二重に数えません）"
      />
    </Sheet>
  );
}

export function InsEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const it = p.insurances.find((x) => x.id === props.id);
  if (!it) return null;
  const set = (fn: (x: Insurance) => void) => up((pl) => fn(pl.insurances.find((x) => x.id === it.id)!));
  const po = it.payout;
  return (
    <Sheet title={it.name} onClose={close} foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.insurances = pl.insurances.filter((x) => x.id !== it.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <TextField label="名前" value={it.name} onChange={(v) => set((x) => void (x.name = v))} />
      <Seg label="種類" value={it.kind} onChange={(v) => set((x) => void (x.kind = v))} options={(Object.keys(INS_LABEL) as Insurance['kind'][]).map((k) => ({ value: k, label: INS_LABEL[k] }))} />
      <div className="grid2">
        <MoneyField label="保険料（月）" unit="yen" nullable={false} value={it.monthly} onChange={(v) => set((x) => void (x.monthly = v ?? 0))} />
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
          <MoneyField label="年額" nullable={false} value={po.annual} onChange={(v) => set((x) => void (x.payout = { ...po, annual: v ?? 0 }))} />
          <YMField label="開始" nullable={false} value={po.startYM} onChange={(v) => v != null && set((x) => void (x.payout = { ...po, startYM: v }))} from={THIS_YEAR} to={THIS_YEAR + 60} />
          <NumField label="期間" unit="年" nullable={false} min={1} max={40} value={po.years} onChange={(v) => set((x) => void (x.payout = { ...po, years: Math.round(v ?? 10) }))} />
        </div>
      )}
    </Sheet>
  );
}

/* ---------- NISA・投資 ---------- */
const INV_LABEL: Record<Investment['kind'], string> = { nisaTsumitate: 'NISA つみたて', nisaGrowth: 'NISA 成長', ideco: 'iDeCo', taxable: '課税口座' };
export function InvestSheet({ close }: SheetProps) {
  const { s, p, up } = usePlan();
  const a = p.assumptions;
  return (
    <Sheet title="NISA・投資" onClose={close} foot={<Done close={close} />}>
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
      />
      <div className="card flat micro" style={{ lineHeight: 1.6 }}>
        運用利回りは保証されません。推奨額は「悲観 {pct(a.returnLow)}・標準 {pct(a.returnMid)}」で確かめます。{NISA_NOTE}
      </div>
      <Toggle label="退職後は、現金が不足する分だけ投資を売る" hint="現金が予備資金を下回ったとき、課税口座→NISA成長→つみたて→iDeCoの順に売却" value={a.withdrawAfterRetire} onChange={(v) => up((pl) => void (pl.assumptions.withdrawAfterRetire = v))} />
      <Toggle label="現役中も同じように売る" hint="オフなら、現役中の現金不足は「不足」として表示します" value={a.withdrawBeforeRetire} onChange={(v) => up((pl) => void (pl.assumptions.withdrawBeforeRetire = v))} />
    </Sheet>
  );
}

export function InvEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const [page, setPage] = useState<'save' | 'draw'>('save');
  const it = p.investments.find((x) => x.id === props.id);
  if (!it) return null;
  const set = (fn: (x: Investment) => void) => up((pl) => fn(pl.investments.find((x) => x.id === it.id)!));
  return (
    <Sheet title={it.name} onClose={close} foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.investments = pl.investments.filter((x) => x.id !== it.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <Seg value={page} onChange={setPage} options={[{ value: 'save', label: '残高・積立' }, { value: 'draw', label: '取崩し' }]} />
      {page === 'save' ? (
        <>
          <div className="grid2">
            <TextField label="名前" value={it.name} onChange={(v) => set((x) => void (x.name = v))} />
            {p.spouse ? <Seg label="名義" value={it.owner} onChange={(v) => set((x) => void (x.owner = v))} options={[{ value: 'self', label: p.self.name || '本人' }, { value: 'spouse', label: p.spouse.name || '配偶者' }]} /> : <div />}
          </div>
          <Seg label="口座" value={it.kind} onChange={(v) => set((x) => void (x.kind = v))} options={(Object.keys(INV_LABEL) as Investment['kind'][]).map((k) => ({ value: k, label: INV_LABEL[k].replace('NISA ', '') }))} />
          <div className="grid2">
            <MoneyField label="いまの残高" nullable={false} value={it.balance} onChange={(v) => set((x) => void (x.balance = v ?? 0))} />
            <MoneyField label="毎月の積立" unit="yen" nullable={false} value={it.monthly} onChange={(v) => set((x) => void (x.monthly = v ?? 0))} />
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
            <MoneyField label="毎月の取崩し" unit="yen" nullable={false} value={it.withdrawMonthly} onChange={(v) => set((x) => void (x.withdrawMonthly = v ?? 0))} />
          </div>
          {it.kind === 'ideco' && <div className="micro">iDeCoは60歳まで引き出せません。それより前の取崩しは計算に入れません。</div>}
          {it.kind === 'taxable' && <div className="micro">課税口座は、売却時の利益に20.315%の税金がかかるものとして計算します。</div>}
        </>
      )}
    </Sheet>
  );
}

/* ---------- 貯蓄目標 ---------- */
export function GoalsSheet({ close }: SheetProps) {
  const { s, p, up } = usePlan();
  const st = s.vm?.fp?.goals ?? [];
  return (
    <Sheet title="貯蓄目標" onClose={close} foot={<Done close={close} />}>
      <div className="micro">目標の金額と時期を入れると、毎月いくら貯めればよいかと、いまの計画で届くかを表示します。</div>
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
    </Sheet>
  );
}

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

/* ---------- ライフイベント ---------- */
const EVENT_PRESETS: { name: string; icon: string; pattern: LifeEvent['pattern']; amount: number; every?: number }[] = [
  { name: '結婚式', icon: 'ring', pattern: 'once', amount: 3_000_000 },
  { name: '新婚旅行', icon: 'plane', pattern: 'once', amount: 800_000 },
  { name: '出産費用', icon: 'baby', pattern: 'once', amount: 100_000 },
  { name: '車の購入', icon: 'car', pattern: 'repeat', amount: 2_500_000, every: 8 },
  { name: 'リフォーム', icon: 'tool', pattern: 'once', amount: 3_000_000 },
  { name: '家族旅行', icon: 'plane', pattern: 'repeat', amount: 300_000, every: 1 },
];
export function EventsSheet({ close }: SheetProps) {
  const { s, p, up } = usePlan();
  const add = (x: (typeof EVENT_PRESETS)[number] | null) => {
    const id = uid('ev');
    up((pl) => void pl.events.push({ id, name: x?.name ?? 'イベント', icon: x?.icon ?? 'flag', kind: 'expense', pattern: x?.pattern ?? 'once', amount: x?.amount ?? 500_000, startYM: nowYM() + 12, endYM: null, everyYears: x?.every ?? 5, inflate: true }));
    s.open({ kind: 'eventEdit', props: { id } });
  };
  return (
    <Sheet title="ライフイベント" onClose={close} foot={<Done close={close} />}>
      <ItemList
        per={4}
        rows={p.events.map((e) => ({ id: e.id, icon: e.icon, title: e.name, sub: `${ymText(e.startYM)}${e.pattern === 'repeat' ? `から${e.everyYears}年ごと` : e.pattern === 'monthly' ? 'から毎月' : ''}`, right: <b className={`num ${e.kind === 'income' ? 'pos' : ''}`}>{e.kind === 'income' ? '+' : ''}{yen(e.amount)}</b> }))}
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
          育休・時短・退職 →
        </button>
      </div>
    </Sheet>
  );
}

export function EventEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const e = p.events.find((x) => x.id === props.id);
  if (!e) return null;
  const set = (fn: (x: LifeEvent) => void) => up((pl) => fn(pl.events.find((x) => x.id === e.id)!));
  return (
    <Sheet title={e.name} onClose={close} foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.events = pl.events.filter((x) => x.id !== e.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
      <div className="grid2">
        <TextField label="名前" value={e.name} onChange={(v) => set((x) => void (x.name = v))} />
        <Seg label="お金の向き" value={e.kind} onChange={(v) => set((x) => void (x.kind = v))} options={[{ value: 'expense', label: '支出' }, { value: 'income', label: '収入' }]} />
      </div>
      <Seg label="時期" value={e.pattern} onChange={(v) => set((x) => void (x.pattern = v))} options={[{ value: 'once', label: '1回だけ' }, { value: 'repeat', label: '数年ごと' }, { value: 'monthly', label: '毎月' }]} />
      <div className="grid2">
        <MoneyField label={e.pattern === 'monthly' ? '金額（月）' : '金額（1回）'} nullable={false} value={e.amount} onChange={(v) => set((x) => void (x.amount = v ?? 0))} />
        <YMField label={e.pattern === 'once' ? 'いつ' : '始まり'} nullable={false} value={e.startYM} onChange={(v) => v != null && set((x) => void (x.startYM = v))} from={THIS_YEAR} to={THIS_YEAR + 70} />
      </div>
      {e.pattern !== 'once' && (
        <div className="grid2">
          {e.pattern === 'repeat' ? <NumField label="間隔" unit="年ごと" nullable={false} min={1} max={30} value={e.everyYears} onChange={(v) => set((x) => void (x.everyYears = Math.round(v ?? 1)))} /> : <div />}
          <YMField label="終わり" hint="空欄は続ける" value={e.endYM} onChange={(v) => set((x) => void (x.endYM = v))} from={THIS_YEAR} to={THIS_YEAR + 70} />
        </div>
      )}
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
    </Sheet>
  );
}

/* ---------- 育休・時短 ---------- */
export function WorkSheet({ close }: SheetProps) {
  const { s, p, up } = usePlan();
  const nm = (o: Owner) => (o === 'self' ? p.self.name || '本人' : p.spouse?.name || '配偶者');
  const add = (type: WorkChange['type']) => {
    const id = uid('work');
    const child = p.children[0];
    const owner: Owner = p.spouse ? 'spouse' : 'self';
    up((pl) => void pl.work.push({ id, owner, type, startYM: child ? child.birthYM : nowYM() + 12, months: 12, endYM: child ? child.birthYM + 36 : nowYM() + 48, ratio: 0.75, maternity: type === 'leave', childId: child?.id ?? null }));
    s.open({ kind: 'workEdit', props: { id } });
  };
  return (
    <Sheet title="育休・時短" onClose={close} foot={<Done close={close} />}>
      <ItemList
        per={4}
        rows={p.work.map((w) => ({ id: w.id, icon: w.type === 'leave' ? 'baby' : 'briefcase', title: `${nm(w.owner)}の${w.type === 'leave' ? '育児休業' : '時短勤務'}`, sub: w.type === 'leave' ? `${ymText(w.startYM)}から${w.months}か月${w.maternity ? '（産休含む）' : ''}` : `${ymText(w.startYM)}〜${w.endYM ? ymText(w.endYM) : ''}・勤務${Math.round(w.ratio * 100)}%` }))}
        onPick={(id) => s.open({ kind: 'workEdit', props: { id } })}
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
      <div className="micro">退職の年齢は「収入」の「退職・年金」で設定します。</div>
    </Sheet>
  );
}

export function WorkEditSheet({ close, props }: SheetProps) {
  const { s, p, up } = usePlan();
  const w = p.work.find((x) => x.id === props.id);
  if (!w) return null;
  const set = (fn: (x: WorkChange) => void) => up((pl) => fn(pl.work.find((x) => x.id === w.id)!));
  return (
    <Sheet title={w.type === 'leave' ? '育児休業' : '時短勤務'} onClose={close} foot={<><DeleteBtn onDelete={() => { up((pl) => void (pl.work = pl.work.filter((x) => x.id !== w.id))); close(); s.notify('削除しました', { label: '元に戻す', run: s.undo }); }} /><Done close={close} /></>}>
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
        <NumField label="勤務の割合（給与の割合）" unit="%" scale={100} nullable={false} min={10} max={100} value={w.ratio} onChange={(v) => set((x) => void (x.ratio = v ?? 1))} />
      )}
      {p.children.length > 0 && (
        <Seg label="対象の子供" value={w.childId ?? ''} onChange={(v) => set((x) => void (x.childId = v || null))} options={[{ value: '', label: 'なし' }, ...p.children.map((c) => ({ value: c.id, label: c.name }))]} />
      )}
    </Sheet>
  );
}

/* ---------- 住まい・購入計画 ---------- */
export function HousingSheet({ close }: SheetProps) {
  const { p, up } = usePlan();
  const [page, setPage] = useState<'now' | 'plan' | 'cost' | 'tax'>('plan');
  const h = p.housing;
  const set = (fn: (x: Plan['housing']) => void) => up((pl) => fn(pl.housing));
  return (
    <Sheet title="住まい・購入計画" onClose={close} foot={<Done close={close} />}>
      <Seg value={page} onChange={setPage} options={[{ value: 'now', label: 'いまの住まい' }, { value: 'plan', label: '購入計画' }, { value: 'cost', label: '維持費' }, { value: 'tax', label: '税の優遇' }]} />
      {page === 'now' && (
        <>
          <MoneyField label="家賃（月）" hint="駐車場・共益費込み" unit="yen" value={h.rentMonthly} onChange={(v) => set((x) => void (x.rentMonthly = v))} />
          <NumField label="家賃と住宅費が重なる期間" unit="か月" nullable={false} min={0} max={12} value={h.overlapMonths} onChange={(v) => set((x) => void (x.overlapMonths = Math.round(v ?? 0)))} hint="引越しまでの二重払い" />
          <div className="micro">購入後は家賃を計上しません（重なる期間だけ両方を払います）。</div>
        </>
      )}
      {page === 'plan' && (
        <>
          <div className="grid2">
            <YMField label="購入の予定" value={h.purchaseYM} onChange={(v) => set((x) => void (x.purchaseYM = v))} from={THIS_YEAR} to={THIS_YEAR + 30} />
            <Seg label="種類" value={h.kind} onChange={(v) => set((x) => void ((x.kind = v), (x.landShare = v === 'mansion' ? 0.2 : 0.35)))} options={[{ value: 'detached', label: '戸建て' }, { value: 'mansion', label: 'マンション' }]} />
          </div>
          <Seg label="自己資金（頭金＋現金で払う諸費用）" value={h.downMode} onChange={(v) => set((x) => void (x.downMode = v))} options={[{ value: 'auto', label: '予備資金を残して自動' }, { value: 'manual', label: '金額を決める' }]} />
          {h.downMode === 'manual' && <MoneyField label="自己資金" value={h.downPayment} onChange={(v) => set((x) => void (x.downPayment = v))} />}
          <div className="grid2">
            <MoneyField label="親などからの援助" nullable={false} value={h.gift} onChange={(v) => set((x) => void (x.gift = v ?? 0))} />
            <MoneyField label="引越し・家具など" value={h.movingCost} onChange={(v) => set((x) => void (x.movingCost = v))} />
          </div>
        </>
      )}
      {page === 'cost' && (
        <>
          <div className="micro">登録した住宅ごとの値がない場合や、予算の計算に使う目安です。</div>
          <div className="grid2">
            <NumField label="諸費用（物件価格に対して）" unit="%" scale={100} nullable={false} min={0} max={20} value={h.miscRate} onChange={(v) => set((x) => void (x.miscRate = v ?? 0.07))} />
            <NumField label="土地の割合" unit="%" scale={100} nullable={false} min={0} max={90} value={h.landShare} onChange={(v) => set((x) => void (x.landShare = v ?? 0.35))} />
          </div>
          <div className="grid2">
            <MoneyField label={h.kind === 'mansion' ? '管理費＋修繕積立金（月）' : '修繕費の積立（月）'} unit="yen" value={h.maintenanceMonthly} onChange={(v) => set((x) => void (x.maintenanceMonthly = v))} />
            <MoneyField label="火災・地震保険（年）" unit="yen" value={h.insuranceAnnual} onChange={(v) => set((x) => void (x.insuranceAnnual = v))} />
          </div>
          <MoneyField label="駐車場（月）" unit="yen" nullable={false} value={h.parkingMonthly} onChange={(v) => set((x) => void (x.parkingMonthly = v ?? 0))} />
        </>
      )}
      {page === 'tax' && (
        <>
          <Toggle label="住宅ローン控除を計算に入れる" hint="初期設定はオフ（条件の確認が必要なため）" value={h.deduction.enabled} onChange={(v) => set((x) => void (x.deduction.enabled = v))} />
          <Seg label="住宅の省エネ性能" value={h.deduction.energy} onChange={(v) => set((x) => void (x.deduction.energy = v))} options={[{ value: 'longlife', label: '長期優良等' }, { value: 'zeh', label: 'ZEH水準' }, { value: 'standard', label: '省エネ基準' }, { value: 'other', label: 'その他' }]} />
          <Seg label="世帯" value={h.deduction.family} onChange={(v) => set((x) => void (x.deduction.family = v))} options={[{ value: 'kosodate', label: '子育て・若者夫婦' }, { value: 'normal', label: 'その他' }]} />
          <MoneyField label="控除に使える税額（年）" hint="空欄は額面年収から推計" unit="yen" value={h.deduction.taxCapAnnual} onChange={(v) => set((x) => void (x.deduction.taxCapAnnual = v))} />
          <Toggle label="新築住宅の固定資産税の減額" hint="3年間（長期優良住宅は5年間）建物分を1/2" value={h.newBuildTaxCut} onChange={(v) => set((x) => void (x.newBuildTaxCut = v))} />
        </>
      )}
    </Sheet>
  );
}

/* ---------- 前提条件 ---------- */
export function AssumptionsSheet({ close }: SheetProps) {
  const { p, up } = usePlan();
  const [page, setPage] = useState<'eco' | 'life' | 'kids'>('eco');
  const a = p.assumptions;
  const set = (fn: (x: Plan['assumptions']) => void) => up((pl) => fn(pl.assumptions));
  return (
    <Sheet title="前提条件" onClose={close} foot={<Done close={close} />}>
      <Seg value={page} onChange={setPage} options={[{ value: 'eco', label: '物価・運用' }, { value: 'life', label: '老後・予備資金' }, { value: 'kids', label: '子供の生活費' }]} />
      {page === 'eco' && (
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
          <div className="micro" style={{ lineHeight: 1.6 }}>生活費・教育費は物価の上昇率で毎年1月に増やします。運用利回りは名目（物価上昇を含む）で入力します。推奨額の「安心」は悲観、「標準」は標準の利回りで確かめます。</div>
        </>
      )}
      {page === 'life' && (
        <>
          <div className="grid2">
            <NumField label="何歳まで計算するか" unit="歳" nullable={false} min={80} max={105} value={a.endAge} onChange={(v) => set((x) => void (x.endAge = Math.round(v ?? 95)))} />
            <NumField label="予備資金" unit="か月分" nullable={false} min={0} max={24} value={a.reserveMonths} onChange={(v) => set((x) => void (x.reserveMonths = v ?? 3))} />
          </div>
          <MoneyField label="老後の生活費（月・いまの物価）" hint="住居費を除く。空欄は統計値" unit="man" value={a.retireLivingMonthly} onChange={(v) => set((x) => void (x.retireLivingMonthly = v))} />
          <Toggle label="児童手当を収入に入れる" value={a.childAllowance} onChange={(v) => set((x) => void (x.childAllowance = v))} />
          <div className="micro">予備資金は「標準」で生活費の{a.reserveMonths}か月分、「安心」でその2倍を保てるかを確かめます。</div>
        </>
      )}
      {page === 'kids' && (
        <>
          <div className="micro">食費・日用品など、子供が増えた分の生活費（1人・月・いまの物価）。目安の値なので、家計に合わせて変えてください。</div>
          <div className="grid2">
            <MoneyField label="未就学" unit="yen" nullable={false} value={a.childLiving.preschool} onChange={(v) => set((x) => void (x.childLiving.preschool = v ?? 0))} />
            <MoneyField label="小学生" unit="yen" nullable={false} value={a.childLiving.elem} onChange={(v) => set((x) => void (x.childLiving.elem = v ?? 0))} />
            <MoneyField label="中高生" unit="yen" nullable={false} value={a.childLiving.middleHigh} onChange={(v) => set((x) => void (x.childLiving.middleHigh = v ?? 0))} />
            <MoneyField label="大学生" unit="yen" nullable={false} value={a.childLiving.univ} onChange={(v) => set((x) => void (x.childLiving.univ = v ?? 0))} />
          </div>
        </>
      )}
    </Sheet>
  );
}

