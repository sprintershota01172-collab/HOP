/**
 * 住む地域で変わる子育ての費用と税（名古屋市・瀬戸市・日進市・豊田市）。確認日 2026-10-30。
 *
 *  - 0〜2歳の保育料: 市の利用者負担額表（保育標準時間・第1子）。父母の市町村民税所得割額の合計で階層が決まる
 *  - 3〜5歳の保育園の給食費（主食費＋副食費）: 保育料は国の無償化で0円、給食費は実費
 *  - 公立小学校の給食費: 2026年4月から国の負担軽減（月5,200円まで）。4市とも保護者負担は0円として計算
 *  - 公立中学校の給食費: 市ごと（豊田市は無償）
 *  - 学童保育（小1〜小3）: 公設の放課後児童クラブなどの月額
 *  - 都市計画税の税率
 *
 * 地域を選ばない場合は全国平均（文部科学省「子供の学習費調査」）と国の目安を使う。
 */
import type { Yen } from './types';

export type RegionKey = 'nagoya' | 'seto' | 'nisshin' | 'toyota';

export interface Bracket {
  /** この額未満なら（null は上限なし） */
  below: number | null;
  /** 保育標準時間・月額 */
  fee: Yen;
  code: string;
}

export interface RegionInfo {
  key: RegionKey;
  name: string;
  nursery: {
    brackets: Bracket[];
    /** 2人目の保育料: half = 同時に通う2人目は半額（3人目以降は無料）、free = 2人目以降は無料 */
    second: 'half' | 'free';
    note: string;
    source: string;
  };
  /** 3〜5歳の保育園の給食費（主食費＋副食費・月額） */
  preschoolMeal: { monthly: Yen; fukushoku: Yen; note: string; source: string };
  /** 公立中学校の給食費（年額） */
  middleLunch: { annual: Yen; note: string; source: string; estimated: boolean };
  /** 学童保育（小1〜小3）の年額。null = 市の公表額がない（入力してもらう） */
  afterSchool: { annual: Yen | null; note: string; source: string };
  cityPlanRate: number;
  cityPlanSource: string;
}

/** 公立中学校の給食費の全国平均（文部科学省 令和5年度 学校給食費調査・月額 5,367円）× 11か月 */
const NATIONAL_MIDDLE_LUNCH = 5_367 * 11;

