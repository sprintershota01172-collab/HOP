import type { ReactElement } from 'react';
import React, { useEffect, useMemo, useState } from 'react';
import type { Lever } from '../../engine/explain';
import { buildSchedule, ratePath } from '../../engine/loan';
import type { ViewModel } from '../../engine/view';
import { emptyData, uid } from '../../engine/defaults';
import { ASSUME, CHECKED, SOURCES } from '../../engine/reference';
import type { Memo, MemoCategory } from '../../engine/types';
import { nowYM } from '../../engine/ym';
import { listBackups, type Backup } from '../../storage/db';
import { copyText, lineShareUrl, saveFile, shareFile, shareLink } from '../../storage/platform';
import { DataError, migrate, toExport } from '../../storage/schema';
import { Money } from '../components/bits';
import { MoneyField, NumField, Pager, Seg, Toggle, useFit, usePages, YMField } from '../components/fields';
import { Sheet, Steps } from '../components/Sheet';
import { Switcher } from '../components/Switcher';
import { pct, yen, ymText } from '../format';
import { Icon } from '../icons';
import { MEMO_CAT } from '../screens/Memo';
import { useStore } from '../store';
import { MascotSays } from '../Mascot';
import { applyUpdate, BUILD, BUILT_AT, latestBuild } from '../update';
import { ChildrenSection, Done, HousingSection, IncomeSection, InvestSection, LivingSection, SavingsSection, WorkSection, type SheetProps } from './plan';


/* ---------- 確認 ---------- */
export function ConfirmSheet({ close, props }: SheetProps) {
  const p = props as { title: string; body: string; ok: string; danger?: boolean; run: () => void };
  return (
    <Sheet
      title={p.title}
      onClose={close}
      short
      foot={
        <>
          <button className="btn" onClick={close}>
            やめる
          </button>
          <button
            className={`btn ${p.danger ? 'danger' : 'primary'}`}
            onClick={() => {
              close();
              p.run();
            }}
          >
            {p.ok}
          </button>
        </>
      }
    >
      <div style={{ lineHeight: 1.7 }}>{p.body}</div>
    </Sheet>
  );
}

/* ---------- 計算の内訳（返済余力 → 借入目安 → 購入予算） ---------- */
const leverCache = new WeakMap<object, Lever[]>();

export function BasisSheet({ close, props }: SheetProps) {
  const s = useStore();
  const vm = s.vm;
  const [page, setPage] = useState<'flow' | 'lines' | 'limit' | 'checks' | 'assumed'>((props.page as 'flow') ?? 'lines');
  const [levers, setLevers] = useState<Lever[] | null>(() => (vm ? leverCache.get(vm) ?? null : null));
  useEffect(() => {
    if (!vm?.ready || s.computing) return;
    const hit = leverCache.get(vm);
    if (hit) {
      setLevers(hit);
      return;
    }
    let alive = true;
    setLevers(null);
    s.levers().then((x) => {
      leverCache.set(vm, x);
      if (alive) setLevers(x);
    });
    return () => {
      alive = false;
    };
  }, [vm, s.computing]);
  const [dir, setDir] = useState(1);
  if (!vm) return null;
  const b = vm.breakdown;
  const go = (sheet: string, page?: string) => s.open({ kind: sheet, props: page ? { page } : {} });
  const pages: { value: typeof page; label: string }[] = [
    { value: 'lines', label: '内訳' },
    { value: 'flow', label: '予算まで' },
    { value: 'limit', label: '制限要因' },
    { value: 'checks', label: '検証' },
    { value: 'assumed', label: `仮置き${vm.assumed.length}` },
  ];
  const idx = pages.findIndex((x) => x.value === page);
  return (
    <Sheet title="計算の内訳" onClose={close} foot={<button className="btn primary" onClick={close}>閉じる</button>}>
      <Seg value={page} onChange={(v) => { setDir(pages.findIndex((x) => x.value === v) >= idx ? 1 : -1); setPage(v); }} options={pages} />
      {!vm.ready || !b ? (
        <div className="empty fill">
          <div>{vm.blocking.join('、')}を入力してください</div>
          <button className="btn primary" onClick={() => s.open({ kind: 'wizard' })}>かんたん入力</button>
        </div>
      ) : (
        <Switcher k={page} dir={dir}>
          {page === 'lines' ? <Lines vm={vm} go={go} /> : page === 'flow' ? <Flow vm={vm} go={go} /> : page === 'limit' ? <LimitPage vm={vm} levers={levers} go={go} /> : page === 'checks' ? <Checks vm={vm} months={s.data.plan.assumptions.reserveMonths} /> : <Assumed vm={vm} go={go} />}
        </Switcher>
      )}
    </Sheet>
  );
}

type Go = (sheet: string, page?: string) => void;

/**
 * 毎月のお金の内訳（各行をタップすると、その入力へ移動）。
 *  - 借入が家計の余力で決まる場合: 購入後、返済に回せる金額（＝①）の内訳
 *  - 審査の目安で決まる場合: ③の予算で買った後の家計（返済後に残る毎月の余裕）
 */
function Lines({ vm, go }: { vm: ViewModel; go: Go }) {
  const b = vm.breakdown!;
  const a = vm.after;
  const bankMode = vm.rec.overBank && !!a;
  const lines = bankMode ? a!.lines : b.lines;
  const fit = useFit<HTMLDivElement>(36, 3, 3);
  const pg = usePages(lines, Math.max(3, fit.n));
  const months = bankMode ? a!.months : b.months;
  const span = months >= 12 ? `${Math.floor(months / 12)}年${months % 12 ? `${months % 12}か月` : ''}` : `${months}か月`;
  return (
    <>
      <div className="micro" style={{ lineHeight: 1.5 }}>
        {bankMode
          ? `③ の予算（借入 ${yen(vm.rec.final.loan)}）で買った後、購入から${span}の月平均です。`
          : b.endKind === 'atPurchase'
            ? '購入した時点で、手元に残すべき予備資金が足りません。'
            : `購入から${ymText(b.to)}まで（${span}）の月平均。家計の中で、毎月ローンの返済に回せる金額です。`}
      </div>
      <div className="wf fill" ref={fit.ref}>
        {pg.slice.map((l) => (
          <button key={l.key} className="ln" onClick={() => go(l.sheet, l.sheet === 'housing' ? (l.key === 'upkeep' ? 'cost' : 'plan') : l.sheet === 'assumptions' ? 'life' : undefined)}>
            <span className={`op${l.op === '+' ? ' plus' : ''}`}>{l.op}</span>
            <span className="nm ellipsis">
              {l.label}
              {l.sub && <small>{l.sub}</small>}
            </span>
            <span className="v">{yen(l.value)}</span>
            <Icon name="right" />
          </button>
        ))}
      </div>
      <Pager {...pg} />
      <div className="wf">
        <div className="total">
          <span className="op">=</span>
          <span className="nm" style={{ fontWeight: 800 }}>{bankMode ? '毎月の余裕（平均）' : '毎月の返済余力（平均）'}</span>
          <span className="v">{yen(bankMode ? a!.surplus : b.payment)}</span>
          <span />
        </div>
      </div>
      {bankMode && (
        <div className="micro" style={{ lineHeight: 1.5 }}>
          借入は審査の目安で決まっています。参考: 金利上昇・収入減への備えを残して返済に回せる最大は、毎月 {yen(b.payment)} です。
        </div>
      )}
    </>
  );
}

