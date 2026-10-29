/**
 * ほっぽさん データモデル
 *
 * 単位の約束（混同防止のため型名で区別する）
 *  - Yen   : 円（整数）
 *  - YM    : 年月の通し番号 = 西暦年 * 12 + (月 - 1)
 *  - Rate  : 年率（小数。1% = 0.01）
 *  - Age   : 満年齢（年）
 *  - null  : 「未設定」。0 とは区別する（0 は「ゼロと確定」）
 */
export type Yen = number;
export type YM = number;
export type Rate = number;
export type Age = number;
export type ID = string;

export type Owner = 'self' | 'spouse';

export interface Person {
  id: Owner;
  name: string;
  birthYM: YM | null;
  /** 手取り月収（賞与除く） */
  netMonthly: Yen | null;
  /** 賞与の手取り（年合計）。6月・12月に半分ずつ */
  bonusNetAnnual: Yen | null;
  /** 賞与を12か月に均して毎月の収入として計算する（受け取りは年2回でも、家計で月々に割って使う場合） */
  bonusSpread?: boolean;
  /** 定年後の再雇用（退職年齢から untilAge 歳になるまで、手取り月収 netMonthly） */
  rehire?: { untilAge: number; netMonthly: Yen } | null;
  /** 額面年収（賞与込み）。審査目安・年金推計・税額推計に使う */
  grossAnnual: Yen | null;
  /** 昇給率（名目・年）。毎年4月に反映 */
  raiseRate: Rate | null;
  retireAge: Age | null;
  /** 退職金（手取り） */
  retireBonus: Yen | null;
  pensionStartAge: Age | null;
  /** 年金の手取り月額（いまの貨幣価値） */
  pensionMonthly: Yen | null;
  /** 現金・預金 */
  cash: Yen | null;
}

export interface Debt {
  id: ID;
  name: string;
  monthly: Yen;
  endYM: YM;
  /** 決まった入力欄の借入（'car' = 自動車ローン） */
  std?: 'car';
  /** ボーナス払い（1回あたり。6月・12月） */
  bonus?: Yen;
  /** ボーナス払いを月々に割って計算する（年2回分 ÷ 12 を毎月） */
  bonusSplit?: boolean;
}

export type SchoolChoice = 'public' | 'private';
export type KinderChoice = 'public' | 'private' | 'none';
export type UnivChoice = 'none' | 'national' | 'privateArts' | 'privateSci';

export interface Child {
  id: ID;
  name: string;
  /** 誕生年月（予定でもよい） */
  birthYM: YM;
  /** 0〜2歳の保育園 */
  nurseryUse: boolean;
  nurseryStartAge: number;
  /** 0〜2歳の保育料（月）。null = 未確認（仮置き値を使う） */
  nurseryMonthly: Yen | null;
  kinder: KinderChoice;
  elem: SchoolChoice;
  middle: SchoolChoice;
  high: SchoolChoice;
  univ: UnivChoice;
  univYears: number;
  /** 大学で自宅外通学（仕送り月額） */
  univAwayMonthly: Yen;
  /** 習い事（月）。null と塾も null なら統計平均の学校外活動費を使う */
  lessonsMonthly: Yen | null;
  /** 塾（月） */
  jukuMonthly: Yen | null;
  /** その他の教育費（年） */
  otherAnnual: Yen;
}

export interface LivingItem {
  id: ID;
  name: string;
  icon: string;
  monthly: Yen;
  kind: 'fixed' | 'variable';
  /** 「その他の生活費（まとめて）」の項目 */
  lump?: boolean;
  /** 決まった入力欄の項目（食費・電気代・水道代・ガス代・携帯代） */
  std?: LivingStd;
}
export type LivingStd = 'food' | 'electric' | 'water' | 'gas' | 'phone';

export type InsuranceKind = 'life' | 'medical' | 'cancer' | 'education' | 'annuity' | 'other';
export type Payout =
  | { type: 'none' }
  | { type: 'lump'; ym: YM; amount: Yen }
  | { type: 'annuity'; startYM: YM; years: number; annual: Yen };

/** 学資保険: 子供の年齢で払込・受取を決める（誕生や時期を変えても追従する） */
export interface EduInsurance {
  childId: ID;
  /** 子供がこの年齢になる前の月まで払い込む */
  payUntilAge: number;
  /** 受取（祝い金・満期金）。子供がこの年齢になる月に受け取る */
  payouts: { age: number; amount: Yen }[];
}

export interface Insurance {
  id: ID;
  name: string;
  kind: InsuranceKind;
  monthly: Yen;
  /** 払込終了（この月まで払う）。null = 終身払い */
  payEndYM: YM | null;
  payout: Payout;
  /** 学資保険で子供に紐付ける場合（payEndYM・payout の代わりに使う） */
  child?: EduInsurance | null;
}

