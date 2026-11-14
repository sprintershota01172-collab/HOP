import { ACQUISITION_TAX, DEDUCTION, GIFT_TAX, PROPERTY_TAX, PURCHASE_FEES, REGISTRATION_TAX, SALE_TAX, STAMP_CONTRACT, STAMP_LOAN } from './reference';
import type { EnergyClass, Yen } from './types';

/* ============================== 所得税・住民税の概算 ============================== */

/** 給与所得控除（令和8年分から最低保障69万円、2026・2027年は特例で74万円） */
function kyuyoDeduction(gross: Yen, year: number): number {
  let k: number;
  if (gross <= 1_900_000) k = 650_000;
  else if (gross <= 3_600_000) k = gross * 0.3 + 80_000;
  else if (gross <= 6_600_000) k = gross * 0.2 + 440_000;
  else if (gross <= 8_500_000) k = gross * 0.1 + 1_100_000;
  else k = 1_950_000;
  const min = year >= 2026 ? (year <= 2027 ? 740_000 : 690_000) : 650_000;
  return Math.min(gross, Math.max(k, min));
}

/**
 * 所得税の基礎控除（令和8年度改正: 2026年分から本則62万円＋合計所得に応じた特例）。
 * 2028年以降も物価に合わせて見直される仕組みのため、2026年の表をそのまま使う（控除が大きいほど税は小さく、ローン控除は厳しめになる）
 */
export function basicDeduction(income: Yen, year: number): number {
  if (year >= 2026) {
    if (income <= 4_890_000) return 1_040_000;
    if (income <= 6_550_000) return 670_000;
    if (income <= 23_500_000) return 620_000;
    if (income <= 24_000_000) return 480_000;
    if (income <= 24_500_000) return 320_000;
    if (income <= 25_000_000) return 160_000;
    return 0;
  }
  if (income <= 1_320_000) return 950_000;
  if (income <= 3_360_000) return 880_000;
  if (income <= 4_890_000) return 680_000;
  if (income <= 6_550_000) return 630_000;
  if (income <= 23_500_000) return 580_000;
  return 0;
}

const DEFAULT_YEAR = 2026;

/** 課税所得の概算（給与所得控除・社会保険料は額面の15%・基礎控除） */
export function taxableOf(gross: Yen, year: number = DEFAULT_YEAR): Yen {
  if (gross <= 0) return 0;
  const income = Math.max(0, gross - kyuyoDeduction(gross, year));
  return Math.max(0, income - gross * 0.15 - basicDeduction(income, year));
}

function incomeTaxOf(taxable: Yen): number {
  let it: number;
  if (taxable <= 1_950_000) it = taxable * 0.05;
  else if (taxable <= 3_300_000) it = taxable * 0.1 - 97_500;
  else if (taxable <= 6_950_000) it = taxable * 0.2 - 427_500;
  else if (taxable <= 9_000_000) it = taxable * 0.23 - 636_000;
  else if (taxable <= 18_000_000) it = taxable * 0.33 - 1_536_000;
  else if (taxable <= 40_000_000) it = taxable * 0.4 - 2_796_000;
  else it = taxable * 0.45 - 4_796_000;
  return Math.max(0, it * 1.021);
}

/**
 * 住宅ローン控除で使い切れる税額の内訳。
 * 先に所得税（復興特別所得税を含む）から引き、引ききれない分を住民税から引く（所得税の課税総所得金額等×5%、上限97,500円）
 */
export function deductibleTaxParts(gross: Yen, year: number = DEFAULT_YEAR): { incomeTax: Yen; residentCap: Yen } {
  if (gross <= 0) return { incomeTax: 0, residentCap: 0 };
  const taxable = taxableOf(gross, year);
  return {
    incomeTax: Math.floor(incomeTaxOf(taxable)),
    residentCap: Math.floor(Math.min(DEDUCTION.residentTaxCap, taxable * DEDUCTION.residentTaxRate)),
  };
}