export const REGIONS: Record<RegionKey, RegionInfo> = {
  nagoya: {
    key: 'nagoya',
    name: '名古屋市',
    nursery: {
      brackets: [
        { below: 10_000, fee: 6_400, code: 'C2' },
        { below: 40_800, fee: 7_500, code: 'C3' },
        { below: 43_800, fee: 11_200, code: 'C4' },
        { below: 55_200, fee: 13_900, code: 'C5' },
        { below: 67_000, fee: 17_500, code: 'C6' },
        { below: 88_800, fee: 22_100, code: 'C7' },
        { below: 110_000, fee: 25_800, code: 'C8' },
        { below: 131_600, fee: 29_400, code: 'C9' },
        { below: 180_000, fee: 34_900, code: 'C10' },
        { below: 236_800, fee: 42_700, code: 'C11' },
        { below: 281_000, fee: 50_300, code: 'C12' },
        { below: 351_500, fee: 58_300, code: 'C13' },
        { below: 411_800, fee: 63_400, code: 'C14' },
        { below: 518_000, fee: 63_900, code: 'C15' },
        { below: null, fee: 64_000, code: 'C16' },
      ],
      second: 'half',
      note: '令和7年度の基準月額表（平成29年度から同じ額）。同時に通う2人目は半額、3人目以降は無料',
      source: 'nagoya-nursery',
    },
    preschoolMeal: { monthly: 4_500, fukushoku: 4_500, note: '施設ごとに決まる実費。国の目安（副食費 月4,500円）で計算', source: 'cfa-fukushoku' },
    middleLunch: { annual: 320 * 20 * 11, note: 'スクールランチ（選択制）1食320円。毎日利用した場合（月20食×11か月）', source: 'nagoya-lunch', estimated: false },
    afterSchool: { annual: 6_500 * 12, note: 'トワイライトルーム 19時までの選択事業 月6,500円（留守家庭児童育成会は平均 月約1.4万円）', source: 'nagoya-twilight' },
    cityPlanRate: 0.003,
    cityPlanSource: 'nagoya-tax',
  },
  seto: {
    key: 'seto',
    name: '瀬戸市',
    nursery: {
      brackets: [
        { below: 48_600, fee: 9_000, code: 'C2' },
        { below: 55_000, fee: 11_000, code: 'D2' },
        { below: 57_700, fee: 12_000, code: 'D4' },
        { below: 61_000, fee: 12_000, code: 'D6' },
        { below: 77_101, fee: 16_000, code: 'D8' },
        { below: 79_000, fee: 16_000, code: 'D9' },
        { below: 85_000, fee: 20_000, code: 'D10' },
        { below: 97_000, fee: 24_000, code: 'D11' },
        { below: 145_000, fee: 27_000, code: 'D12' },
        { below: 157_000, fee: 32_000, code: 'D13' },
        { below: 169_000, fee: 37_000, code: 'D14' },
        { below: 185_000, fee: 43_000, code: 'D15' },
        { below: 209_000, fee: 48_000, code: 'D16' },
        { below: 227_000, fee: 51_000, code: 'D17' },
        { below: null, fee: 54_000, code: 'D18' },
      ],
      second: 'half',
      note: '令和8年度 保育園入所申込案内の利用者負担額。2人目は半額、3人目は無料。延長保育料は全園無料',
      source: 'seto-nursery',
    },
    preschoolMeal: { monthly: 5_900, fukushoku: 4_900, note: '市内の私立・公設民営園の多く（主食費 約1,000円＋副食費 4,900円）。園ごとに異なる', source: 'seto-nursery-list' },
    middleLunch: { annual: NATIONAL_MIDDLE_LUNCH, note: '市の公表額を確認できなかったため、公立中学校の給食費の全国平均（月5,367円×11か月）で計算', source: 'mext-lunch', estimated: true },
    afterSchool: { annual: null, note: '児童クラブごとに異なり、市の一覧に金額の掲載がない（月額を入力）', source: 'seto-club' },
    cityPlanRate: 0.003,
    cityPlanSource: 'seto-tax',
  },
  nisshin: {
    key: 'nisshin',
    name: '日進市',
    nursery: {
      brackets: [
        { below: 48_600, fee: 11_000, code: 'C' },
        { below: 61_000, fee: 13_500, code: 'D1' },
        { below: 73_000, fee: 16_500, code: 'D2' },
        { below: 85_000, fee: 20_500, code: 'D3' },
        { below: 97_000, fee: 24_500, code: 'D4' },
        { below: 109_000, fee: 31_000, code: 'D5' },
        { below: 133_000, fee: 37_000, code: 'D6' },
        { below: 169_000, fee: 43_000, code: 'D7' },
        { below: 213_000, fee: 49_000, code: 'D8' },
        { below: 301_000, fee: 54_500, code: 'D9' },
        { below: 397_000, fee: 57_500, code: 'D10' },
        { below: null, fee: 59_500, code: 'D11' },
      ],
      second: 'half',
      note: '令和8年度 保育料基準額表（2・3号認定）。同時入園の2人目は半額、3人目以降は無料（県の第2子無料化は令和7年度のみ）',
      source: 'nisshin-nursery',
    },
    preschoolMeal: { monthly: 5_200, fukushoku: 4_800, note: '公立保育園 主食費 400円＋副食費 4,800円', source: 'nisshin-nursery-guide' },
    middleLunch: { annual: NATIONAL_MIDDLE_LUNCH, note: '令和8年度の保護者負担額（市のPDF）を確認できなかったため、公立中学校の給食費の全国平均（月5,367円×11か月）で計算', source: 'mext-lunch', estimated: true },
    afterSchool: { annual: 5_200 * 11 + 8_200, note: '公設の放課後児童クラブ 月5,200円（8月は8,200円）', source: 'nisshin-club' },
    cityPlanRate: 0.0015,
    cityPlanSource: 'nisshin-tax',
  },
  toyota: {
    key: 'toyota',
    name: '豊田市',
    nursery: {
      brackets: [
        { below: 77_101, fee: 0, code: 'C03' },
        { below: 97_000, fee: 12_000, code: 'D01' },
        { below: 169_000, fee: 15_000, code: 'D02' },
        { below: 301_000, fee: 32_000, code: 'D03' },
        { below: null, fee: 37_000, code: 'D04' },
      ],
      second: 'free',
      note: '令和8年度版 こども園等のご案内の基本保育料。第2子以降は0円',
      source: 'toyota-nursery',
    },
    preschoolMeal: { monthly: 0, fukushoku: 0, note: '市内のこども園等の3〜5歳児の給食費は無料', source: 'toyota-nursery' },
    middleLunch: { annual: 0, note: '市立小中学校の給食費は2024年4月から無償', source: 'toyota-lunch', estimated: false },
    afterSchool: { annual: 5_500 * 11 + 8_000, note: '放課後児童クラブ 月5,500円（8月は8,000円）', source: 'toyota-club' },
    cityPlanRate: 0.0025,
    cityPlanSource: 'toyota-tax',
  },
};

