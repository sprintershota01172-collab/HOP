/**
 * 初期値・制度値とその出典（確認日: 2026-10-28）
 *
 * kind:
 *  - 'stat'   公的統計の値
 *  - 'law'    法令・制度で決まっている値
 *  - 'market' 市場の実勢（変動する）
 *  - 'guide'  一般的な目安（制度上の基準ではない）
 *  - 'assume' アプリが置く仮定（ユーザーが変更する前提）
 */
export interface Source {
  id: string;
  title: string;
  org: string;
  url: string;
  published: string;
  checked: string;
  kind: 'stat' | 'law' | 'market' | 'guide';
  note: string;
}

export const CHECKED = '2026-10-28';

export const SOURCES: Source[] = [
  {
    id: 'mext-r5',
    title: '令和5年度 子供の学習費調査',
    org: '文部科学省',
    url: 'https://www.mext.go.jp/content/20241225-mxt_chousa01_000039333_1.pdf',
    published: '2024-12-25',
    checked: CHECKED,
    kind: 'stat',
    note: '幼稚園〜高校の学習費（学校教育費・給食費・学校外活動費）の年額。教育費の初期値に使用。',
  },
  {
    id: 'jfc-r3',
    title: '令和3年度 教育費負担の実態調査',
    org: '日本政策金融公庫（ファイナンシャルフィールドの解説で照合）',
    url: 'https://financial-field.com/living/entry-188017',
    published: '2021-12',
    checked: CHECKED,
    kind: 'stat',
    note: '大学の入学費用・在学費用（国公立／私立文系／私立理系）。公庫の調査票原本は未取得のため、解説記事の数値を使用。',
  },
  {
    id: 'cfa-allowance',
    title: '児童手当制度の改正（令和6年10月〜）',
    org: 'こども家庭庁（香川県の案内で照合）',
    url: 'https://www.pref.kagawa.lg.jp/kosodate/jidoteate/seidokaisei.html',
    published: '2024-10',
    checked: CHECKED,
    kind: 'law',
    note: '高校生年代まで延長・所得制限撤廃。3歳未満1.5万円、3歳〜高校生年代1万円、第3子以降3万円（22歳年度末まで数える）。',
  },
  {
    id: 'mhlw-leave',
    title: '出生後休業支援給付金・育児時短就業給付金の創設',
    org: '厚生労働省',
    url: 'https://www.mhlw.go.jp/content/11601000/001334939.pdf',
    published: '2025-04-01施行',
    checked: CHECKED,
    kind: 'law',
    note: '育児休業給付 67%（180日まで）→50%。出生後休業支援給付 13%（最大28日）。時短就業給付は時短中賃金の10%。上限額は令和7年7月31日までの値（毎年8月改定）。',
  },
  {
    id: 'flat35-ratio',
    title: 'フラット35 商品概要説明書（総返済負担率）',
    org: '住宅金融支援機構（ゆうちょ銀行取扱分）',
    url: 'https://www.jp-bank.japanpost.jp/setumeisho/pdf/yucho_flat35.pdf',
    published: '—',
    checked: CHECKED,
    kind: 'law',
    note: '年収400万円未満30%以下・400万円以上35%以下。返済期間15〜35年、完済時80歳まで。',
  },
  {
    id: 'rate-2026-10',
    title: 'フラット35の金利 3.83%（2026年10月、過去最高）',
    org: '共同通信（熊本日日新聞）',
    url: 'https://kumanichi.com/articles/2041676',
    published: '2026-10-01',
    checked: CHECKED,
    kind: 'market',
    note: '返済期間21〜35年の最低金利。前月比+0.37pt。',
  },
  {
    id: 'rate-variable',
    title: '2026年10月 住宅ローン金利ランキング',
    org: '0systems（各行公表値の集計）',
    url: 'https://0systems.com/2026/10/03/53465/',
    published: '2026-10-03',
    checked: CHECKED,
    kind: 'market',
    note: '変動金利の上位は1.04〜1.275%程度。35年固定は3.83〜4.2%程度。',
  },
  {
    id: 'mortgage-r8',
    title: '令和8年度税制改正 住宅ローン減税の延長・拡充',
    org: '国土交通省',
    url: 'https://www.mlit.go.jp/report/press/house02_hh_000241.html',
    published: '2025-12-26（法成立 2026-03-31）',
    checked: CHECKED,
    kind: 'law',
    note: '2030年末入居まで5年延長。控除率0.7%。借入限度額（新築）は認定4,500万円（子育て等5,000万円）、ZEH水準3,500万円（4,500万円）、省エネ基準2,000万円（3,000万円）を山田&パートナーズの解説で照合。限度額表の一次資料（別紙）は未取得のため、控除は初期設定で計算に含めない。',
  },
  {
    id: 'nisa-r8',
    title: '令和8年度税制改正 NISAの対象年齢拡大',
    org: '山田&パートナーズ（税制改正大綱の解説）',
    url: 'https://www.yamada-partners.jp/reform/r8/k03-expanding-nisa-investment-eligibility-age',
    published: '2025-12',
    checked: CHECKED,
    kind: 'law',
    note: '18歳以上: 年間360万円（つみたて120万・成長240万）、生涯1,800万円（成長は1,200万円まで）。0〜17歳向けつみたて投資枠（年60万・600万円）は2027年開始。',
  },
  {
    id: 'pension-r8',
    title: '令和8年度の年金額改定',
    org: '厚生労働省（ファイナンシャルフィールドの解説で照合）',
    url: 'https://financial-field.com/pension/entry-505310',
    published: '2026-01-23',
    checked: CHECKED,
    kind: 'law',
    note: '老齢基礎年金（満額）月70,608円。夫婦2人のモデル年金 月237,279円。年金未入力時の推計に使用。',
  },
  {
    id: 'kakei-2025',
    title: '家計調査報告（家計収支編）2025年平均',
    org: '総務省統計局',
    url: 'https://www.stat.go.jp/data/kakei/2025np/pdf/summary.pdf',
    published: '2026',
    checked: CHECKED,
    kind: 'stat',
    note: '65歳以上の夫婦のみの無職世帯: 消費支出 月263,979円、社会保障給付 月228,614円、不足 月42,434円。老後生活費の仮置きに使用。',
  },
  {
    id: 'misc-cost',
    title: '住宅購入時の諸費用の目安',
    org: '野村不動産ソリューションズ',
    url: 'https://www.nomu.com/house/study/13.html',
    published: '—',
    checked: CHECKED,
    kind: 'guide',
    note: '新築一戸建て 物件価格の約7〜8%、中古 約6〜10%（仲介手数料込み）。',
  },
  {
    id: 'property-tax',
    title: '新築住宅の固定資産税の減額・住宅用地の特例',
    org: '地方税法（HOME\'S不動産投資の解説で照合）',
    url: 'https://toushi.homes.co.jp/column/tax/tax_system_amendment/law08/',
    published: '—',
    checked: CHECKED,
    kind: 'law',
    note: '固定資産税1.4%・都市計画税0.3%（上限）。小規模住宅用地は固定資産税1/6・都市計画税1/3。新築住宅は120㎡分の固定資産税を3年度（長期優良住宅5年度）1/2。',
  },
  {
    id: 'care-2024',
    title: '生命保険に関する全国実態調査（2024年度）介護費用',
    org: '生命保険文化センター',
    url: 'https://jili.or.jp/lifeplan/lifesecurity/1116.html',
    published: '2024',
    checked: CHECKED,
    kind: 'stat',
    note: '介護の一時費用 平均47.2万円、月額 平均9.0万円、期間 平均55.0か月。1人あたり約542万円を「老後の予備資金」として最後まで残す条件に使用。',
  },
];