/**
 * 給与収入から「住宅ローン控除で使い切れる税額」の概算（所得税＋住民税の控除上限分）。
 * 実際の税額は源泉徴収票で確認する前提の推計値。
 */
export function estimateDeductibleTax(gross: Yen, year: number = DEFAULT_YEAR): Yen {
  const p = deductibleTaxParts(gross, year);
  return p.incomeTax + p.residentCap;
}

/**
 * iDeCo などの所得控除で軽くなる税の割合（所得税の限界税率×1.021＋住民税10%）。
 * 課税所得が0なら0（控除しても税は減らない）
 */
export function marginalTaxRate(gross: Yen, year: number = DEFAULT_YEAR): number {
  if (gross <= 0) return 0;
  const t = taxableOf(gross, year);
  if (t <= 0) return 0;
  const it = t <= 1_950_000 ? 0.05 : t <= 3_300_000 ? 0.1 : t <= 6_950_000 ? 0.2 : t <= 9_000_000 ? 0.23 : t <= 18_000_000 ? 0.33 : t <= 40_000_000 ? 0.4 : 0.45;
  return it * 1.021 + 0.1;
}

/* ============================== 住宅ローン控除 ============================== */

/**
 * 借入限度額と控除期間。
 * entryYear = 入居した年、newBuild = 新築（または買取再販の認定住宅）
 */
export function deductionLimit(energy: EnergyClass, family: 'kosodate' | 'normal', newBuild: boolean = true, entryYear: number = DEFAULT_YEAR): { limit: Yen; years: number } {
  if (entryYear > DEDUCTION.lastYear) return { limit: 0, years: 0 };
  if (newBuild && energy === 'standard' && entryYear > DEDUCTION.standardNewLastYear) return { ...DEDUCTION.standardNewLate };
  const row = (newBuild ? DEDUCTION.limits : DEDUCTION.usedLimits)[energy];
  return { limit: row[family], years: row.years };
}

/* ============================== 固定資産税・都市計画税 ============================== */

export interface PropertyTaxInput {
  kind: 'detached' | 'mansion';
  newBuild: boolean;
  landPrice: Yen;
  buildingPrice: Yen;
  floorArea: number | null;
  landArea?: number | null;
  energy: EnergyClass;
  cutEnabled: boolean;
}

/** 新築住宅の固定資産税の減額が続く年数 */
export function newBuildCutYears(kind: 'detached' | 'mansion', energy: EnergyClass): number {
  const T = PROPERTY_TAX;
  if (kind === 'mansion') return energy === 'longlife' ? T.newBuildYearsMansionLonglife : T.newBuildYearsMansion;
  return energy === 'longlife' ? T.newBuildYearsLonglife : T.newBuildYears;
}

/**
 * 固定資産税＋都市計画税の推計（年額）を土地・建物に分けて返す。
 * age = 建物が課税されてから何年度目か（0始まり）。減額の期間・経年の減価に使う。
 * evalAge = 建物の評価に使う経過年数（評価替えの年度にだけ進む）。省略時は age
 */
