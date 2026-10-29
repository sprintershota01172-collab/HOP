import { DEFAULT_WEIGHTS } from './houses';
import { ASSUME } from './reference';
import type { AppData, Assumptions, Child, House, HousingPlan, LivingItem, Person, Plan } from './types';
import { toYM, ymYear } from './ym';

export const SCHEMA_VERSION = 1;

let seq = 0;
export const uid = (p = 'id'): string => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyPerson = (id: 'self' | 'spouse'): Person => ({
  id,
  name: id === 'self' ? '本人' : '配偶者',
  birthYM: null,
  netMonthly: null,
  bonusNetAnnual: null,
  grossAnnual: null,
  raiseRate: null,
  retireAge: null,
  retireBonus: null,
  pensionStartAge: null,
  pensionMonthly: null,
  cash: null,
});

export const defaultAssumptions = (): Assumptions => ({
  inflation: ASSUME.inflation,
  pensionAdjust: ASSUME.pensionAdjust,
  returnLow: ASSUME.returnLow,
  returnMid: ASSUME.returnMid,
  returnHigh: ASSUME.returnHigh,
  endAge: ASSUME.endAge,
  reserveMonths: ASSUME.reserveMonths,
  childLiving: { ...ASSUME.childLiving },
  retireLivingMonthly: null,
  childAllowance: true,
  leaveBenefits: true,
  withdrawAfterRetire: true,
  withdrawBeforeRetire: false,
  childrenConfirmed: false,
});

export const defaultHousing = (): HousingPlan => ({
  rentMonthly: null,
  purchaseYM: null,
  overlapMonths: 1,
  downMode: 'auto',
  downPayment: null,
  gift: 0,
  movingCost: null,
  miscRate: ASSUME.miscRate,
  kind: 'detached',
  landShare: ASSUME.landShareDetached,
  maintenanceMonthly: null,
  insuranceAnnual: null,
  parkingMonthly: 0,
  loan: {
    rateType: 'variable',
    rate: ASSUME.variableRate,
    fixedYears: 10,
    afterRate: 0.02,
    years: 35,
    method: 'annuity',
    bonusShare: 0,
    screeningRate: ASSUME.screeningRate,
    borrower: 'self',
  },
  desiredLoan: null,
  fpBasis: 'recommended',
  houseId: null,
  deduction: { enabled: false, energy: 'zeh', family: 'kosodate', taxCapAnnual: null },
  newBuildTaxCut: false,
});

/** 生活費の決まった入力欄（ここにない費目は「そのほかの項目」か「その他の生活費」に入れる） */
export const LIVING_STD: { std: import('./types').LivingStd; name: string; icon: string; kind: 'fixed' | 'variable' }[] = [
  { std: 'food', name: '食費', icon: 'food', kind: 'variable' },
  { std: 'electric', name: '電気代', icon: 'bolt', kind: 'fixed' },
  { std: 'water', name: '水道代', icon: 'drop', kind: 'fixed' },
  { std: 'gas', name: 'ガス代', icon: 'flame', kind: 'fixed' },
  { std: 'phone', name: '携帯代', icon: 'phone', kind: 'fixed' },
];

export const LIVING_PRESETS: { name: string; icon: string; kind: 'fixed' | 'variable' }[] = [
  { name: '日用品', icon: 'basket', kind: 'variable' },
  { name: 'インターネット', icon: 'phone', kind: 'fixed' },
  { name: '車関連費', icon: 'car', kind: 'fixed' },
  { name: 'ガソリン', icon: 'fuel', kind: 'variable' },
  { name: '医療費', icon: 'medical', kind: 'variable' },
  { name: '被服費', icon: 'shirt', kind: 'variable' },
  { name: '娯楽費', icon: 'smile', kind: 'variable' },
  { name: '旅行', icon: 'plane', kind: 'variable' },
  { name: 'その他', icon: 'dots', kind: 'variable' },
];

export function emptyPlan(baseYM: number): Plan {
  return {
    baseYM,
    self: emptyPerson('self'),
    spouse: null,
    debts: [],
    children: [],
    living: [],
    pocket: { self: null, spouse: null, free: null },
    saving: { monthly: null, bonus: null },
    incomeChanges: [],
    insurances: [],
    investments: [],
    goals: [],
    events: [],
    work: [],
    housing: defaultHousing(),
    assumptions: defaultAssumptions(),
  };
}