/** ① → ② → ③ の流れと、自己資金・審査の目安（実際に借りる額で説明する） */
function Flow({ vm, go }: { vm: ViewModel; go: Go }) {
  const b = vm.breakdown!;
  const r = vm.rec;
  const f = r.final;
  const m = r.metrics;
  const d = b.downParts;
  const bank = vm.bank!;
  const pair = bank.pair;
  const kept = Math.max(0, d.cashBefore + d.gift - d.moving - f.down);
  return (
    <>
      <FlowCards vm={vm} />
      <div className="card stack" style={{ gap: 6 }}>
        <div className="micro" style={{ lineHeight: 1.6 }}>
          <b style={{ color: 'var(--ink)' }}>① 毎月の返済</b> = 借入 {yen(f.loan)} を金利 {pct(b.rate, 2)}・{b.years}年（{b.years * 12}回）で返す額{f.paymentBonus ? `（ボーナス月 +${yen(f.paymentBonus)}）` : ''}。
          {m && <>総返済 <span className="interest">{yen(m.totalPayment)}</span>、うち利息 <span className="interest">{yen(m.totalInterest)}</span>。</>}
        </div>
        <div className="micro" style={{ lineHeight: 1.6 }}>
          <b style={{ color: 'var(--ink)' }}>② 借入額</b>
          {r.overBank
            ? ` は、金融機関の審査の目安 ${yen(bank.amount)} で決まっています。家計の余力からは、毎月 ${yen(r.payment)}・借入 ${yen(r.loan)} まで返せる計算です（参考）。`
            : ` = 家計の中で毎月返済に回せる金額（${yen(r.payment)}）を、金利・返済期間で割り戻した額。審査の目安 ${yen(bank.amount)} の範囲内です。`}
        </div>
        <div className="micro" style={{ lineHeight: 1.6 }}>
          <b style={{ color: 'var(--ink)' }}>③ 住宅購入予算</b> = ② {yen(f.loan)} ＋ 自己資金 {yen(f.down)} = 物件 {yen(f.price)} ＋ 諸費用 {yen(f.total - f.price)}
        </div>
        <button className="item" style={{ minHeight: 0 }} onClick={() => go('housing', 'plan')}>
          <div className="grow micro" style={{ lineHeight: 1.6 }}>
            <b style={{ color: 'var(--ink)' }}>自己資金</b>
            {d.manual ? ' = 手入力の金額' : ` = 購入直前の現金 ${yen(d.cashBefore)}${d.gift ? ` ＋ 援助 ${yen(d.gift)}` : ''}${d.moving ? ` − 引越し等 ${yen(d.moving)}` : ''} − 手元に残す予備資金 ${yen(kept)}`}
          </div>
          <Icon name="right" size={16} />
        </button>
      </div>
      <button className="card item" style={{ border: r.overBank ? '1.5px solid var(--orange)' : undefined }} onClick={() => go('loanTerms', 'who')}>
        <div className="grow">
          <div className="t">金融機関の審査の目安 {yen(bank.amount)}</div>
          <div className="micro" style={{ lineHeight: 1.5 }}>
            {pair ? '夫婦の' : '本人の'}額面年収 {yen(bank.gross)} × {pct(bank.ratio, 0)}・審査金利 {pct(bank.rate, 1)}・{bank.years}年で計算。{pair ? '' : '夫婦で借りる場合はここで変更できます。'}
          </div>
        </div>
        <Icon name="right" size={16} />
      </button>
    </>
  );
}

/** ① 毎月の返済 → ② 借入額 → ③ 購入予算（実際に目指す予算） */
export function FlowCards({ vm }: { vm: ViewModel }) {
  const f = vm.rec.final;
  return (
    <div className="flow">
      <div className="card flat">
        <div className="label">① 毎月の返済</div>
        <Money v={f.payment} />
      </div>
      <span className="arrow">→</span>
      <div className="card flat">
        <div className="label">② 借入額</div>
        <Money v={f.loan} />
      </div>
      <span className="arrow">→</span>
      <div className="card main-n">
        <div className="label">③ 購入予算</div>
        <Money v={f.total} />
      </div>
    </div>
  );
}

/** 借入額を制限している要因と、どの入力を変えると予算が動くか */
function LimitPage({ vm, levers, go }: { vm: ViewModel; levers: Lever[] | null; go: Go }) {
  const b = vm.breakdown!;
  const fit = useFit<HTMLDivElement>(38, 0, 2);
  return (
    <>
      {vm.rec.overBank ? (
        <BankLimitCard vm={vm} go={go} />
      ) : (
        <div className="card stack" style={{ gap: 4 }}>
          <div className="label" style={{ fontWeight: 700 }}>いちばん制限している要因</div>
          <div style={{ fontSize: 'var(--fs-s)', lineHeight: 1.6 }}>
            {b.limit ? <>1万円多く借りると、{b.limit.text}。</> : 'ローン完済まで、どの条件でも予備資金を保てます。'}
          </div>
        </div>
      )}
      {vm.rec.overBank ? <BankLevers vm={vm} go={go} /> : <>
      <div className="label" style={{ fontWeight: 700 }}>
        この入力を変えると、予算がこれだけ変わります
      </div>
      <div className="fill" ref={fit.ref}>
        {!levers
          ? Array.from({ length: Math.min(4, fit.n) }, (_, i) => <div key={i} className="skeleton" style={{ margin: '12px 0' }} />)
          : levers.slice(0, fit.n).map((l) => (
              <button key={l.key} className="lever" onClick={() => go(l.sheet, l.sheet === 'housing' ? 'plan' : l.sheet === 'assumptions' ? 'life' : undefined)}>
                <span className="ellipsis">{l.label}</span>
                <b className={l.deltaTotal > 0 ? 'pos' : l.deltaTotal < 0 ? 'neg' : ''}>{Math.abs(l.deltaTotal) < 10_000 ? '±0' : yen(l.deltaTotal, { sign: true })}</b>
                <Icon name="right" />
              </button>
            ))}
      </div>
      <div className="micro">標準の条件（金利+1%・収入−10%のどちらでも予備資金と老後の資金を保てる）で、住宅購入予算を計算し直した差です。</div>
      </>}
    </>
  );
}

/** 借入額が審査の目安で決まっている場合の説明 */
function BankLimitCard({ vm, go }: { vm: ViewModel; go: Go }) {
  const bank = vm.bank!;
  return (
    <button className="card stack" style={{ gap: 4, textAlign: 'left' }} onClick={() => go('loanTerms', 'who')}>
      <div className="label" style={{ fontWeight: 700 }}>いちばん制限している要因</div>
      <div style={{ fontSize: 'var(--fs-s)', lineHeight: 1.6 }}>
        金融機関の審査の目安です。{bank.pair ? '夫婦' : '本人'}の額面年収 {yen(bank.gross)} から、借入は {yen(bank.amount)} までと見込んでいます。家計の余力ではありません。
      </div>
    </button>
  );
}