export function propertyTaxParts(h: PropertyTaxInput, age: number, cityRate: number = PROPERTY_TAX.cityRate, evalAge: number = age): { land: Yen; building: Yen } {
  const T = { ...PROPERTY_TAX, cityRate };
  const landEval = h.landPrice * T.landEvalRatio;
  // 200㎡までは小規模住宅用地（1/6・1/3）、超える部分は一般住宅用地（1/3・2/3）
  const area = h.landArea ?? null;
  const smallShare = area && area > T.smallLandArea ? T.smallLandArea / area : 1;
  const land =
    landEval * smallShare * (T.landFixedFactor * T.fixedRate + T.landCityFactor * T.cityRate) +
    landEval * (1 - smallShare) * (T.landFixedFactorLarge * T.fixedRate + T.landCityFactorLarge * T.cityRate);
  const life = h.kind === 'mansion' ? T.rcYears : T.woodYears;
  const dep = Math.max(T.bldgFloor, 1 - ((1 - T.bldgFloor) * Math.max(0, evalAge)) / life);
  const bldgEval = h.buildingPrice * T.bldgEvalRatio * dep;
  let fixedB = bldgEval * T.fixedRate;
  const floor = h.floorArea;
  const areaOk = floor == null || (floor >= T.newBuildAreaMin && floor <= T.newBuildAreaMax);
  if (h.newBuild && h.cutEnabled && areaOk && age < newBuildCutYears(h.kind, h.energy)) {
    const share = floor && floor > T.newBuildArea ? T.newBuildArea / floor : 1;
    fixedB -= fixedB * T.newBuildCut * share;
  }
  const cityB = bldgEval * T.cityRate;
  return { land: Math.round(land), building: Math.round(fixedB + cityB) };
}

/** 固定資産税＋都市計画税の推計（年額）。yearIndex = 購入後何年目か（0始まり） */
export function estimatePropertyTax(h: PropertyTaxInput, yearIndex: number, cityRate: number = PROPERTY_TAX.cityRate): Yen {
  const p = propertyTaxParts(h, yearIndex, cityRate);
  return p.land + p.building;
}

/** その年度の建物の評価に使う経過年数（評価替えは3年ごと。firstYear = 建物が初めて課税された年度） */
export function evalAgeAt(year: number, firstYear: number): number {
  const base = PROPERTY_TAX.reevalBaseYear;
  const last = year - (((year - base) % 3) + 3) % 3; // year 以前で最も近い基準年度
  return Math.max(0, last - firstYear);
}

/* ============================== 購入時の諸費用・税 ============================== */

export interface CostHouse {
  kind: 'detached' | 'mansion';
  newBuild: boolean;
  price: Yen;
  landPrice: Yen;
  buildingPrice: Yen;
  floorArea: number | null;
  landArea?: number | null;
  energy: EnergyClass;
}

export interface CostItem {
  key: string;
  label: string;
  value: Yen;
  /** 'now' = 購入時（引き渡しまで）、'later' = 購入後に納税通知書が届く */
  when: 'now' | 'later';
  /** 借入額で変わる */
  byLoan?: boolean;
  note?: string;
}

const stampOf = (table: [number, number][], amount: Yen): Yen => {
  if (amount < 10_000) return 0;
  for (const [hi, tax] of table) if (amount <= hi) return tax;
  return 0;
};

/** 不動産取得税（土地・建物） */
export function acquisitionTax(h: CostHouse): { land: Yen; building: Yen } {
  const A = ACQUISITION_TAX;
  const floor = h.floorArea ?? (h.kind === 'mansion' ? PURCHASE_FEES.floorMansion : PURCHASE_FEES.floorDetached);
  const bldgEval = h.buildingPrice * PROPERTY_TAX.bldgEvalRatio;
  const housingOk = floor >= A.floorMin && floor <= A.floorMax;
  const deduct = !housingOk ? 0 : h.newBuild ? (h.energy === 'longlife' ? A.bldgDeductLonglife : A.bldgDeduct) : A.usedDeduct;
  const building = Math.max(0, Math.floor(((bldgEval - deduct) * A.rate) / 100) * 100);
  const landEval = h.landPrice * PROPERTY_TAX.landEvalRatio;
  const landArea = h.landArea ?? (h.kind === 'mansion' ? null : PURCHASE_FEES.landDetached);
  let land = landEval * A.landHalf * A.rate;
  if (housingOk) {
    // 住宅を建てた（買った）土地の減額: 4.5万円と「1㎡あたりの価格×床面積の2倍（200㎡まで）×3%」の多い方
    const perM2 = landArea ? (landEval * A.landHalf) / landArea : Infinity;
    const reduce = Math.max(A.landMinReduce, perM2 * Math.min(floor * 2, A.landFloorMax) * A.rate);
    land = Math.max(0, land - reduce);
  }
  return { land: Math.floor(land / 100) * 100, building };
}