export function emptyData(baseYM: number): AppData {
  return { schema: SCHEMA_VERSION, plan: emptyPlan(baseYM), houses: [], memos: [], weights: { ...DEFAULT_WEIGHTS }, updatedAt: Date.now() };
}

export const newChild = (birthYM: number, n: number): Child => ({
  id: uid('child'),
  name: `子供${n}`,
  birthYM,
  nurseryUse: true,
  nurseryStartAge: 1,
  nurseryMonthly: null,
  kinder: 'public',
  elem: 'public',
  middle: 'public',
  high: 'public',
  univ: 'national',
  univYears: 4,
  univAwayMonthly: 0,
  lessonsMonthly: null,
  jukuMonthly: null,
  otherAnnual: 0,
});

export const newHouse = (): House => ({
  id: uid('house'),
  name: '',
  maker: '',
  address: '',
  kind: 'detached',
  newBuild: true,
  price: null,
  landPrice: null,
  buildingPrice: null,
  misc: null,
  floorArea: null,
  landArea: null,
  layout: '',
  parking: null,
  station: '',
  walkMin: null,
  commuteMin: null,
  moveInYM: null,
  perf: { insulation: null, ua: null, cValue: null, quake: null, energy: null, solar: false, battery: false, ventilation: '', structure: '', warrantyYears: null, maintenanceNote: '' },
  costs: { propertyTaxAnnual: null, insuranceAnnual: null, repairMonthly: null, mgmtMonthly: 0, repairFundMonthly: 0, parkingMonthly: 0 },
  ratings: {},
  createdAt: Date.now(),
});

/**
 * 「サンプルで試す」用の架空の世帯（実在の人物・世帯のデータではない）。
 * 共働き・30歳前後・1年半後に第1子・購入は1年後。
 */