/** 審査の目安で決まる場合に、予算を増やす方法 */
function BankLevers({ vm, go }: { vm: ViewModel; go: Go }) {
  const s = useStore();
  const bank = vm.bank!;
  const rows: { key: string; label: string; sub: string; run: () => void }[] = [];
  if (!bank.pair && s.data.plan.spouse) rows.push({ key: 'pair', label: '夫婦で借りる（収入合算・ペアローン）', sub: '配偶者の年収も審査の目安に入ります', run: () => go('loanTerms', 'who') });
  rows.push({ key: 'gross', label: '額面年収を確かめる', sub: '源泉徴収票の「支払金額」（賞与込み）', run: () => go('income') });
  rows.push({ key: 'down', label: '自己資金を増やす（援助など）', sub: '増やした分だけ予算が増えます', run: () => go('housing', 'plan') });
  return (
    <>
      <div className="label" style={{ fontWeight: 700 }}>
        予算を増やすには
      </div>
      <div className="fill">
        {rows.map((x) => (
          <button key={x.key} className="lever" onClick={x.run}>
            <span className="stack" style={{ gap: 0, minWidth: 0 }}>
              <span className="ellipsis">{x.label}</span>
              <small className="micro ellipsis">{x.sub}</small>
            </span>
            <b />
            <Icon name="right" />
          </button>
        ))}
      </div>
      <div className="micro">生活費などを減らしても、審査の目安は変わらないため予算は増えません（家計の余裕が増えます）。</div>
    </>
  );
}