export const REGION_KEYS = Object.keys(REGIONS) as RegionKey[];

/** 全国平均で計算する場合（地域を選ばない） */
export const NATIONAL = {
  /** 3〜5歳の保育園の副食費（国の目安・月額） */
  preschoolMeal: 4_500,
  /** 公立中学校の給食費（文部科学省 令和5年度 子供の学習費調査・年額） */
  middleLunch: 35_667,
  cityPlanRate: 0.003,
};

/** 副食費が免除される所得割額（年収360万円未満相当） */
export const FUKUSHOKU_EXEMPT_BELOW = 57_700;

/**
 * 給与収入から市町村民税の所得割額（6%）の概算。保育料の階層を決めるのに使う。
 * 給与所得控除（令和7年分以降）・社会保険料は額面の15%・住民税の基礎控除43万円。配偶者控除（33万円）は相手の給与収入が123万円以下のとき。
 * 保育料は住宅ローン控除などの税額控除を引く前の所得割額で決まるため、ここでも引かない。
 */
export function residentIncomeTax(gross: Yen, spouseGross: Yen | null): Yen {
  if (gross <= 0) return 0;
  let kyuyo: number;
  if (gross <= 1_900_000) kyuyo = 650_000;
  else if (gross <= 3_600_000) kyuyo = gross * 0.3 + 80_000;
  else if (gross <= 6_600_000) kyuyo = gross * 0.2 + 440_000;
  else if (gross <= 8_500_000) kyuyo = gross * 0.1 + 1_100_000;
  else kyuyo = 1_950_000;
  const spouse = spouseGross != null && spouseGross <= 1_230_000 ? 330_000 : 0;
  const taxable = Math.max(0, gross - kyuyo - gross * 0.15 - 430_000 - spouse);
  return Math.floor(taxable / 1000) * 1000 * 0.06;
}

/** 世帯の所得割額（父母の合計）から 0〜2歳の保育料（第1子・保育標準時間・月額）と階層 */
export function nurseryFee(region: RegionInfo, incomeTax: Yen): Bracket {
  if (incomeTax <= 0) return { below: 0, fee: 0, code: '非課税' };
  return region.nursery.brackets.find((b) => b.below == null || incomeTax < b.below)!;
}
