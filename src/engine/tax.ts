import { DEDUCTION, PROPERTY_TAX } from './reference';
import type { EnergyClass, Yen } from './types';

/**
 * 給与収入から「住宅ローン控除で使い切れる税額」の概算（所得税＋住民税の控除上限分）。
 * 給与所得控除（令和7年分以降）、社会保険料は額面の15%、基礎控除58万円で概算する。
 * 実際の税額は源泉徴収票で確認する前提の推計値。
 */
export function estimateDeductibleTax(gross: Yen): Yen {
  if (gross <= 0) return 0;
  let kyuyo: number;
  if (gross <= 1_900_000) kyuyo = 650_000;
  else if (gross <= 3_600_000) kyuyo = gross * 0.3 + 80_000;
  else if (gross <= 6_600_000) kyuyo = gross * 0.2 + 440_000;
  else if (gross <= 8_500_000) kyuyo = gross * 0.1 + 1_100_000;
  else kyuyo = 1_950_000;
  const social = gross * 0.15;
  const taxable = Math.max(0, gross - kyuyo - social - 580_000);
  let it: number;
  if (taxable <= 1_950_000) it = taxable * 0.05;
  else if (taxable <= 3_300_000) it = taxable * 0.1 - 97_500;
  else if (taxable <= 6_950_000) it = taxable * 0.2 - 427_500;
  else if (taxable <= 9_000_000) it = taxable * 0.23 - 636_000;
  else if (taxable <= 18_000_000) it = taxable * 0.33 - 1_536_000;
  else if (taxable <= 40_000_000) it = taxable * 0.4 - 2_796_000;
  else it = taxable * 0.45 - 4_796_000;
  it *= 1.021;
  const resident = Math.min(DEDUCTION.residentTaxCap, (taxable + 150_000) * 0.05);
  return Math.max(0, Math.floor(it + resident));
}

/** 課税所得の概算（給与所得控除・社会保険料15%・基礎控除58万円） */
function taxableOf(gross: Yen): Yen {
  let kyuyo: number;
  if (gross <= 1_900_000) kyuyo = 650_000;
  else if (gross <= 3_600_000) kyuyo = gross * 0.3 + 80_000;
  else if (gross <= 6_600_000) kyuyo = gross * 0.2 + 440_000;
  else if (gross <= 8_500_000) kyuyo = gross * 0.1 + 1_100_000;
  else kyuyo = 1_950_000;
  return Math.max(0, gross - kyuyo - gross * 0.15 - 580_000);
}

/**
 * iDeCo などの所得控除で軽くなる税の割合（所得税の限界税率×1.021＋住民税10%）。
 * 課税所得が0なら0（控除しても税は減らない）
 */
export function marginalTaxRate(gross: Yen): number {
  if (gross <= 0) return 0;
  const t = taxableOf(gross);
  if (t <= 0) return 0;
  const it = t <= 1_950_000 ? 0.05 : t <= 3_300_000 ? 0.1 : t <= 6_950_000 ? 0.2 : t <= 9_000_000 ? 0.23 : t <= 18_000_000 ? 0.33 : t <= 40_000_000 ? 0.4 : 0.45;
  return it * 1.021 + 0.1;
}

export function deductionLimit(energy: EnergyClass, family: 'kosodate' | 'normal'): { limit: Yen; years: number } {
  const row = DEDUCTION.limits[energy];
  return { limit: row[family], years: row.years };
}

export interface PropertyTaxInput {
  kind: 'detached' | 'mansion';
  newBuild: boolean;
  landPrice: Yen;
  buildingPrice: Yen;
  floorArea: number | null;
  energy: EnergyClass;
  cutEnabled: boolean;
}

/** 固定資産税＋都市計画税の推計（年額）。yearIndex = 購入後何年目か（0始まり） */
export function estimatePropertyTax(h: PropertyTaxInput, yearIndex: number, cityRate: number = PROPERTY_TAX.cityRate): Yen {
  const T = { ...PROPERTY_TAX, cityRate };
  const landEval = h.landPrice * T.landEvalRatio;
  const land = landEval * T.landFixedFactor * T.fixedRate + landEval * T.landCityFactor * T.cityRate;
  const life = h.kind === 'mansion' ? T.rcYears : T.woodYears;
  const dep = Math.max(T.bldgFloor, 1 - ((1 - T.bldgFloor) * yearIndex) / life);
  const bldgEval = h.buildingPrice * T.bldgEvalRatio * dep;
  let fixedB = bldgEval * T.fixedRate;
  const cutYears = h.energy === 'longlife' ? T.newBuildYearsLonglife : T.newBuildYears;
  if (h.newBuild && h.cutEnabled && yearIndex < cutYears) {
    const share = h.floorArea && h.floorArea > T.newBuildArea ? T.newBuildArea / h.floorArea : 1;
    fixedB -= fixedB * T.newBuildCut * share;
  }
  const cityB = bldgEval * T.cityRate;
  return Math.round(land + fixedB + cityB);
}
