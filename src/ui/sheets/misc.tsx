import React, { useEffect, useState } from 'react';
import { emptyData, emptyPerson, newChild, uid } from '../../engine/defaults';
import { ASSUME, CHECKED, SOURCES } from '../../engine/reference';
import type { Memo, MemoCategory } from '../../engine/types';
import { ageAt, nowYM, ymYear } from '../../engine/ym';
import { listBackups, type Backup } from '../../storage/db';
import { copyText, saveFile } from '../../storage/platform';
import { DataError, migrate, toExport } from '../../storage/schema';
import { FAIL_TEXT, Kpi, tierNote, TierChip } from '../components/bits';
import { MoneyField, NumField, Seg, Toggle, YMField } from '../components/fields';
import { Sheet, Steps } from '../components/Sheet';
import { pct, yen, ymText } from '../format';
import { Icon } from '../icons';
import { MEMO_CAT } from '../screens/Memo';
import { useStore } from '../store';
import type { SheetProps } from './plan';

const THIS_YEAR = ymYear(nowYM());

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

/* ---------- 推奨額の根拠 ---------- */
export function BasisSheet({ close }: SheetProps) {
  const s = useStore();
  const vm = s.vm;
  const [page, setPage] = useState<'sum' | 'tiers' | 'bank' | 'assume'>('sum');
  if (!vm) return null;
  const self = vm.people[0];
  const age = (ym: number) => (self ? `（${self.name} ${ageAt(self.birthYM, ym)}歳）` : '');
  const di = vm.downInfo;
  return (
    <Sheet title="推奨額の根拠" onClose={close} foot={<button className="btn primary" onClick={close}>閉じる</button>}>
      <Seg value={page} onChange={setPage} options={[{ value: 'sum', label: '結論' }, { value: 'tiers', label: '3つの段階' }, { value: 'bank', label: '審査の目安' }, { value: 'assume', label: `仮置き ${vm.assumed.length}` }]} />
      {!vm.ready ? (
        <div className="empty">{vm.blocking.join('、')}を入力してください</div>
      ) : page === 'sum' ? (
        <>
          <div className="card grid2">
            <Kpi label="住宅取得総額（標準）" v={vm.rec.total} sub={`物件 ${yen(vm.rec.price)}＋諸費用 ${yen(vm.rec.total - vm.rec.price)}`} />
            <Kpi label="借入額" v={vm.rec.loan} sub={`自己資金 ${yen(vm.rec.down)}`} />
          </div>
          {di && (
            <div className="card flat micro" style={{ lineHeight: 1.7 }}>
              自己資金 = 購入直前の現金の見込み {yen(di.cashBefore)}
              {di.gift ? ` ＋ 援助 ${yen(di.gift)}` : ''}
              {di.moving ? ` − 引越し等 ${yen(di.moving)}` : ''} − 手元に残す予備資金
              {s.data.plan.housing.downMode === 'auto' ? ` ${yen(Math.max(0, di.cashBefore + di.gift - di.moving - vm.rec.down))}` : ''}。
              {s.data.plan.housing.downMode === 'manual' ? '（手入力の金額を使用）' : ''}
            </div>
          )}
          <div className="card stack micro" style={{ gap: 4, lineHeight: 1.6 }}>
            <b style={{ color: 'var(--ink)' }}>計算の手順</b>
            <span>1. 収入・生活費・教育費・保険・投資・イベントから、{ymText(vm.start)}以降の家計を毎月計算</span>
            <span>2. {ymText(vm.purchaseYM)}に購入し、家賃を住宅ローン・固定資産税・保険・修繕費に切り替え</span>
            <span>3. 借入額を1万円単位で変えながら、退職まで現金が予備資金を保てるか、{s.data.plan.assumptions.endAge}歳まで資金が尽きないかを確認</span>
            <span>4. 金利上昇・収入減を加えた3段階の条件を満たす上限を探し、「標準」を適正予算として表示</span>
            <span>5. 審査の目安（①）を超える場合は、そちらを上限にする</span>
          </div>
          {vm.rec.bankBinds && <div className="micro neg">家計の上では借りられても、審査の目安（{yen(vm.bank?.amount)}）が上限になっています。</div>}
        </>
      ) : page === 'tiers' ? (
        <>
          {(['safe', 'standard', 'caution'] as const).map((k) => {
            const t = vm.tiers![k];
            const b = t.binding;
            return (
              <div key={k} className="card stack" style={{ gap: 4 }}>
                <div className="row between">
                  <TierChip tier={k} />
                  <b className="num">{t.ok ? `〜${yen(t.total)}` : '条件を満たせない'}</b>
                </div>
                <div className="micro">{tierNote(k, s.data.plan.assumptions.reserveMonths)}</div>
                {t.ok && <div className="micro">借入 {yen(t.maxLoan)}・自己資金 {yen(t.down)}</div>}
                {b && (
                  <div className="micro neg">
                    {t.ok ? 'これを超えると' : 'いまの計画では'} {ymText(b.ym)}
                    {age(b.ym)}に{FAIL_TEXT[b.kind]}（{b.driver}）
                  </div>
                )}
              </div>
            );
          })}
          <div className="micro">「標準」「安心」は、老後に介護費用の平均（1人約542万円・生命保険文化センター）を残せることも条件にしています。</div>
        </>
      ) : page === 'bank' ? (
        <>
          <div className="card grid2">
            <Kpi label="① 借りられる目安" v={vm.bank!.amount} />
            <Kpi label="審査に使う年収（額面）" v={vm.bank!.gross} sub={s.data.plan.housing.loan.borrower === 'pair' ? '夫婦の合算' : '本人のみ'} />
          </div>
          <div className="card flat micro" style={{ lineHeight: 1.7 }}>
            年収 × 返済負担率 {pct(vm.bank!.ratio, 0)}（フラット35: 年収400万円未満30%・以上35%）から既存の借入の返済（年{yen(vm.bank!.debtAnnual)}）を引いた額を、審査金利 {pct(vm.bank!.rate, 2)}・{vm.bank!.years}年（完済80歳まで）で借りた場合の元金です。金融機関の実際の審査結果を保証するものではありません。
          </div>
        </>
      ) : (
        <>
          <div className="card row between">
            <span className="label">推奨額の信頼度</span>
            <b className="num" style={{ fontSize: 'var(--fs-xl)' }}>
              {vm.confidence.level}
              <small className="micro"> {vm.confidence.score}点</small>
            </b>
          </div>
          {vm.assumed.length === 0 ? (
            <div className="empty">仮置きした項目はありません</div>
          ) : (
            <div className="list">
              {vm.assumed.slice(0, 8).map((a) => (
                <div key={a.key} className="item" style={{ minHeight: 0 }}>
                  <span className={`chip ${a.impact === 'high' ? 'tier-danger' : a.impact === 'mid' ? 'tier-caution' : ''}`}>{a.impact === 'high' ? '影響大' : a.impact === 'mid' ? '影響中' : '影響小'}</span>
                  <div className="grow">
                    <div className="t ellipsis" style={{ fontSize: 'var(--fs-s)' }}>
                      {a.label}
                    </div>
                    <div className="micro ellipsis">{a.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
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
    </Sheet>
  );
}

/* ---------- ローン条件 ---------- */
export function LoanTermsSheet({ close, props }: SheetProps) {
  const s = useStore();
  const h = s.data.plan.housing;
  const t = h.loan;
  const [page, setPage] = useState<'amount' | 'rate' | 'how'>(props.focus === 'desired' ? 'amount' : 'rate');
  const set = (fn: (x: typeof t) => void) => s.update((d) => fn(d.plan.housing.loan));
  return (
    <Sheet title="ローンの条件" onClose={close} foot={<button className="btn primary" onClick={close}>完了</button>}>
      <Seg value={page} onChange={setPage} options={[{ value: 'amount', label: '借入額' }, { value: 'rate', label: '金利' }, { value: 'how', label: '返し方' }]} />
      {page === 'amount' && (
        <>
          <MoneyField label="③ 希望の借入額" hint="空欄なら推奨額で試算" value={h.desiredLoan} onChange={(v) => s.update((d) => void (d.plan.housing.desiredLoan = v))} />
          <Seg label="借りる人" value={t.borrower} onChange={(v) => set((x) => void (x.borrower = v))} options={[{ value: 'self', label: '本人のみ' }, { value: 'pair', label: '夫婦（ペア・収入合算）' }]} />
          <button className="item" onClick={() => s.open({ kind: 'housing' })}>
            <span className="ic">
              <Icon name="calendar" />
            </span>
            <div className="grow">
              <div className="t">購入時期・自己資金</div>
              <div className="micro">
                {h.purchaseYM ? ymText(h.purchaseYM) : '未設定'}・{h.downMode === 'auto' ? '予備資金を残して自動' : `自己資金 ${yen(h.downPayment)}`}
              </div>
            </div>
            <Icon name="right" />
          </button>
        </>
      )}
      {page === 'rate' && (
        <>
          <Seg label="金利のタイプ" value={t.rateType} onChange={(v) => set((x) => void ((x.rateType = v), (x.rate = v === 'fixed' ? ASSUME.fixedRate : v === 'variable' ? ASSUME.variableRate : x.rate)))} options={[{ value: 'variable', label: '変動' }, { value: 'fixedPeriod', label: '固定期間選択' }, { value: 'fixed', label: '全期間固定' }]} />
          <NumField label="借入時の金利（年）" unit="%" scale={100} nullable={false} min={0} max={15} value={t.rate} onChange={(v) => set((x) => void (x.rate = v ?? 0))} />
          {t.rateType === 'fixedPeriod' && (
            <div className="grid2">
              <NumField label="固定の期間" unit="年" nullable={false} min={1} max={35} value={t.fixedYears} onChange={(v) => set((x) => void (x.fixedYears = Math.round(v ?? 10)))} />
              <NumField label="固定期間後の金利" unit="%" scale={100} nullable={false} value={t.afterRate} onChange={(v) => set((x) => void (x.afterRate = v ?? 0))} />
            </div>
          )}
          <div className="card flat micro" style={{ lineHeight: 1.7 }}>
            2026年10月の目安: 変動は低い銀行で1.04〜1.28%程度、フラット35（21〜35年）は3.83%で過去最高。変動金利の将来は「金利・収入の変化」と、推奨額の3段階（+1%・+2%）で確かめます。（確認日 {CHECKED}）
          </div>
        </>
      )}
      {page === 'how' && (
        <>
          <NumField label="返済期間" unit="年" nullable={false} min={5} max={50} value={t.years} onChange={(v) => set((x) => void (x.years = Math.round(v ?? 35)))} hint="完済80歳を超える分は短くして計算" />
          <Seg label="返済方式" value={t.method} onChange={(v) => set((x) => void (x.method = v))} options={[{ value: 'annuity', label: '元利均等（毎月同じ）' }, { value: 'equalPrincipal', label: '元金均等（だんだん減る）' }]} />
          <NumField label="ボーナス返済の割合" unit="%" scale={100} nullable={false} min={0} max={50} value={t.bonusShare} onChange={(v) => set((x) => void (x.bonusShare = v ?? 0))} hint="借入額のうち。0%でなし" />
          <NumField label="審査の目安に使う金利" unit="%" scale={100} nullable={false} min={0} max={10} value={t.screeningRate} onChange={(v) => set((x) => void (x.screeningRate = v ?? 0.035))} />
        </>
      )}
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

/* ---------- 設定・データ ---------- */
export function SettingsSheet({ close }: SheetProps) {
  const s = useStore();
  const [page, setPage] = useState<'data' | 'src' | 'about'>('data');
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
      <Seg value={page} onChange={setPage} options={[{ value: 'data', label: 'データ' }, { value: 'src', label: '出典' }, { value: 'about', label: 'このアプリ' }]} />
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
                const r = await saveFile(fname, json());
                if (r === 'saved') s.notify('ファイルに書き出しました');
                else if (r === 'unavailable') setExportText(json());
              }}
            >
              <Icon name="download" />
              書き出す
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
            住宅購入とライフプランを一緒に考えるアプリ。計算はすべてこの端末の中で行い、入力したデータを外部に送りません
            {s.cloud === 'on' ? '（claude.ai で開いている場合は、あなたのアカウントの本人専用の領域にも保存します）' : ''}。
          </div>
          <div>
            <b style={{ color: 'var(--ink)' }}>ホーム画面に追加（iPhone）</b>
            <br />
            Safariで開き、共有ボタン →「ホーム画面に追加」。オフラインでも使えます（GitHub Pages版）。
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

/* ---------- かんたん入力 ---------- */
export function WizardSheet({ close }: SheetProps) {
  const s = useStore();
  const [step, setStep] = useState(0);
  const p = s.data.plan;
  const up = (fn: (pl: typeof p) => void) => s.update((d) => void (fn(d.plan), (d.sample = false)));
  const living = p.living.reduce((t, x) => t + x.monthly, 0);
  const setLiving = (v: number | null) =>
    up((pl) => {
      if (v == null) return;
      if (pl.living.length <= 1) pl.living = [{ id: pl.living[0]?.id ?? uid('liv'), name: '生活費（合計）', icon: 'basket', monthly: v, kind: 'variable' }];
    });
  const titles = ['世帯', '収入', '貯蓄と生活費', '予定'];
  return (
    <Sheet
      title="かんたん入力"
      onClose={close}
      foot={
        <>
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              戻る
            </button>
          )}
          {step < titles.length - 1 ? (
            <button className="btn primary" onClick={() => setStep(step + 1)}>
              次へ
            </button>
          ) : (
            <button className="btn primary" onClick={() => { close(); s.setTab('home'); }}>
              結果を見る
            </button>
          )}
        </>
      }
    >
      <Steps n={titles.length} at={step} />
      <div className="label" style={{ fontWeight: 700 }}>
        {step + 1}. {titles[step]}
      </div>
      {step === 0 && (
        <>
          <YMField label="あなたの生まれた年月" value={p.self.birthYM} onChange={(v) => up((pl) => void (pl.self.birthYM = v))} from={THIS_YEAR - 80} to={THIS_YEAR - 15} />
          <Toggle label="配偶者（パートナー）と一緒に計算する" value={!!p.spouse} onChange={(v) => up((pl) => void (pl.spouse = v ? pl.spouse ?? { ...emptyPerson('spouse') } : null))} />
          {p.spouse && <YMField label="配偶者の生まれた年月" value={p.spouse.birthYM} onChange={(v) => up((pl) => void (pl.spouse!.birthYM = v))} from={THIS_YEAR - 80} to={THIS_YEAR - 15} />}
        </>
      )}
      {step === 1 && (
        <>
          <div className="grid2">
            <MoneyField label="あなたの手取り月収" value={p.self.netMonthly} onChange={(v) => up((pl) => void (pl.self.netMonthly = v))} />
            <MoneyField label="賞与（年・手取り）" value={p.self.bonusNetAnnual} onChange={(v) => up((pl) => void (pl.self.bonusNetAnnual = v))} />
          </div>
          {p.spouse && (
            <div className="grid2">
              <MoneyField label="配偶者の手取り月収" hint="なしは0" value={p.spouse.netMonthly} onChange={(v) => up((pl) => void (pl.spouse!.netMonthly = v))} />
              <MoneyField label="賞与（年・手取り）" value={p.spouse.bonusNetAnnual} onChange={(v) => up((pl) => void (pl.spouse!.bonusNetAnnual = v))} />
            </div>
          )}
          <div className="micro">額面年収・昇給・退職金・年金は、あとで「ライフプラン → 収入」から入力できます（未入力は推計）。</div>
        </>
      )}
      {step === 2 && (
        <>
          <div className="grid2">
            <MoneyField label="あなたの現金・預金" value={p.self.cash} onChange={(v) => up((pl) => void ((pl.self.cash = v), (pl.baseYM = nowYM())))} />
            {p.spouse && <MoneyField label="配偶者の現金・預金" value={p.spouse.cash} onChange={(v) => up((pl) => void ((pl.spouse!.cash = v), (pl.baseYM = nowYM())))} />}
          </div>
          <MoneyField label="毎月の生活費（合計）" hint="家賃・保険・投資の積立を除く" value={living || null} onChange={setLiving} />
          <MoneyField label="いまの家賃（月）" unit="yen" value={p.housing.rentMonthly} onChange={(v) => up((pl) => void (pl.housing.rentMonthly = v))} />
          {p.living.length > 1 && <div className="micro">生活費は項目ごとに入力済みです（合計 {yen(living)}）。</div>}
        </>
      )}
      {step === 3 && (
        <>
          <YMField label="家を買う時期" value={p.housing.purchaseYM} onChange={(v) => up((pl) => void (pl.housing.purchaseYM = v))} from={THIS_YEAR} to={THIS_YEAR + 20} />
          <Seg
            label="子供の予定"
            value={p.children.length}
            onChange={(n) =>
              up((pl) => {
                pl.assumptions.childrenConfirmed = true;
                while (pl.children.length < n) pl.children.push(newChild(pl.children.length ? pl.children[pl.children.length - 1].birthYM + 24 : nowYM() + 18, pl.children.length + 1));
                pl.children = pl.children.slice(0, n);
              })
            }
            options={[0, 1, 2, 3].map((n) => ({ value: n, label: n === 0 ? 'なし' : `${n}人` }))}
          />
          {p.children.map((c, i) => (
            <YMField key={c.id} label={`${c.name}の誕生（予定）`} nullable={false} value={c.birthYM} onChange={(v) => v != null && up((pl) => void (pl.children[i].birthYM = v))} from={THIS_YEAR - 20} to={THIS_YEAR + 15} />
          ))}
          <div className="micro">子供は公立中心・国公立大学で計算します。育休・時短・進路はあとで変えられます。</div>
        </>
      )}
    </Sheet>
  );
}