export type InvestKind = 'nisaTsumitate' | 'nisaGrowth' | 'ideco' | 'taxable';
export interface Investment {
  id: ID;
  name: string;
  kind: InvestKind;
  owner: Owner;
  balance: Yen;
  /** 取得原価（NISA枠・課税計算用）。null = 残高と同額とみなす */
  basis: Yen | null;
  monthly: Yen;
  startYM: YM | null;
  /** 積立終了（この月まで積み立てる） */
  endYM: YM | null;
  /** 取崩開始 */
  withdrawStartYM: YM | null;
  withdrawMonthly: Yen;
}

export interface Goal {
  id: ID;
  name: string;
  target: Yen;
  ym: YM;
}

export type EventPattern = 'once' | 'monthly' | 'repeat';
export interface LifeEvent {
  id: ID;
  name: string;
  icon: string;
  kind: 'expense' | 'income';
  pattern: EventPattern;
  amount: Yen;
  startYM: YM;
  /** monthly / repeat の終了 */
  endYM: YM | null;
  /** repeat の間隔（年） */
  everyYears: number;
  inflate: boolean;
  /** 支出の時期から逆算して毎月積み立て、その積立から払う（1回だけ・数年ごとの支出） */
  fund?: boolean;
}

export interface WorkChange {
  id: ID;
  owner: Owner;
  type: 'leave' | 'short';
  startYM: YM;
  /** leave: 期間（月） */
  months: number;
  /** short: 終了（この月まで） */
  endYM: YM | null;
  /** short: 勤務時間の割合（0.5 = 半分） */
  ratio: number;
  /** leave: 産前産後休業を含む（最初の3か月を出産手当金とみなす） */
  maternity: boolean;
  /** 給付対象の子（時短の2歳未満判定に使う） */
  childId: ID | null;
}

export type RateType = 'variable' | 'fixed' | 'fixedPeriod';
export type RepayMethod = 'annuity' | 'equalPrincipal';

export interface LoanTerms {
  rateType: RateType;
  /** 当初の適用金利（年） */
  rate: Rate;
  /** 固定期間選択型の固定年数 */
  fixedYears: number;
  /** 固定期間終了後の想定金利 */
  afterRate: Rate;
  years: number;
  method: RepayMethod;
  /** ボーナス返済の割合（借入額に対する比率 0〜0.5） */
  bonusShare: Rate;
  /** 審査目安に使う金利 */
  screeningRate: Rate;
  borrower: 'self' | 'pair';
  /** 変動金利の5年ルール・125%ルールを使う（多くの銀行の変動金利） */
  rule125?: boolean;
  /** 繰上返済の予定 */
  prepayments?: Prepayment[];
}

export interface Prepayment {
  id: ID;
  /** 繰上返済する月 */
  ym: YM;
  amount: Yen;
  /** shorten = 期間短縮（毎月の返済は同じ）、reduce = 返済額軽減（期間は同じ） */
  mode: 'shorten' | 'reduce';
}

export type EnergyClass = 'longlife' | 'zeh' | 'standard' | 'other';

export interface HousingPlan {
  /** 家の売却・住み替えの予定（FP画面の推移に反映。購入予算の計算では売却を当てにしない） */
  sale?: { ym: YM; price: Yen | null; rentAfter: Yen } | null;
  /** 現在の家賃（駐車場など込み・月）。null=未設定 */
  rentMonthly: Yen | null;
  purchaseYM: YM | null;
  /** 家賃と住宅費を二重に払う月数 */
  overlapMonths: number;
  downMode: 'auto' | 'manual';
  /** 充当する自己資金（頭金＋現金で払う諸費用） */
  downPayment: Yen | null;
  /** 親などからの援助（購入月に入金） */
  gift: Yen;
  movingCost: Yen | null;
  /** 諸費用率（物価に対する割合） */
  miscRate: Rate;
  kind: 'detached' | 'mansion';
  landShare: Rate;
  /** 戸建て: 修繕積立相当 / マンション: 管理費＋修繕積立金（月） */
  maintenanceMonthly: Yen | null;
  insuranceAnnual: Yen | null;
  parkingMonthly: Yen;
  loan: LoanTerms;
  desiredLoan: Yen | null;
  /** FP画面の前提にする住宅 */
  fpBasis: 'recommended' | 'house' | 'desired' | 'none';
  houseId: ID | null;
  deduction: {
    enabled: boolean;
    energy: EnergyClass;
    family: 'kosodate' | 'normal';
    /** 控除しきれる税額（所得税＋住民税分・年）。null = 推計 */
    taxCapAnnual: Yen | null;
  };
  newBuildTaxCut: boolean;
}

