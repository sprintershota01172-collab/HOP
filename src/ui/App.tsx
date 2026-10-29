import React, { useRef } from 'react';
import { SheetState } from './components/Sheet';
import { Switcher } from './components/Switcher';
import type { ReactElement } from 'react';
import { Icon } from './icons';
import { Compare } from './screens/Compare';
import { FP } from './screens/FP';
import { Home } from './screens/Home';
import { Loan } from './screens/Loan';
import { Memo } from './screens/Memo';
import { HouseDetailSheet, HouseEditSheet, WeightsSheet } from './sheets/house';
import { BasisSheet, ConfirmSheet, FpBasisSheet, LoanTermsSheet, MemoEditSheet, MissingSheet, PrepayEditSheet, SaleSheet, SettingsSheet, WizardSheet } from './sheets/misc';
import {
  AssumptionsSheet, ChildEditSheet, ChildrenSheet, DebtEditSheet, EventEditSheet, EventsSheet, GoalEditSheet, GoalsSheet, HousingSheet, IncomeChangeSheet, IncomeSheet,
  InsEditSheet, InsuranceSheet, InvEditSheet, InvestSheet, LivingAddSheet, LivingItemsSheet, LivingEditSheet, LivingSheet, SavingsSheet, WorkEditSheet, WorkSheet,
  type SheetProps,
} from './sheets/plan';
import { useStore, type Tab } from './store';

const SHEETS: Record<string, (p: SheetProps) => ReactElement | null> = {
  income: IncomeSheet, incomeChange: IncomeChangeSheet, savings: SavingsSheet, debtEdit: DebtEditSheet, children: ChildrenSheet, childEdit: ChildEditSheet,
  living: LivingSheet, livingItems: LivingItemsSheet, livingAdd: LivingAddSheet, livingEdit: LivingEditSheet, insurance: InsuranceSheet, insEdit: InsEditSheet,
  invest: InvestSheet, invEdit: InvEditSheet, goals: GoalsSheet, goalEdit: GoalEditSheet, events: EventsSheet, eventEdit: EventEditSheet,
  work: WorkSheet, workEdit: WorkEditSheet, housing: HousingSheet, assumptions: AssumptionsSheet,
  basis: BasisSheet, fpBasis: FpBasisSheet, loanTerms: LoanTermsSheet, prepayEdit: PrepayEditSheet, missing: MissingSheet, sale: SaleSheet, memoEdit: MemoEditSheet, settings: SettingsSheet,
  confirm: ConfirmSheet, wizard: WizardSheet, houseEdit: HouseEditSheet, houseDetail: HouseDetailSheet, weights: WeightsSheet,
};

const TABS: { t: Tab; label: string; icon: string; title: string }[] = [
  { t: 'home', label: 'ホーム', icon: 'home', title: 'ほっぽさん' },
  { t: 'fp', label: 'FP', icon: 'fp', title: 'ライフプラン' },
  { t: 'compare', label: 'お家比較', icon: 'compare', title: 'お家比較' },
  { t: 'loan', label: 'ローン', icon: 'loan', title: '住宅ローン診断' },
  { t: 'memo', label: 'メモ', icon: 'memo', title: 'メモ' },
];

export function App() {
  const s = useStore();
  const cur = TABS.find((x) => x.t === s.tab)!;
  // タブの並び順で、新しい画面が入ってくる向きを決める
  const prev = useRef(s.tab);
  const dirRef = useRef(1);
  if (prev.current !== s.tab) {
    dirRef.current = TABS.findIndex((x) => x.t === s.tab) >= TABS.findIndex((x) => x.t === prev.current) ? 1 : -1;
    prev.current = s.tab;
  }
  const dir = dirRef.current;
  return (
    <div className="app">
      <header className="top">
        <h1>
          <span className="ttl" key={cur.t}>
            {cur.title}
          </span>
          {s.tab !== 'home' && <small>ほっぽさん</small>}
        </h1>
        <span className="save-dot" data-s={s.saveState} title={s.saveState === 'saved' ? '保存済み' : s.saveState === 'saving' ? '保存中' : '保存に失敗'} aria-label={s.saveState === 'saved' ? '保存済み' : '保存中'} />
        <button className="iconbtn" onClick={s.undo} disabled={!s.canUndo} style={{ opacity: s.canUndo ? 1 : 0.3 }} aria-label="元に戻す">
          <Icon name="undo" />
        </button>
        <button className="iconbtn" onClick={() => s.open({ kind: 'settings' })} aria-label="データと設定">
          <Icon name="gear" />
        </button>
      </header>
      <main className="main">
        {s.loaded && (
          <Switcher k={s.tab} dir={dir}>
            {s.tab === 'home' ? <Home /> : s.tab === 'fp' ? <FP /> : s.tab === 'compare' ? <Compare /> : s.tab === 'loan' ? <Loan /> : <Memo />}
          </Switcher>
        )}
      </main>
      <nav className="nav" aria-label="画面の切り替え">
        {TABS.map((x) => (
          <button key={x.t} aria-current={s.tab === x.t ? 'page' : undefined} onClick={() => s.setTab(x.t)}>
            <Icon name={x.icon} />
            {x.label}
          </button>
        ))}
      </nav>
      {s.sheets.map((sh) => {
        const C = SHEETS[sh.kind];
        return C ? (
          <SheetState.Provider key={sh.id} value={{ closing: !!sh.closing }}>
            <C close={s.close} props={sh.props ?? {}} />
          </SheetState.Provider>
        ) : null;
      })}
      {s.toast && (
        <div className="toast" role="status">
          <span>{s.toast.text}</span>
          {s.toast.action && <button onClick={s.toast.action.run}>{s.toast.action.label}</button>}
        </div>
      )}
    </div>
  );
}