/**
 * 購入時の諸費用の内訳（目安）。
 * 火災・地震保険は維持費で毎年計上するため含めない。外構・地盤改良などは extra に入れる
 */
export function purchaseCostItems(h: CostHouse, loan: Yen, opts: { loanFeeRate: number; extra: Yen; broker?: boolean }): CostItem[] {
  const R = REGISTRATION_TAX;
  const F = PURCHASE_FEES;
  const items: CostItem[] = [];
  const certified = h.energy === 'longlife';
  // 印紙税（売買契約・工事請負契約、ローンの契約）
  const stampSale = h.kind === 'detached' && h.newBuild ? stampOf(STAMP_CONTRACT, h.landPrice) + stampOf(STAMP_CONTRACT, h.buildingPrice) : stampOf(STAMP_CONTRACT, h.price);
  items.push({ key: 'stamp', label: '印紙税（売買・請負の契約書）', value: stampSale, when: 'now', note: h.kind === 'detached' && h.newBuild ? '土地の売買と建物の請負の2通' : undefined });
  if (loan > 0) items.push({ key: 'stampLoan', label: '印紙税（ローンの契約書）', value: stampOf(STAMP_LOAN, loan), when: 'now', byLoan: true });
  // 登録免許税
  const landEval = h.landPrice * 0.7;
  const bldgEval = h.buildingPrice * 0.6;
  const bldgRate = h.newBuild ? (certified ? R.preserveCertified : R.preserve) : certified && h.kind === 'detached' ? R.transferBldgLonglifeDetached : R.transferBldg;
  const reg = Math.floor((landEval * R.transferLand + bldgEval * bldgRate) / 100) * 100;
  items.push({ key: 'reg', label: '登録免許税（土地・建物の登記）', value: reg, when: 'now', note: `土地${(R.transferLand * 100).toFixed(1)}%・建物${(bldgRate * 100).toFixed(2)}%（評価額に対して）` });
  if (loan > 0) items.push({ key: 'regLoan', label: '登録免許税（抵当権の設定）', value: Math.floor((loan * R.mortgage) / 100) * 100, when: 'now', byLoan: true, note: '借入額の0.1%' });
  items.push({ key: 'scrivener', label: '司法書士の報酬', value: F.scrivener, when: 'now' });
  if (h.newBuild && h.kind === 'detached') items.push({ key: 'surveyor', label: '建物の表示登記（土地家屋調査士）', value: F.surveyor, when: 'now' });
  if (loan > 0 && opts.loanFeeRate > 0) items.push({ key: 'loanFee', label: '融資手数料・保証料', value: Math.round(loan * opts.loanFeeRate), when: 'now', byLoan: true, note: `借入額の${(opts.loanFeeRate * 100).toFixed(1)}%` });
  const broker = opts.broker ?? !h.newBuild;
  if (broker && h.price > 0) items.push({ key: 'broker', label: '仲介手数料', value: Math.round((h.price * F.brokerRate + F.brokerFixed) * (1 + F.consumptionTax)), when: 'now', note: '（価格×3%＋6万円）＋消費税' });
  if (opts.extra > 0) items.push({ key: 'extra', label: '外構・地盤改良などの工事', value: opts.extra, when: 'now' });
  const acq = acquisitionTax(h);
  items.push({ key: 'acq', label: '不動産取得税', value: acq.land + acq.building, when: 'later', note: `土地${acq.land.toLocaleString()}円・建物${acq.building.toLocaleString()}円。購入から半年ほどで納付` });
  return items;
}

/* ============================== 贈与税（住宅資金の援助） ============================== */

export type GiftMode = 'exempt' | 'settlement' | 'calendar';