/** 老後の予備資金（介護費用の平均・1人あたり） = 47.2万円 + 9.0万円 × 55か月 */
export const CARE_RESERVE = 472_000 + 90_000 * 55;

/* ---------- 教育費（文部科学省 令和5年度 子供の学習費調査・年額） ---------- */
/** school = 学校教育費 + 学校給食費、outside = 学校外活動費（塾・習い事等） */
export const EDU_MEXT = {
  kinder: { public: { school: 84_597, outside: 100_049 }, private: { school: 189_803, outside: 157_535 } },
  elem: { public: { school: 120_158, outside: 216_107 }, private: { school: 1_107_684, outside: 720_428 } },
  middle: { public: { school: 186_414, outside: 356_061 }, private: { school: 1_137_378, outside: 422_981 } },
  high: { public: { school: 351_452, outside: 246_300 }, private: { school: 766_490, outside: 263_793 } },
} as const;

/** 大学（日本政策金融公庫 令和3年度 教育費負担の実態調査） */
export const EDU_UNIV = {
  national: { entrance: 672_000, annual: 1_035_000 },
  privateArts: { entrance: 818_000, annual: 1_520_000 },
  privateSci: { entrance: 888_000, annual: 1_832_000 },
} as const;

/** NISA の上限（画面の説明用） */
export const NISA_NOTE = 'NISAは18歳以上で年360万円（つみたて120万円・成長240万円）、生涯1,800万円まで。上限を超える積立は計算に入れません。';