export interface Assumptions {
  inflation: Rate;
  /** 年金の改定率 = 物価上昇率 + この値 */
  pensionAdjust: Rate;
  returnLow: Rate;
  returnMid: Rate;
  returnHigh: Rate;
  endAge: Age;
  /** 予備資金（生活費の何か月分） */
  reserveMonths: number;
  childLiving: { preschool: Yen; elem: Yen; middleHigh: Yen; univ: Yen };
  /** 老後の生活費（住居費除く・月・いまの価値）。null = 統計値を仮置き */
  retireLivingMonthly: Yen | null;
  childAllowance: boolean;
  leaveBenefits: boolean;
  /** 退職後、現金が予備資金を下回ったら投資を売却して補填する */
  withdrawAfterRetire: boolean;
  /** 現役中も同様に補填する */
  withdrawBeforeRetire: boolean;
  /** 子供の予定を確認済み */
  childrenConfirmed: boolean;
}

export interface HousePerf {
  insulation: number | null; // 断熱等性能等級 4〜7
  ua: number | null;
  cValue: number | null;
  quake: number | null; // 耐震等級 1〜3
  energy: EnergyClass | null;
  solar: boolean;
  battery: boolean;
  ventilation: string;
  structure: string;
  warrantyYears: number | null;
  maintenanceNote: string;
}

export interface HouseCosts {
  propertyTaxAnnual: Yen | null;
  insuranceAnnual: Yen | null;
  /** 戸建て: 修繕積立相当（月） */
  repairMonthly: Yen | null;
  /** マンション: 管理費（月） */
  mgmtMonthly: Yen;
  /** マンション: 修繕積立金（月） */
  repairFundMonthly: Yen;
  parkingMonthly: Yen;
}

export type RatingKey = 'location' | 'layout' | 'warranty' | 'resale' | 'satisfaction';
export interface House {
  id: ID;
  name: string;
  maker: string;
  address: string;
  kind: 'detached' | 'mansion';
  newBuild: boolean;
  price: Yen | null;
  landPrice: Yen | null;
  buildingPrice: Yen | null;
  /** 諸費用。null = 諸費用率で推計 */
  misc: Yen | null;
  floorArea: number | null;
  landArea: number | null;
  layout: string;
  parking: number | null;
  station: string;
  walkMin: number | null;
  commuteMin: number | null;
  moveInYM: YM | null;
  perf: HousePerf;
  costs: HouseCosts;
  ratings: Partial<Record<RatingKey, number>>;
  createdAt: number;
}

export type WeightKey = 'price' | 'location' | 'layout' | 'performance' | 'upkeep' | 'warranty' | 'resale' | 'satisfaction';
export type Weights = Record<WeightKey, number>;

export type MemoCategory = 'common' | 'house' | 'meeting' | 'concern' | 'check' | 'next';
export interface Memo {
  id: ID;
  category: MemoCategory;
  houseId: ID | null;
  title: string;
  body: string;
  /** 次回予定などの日付（YYYY-MM-DD） */
  date: string | null;
  done: boolean;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 毎月のお小遣い・自由費（月額・いまの価値。生活費として物価に合わせて増やす）。null = 未設定 */
export interface Pocket {
  self: Yen | null;
  spouse: Yen | null;
  /** 家族の自由費（外食・レジャー・趣味など） */
  free: Yen | null;
}

/** ym から手取りが変わる（その後は昇給率で増える） */
export interface IncomeChange {
  id: ID;
  owner: Owner;
  ym: YM;
  netMonthly: Yen;
  /** 賞与（手取り・年合計）。null = 変えない */
  bonusNetAnnual: Yen | null;
  note: string;
}

export interface Plan {
  /** 残高（現金・投資）を入力した時点。シミュレーションの開始月 */
  baseYM: YM;
  self: Person;
  spouse: Person | null;
  debts: Debt[];
  children: Child[];
  living: LivingItem[];
  pocket: Pocket;
  /** 収入が途中で変わる予定（転職・昇進など） */
  incomeChanges: IncomeChange[];
  /** 毎月の貯金（先取り。預金として現金に残す）。null = 未設定 */
  saving: { monthly: Yen | null; bonus: Yen | null };
  insurances: Insurance[];
  investments: Investment[];
  goals: Goal[];
  events: LifeEvent[];
  work: WorkChange[];
  housing: HousingPlan;
  assumptions: Assumptions;
}

export interface AppData {
  schema: number;
  plan: Plan;
  houses: House[];
  memos: Memo[];
  weights: Weights;
  updatedAt: number;
  /** サンプルデータを表示中 */
  sample?: boolean;
}