export function sampleData(baseYM: number): AppData {
  const d = emptyData(baseYM);
  const y = ymYear(baseYM);
  const p = d.plan;
  p.self = { ...emptyPerson('self'), name: 'たろう', birthYM: toYM(y - 30, 6), netMonthly: 280_000, bonusNetAnnual: 800_000, grossAnnual: 5_500_000, raiseRate: 0.015, retireAge: 65, retireBonus: 15_000_000, pensionStartAge: 65, pensionMonthly: null, cash: 3_000_000 };
  p.spouse = { ...emptyPerson('spouse'), name: 'はなこ', birthYM: toYM(y - 29, 2), netMonthly: 220_000, bonusNetAnnual: 400_000, grossAnnual: 3_900_000, raiseRate: 0.01, retireAge: 65, retireBonus: 5_000_000, pensionStartAge: 65, pensionMonthly: null, cash: 1_500_000 };
  const living: [string, number][] = [
    ['食費', 60_000], ['電気代', 9_000], ['水道代', 4_000], ['ガス代', 5_000], ['携帯代', 12_000], ['日用品', 10_000], ['車関連費', 15_000], ['ガソリン', 10_000],
    ['医療費', 5_000], ['被服費', 10_000], ['娯楽費', 15_000], ['旅行', 15_000], ['その他', 10_000],
  ];
  p.pocket = { self: 20_000, spouse: 20_000, free: null };
  p.saving = { monthly: 30_000, bonus: 100_000 };
  p.living = living.map(([name, monthly]): LivingItem => {
    const std = LIVING_STD.find((x) => x.name === name);
    if (std) return { id: uid('liv'), name, icon: std.icon, monthly, kind: std.kind, std: std.std };
    const preset = LIVING_PRESETS.find((x) => x.name === name)!;
    return { id: uid('liv'), name, icon: preset.icon, monthly, kind: preset.kind };
  });
  const birth = baseYM + 18;
  const child = newChild(birth, 1);
  child.name = '第1子';
  p.children = [child];
  p.assumptions.childrenConfirmed = true;
  p.work = [
    { id: uid('work'), owner: 'spouse', type: 'leave', startYM: birth - 1, months: 13, endYM: null, ratio: 1, maternity: true, childId: child.id },
    { id: uid('work'), owner: 'spouse', type: 'short', startYM: birth + 12, months: 0, endYM: birth + 12 * 6 - 1, ratio: 0.75, maternity: false, childId: child.id },
  ];
  p.debts = [{ id: uid('debt'), name: '自動車ローン', monthly: 15_000, endYM: baseYM + 36, std: 'car' }];
  p.insurances = [{ id: uid('ins'), name: '医療保険（2人分）', kind: 'medical', monthly: 6_000, payEndYM: null, payout: { type: 'none' } }];
  p.investments = [
    { id: uid('inv'), name: 'NISA つみたて（たろう）', kind: 'nisaTsumitate', owner: 'self', balance: 1_000_000, basis: 850_000, monthly: 30_000, startYM: null, endYM: toYM(y + 34, 12), withdrawStartYM: null, withdrawMonthly: 0 },
    { id: uid('inv'), name: 'NISA つみたて（はなこ）', kind: 'nisaTsumitate', owner: 'spouse', balance: 500_000, basis: 450_000, monthly: 20_000, startYM: null, endYM: toYM(y + 35, 12), withdrawStartYM: null, withdrawMonthly: 0 },
  ];
  p.goals = [
    { id: uid('goal'), name: '子供の大学資金', target: 5_000_000, ym: birth + 18 * 12 - 2 },
  ];
  p.events = [
    { id: uid('ev'), name: '車の買い替え', icon: 'car', kind: 'expense', pattern: 'repeat', amount: 2_500_000, startYM: baseYM + 60, endYM: toYM(y + 40, 12), everyYears: 8, inflate: true, fund: true },
    { id: uid('ev'), name: '出産費用（一時金との差額）', icon: 'baby', kind: 'expense', pattern: 'once', amount: 100_000, startYM: birth, endYM: null, everyYears: 1, inflate: false },
  ];
  p.housing = {
    ...p.housing,
    rentMonthly: 95_000,
    purchaseYM: toYM(y + 1, 3),
    movingCost: 500_000,
    loan: { ...p.housing.loan, borrower: 'pair' },
  };
  d.houses = [
    {
      ...newHouse(), name: 'A社 2階建て', maker: 'A住宅', address: '○○市北町', price: 42_000_000, landPrice: 15_000_000, buildingPrice: 27_000_000,
      floorArea: 105, landArea: 150, layout: '4LDK', parking: 2, station: '北町駅', walkMin: 12, commuteMin: 40,
      perf: { ...newHouse().perf, insulation: 6, quake: 3, cValue: 0.5, energy: 'zeh', solar: true, warrantyYears: 30, structure: '木造' },
      ratings: { location: 3, layout: 5, satisfaction: 4, resale: 3 },
    },
    {
      ...newHouse(), name: 'B社 駅近', maker: 'B工務店', address: '○○市中央', price: 48_000_000, landPrice: 24_000_000, buildingPrice: 24_000_000,
      floorArea: 95, landArea: 110, layout: '3LDK', parking: 1, station: '中央駅', walkMin: 6, commuteMin: 25,
      perf: { ...newHouse().perf, insulation: 5, quake: 2, energy: 'zeh', warrantyYears: 20, structure: '木造' },
      ratings: { location: 5, layout: 3, satisfaction: 4, resale: 5 },
    },
    {
      ...newHouse(), name: 'C社 建売', maker: 'Cホーム', address: '○○市南町', price: 33_000_000, landPrice: 12_000_000, buildingPrice: 21_000_000,
      floorArea: 98, landArea: 130, layout: '4LDK', parking: 2, station: '南町駅', walkMin: 18, commuteMin: 50,
      perf: { ...newHouse().perf, insulation: 4, quake: 1, energy: 'standard', warrantyYears: 10, structure: '木造' },
      ratings: { location: 2, layout: 3, satisfaction: 2, resale: 2 },
    },
  ];
  d.sample = true;
  d.memos = [
    { id: uid('memo'), category: 'meeting', houseId: d.houses[0].id, title: 'A社 初回打ち合わせ', body: '断熱等級6で標準仕様。太陽光は4.5kW。\n外構は別見積もり？', date: null, done: false, pinned: false, createdAt: Date.now(), updatedAt: Date.now() },
    { id: uid('memo'), category: 'check', houseId: null, title: '住宅ローン控除の対象か確認', body: 'ZEH水準の証明書が出るか各社に聞く', date: null, done: false, pinned: true, createdAt: Date.now(), updatedAt: Date.now() },
  ];
  return d;
}