/**
 * 親（直系尊属）からの住宅資金の贈与にかかる贈与税。
 * exempt = 住宅取得等資金の非課税（省エネ等1,000万円・一般500万円）＋基礎控除110万円。2026年までの贈与だけ使える
 * settlement = 相続時精算課税（累計2,500万円まで非課税、超えた分は20%）。毎年110万円の基礎控除あり
 * calendar = 暦年課税のみ（110万円を超えた分に特例税率）
 */
export function giftTax(amount: Yen, mode: GiftMode, energy: EnergyClass, year: number): { tax: Yen; exempt: Yen; usable: boolean } {
  const G = GIFT_TAX;
  if (amount <= G.basic) return { tax: 0, exempt: 0, usable: true };
  let taxable: number;
  let exempt = 0;
  const usable = year <= G.exemptLastYear;
  if (mode === 'settlement') {
    const over = Math.max(0, amount - G.basic - G.settlement);
    return { tax: Math.floor(over * G.settlementRate), exempt: Math.min(amount - G.basic, G.settlement), usable: true };
  }
  if (mode === 'exempt' && usable) {
    exempt = Math.min(amount, energy === 'other' ? G.exemptGeneral : G.exemptHigh);
    taxable = amount - exempt - G.basic;
  } else taxable = amount - G.basic;
  if (taxable <= 0) return { tax: 0, exempt, usable };
  const [, rate, minus] = G.table.find(([hi]) => taxable <= hi)!;
  return { tax: Math.floor(taxable * rate - minus), exempt, usable };
}

/* ============================== 家を売ったときの税（譲渡所得） ============================== */

/**
 * 居住用の家を売ったときの所得税・住民税（3,000万円の特別控除を使う前提）。
 * heldYears = 売った年の1月1日時点の所有期間、usedYears = 住んでいた年数（建物の減価償却）
 */
export function saleGainTax(input: { price: Yen; cost: Yen; landPrice: Yen; buildingPrice: Yen; misc: Yen; kind: 'detached' | 'mansion'; heldYears: number; usedYears: number }): { gain: Yen; tax: Yen } {
  const S = SALE_TAX;
  const dep = input.kind === 'mansion' ? S.depRC : S.depWood;
  const used = Math.round(input.usedYears);
  const bldg = Math.max(input.buildingPrice * 0.05, input.buildingPrice - input.buildingPrice * 0.9 * dep * used);
  const basis = input.landPrice + bldg + input.misc;
  const gain = Math.max(0, input.price - input.cost - basis);
  const taxable = Math.max(0, gain - S.special);
  if (taxable <= 0) return { gain, tax: 0 };
  let tax: number;
  if (input.heldYears > 10) tax = Math.min(taxable, S.longLowLimit) * S.longLowRate + Math.max(0, taxable - S.longLowLimit) * S.longRate;
  else if (input.heldYears > 5) tax = taxable * S.longRate;
  else tax = taxable * S.shortRate;
  return { gain, tax: Math.floor(tax) };
}

/** 借入額で決まる諸費用（ローン契約の印紙税・抵当権の登録免許税・融資手数料） */
export function loanCosts(loan: Yen, feeRate: number): Yen {
  if (loan <= 0) return 0;
  return stampOf(STAMP_LOAN, loan) + Math.floor((loan * REGISTRATION_TAX.mortgage) / 100) * 100 + Math.round(loan * feeRate);
}

/** 借入に関係しない諸費用（購入時に払う分）と、後で払う不動産取得税 */
export function fixedCosts(h: CostHouse, extra: Yen, broker?: boolean): { now: Yen; later: Yen } {
  const items = purchaseCostItems(h, 0, { loanFeeRate: 0, extra, broker });
  return {
    now: items.filter((x) => x.when === 'now').reduce((s, x) => s + x.value, 0),
    later: items.filter((x) => x.when === 'later').reduce((s, x) => s + x.value, 0),
  };
}