/** 統計値の基準年（この年の物価として扱い、以降は物価上昇率で伸ばす） */
export const STAT_BASE_YEAR = 2026;

/* ---------- 児童手当（令和6年10月〜） ---------- */
export const CHILD_ALLOWANCE = { under3: 15_000, over3: 10_000, third: 30_000 } as const;

/* ---------- 育児休業給付など ---------- */
export const LEAVE = {
  maternityRate: 2 / 3, // 出産手当金（標準報酬日額の2/3）
  leaveRateFirst: 0.67, // 育児休業給付（開始180日まで）
  leaveRateLater: 0.5,
  postBirthTopUp: 0.13, // 出生後休業支援給付（最大28日）
  shortTimeTopUp: 0.1, // 育児時短就業給付（2歳未満）
  /** 給付（非課税・社保免除）を手取りに換算する係数。手取り ≒ 額面の80% として「給付率80% ≒ 手取り10割」 */
  netRatio: 0.8,
  capFirst: 315_369,
  capLater: 235_350,
} as const;

/* ---------- 年金推計（年金未入力時） ---------- */
export const PENSION = {
  basicMonthly: 70_608, // 令和8年度 老齢基礎年金（満額）
  proportionalRate: 5.481 / 1000, // 報酬比例部分（平成15年4月以降の乗率）
  workStartAge: 22,
  netRatio: 0.9, // 税・社会保険料控除後の目安
} as const;

/* ---------- 老後生活費（家計調査 2025年 65歳以上夫婦のみ無職世帯 消費支出） ---------- */
export const RETIRE_LIVING_COUPLE = 263_979;

/* ---------- 住宅ローン審査の目安（フラット35） ---------- */
export const SCREENING = { lowIncome: 4_000_000, ratioLow: 0.3, ratioHigh: 0.35, maxYears: 35, maxAge: 80 } as const;

/* ---------- 住宅ローン控除（令和8年度改正後・2026〜2027年入居の新築） ---------- */
export const DEDUCTION = {
  rate: 0.007,
  residentTaxCap: 97_500,
  limits: {
    longlife: { normal: 45_000_000, kosodate: 50_000_000, years: 13 },
    zeh: { normal: 35_000_000, kosodate: 45_000_000, years: 13 },
    standard: { normal: 20_000_000, kosodate: 30_000_000, years: 10 },
    other: { normal: 0, kosodate: 0, years: 0 },
  },
} as const;

/* ---------- 固定資産税・都市計画税の推計 ---------- */
export const PROPERTY_TAX = {
  fixedRate: 0.014,
  cityRate: 0.003,
  landEvalRatio: 0.7, // 固定資産税評価額 ≒ 公示価格の7割
  landFixedFactor: 1 / 6, // 小規模住宅用地
  landCityFactor: 1 / 3,
  bldgEvalRatio: 0.6, // 新築家屋の評価額 ≒ 請負価格の5〜7割（目安）
  bldgFloor: 0.2, // 経年減点補正率の下限
  woodYears: 25,
  rcYears: 47,
  newBuildCut: 0.5,
  newBuildYears: 3,
  newBuildYearsLonglife: 5,
  newBuildArea: 120,
} as const;

/* ---------- アプリの仮定（ユーザーが変更できる初期値） ---------- */
export const ASSUME = {
  miscRate: 0.07, // 諸費用率（新築戸建て 7〜8% の下限側）
  landShareDetached: 0.35,
  landShareMansion: 0.2,
  maintenanceDetached: 20_000, // 戸建ての修繕積立相当（月）
  maintenanceMansion: 35_000, // マンションの管理費＋修繕積立金（月）
  insuranceDetached: 60_000, // 火災・地震保険（年）
  insuranceMansion: 25_000,
  nurseryMonthly: 30_000, // 0〜2歳保育料（自治体・所得で大きく異なる）
  inflation: 0.015,
  pensionAdjust: -0.005, // マクロ経済スライドによる調整の目安
  returnLow: 0.01,
  returnMid: 0.03,
  returnHigh: 0.05,
  endAge: 95,
  reserveMonths: 3,
  retireAge: 65,
  pensionStartAge: 65,
  raiseRate: 0.01,
  grossFromNet: 1 / 0.78, // 額面未入力時の推計（手取り ≒ 額面の78%）
  childLiving: { preschool: 10_000, elem: 15_000, middleHigh: 25_000, univ: 20_000 },
  variableRate: 0.0105,
  fixedRate: 0.0383,
  screeningRate: 0.035,
  rampMonths: 60, // 変動金利ストレスを何か月かけて上げるか
} as const;
