import { loanFeeRateOf, miscDetail } from './recommend';
import { ACQUISITION_TAX, DEDUCTION, GIFT_TAX } from './reference';
import type { Resolved } from './resolve';
import { deductionPlan, propertyTaxForYear, type DeductionYear, type SimResult } from './simulate';
import { giftTax, purchaseCostItems, type CostItem, type GiftMode } from './tax';
import type { Yen, YM } from './types';
import { ymYear } from './ym';

/** 住まいの画面に出す「購入時の諸費用と税」「住宅ローン控除」「固定資産税」の見込み */
export interface HousingTaxView {
  /** 計算に使っている諸費用の方式 */
  mode: 'detail' | 'rate';
  purchaseYM: YM;
  price: Yen;
  loan: Yen;
  /** 計算に使っている諸費用（取得総額 − 物件価格） */
  misc: Yen;
  /** 内訳で計算した場合の諸費用（購入時に払う分）と内訳 */
  detailNow: Yen;
  items: CostItem[];
  /** 諸費用率で計算した場合の諸費用 */
  rateMisc: Yen;
  /** 購入の半年後に払う不動産取得税 */
  acqTax: Yen;
  acqTaxYM: YM;
  /** 固定資産税・都市計画税（購入した年から10年分） */
  propertyTax: { year: number; land: Yen; building: Yen; total: Yen; cut: boolean }[];
  /** 住宅ローン控除（計算に入れていなくても、入れた場合の見込みを出す） */
  deduction: {
    enabled: boolean;
    family: 'kosodate' | 'normal';
    limit: Yen;
    years: number;
    total: Yen;
    unused: Yen;
    list: DeductionYear[];
    note: string | null;
  } | null;
  gift: { amount: Yen; mode: GiftMode; tax: Yen; exempt: Yen; usable: boolean; year: number } | null;
  /** 確認・手続きが必要なこと */
  notes: string[];
}

export function housingTaxView(r: Resolved, sim: SimResult | null): HousingTaxView | null {
  const purchase = sim?.purchase;
  if (!sim || !purchase) return null;
  const h = r.plan.housing;
  const hm = purchase.house;
  const py = ymYear(purchase.ym);
  const items = purchaseCostItems(hm, purchase.loan, { loanFeeRate: loanFeeRateOf(h), extra: h.extraCost ?? 0 });
  const detailNow = items.filter((x) => x.when === 'now').reduce((s, x) => s + x.value, 0);
  const acq = items.find((x) => x.key === 'acq')?.value ?? 0;
  const propertyTax = Array.from({ length: 10 }, (_, i) => ({ year: py + i, ...propertyTaxForYear(r, hm, purchase.ym, py + i) }));

  let deduction: HousingTaxView['deduction'] = null;
  if (sim.schedule && purchase.loan > 0) {
    const on = { ...r, plan: { ...r.plan, housing: { ...h, deduction: { ...h.deduction, enabled: true } } } };
    const dp = deductionPlan(on, purchase, sim.schedule);
    if (dp)
      deduction = {
        enabled: h.deduction.enabled,
        family: dp.family,
        limit: dp.limit,
        years: dp.years,
        total: dp.list.reduce((s, x) => s + x.credit, 0),
        unused: dp.list.reduce((s, x) => s + x.unused, 0),
        list: dp.list,
        note: dp.note,
      };
  }

  const mode = h.giftMode ?? 'exempt';
  const gift = h.gift > 0 ? { amount: h.gift, mode, ...giftTax(h.gift, mode, hm.energy, py), year: py } : null;

  const notes: string[] = [];
  if (h.deduction.enabled || deduction) {
    notes.push(`住宅ローン控除は入居した年の翌年2月16日〜3月15日に確定申告が必要（2年目からは勤務先の年末調整）。${DEDUCTION.lastYear}年末までの入居が対象`);
    if (hm.newBuild && hm.energy === 'standard' && py > DEDUCTION.standardNewLastYear) notes.push('2028年以降に入居する新築の省エネ基準適合住宅は、2027年末までに建築確認を受けたものだけが対象（2,000万円×10年）');
    if (hm.newBuild) notes.push('2028年以降に入居する新築は、土砂災害特別警戒区域などの災害レッドゾーンにあると控除の対象外');
  }
  if (gift && gift.amount > GIFT_TAX.basic) {
    if (mode === 'exempt' && !gift.usable)
      notes.push(`住宅取得等資金の贈与の非課税は${GIFT_TAX.exemptLastYear}年12月31日までの贈与が対象（延長は令和9年度税制改正で要望中）。延長されない場合は相続時精算課税を選ぶと贈与税は0円`);
    notes.push('110万円を超える援助は、贈与を受けた翌年の2月1日〜3月15日に贈与税の申告が必要（非課税の特例・相続時精算課税も申告で使う）');
  }
  if (acq > 0) notes.push(`不動産取得税は購入から約${ACQUISITION_TAX.payAfterMonths}か月後に県から納税通知書が届く（軽減は申告が必要な場合あり）`);
  if (h.newBuildTaxCut === false && hm.newBuild) notes.push('新築住宅の固定資産税の減額は計算に入れていない（厳しめ）。「税の優遇」で入れられる');
  if (!miscDetail(h)) notes.push('諸費用は物件価格×諸費用率で計算中。内訳（下の表）で計算するよう切り替えられる');

  return {
    mode: miscDetail(h) ? 'detail' : 'rate',
    purchaseYM: purchase.ym,
    price: hm.price,
    loan: purchase.loan,
    misc: hm.misc,
    detailNow,
    items,
    rateMisc: Math.round(hm.price * h.miscRate),
    acqTax: hm.acqTax,
    acqTaxYM: purchase.ym + ACQUISITION_TAX.payAfterMonths,
    propertyTax,
    deduction,
    gift,
    notes,
  };
}