/** 目指す予算（③）で購入した場合に、条件が変わったら */
function Checks({ vm, months }: { vm: ViewModel; months: number }) {
  return (
    <>
      <div className="micro">③ の予算（借入 {yen(vm.rec.final.loan)}）で購入した場合に、生活費{months}か月分の予備資金と老後の資金を保てるか。</div>
      <div className="stack fill" style={{ gap: 0 }}>
        {vm.checks.map((c) => (
          <div key={c.key} className="check-row">
            <span className={c.ok ? 'ok' : 'ng'}>{c.ok ? '○' : '×'}</span>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{c.label}</div>
              {c.fail && <div className="micro neg">{c.fail.text.replace(/^.*?場合、/, '')}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="micro">「安心」の予算は、金利+2%と収入−10%が同時に起きても予備資金を2倍保てる金額です（ホームのものさし）。</div>
    </>
  );
}

function Assumed({ vm, go }: { vm: ViewModel; go: Go }) {
  const fit = useFit<HTMLDivElement>(50, 6, 2);
  const pg = usePages(vm.assumed, fit.n);
  return (
    <>
      <div className="card row between">
        <span className="label">予算の信頼度</span>
        <b className="num" style={{ fontSize: 'var(--fs-xl)' }}>
          {vm.confidence.level}
          <small className="micro"> {vm.confidence.score}点</small>
        </b>
      </div>
      <div className="micro" style={{ lineHeight: 1.5 }}>
        100点から、入力がなく仮の値で計算した項目ごとに 影響大 −12・影響中 −5・影響小 −2 点。75点以上で「高」、50点以上で「中」。下の項目を入れると上がります。
      </div>
      {vm.assumed.length === 0 ? (
        <div className="empty">仮置きした項目はありません</div>
      ) : (
        <div className="list fill" ref={fit.ref}>
          {pg.slice.map((a) => (
            <button key={a.key} className="item" style={{ minHeight: 0 }} onClick={() => go(a.sheet)}>
              <span className={`chip ${a.impact === 'high' ? 'tier-danger' : a.impact === 'mid' ? 'tier-caution' : ''}`}>{a.impact === 'high' ? '影響大' : a.impact === 'mid' ? '影響中' : '影響小'}</span>
              <div className="grow">
                <div className="t ellipsis" style={{ fontSize: 'var(--fs-s)' }}>{a.label}</div>
                <div className="micro ellipsis">{a.value}</div>
              </div>
              <Icon name="right" size={16} />
            </button>
          ))}
        </div>
      )}
      <Pager {...pg} />
    </>
  );
}

/* ---------- FP画面の前提にする住宅 ---------- */
export function FpBasisSheet({ close }: SheetProps) {
  const s = useStore();
  const h = s.data.plan.housing;
  const pick = (fpBasis: typeof h.fpBasis, houseId: string | null = null) => {
    s.update((d) => void ((d.plan.housing.fpBasis = fpBasis), (d.plan.housing.houseId = houseId)));
    close();
  };
  const opt = (on: boolean, title: string, sub: string, run: () => void, key: string) => (
    <button key={key} className="item" onClick={run} aria-pressed={on ? 'true' : 'false'} style={{ borderColor: on ? 'var(--green-2)' : undefined }}>
      <span className="ic">{on ? <Icon name="check" /> : <Icon name="house" />}</span>
      <div className="grow">
        <div className="t">{title}</div>
        <div className="micro">{sub}</div>
      </div>
    </button>
  );
  return (
    <Sheet title="将来の家計の前提" onClose={close} short>
      <div className="list">
        {opt(h.fpBasis === 'recommended', '適正予算で購入', `標準の予算 ${yen(s.vm?.rec.total)}`, () => pick('recommended'), 'r')}
        {opt(h.fpBasis === 'desired', '希望の借入額で購入', h.desiredLoan != null ? `借入 ${yen(h.desiredLoan)}` : 'ローン画面で希望額を設定', () => pick('desired'), 'd')}
        {s.data.houses.slice(0, 4).map((x) => opt(h.fpBasis === 'house' && h.houseId === x.id, x.name || '名称未設定', x.price ? `物件 ${yen(x.price)}` : '価格未入力', () => pick('house', x.id), x.id))}
        {opt(h.fpBasis === 'none', '購入しない', '家賃のまま暮らす場合', () => pick('none'), 'n')}
      </div>
      {h.fpBasis !== 'none' && (
        <button className="item" onClick={() => s.open({ kind: 'sale' })}>
          <span className="ic">
            <Icon name="key" />
          </span>
          <div className="grow">
            <div className="t">売却・住み替え</div>
            <div className="micro">{h.sale ? `${ymText(h.sale.ym)}に売却・その後の家賃 月${yen(h.sale.rentAfter)}` : '予定なし'}</div>
          </div>
          <Icon name="right" />
        </button>
      )}
    </Sheet>
  );
}

/** 家の売却・住み替え（将来の家計の推移にだけ反映し、購入予算の計算では売却を当てにしない） */
export function SaleSheet({ close }: SheetProps) {
  const s = useStore();
  const h = s.data.plan.housing;
  const sale = h.sale ?? null;
  const set = (fn: (x: NonNullable<typeof sale>) => void) =>
    s.update((d) => {
      const cur = d.plan.housing.sale ?? { ym: (d.plan.housing.purchaseYM ?? nowYM()) + 12 * 25, price: null, rentAfter: 100_000 };
      fn(cur);
      d.plan.housing.sale = cur;
      d.sample = false;
    });
  return (
    <Sheet title="売却・住み替え" onClose={close} preview foot={<button className="btn primary" onClick={close}>完了</button>}>
      <Toggle label="家を売却する予定がある" value={!!sale} onChange={(v) => (v ? set(() => undefined) : s.update((d) => void (d.plan.housing.sale = null)))} />
      {sale && (
        <>
          <div className="grid2">
            <YMField label="売却の時期" nullable={false} value={sale.ym} onChange={(v) => v != null && set((x) => void (x.ym = v))} from={new Date().getFullYear()} to={new Date().getFullYear() + 60} />
            <MoneyField label="売却価格" hint="空欄は参考評価額" value={sale.price} placeholder="参考評価額" onChange={(v) => set((x) => void (x.price = v))} />
          </div>
          <MoneyField label="売却後の家賃" hint="住み替え先・いまの価値" per="month" nullable={false} value={sale.rentAfter} onChange={(v) => set((x) => void (x.rentAfter = v ?? 0))} />
          <div className="card flat micro" style={{ lineHeight: 1.6 }}>
            売却の月に、売却価格から売却費用（4%）を引いた額が入り、ローンの残りを一括で返します。その後は維持費・ローンがなくなり、家賃を払います。売却益の税（居住用の3,000万円控除など）は計算に入れていません。
          </div>
          <div className="micro" style={{ lineHeight: 1.6 }}>この予定は「将来の家計」の推移にだけ反映します。住宅購入予算は、売却を当てにせずに計算します。</div>
        </>
      )}
    </Sheet>
  );
}

/** 一般的な入力項目のうち、まだ入っていないもの（タップでその入力へ） */
export function MissingSheet({ close }: SheetProps) {
  const s = useStore();
  const list = s.vm?.missing ?? [];
  const fit = useFit<HTMLDivElement>(52, 6, 2);
  const pg = usePages(list, fit.n);
  return (
    <Sheet title={`未入力の項目 ${list.length}件`} onClose={close} foot={<button className="btn primary" onClick={close}>閉じる</button>}>
      <MascotSays size={48} pose="think" text={list.length ? '入れると予算が正確になるっぽ。ない項目は 0 を入れてね' : 'ぜんぶ入力できたっぽ！'} mood={list.length ? 'normal' : 'happy'} />
      <div className="list fill" ref={fit.ref}>
        {pg.slice.map((m) => (
          <button key={m.key} className="item" style={{ minHeight: 0 }} onClick={() => s.open({ kind: m.sheet, props: m.props ?? {} })}>
            <span className="ic" style={{ background: 'var(--orange-soft)', color: 'var(--orange)' }}>
              <Icon name="info" />
            </span>
            <div className="grow t ellipsis">{m.label}</div>
            <Icon name="right" size={16} />
          </button>
        ))}
      </div>
      <Pager {...pg} />
    </Sheet>
  );
}

/* ---------- ローン条件 ---------- */
export function LoanTermsSection({ initial }: { initial?: 'who' | 'rate' | 'how' | 'prepay' }) {
  const s = useStore();
  const h = s.data.plan.housing;
  const t = h.loan;
  const spouse = s.data.plan.spouse;
  const set = (fn: (x: typeof t) => void) => s.update((d) => void (fn(d.plan.housing.loan), (d.sample = false)));
  const pages = [{ value: 'who' as const, label: '借りる人' }, { value: 'rate' as const, label: '金利' }, { value: 'how' as const, label: '返し方' }, { value: 'prepay' as const, label: '繰上返済' }];
  const [page, setPage] = useState<'who' | 'rate' | 'how' | 'prepay'>(initial ?? 'who');
  const [dir, setDir] = useState(1);
  return (
    <>
      <Seg value={page} onChange={(v) => { setDir(pages.findIndex((x) => x.value === v) >= pages.findIndex((x) => x.value === page) ? 1 : -1); setPage(v); }} options={pages} />
      <Switcher k={page} dir={dir}>
        {page === 'who' ? (
          <>
            <Seg
              label="ローンを組む人（審査の目安に使う年収）"
              value={spouse ? t.borrower : 'self'}
              onChange={(v) => set((x) => void (x.borrower = v))}
              options={spouse ? [{ value: 'self', label: '本人のみ' }, { value: 'pair', label: '夫婦（収入合算・ペア）' }] : [{ value: 'self', label: '本人のみ' }]}
            />
            {s.vm?.bank && <div className="micro">審査の目安: {yen(s.vm.bank.amount)}（額面 {yen(s.vm.bank.gross)}）。家計上の返済余力とは別に表示します。</div>}
            <MoneyField label="希望の借入額" hint="ローン画面で試算する額" value={h.desiredLoan} placeholder="未設定（推奨額で試算）" onChange={(v) => s.update((d) => void (d.plan.housing.desiredLoan = v))} />
            <button className="item" onClick={() => s.open({ kind: 'housing', props: { page: 'plan' } })}>
              <span className="ic">
                <Icon name="calendar" />
              </span>
              <div className="grow">
                <div className="t">購入時期・自己資金</div>
                <div className="micro">
                  {h.purchaseYM ? ymText(h.purchaseYM) : '未設定'}・{h.downMode === 'auto' ? '予備資金を残して自動' : `自己資金 ${yen(h.downPayment ?? 0)}`}
                </div>
              </div>
              <Icon name="right" />
            </button>
          </>
        ) : page === 'rate' ? (
          <>
            <Seg label="金利のタイプ" value={t.rateType} onChange={(v) => set((x) => void ((x.rateType = v), (x.rate = v === 'fixed' ? ASSUME.fixedRate : v === 'variable' ? ASSUME.variableRate : x.rate)))} options={[{ value: 'variable', label: '変動' }, { value: 'fixedPeriod', label: '固定期間選択' }, { value: 'fixed', label: '全期間固定' }]} />
            <NumField label="借入時の金利（年）" unit="%" scale={100} nullable={false} min={0} max={15} value={t.rate} onChange={(v) => set((x) => void (x.rate = v ?? 0))} />
            {t.rateType === 'fixedPeriod' && (
              <div className="grid2">
                <NumField label="固定の期間" unit="年" nullable={false} min={1} max={35} value={t.fixedYears} onChange={(v) => set((x) => void (x.fixedYears = Math.round(v ?? 10)))} />
                <NumField label="固定期間後の金利" unit="%" scale={100} nullable={false} value={t.afterRate} onChange={(v) => set((x) => void (x.afterRate = v ?? 0))} />
              </div>
            )}
            {t.rateType !== 'fixed' && (
              <Toggle label="5年ルール・125%ルール" hint="返済額の見直しは5年ごと、上がっても前の1.25倍まで（多くの銀行の変動金利）" value={!!t.rule125} onChange={(v) => set((x) => void (x.rule125 = v))} />
            )}
            <div className="card flat micro" style={{ lineHeight: 1.7 }}>
              2026年10月の目安: 変動は低い銀行で1.04〜1.28%程度、フラット35（21〜35年）は3.83%で過去最高。変動・固定期間後の金利は、+1%（標準）・+2%（安心）上がっても返せるかを確かめます。（確認日 {CHECKED}）
            </div>
          </>
        ) : page === 'prepay' ? (
          <PrepaySection />
        ) : (
          <>
            <NumField label="返済期間" unit="年" nullable={false} min={5} max={50} value={t.years} onChange={(v) => set((x) => void (x.years = Math.round(v ?? 35)))} hint="完済80歳を超える分は短くして計算" />
            <Seg label="返済方式" value={t.method} onChange={(v) => set((x) => void (x.method = v))} options={[{ value: 'annuity', label: '元利均等（毎月同じ）' }, { value: 'equalPrincipal', label: '元金均等（だんだん減る）' }]} />
            <NumField label="ボーナス返済の割合" unit="%" scale={100} nullable={false} min={0} max={50} value={t.bonusShare} onChange={(v) => set((x) => void (x.bonusShare = v ?? 0))} hint="借入額のうち。0%でなし" />
            <NumField label="審査の目安に使う金利" unit="%" scale={100} nullable={false} min={0} max={10} value={t.screeningRate} onChange={(v) => set((x) => void (x.screeningRate = v ?? 0.035))} />
          </>
        )}
      </Switcher>
    </>
  );
}
export const LoanTermsSheet = ({ close, props }: SheetProps) => (
  <Sheet title="ローンの条件" onClose={close} preview foot={<Done close={close} />}>
    <LoanTermsSection initial={(props.page as 'who' | 'rate' | 'how' | 'prepay') ?? (props.focus === 'desired' ? 'who' : 'rate')} />
  </Sheet>
);

/** 繰上返済の予定と、その効果（目指す予算の借入額で、金利が変わらない場合） */
function PrepaySection() {
  const s = useStore();
  const h = s.data.plan.housing;
  const t = h.loan;
  const list = t.prepayments ?? [];
  const loan = s.vm?.rec.final.loan ?? 0;
  const pym = h.purchaseYM ?? s.vm?.purchaseYM ?? nowYM() + 12;
  const eff = useMemo(() => {
    if (!loan) return null;
    const base = { principal: loan, months: t.years * 12, method: t.method, bonusShare: t.bonusShare, rateAt: ratePath(t.rateType, t.rate, { fixedYears: t.fixedYears, afterRate: t.afterRate }), rule125: t.rule125 };
    const a = buildSchedule(base);
    const b = buildSchedule({ ...base, prepay: list.map((x) => ({ k: x.ym - pym, amount: x.amount, mode: x.mode })) });
    return { interest: a.totalInterest - b.totalInterest, months: a.lastK - b.lastK, first: a.firstMonthly };
  }, [loan, t, pym, list]);
  const add = () => {
    const id = uid('pre');
    s.update((d) => {
      const l = d.plan.housing.loan;
      l.prepayments = [...(l.prepayments ?? []), { id, ym: Math.max(pym + 12, nowYM() + 12) + 48, amount: 1_000_000, mode: 'shorten' }];
      d.sample = false;
    });
    s.open({ kind: 'prepayEdit', props: { id } });
  };
  return (
    <>
      <div className="list">
        {list.length === 0 && <div className="empty">ボーナスや貯金で、借入の一部を前倒しで返す予定を入れると、減る利息と完済の早まりを計算します</div>}
        {list.slice(0, 3).map((x) => (
          <button key={x.id} className="item" style={{ minHeight: 0 }} onClick={() => s.open({ kind: 'prepayEdit', props: { id: x.id } })}>
            <span className="ic">
              <Icon name="coins" />
            </span>
            <div className="grow">
              <div className="t">{ymText(x.ym)}</div>
              <div className="micro">{x.mode === 'shorten' ? '期間短縮（毎月の返済は同じ）' : '返済額軽減（期間は同じ）'}</div>
            </div>
            <b className="num">{yen(x.amount)}</b>
            <Icon name="right" size={16} />
          </button>
        ))}
        {list.length > 3 && <div className="micro">ほか{list.length - 3}件</div>}
      </div>
      <button className="btn" onClick={add}>
        <Icon name="plus" />
        繰上返済を追加
      </button>
      {eff && list.length > 0 && (
        <div className="card flat stack" style={{ gap: 4 }}>
          <div className="row between">
            <span className="micro">減る利息</span>
            <b className="num pos">{yen(eff.interest)}</b>
          </div>
          <div className="row between">
            <span className="micro">完済が早まる</span>
            <b className="num">{eff.months > 0 ? `${Math.floor(eff.months / 12)}年${eff.months % 12 ? `${eff.months % 12}か月` : ''}` : 'なし（返済額が下がる）'}</b>
          </div>
          <div className="micro">借入 {yen(loan)}・金利が変わらない場合。繰上返済のお金は、その月の現金から払う計算です。</div>
        </div>
      )}
    </>
  );
}

export function PrepayEditSheet({ close, props }: SheetProps) {
  const s = useStore();
  const list = s.data.plan.housing.loan.prepayments ?? [];
  const x = list.find((p) => p.id === props.id);
  if (!x) return null;
  const set = (fn: (p: NonNullable<typeof x>) => void) =>
    s.update((d) => {
      const p = (d.plan.housing.loan.prepayments ?? []).find((q) => q.id === x.id);
      if (p) fn(p);
      d.sample = false;
    });
  const del = () => {
    s.update((d) => void (d.plan.housing.loan.prepayments = (d.plan.housing.loan.prepayments ?? []).filter((q) => q.id !== x.id)));
    close();
  };
  return (
    <Sheet title="繰上返済" onClose={close} preview short foot={<><button className="btn danger" onClick={del}><Icon name="trash" />削除</button><button className="btn primary" onClick={close}>完了</button></>}>
      <div className="grid2">
        <YMField label="いつ" nullable={false} value={x.ym} onChange={(v) => v != null && set((p) => void (p.ym = v))} from={new Date().getFullYear()} to={new Date().getFullYear() + 50} />
        <MoneyField label="金額" nullable={false} value={x.amount} onChange={(v) => set((p) => void (p.amount = v ?? 0))} />
      </div>
      <Seg label="方法" value={x.mode} onChange={(v) => set((p) => void (p.mode = v))} options={[{ value: 'shorten', label: '期間短縮' }, { value: 'reduce', label: '返済額軽減' }]} />
      <div className="micro" style={{ lineHeight: 1.6 }}>期間短縮は毎月の返済を変えずに完済を早め、利息がより減ります。返済額軽減は期間を変えずに毎月の返済を下げます。</div>
    </Sheet>
  );
}

/* ---------- メモ ---------- */
export function MemoEditSheet({ close, props }: SheetProps) {
  const s = useStore();
  const [id] = useState<string>(() => (typeof props.id === 'string' ? props.id : uid('memo')));
  const existing = s.data.memos.find((m) => m.id === id);
  const [draft, setDraft] = useState<Memo>(
    () =>
      existing ?? {
        id,
        category: (props.category as MemoCategory) ?? 'common',
        houseId: (props.houseId as string) ?? null,
        title: '',
        body: '',
        date: null,
        done: false,
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
  );
  const save = () => {
    if (!draft.title.trim() && !draft.body.trim()) {
      close();
      return;
    }
    s.update((d) => {
      const i = d.memos.findIndex((m) => m.id === id);
      const m = { ...draft, updatedAt: Date.now() };
      if (i >= 0) d.memos[i] = m;
      else d.memos.unshift(m);
    }, '保存しました');
    close();
  };
  return (
    <Sheet
      title={existing ? 'メモを編集' : '新しいメモ'}
      onClose={save}
      foot={
        <>
          {existing && (
            <button className="btn danger" onClick={() => { s.update((d) => void (d.memos = d.memos.filter((m) => m.id !== id))); close(); s.notify('メモを削除しました', { label: '元に戻す', run: s.undo }); }}>
              <Icon name="trash" />
              削除
            </button>
          )}
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </>
      }
    >
      <div className="chips">
        {(Object.keys(MEMO_CAT) as MemoCategory[]).map((k) => (
          <button key={k} className={`chip ${draft.category === k ? 'tier-safe' : ''}`} style={{ border: 0, height: 30 }} aria-pressed={draft.category === k ? 'true' : 'false'} onClick={() => setDraft({ ...draft, category: k })}>
            {MEMO_CAT[k].label}
          </button>
        ))}
      </div>
      {s.data.houses.length > 0 && (
        <div className="field">
          <span>関係する住宅</span>
          <div className="inp">
            <select aria-label="関係する住宅" value={draft.houseId ?? ''} onChange={(e: Event) => setDraft({ ...draft, houseId: (e.target as HTMLSelectElement).value || null })}>
              <option value="">なし（共通）</option>
              {s.data.houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name || '名称未設定'}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <label className="field">
        <span>タイトル</span>
        <div className="inp">
          <input className="text" id="memo-title" value={draft.title} placeholder="例: B社 2回目の打ち合わせ" onInput={(e: Event) => setDraft({ ...draft, title: (e.target as HTMLInputElement).value })} />
        </div>
      </label>
      <label className="field fill">
        <span>内容</span>
        <textarea className="inp fill" id="memo-body" rows={5} value={draft.body} placeholder="気になった点、確認したいこと（？を付けると確認事項に分類されます）" onInput={(e: Event) => setDraft({ ...draft, body: (e.target as HTMLTextAreaElement).value })} />
      </label>
      <div className="grid2">
        <label className="field">
          <span>日付（予定など）</span>
          <div className="inp">
            <input type="date" id="memo-date" value={draft.date ?? ''} onInput={(e: Event) => setDraft({ ...draft, date: (e.target as HTMLInputElement).value || null })} />
          </div>
        </label>
        <Toggle label="上に固定" value={draft.pinned} onChange={(v) => setDraft({ ...draft, pinned: v })} />
      </div>
    </Sheet>
  );
}

/* ---------- 夫婦で共有 ---------- */
const inviteMessage = (name: string, link: string) => `${name ? `${name}から` : ''}ほっぽさんの家計の共有の招待です。リンクを開いて「参加する」を押してね（ホーム画面のアプリで使うときは、開いた画面のまま「ホーム画面に追加」）\n${link}`;

function SharePanel() {
  const s = useStore();
  const sh = s.share;
  const [paste, setPaste] = useState<string | null>(null);
  const when = (t: number) => new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  if (!sh.available)
    return (
      <div className="stack" style={{ gap: 8 }}>
        <MascotSays mood="normal" pose="think" size={48} text="このブラウザでは自動の共有が使えないよ" />
        <div className="card stack" style={{ gap: 4 }}>
          <span className="label">いま使える方法</span>
          <div className="micro">「データ」の「書き出す・送る」で LINE などに送り、相手は「ファイルを読む」で取り込みます（自動ではそろいません）。</div>
        </div>
      </div>
    );
  const room = sh.kind === 'room';
  const last = sh.last ? `${when(sh.last.at)}　${sh.last.mine ? 'あなた' : `${sh.last.name || '相手'}さん`}` : 'まだ共有していません';
  const nameField = <TextField label="あなたの呼び名（相手の通知に出ます）" value={sh.myName} placeholder="例: しょうた" onChange={s.setMyName} />;
  const sendInvite = async () => {
    if (!sh.invite) return;
    const msg = inviteMessage(sh.myName, sh.invite);
    const r = await shareLink(msg.split('\n')[0], sh.invite);
    if (r === 'shared' || r === 'cancelled') return;
    if (await copyText(sh.invite)) s.notify('招待リンクをコピーしました。LINE に貼り付けて送ってください');
  };
  const pasteJoin = async () => {
    const p = await s.peekInvite(paste ?? '');
    if (!p) return s.notify('招待リンクを読み取れませんでした。届いたリンクをそのまま貼り付けてください');
    s.open({ kind: 'joinRoom', props: { link: paste ?? '' } });
    setPaste(null);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <MascotSays mood="happy" pose="wave" size={44} text={sh.on ? '2人の変更は自動でそろうよ' : room ? '招待リンクを LINE で送ると、2人のアプリがいつも同じになるよ' : '共有すると、2人の画面がいつも同じになるよ'} />
      <div className="card stack" style={{ gap: 4 }}>
        <div className="row between">
          <span className="label">夫婦で共有</span>
          <span className={`chip ${sh.on ? 'tier-safe' : ''}`}>{sh.on ? (sh.status === 'ok' ? '共有中' : sh.status === 'too-big' ? 'データが大きすぎます' : 'つながりません') : 'オフ'}</span>
        </div>
        <div className="micro">最終更新：{last}</div>
      </div>
      {room && nameField}
      {sh.on ? (
        <>
          {room && sh.invite && (
            <div className="grid2">
              <a className="btn primary" href={lineShareUrl(inviteMessage(sh.myName, sh.invite))} target="_blank" rel="noopener noreferrer">
                LINEで招待
              </a>
              <button className="btn" onClick={sendInvite}>
                <Icon name="copy" />
                ほかの方法で送る
              </button>
            </div>
          )}
          <Toggle label="相手が更新したら知らせる" value={sh.notify} onChange={s.setShareNotify} />
          <div className="micro">開いている間は数秒で、閉じていた間の更新は次に開いたときに知らせます（スマートフォンのプッシュ通知ではありません）。</div>
          <button className="btn" onClick={() => s.open({ kind: 'confirm', props: { title: '共有をやめますか？', body: room ? 'この端末だけ共有から抜けます。いまのデータはこの端末に残ります。もう一度つなぐには招待リンクが必要です。' : 'いまのデータはこの端末に残ります。', ok: 'やめる', danger: true, run: s.stopShare } })}>
            共有をやめる
          </button>
        </>
      ) : room ? (
        <>
          <button className="btn primary" onClick={() => s.startShare('mine')}>
            このデータで共有を始める
          </button>
          {paste == null ? (
            <button className="btn" onClick={() => setPaste('')}>
              届いた招待リンクで参加する
            </button>
          ) : (
            <div className="row" style={{ gap: 6 }}>
              <input className="inp grow" placeholder="招待リンクを貼り付け" value={paste} onInput={(e: Event) => setPaste((e.target as HTMLInputElement).value)} />
              <button className="btn primary small" onClick={pasteJoin}>
                確かめる
              </button>
            </div>
          )}
        </>
      ) : sh.last ? (
        <div className="grid2">
          <button className="btn primary" onClick={() => s.startShare('theirs')}>
            共有データを使う
          </button>
          <button className="btn" onClick={() => s.open({ kind: 'confirm', props: { title: '自分のデータで共有しますか？', body: '共有されているデータを、この端末のデータで置き換えます。', ok: '置き換える', danger: true, run: () => s.startShare('mine') } })}>
            自分のデータで上書き
          </button>
        </div>
      ) : (
        <button className="btn primary" onClick={() => s.startShare('mine')}>
          このデータで共有を始める
        </button>
      )}
      <div className="micro">
        {room
          ? 'データは暗号化して保存し、鍵は招待リンクにだけ入ります（TABI・家賃デスと同じ同期サービス）。リンクを知っている人は編集できるので、相手以外には送らないでください。'
          : '相手にはこのアプリ（claude.ai のアーティファクト）を「編集できる」権限で共有してください。見るだけの権限では相手は変更できません。'}
      </div>
    </div>
  );
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <label className="field">
      <span>{label}</span>
      <input className="inp" value={v} placeholder={placeholder} maxLength={20} onInput={(e: Event) => setV((e.target as HTMLInputElement).value)} onBlur={() => onChange(v)} onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && onChange(v)} />
    </label>
  );
}

/** 招待リンクを開いたとき: だれの共有か確かめて参加する */
export function JoinRoomSheet({ close, props }: SheetProps) {
  const s = useStore();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof s.peekInvite>> | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const link = (props.link as string) ?? '';
  useEffect(() => {
    let alive = true;
    s.peekInvite(link).then((r) => alive && setInfo(r ?? 'error'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);
  const done = () => {
    s.clearPendingInvite();
    close();
  };
  return (
    <Sheet title="共有の招待" onClose={done}>
      {info === 'loading' ? (
        <MascotSays mood="normal" pose="think" size={48} text="招待を確かめているよ…" />
      ) : info === 'error' || info == null ? (
        <>
          <MascotSays mood="worry" pose="think" size={48} text="招待を読み取れなかったよ" />
          <div className="micro">リンクが途中で切れていないか、インターネットにつながっているか確かめてください。相手が共有をやめた場合は、新しい招待リンクをもらってください。</div>
          <button className="btn" onClick={done}>
            閉じる
          </button>
        </>
      ) : (
        <>
          <MascotSays mood="happy" pose="wave" size={48} text={`${info.name ? `${info.name}さん` : '相手'}の家計に参加する？`} />
          <div className="card stack" style={{ gap: 4 }}>
            <div className="micro">参加すると、この端末のデータが共有のデータ（住宅{info.houses}件など）に置き換わり、これからは2人の変更が自動でそろいます。直後なら「元に戻す」で戻せます。</div>
          </div>
          <TextField label="あなたの呼び名（相手の通知に出ます）" value={s.share.myName} placeholder="例: しほ" onChange={s.setMyName} />
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await s.joinInvite(info.invite);
              setBusy(false);
              if (ok) done();
            }}
          >
            参加する
          </button>
          <div className="micro">iPhone でホーム画面のアプリとして使う場合は、参加したあと、この画面のまま共有ボタン →「ホーム画面に追加」をしてください（Safari とホーム画面のアプリはデータの保存場所が別です）。すでに追加したアプリでは「データと設定 → 共有 → 届いた招待リンクで参加する」に貼り付けます。</div>
        </>
      )}
    </Sheet>
  );
}

/* ---------- 設定・データ ---------- */
export function SettingsSheet({ close }: SheetProps) {
  const s = useStore();
  const [page, setPage] = useState<'data' | 'share' | 'src' | 'about'>('data');
  const [backups, setBackups] = useState<Backup[]>([]);
  const [paste, setPaste] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  useEffect(() => {
    listBackups().then(setBackups);
  }, []);
  const json = () => JSON.stringify(toExport(s.data), null, 1);
  const fname = `hoppo-${new Date().toISOString().slice(0, 10)}.json`;
  const importText = (text: string) => {
    try {
      const d = migrate(JSON.parse(text));
      s.open({ kind: 'confirm', props: { title: 'データを読み込みますか？', body: `いまのデータを、読み込んだデータ（住宅${d.houses.length}件・メモ${d.memos.length}件）に置き換えます。直後なら「元に戻す」で戻せます。`, ok: '読み込む', run: () => s.replace({ ...d, sample: false }, '読み込みました') } });
    } catch (e) {
      s.notify(e instanceof DataError ? e.message : '読み込めませんでした。ほっぽさんで書き出したJSONか確認してください');
    }
  };
  const storageLabel = s.storage === 'indexeddb' ? 'この端末（IndexedDB）' : s.storage === 'localstorage' ? 'この端末（localStorage）' : '保存できない環境（閉じると消えます）';
  const cloudLabel = { off: '—', on: 'あなたのアカウントにも保存中（本人だけが読み書きできる領域）', error: 'アカウントへの保存に失敗', 'too-big': 'データが大きいためアカウントには保存していません' }[s.cloud];
  return (
    <Sheet title="データと設定" onClose={close}>
      <Seg value={page} onChange={setPage} options={[{ value: 'data', label: 'データ' }, { value: 'share', label: '共有' }, { value: 'src', label: '出典' }, { value: 'about', label: 'アプリ' }]} />
      {page === 'share' && <SharePanel />}
      {page === 'data' && (
        <>
          <div className="card stack" style={{ gap: 4 }}>
            <div className="row between">
              <span className="label">保存先</span>
              <span className="chip tier-safe">{s.saveState === 'saved' ? '保存済み' : s.saveState === 'saving' ? '保存中' : '保存に失敗'}</span>
            </div>
            <div className="micro">{storageLabel}</div>
            {s.cloud !== 'off' && <div className="micro">{cloudLabel}</div>}
          </div>
          <div className="grid2">
            <button
              className="btn"
              onClick={async () => {
                // スマートフォンでは共有メニュー（LINE・AirDrop など）で配偶者に送れる。使えない環境ではファイルに保存
                const sh = await shareFile(fname, json());
                if (sh === 'shared' || sh === 'cancelled') return;
                const r = await saveFile(fname, json());
                if (r === 'saved') s.notify('ファイルに書き出しました');
                else if (r === 'unavailable') setExportText(json());
              }}
            >
              <Icon name="download" />
              書き出す・送る
            </button>
            <button
              className="btn"
              onClick={async () => {
                const ok = await copyText(json());
                if (ok) s.notify('データをコピーしました。メモアプリなどに貼り付けて保管できます');
                else setExportText(json());
              }}
            >
              <Icon name="copy" />
              コピー
            </button>
            <label className="btn" style={{ position: 'relative' }}>
              <Icon name="upload" />
              ファイルを読む
              <input type="file" accept="application/json,.json" style={{ position: 'absolute', inset: 0, opacity: 0 }} onChange={(e: Event) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) f.text().then(importText);
                (e.target as HTMLInputElement).value = '';
              }} />
            </label>
            <button className="btn" onClick={() => setPaste('')}>
              <Icon name="memo" />
              貼り付けて読む
            </button>
          </div>
          {exportText != null && (
            <label className="field">
              <span>この内容を選んでコピーしてください</span>
              <textarea className="inp" rows={4} readOnly value={exportText} onFocus={(e: FocusEvent) => (e.target as HTMLTextAreaElement).select()} />
            </label>
          )}
          {paste != null && (
            <div className="stack" style={{ gap: 6 }}>
              <textarea className="inp" rows={4} placeholder="書き出したデータ（JSON）を貼り付け" value={paste} onInput={(e: Event) => setPaste((e.target as HTMLTextAreaElement).value)} />
              <button className="btn primary small" onClick={() => importText(paste)}>
                読み込む
              </button>
            </div>
          )}
          <div className="row between">
            <span className="label">自動バックアップ（1日1回・5件）</span>
          </div>
          <div className="list">
            {backups.slice(0, 3).map((b) => (
              <button key={b.at} className="item" style={{ minHeight: 40 }} onClick={() => s.open({ kind: 'confirm', props: { title: 'バックアップに戻しますか？', body: `${new Date(b.at).toLocaleString('ja-JP')} の状態に戻します。`, ok: '戻す', run: () => s.replace(migrate(b.data), 'バックアップに戻しました') } })}>
                <Icon name="undo" />
                <span className="grow">{new Date(b.at).toLocaleString('ja-JP')}</span>
                <span className="micro">戻す</span>
              </button>
            ))}
            {backups.length === 0 && <div className="micro">まだありません</div>}
          </div>
          <button className="btn danger" onClick={() => s.open({ kind: 'confirm', props: { title: 'すべて初期化しますか？', body: 'ライフプラン・住宅・メモをすべて消します。自動バックアップは残ります。', ok: '初期化する', danger: true, run: () => { s.replace({ ...emptyData(nowYM()), sample: false }, '初期化しました'); close(); } } })}>
            すべて初期化
          </button>
        </>
      )}
      {page === 'src' && (
        <div className="stack" style={{ gap: 0 }}>
          <div className="micro">計算の初期値と制度の数値の出典（確認日 {CHECKED}）。統計＝公的統計、制度＝法令・制度、市場＝変動する実勢、目安＝一般的な目安。</div>
          {SOURCES.map((x) => (
            <div key={x.id} className="src">
              <div className="row" style={{ gap: 6 }}>
                <span className="kind">{{ stat: '統計', law: '制度', market: '市場', guide: '目安' }[x.kind]}</span>
                <a href={x.url} target="_blank" rel="noopener noreferrer" className="ellipsis">
                  {x.title}
                </a>
              </div>
              <div className="micro">
                {x.org}・公表 {x.published}
              </div>
              <div className="micro" style={{ color: 'var(--ink-2)' }}>
                {x.note}
              </div>
            </div>
          ))}
        </div>
      )}
      {page === 'about' && (
        <div className="stack micro" style={{ lineHeight: 1.7, gap: 8 }}>
          <div className="card flat">
            <b style={{ color: 'var(--ink)', fontSize: 'var(--fs-m)' }}>ほっぽさん</b>
            <br />
            住宅購入とライフプランを一緒に考えるアプリ。計算はすべてこの端末の中で行います。入力したデータは、「共有」を始めた場合だけ暗号化して共有の場所に置きます
            {s.cloud === 'on' ? '（claude.ai で開いている場合は、あなたのアカウントの本人専用の領域にも保存します）' : ''}。
            <br />
            版 <b className="num">{BUILD}</b>
            {BUILT_AT ? `（${BUILT_AT}）` : ''}
          </div>
          <button
            className="btn small"
            onClick={async () => {
              const b = await latestBuild();
              if (!b) return s.notify('新しい版を確かめられませんでした（オフラインか、claude.ai で開いています）');
              if (b === BUILD) return s.notify('最新の版です');
              s.notify('新しい版を読み込みます');
              void applyUpdate();
            }}
          >
            新しい版を確かめる
          </button>
          <div>
            <b style={{ color: 'var(--ink)' }}>ホーム画面に追加（iPhone）</b>
            <br />
            Safariで開き、共有ボタン →「ホーム画面に追加」。オフラインでも使えます（GitHub Pages版）。アプリの中身は自動で新しい版になりますが、ホーム画面のアイコンの絵は追加したときのままです（変えるには追加し直します）。
          </div>
          <div>
            <b style={{ color: 'var(--ink)' }}>ご注意</b>
            <br />
            表示する金額は、入力と前提に基づく試算です。住宅ローンの審査結果、税制の適用、運用成果を保証するものではありません。大きな判断の前には、金融機関・税理士・FPに確認してください。
          </div>
          <div>メモの「ワンタップ整理」は端末内のルールで処理し、AIや外部サービスは使いません。</div>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- かんたん入力（編集シートと同じセクションを順番に案内する） ---------- */
const WIZARD: { key: string; title: string; el: () => ReactElement }[] = [
  { key: 'income', title: '収入', el: () => <IncomeSection /> },
  { key: 'savings', title: '貯蓄・借入', el: () => <SavingsSection /> },
  { key: 'living', title: '生活費', el: () => <LivingSection /> },
  { key: 'housing', title: '住まい・購入時期', el: () => <HousingSection initial="now" /> },
  { key: 'children', title: '子供・教育', el: () => <ChildrenSection /> },
  { key: 'work', title: '育休・時短', el: () => <WorkSection /> },
  { key: 'invest', title: 'NISA・積立', el: () => <InvestSection /> },
  { key: 'loan', title: 'ローンの条件', el: () => <LoanTermsSection initial="who" /> },
];

export function WizardSheet({ close }: SheetProps) {
  const s = useStore();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (i: number) => {
    setDir(i >= step ? 1 : -1);
    setStep(Math.max(0, Math.min(WIZARD.length - 1, i)));
  };
  const cur = WIZARD[step];
  const last = step === WIZARD.length - 1;
  // 一般的な入力項目の入れ忘れ: 1回目の「次へ」で知らせ、もう一度押すとそのまま進める
  const STEP_SHEET: Record<string, string> = { income: 'income', living: 'living', housing: 'housing', children: 'children' };
  const miss = (s.vm?.missing ?? []).filter((m) => m.sheet === STEP_SHEET[cur.key]);
  const [warned, setWarned] = useState(-1);
  const next = () => {
    if (miss.length && warned !== step) {
      setWarned(step);
      s.notify(`未入力: ${miss.map((m) => m.label).join('、')}。ない場合は 0 を入れてください（もう一度押すと進みます）`);
      return;
    }
    go(step + 1);
  };
  return (
    <Sheet
      title={`かんたん入力 ${step + 1}/${WIZARD.length}・${cur.title}`}
      onClose={close}
      preview
      foot={
        <>
          {step > 0 && (
            <button className="btn" onClick={() => go(step - 1)}>
              戻る
            </button>
          )}
          {!last ? (
            <button className="btn primary" onClick={next}>
              {miss.length && warned === step ? 'このまま次へ' : `次へ（${WIZARD[step + 1].title}）`}
            </button>
          ) : (
            <button className="btn primary" onClick={() => { s.closeAll(); s.setTab('home'); }}>
              結果を見る
            </button>
          )}
        </>
      }
    >
      <Steps n={WIZARD.length} at={step} onPick={go} />
      <Switcher k={cur.key} dir={dir}>
        {cur.el()}
      </Switcher>
    </Sheet>
  );
}
