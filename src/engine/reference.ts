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
/** 子供の生活費の出典を確かめた日 */
export const CHECKED_CHILD = '2026-11-13';
/** 住宅の税（登録免許税・不動産取得税・印紙税・贈与税・住宅ローン控除の限度額）を確かめた日 */
export const CHECKED_TAX = '2026-11-14';

export const SOURCES: Source[] = [
  {
    id: 'mext-r5',
    title: '令和5年度 子供の学習費調査',
    org: '文部科学省',
    url: 'https://www.mext.go.jp/content/20260116-mxt_chousa01-000039333_3.pdf',
    published: '2024-12-25（2026-01-16 数値訂正版）',
    checked: CHECKED_CHILD,
    kind: 'stat',
    note: '幼稚園〜高校の学習費（学校教育費・給食費・学校外活動費）の年額。教育費の初期値に使用。学習塾費（表6）は中学生からとし、中学・高校は学年別の値を使う。',
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
    id: 'child-cost-2024',
    title: '日本における0〜18歳の子育てに要する費用の調査：ウェブアンケート調査2024',
    org: '竹原健二ほか（国立成育医療研究センター）・日本公衆衛生雑誌 73(2)',
    url: 'https://www.jsph.jp/docs/magazine/2026/02/73-2_p176.pdf',
    published: '2026',
    checked: CHECKED,
    kind: 'stat',
    note: '0〜6歳は年齢別、小1〜高3は学年別の年額。医療・携帯・おこづかい・行事・レジャーはこの値を使い、食費・衣類・日用品は年齢による増え方（形）だけを使う（金額は下の標準生計費・家計調査に合わせる）。教育費は文部科学省の学習費調査で別に計算。',
  },
  {
    id: 'jinji-std-r7',
    title: '令和7年4月の標準生計費（費目別、世帯人員別）',
    org: '人事院（総務省「家計調査」などから算定）',
    url: 'https://www.jinji.go.jp/content/000011703.pdf',
    published: '2025-08',
    checked: CHECKED_CHILD,
    kind: 'stat',
    note: '食料費 2人48,320円・3人61,800円・4人75,270円・5人88,750円、被服・履物費 2人4,480円〜5人12,450円（月）。世帯が1人増えるごとの増え方（食料費 約13,480円、被服・履物費 約2,660円）を子供1人の平均にする。',
  },
  {
    id: 'mhlw-dri-2025',
    title: '日本人の食事摂取基準（2025年版）推定エネルギー必要量',
    org: '厚生労働省（堺市・農林水産省の資料で照合。0〜9歳は2020年版の値）',
    url: 'https://www.city.sakai.lg.jp/kenko/kenko/kenkozoshin/eiyo/eiyoseibun/ichinichi.html',
    published: '2024-10',
    checked: CHECKED_CHILD,
    kind: 'guide',
    note: '身体活動レベル「ふつう」の男女平均。子供の食費を年齢で分ける比率に使う（0歳 約590kcal → 中学生 2,500kcal・高校生 2,575kcal。30〜49歳の大人は2,400kcal）。',
  },
  {
    id: 'fukoku-phone-2026',
    title: '中高生の子どものスマホ代（47都道府県調査）',
    org: 'フコク生命「47Life」編集部（北海道新聞の記事で照合）',
    url: 'https://www.hokkaido-np.co.jp/article/1335071/',
    published: '2026',
    checked: CHECKED_CHILD,
    kind: 'stat',
    note: '中高生の毎月のスマホ代 全国平均3,385円（2024年は3,710円）。中1〜高3の携帯代に月3,300円（100円未満切り捨て）を使う。',
  },
  {
    id: 'kakei-2024',
    title: '家計調査 2024年平均（二人以上の世帯）',
    org: '総務省統計局',
    url: 'https://www.stat.go.jp/data/kakei/sokuhou/tsuki/pdf/fies_gaikyo2024.pdf',
    published: '2025-02',
    checked: CHECKED_CHILD,
    kind: 'stat',
    note: '家具・家事用品 月12,788円（平均世帯人員2.88人）。1人あたり約4,440円を子供1人の日用品の平均にする。',
  },
  {
    id: 'mext-lunch-relief',
    title: '学校給食費の抜本的な負担軽減（令和8年4月〜）',
    org: '文部科学省',
    url: 'https://www.mext.go.jp/a_menu/sports/syokuiku/kyu-lighten.html',
    published: '2026',
    checked: '2026-10-30',
    kind: 'law',
    note: '公立小学校の給食の食材費を国が支援（完全給食 月5,200円・11か月）。基準額以下の自治体は保護者負担0円。中学校は対象外。',
  },
  {
    id: 'mext-lunch',
    title: '三党合意に基づく学校給食費の抜本的な負担軽減について（令和5年度 学校給食費調査）',
    org: '文部科学省',
    url: 'https://www.mext.go.jp/content/20260126-mxt_syoto02-000046862_03.pdf',
    published: '2026-01',
    checked: '2026-10-30',
    kind: 'stat',
    note: '公立の学校給食費の全国平均 月額: 小学校4,688円・中学校5,367円（令和5年5月）。市の額が確認できない中学校の給食費に使用。',
  },
  {
    id: 'cfa-fukushoku',
    title: '幼児教育・保育の無償化の概要',
    org: 'こども家庭庁',
    url: 'https://www.cfa.go.jp/policies/kokoseido/mushouka/gaiyou',
    published: '—',
    checked: '2026-10-30',
    kind: 'law',
    note: '3〜5歳の保育料は無料。給食の副食費は保護者負担（国の公定価格上の目安 月4,500円）、年収360万円未満相当世帯と第3子以降は免除。',
  },
  {
    id: 'nagoya-nursery',
    title: '0〜2歳児クラスの利用者負担額（保育料）',
    org: '名古屋市',
    url: 'https://www.city.nagoya.jp/kodomo/kosodate/1009115/1009125/1009255/1009267.html',
    published: '2025-10',
    checked: '2026-10-30',
    kind: 'law',
    note: '基準月額（保育標準時間）C2 6,400円〜C16 64,000円。表のPDFは文字の抽出が崩れるため、階層の額は民間の解説（令和8年度）の表を、公式の一部の値（C1・C10・C11・C16）と照合して使用。',
  },
  {
    id: 'nagoya-lunch',
    title: '学校給食（小学校月4,400円・中学校スクールランチ1食320円）',
    org: '名古屋市',
    url: 'https://www.city.nagoya.jp/kodomo/schools/1034352/1016933/1016946/1016951.html',
    published: '2026-05',
    checked: '2026-10-30',
    kind: 'law',
    note: '中学校はスクールランチ（選択制）1食320円。小学校給食費 月4,400円は国の負担軽減（月5,200円まで）の範囲。',
  },
  {
    id: 'nagoya-twilight',
    title: 'トワイライトルーム（FAQ）',
    org: '名古屋市',
    url: 'https://faq.city.nagoya.jp/faq/detail.aspx?id=2881',
    published: '—',
    checked: '2026-10-30',
    kind: 'law',
    note: '基本（17時まで）無料、選択事業 18時まで月1,500円・19時まで月6,500円。留守家庭児童育成会は平均 月約14,000円（放課後施策の案内 令和5年）。',
  },
  {
    id: 'nagoya-tax',
    title: '固定資産税・都市計画税の税率',
    org: '名古屋市',
    url: 'https://www.city.nagoya.jp/zaisei/page/0000097921.html',
    published: '—',
    checked: '2026-10-30',
    kind: 'law',
    note: '固定資産税1.4%・都市計画税0.3%。',
  },
  {
    id: 'seto-nursery',
    title: '令和8年度 保育園入所申込案内（利用者負担額）',
    org: '瀬戸市',
    url: 'https://www.city.seto.aichi.jp/docs/2011/03/10/00240/files/r8moushikomiannai.pdf',
    published: '2025',
    checked: '2026-10-30',
    kind: 'law',
    note: '0〜2歳 保育標準時間 C2 9,000円〜D18・D19 54,000円。2人目半額・3人目無料。延長保育料は全園無料。',
  },
  {
    id: 'seto-nursery-list',
    title: '令和8年度 保育園一覧（主食費・副食費）',
    org: '瀬戸市',
    url: 'https://www.city.seto.aichi.jp/docs/2016/08/17/00027/files/r8hoikuenichiran.pdf',
    published: '2025',
    checked: '2026-10-30',
    kind: 'law',
    note: '3〜5歳の主食費 750〜1,700円・副食費 4,500〜6,500円（私立・公設民営園）。',
  },
  {
    id: 'seto-club',
    title: '放課後児童クラブ 利用申込書（令和8年度）',
    org: '瀬戸市',
    url: 'https://www.city.seto.aichi.jp/docs/2010/11/10/00856/files/R8_houkagojioukuraburiyoumousikomisyo.pdf',
    published: '2026',
    checked: '2026-10-30',
    kind: 'law',
    note: '保育料は各児童クラブに問い合わせ（市の一覧に金額の掲載なし）。',
  },
  {
    id: 'seto-tax',
    title: '税率について',
    org: '瀬戸市',
    url: 'https://www.city.seto.aichi.jp/docs/2010/11/10/00660/index.html',
    published: '—',
    checked: '2026-10-30',
    kind: 'law',
    note: '固定資産税1.4%・都市計画税0.3%。',
  },
  {
    id: 'nisshin-nursery',
    title: '令和8年度 保育料基準額表（2・3号認定）',
    org: '日進市',
    url: 'https://www.city.nisshin.lg.jp/material/files/group/120/kijyungakuhyou-08.pdf',
    published: '2026',
    checked: '2026-10-30',
    kind: 'law',
    note: '0〜2歳 保育標準時間 C 11,000円〜D11 59,500円。同時入園の2人目半額・3人目以降無料。第二子保育料無料化等事業は令和7年度（10月〜3月）限定。',
  },
  {
    id: 'nisshin-nursery-guide',
    title: '保育園の施設案内（給食費）',
    org: '日進市',
    url: 'https://www.city.nisshin.lg.jp/material/files/group/120/shisetuannnai6.pdf',
    published: '—',
    checked: '2026-10-30',
    kind: 'law',
    note: '公立保育園の3歳以上児 主食費 月400円・副食費 月4,800円。',
  },
  {
    id: 'nisshin-club',
    title: '令和8年度 放課後児童クラブ 利用案内',
    org: '日進市',
    url: 'https://www.city.nisshin.lg.jp/material/files/group/48/R8riyouannnaisyousai.pdf',
    published: '2026',
    checked: '2026-10-30',
    kind: 'law',
    note: '公設の放課後児童クラブ 月5,200円（8月のみ8,200円）。',
  },
  {
    id: 'nisshin-tax',
    title: '固定資産税・都市計画税のあらまし',
    org: '日進市',
    url: 'https://www.city.nisshin.lg.jp/kurashi/seane/zeikin/kotei/8147.html',
    published: '—',
    checked: '2026-10-30',
    kind: 'law',
    note: '固定資産税1.4%・都市計画税0.15%。',
  },
  {
    id: 'toyota-nursery',
    title: '令和8年度版 豊田市こども園等のご案内',
    org: '豊田市',
    url: 'https://www.city.toyota.aichi.jp/_res/projects/default_project/_page_/001/016/126/r0804/01.pdf',
    published: '2026-04',
    checked: '2026-10-30',
    kind: 'law',
    note: '0〜2歳の基本保育料 所得割77,101円未満0円、D01 12,000円・D02 15,000円・D03 32,000円・D04 37,000円。第2子以降0円。3〜5歳は給食費も無料。',
  },
  {
    id: 'toyota-lunch',
    title: '豊田市立学校給食費の無償化について',
    org: '豊田市',
    url: 'https://www.city.toyota.aichi.jp/kurashi/gakkou/kyushoku/1064085/index.html',
    published: '2025-03',
    checked: '2026-10-30',
    kind: 'law',
    note: '市立小中学校の給食費は2024年4月から無償。',
  },
  {
    id: 'toyota-club',
    title: '2026年度 豊田市放課後児童クラブ 参加のしおり',
    org: '豊田市',
    url: 'https://www.city.toyota.aichi.jp/_res/projects/default_project/_page_/001/069/550/r0711/01.pdf',
    published: '2026',
    checked: '2026-10-30',
    kind: 'law',
    note: '通年 月5,500円（8月のみ8,000円）。',
  },
  {
    id: 'toyota-tax',
    title: '都市計画税の概要',
    org: '豊田市',
    url: 'https://www.city.toyota.aichi.jp/kurashi/zeikin/kotei/1002866.html',
    published: '—',
    checked: '2026-10-30',
    kind: 'law',
    note: '都市計画税0.25%（市街化区域内）。',
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
    title: '住宅ローン減税（令和8年度改正）の説明資料',
    org: '国土交通省',
    url: 'https://www.mlit.go.jp/jutakukentiku/house/content/001976453.pdf',
    published: '2026-06',
    checked: CHECKED_TAX,
    kind: 'law',
    note: '2030年末入居まで。控除率0.7%。新築: 長期優良・低炭素4,500万円（子育て・若者夫婦世帯5,000万円）、ZEH水準3,500万円（4,500万円）、省エネ基準2,000万円（3,000万円）×13年（2028年以降の入居は2027年末までに建築確認のもの 2,000万円×10年）。中古: 長期優良・ZEH水準3,500万円（4,500万円）・省エネ基準2,000万円（3,000万円）×13年、その他2,000万円×10年。床面積40㎡以上（上乗せは50㎡以上）。住民税から引けるのは所得税の課税総所得金額等の5%（上限97,500円）。初期設定では計算に含めない（オンで計算）。',
  },
  {
    id: 'income-tax-r8',
    title: '令和8年度税制改正（基礎控除・給与所得控除の見直し）',
    org: '三井のリハウス「不動産・住宅税金の手引き」',
    url: 'https://www.rehouse.co.jp/mtebiki/new/',
    published: '2026',
    checked: CHECKED_TAX,
    kind: 'law',
    note: '所得税の基礎控除（2026・2027年）: 合計所得489万円以下104万円、655万円以下67万円、2,350万円以下62万円。給与所得控除の最低額74万円。新築住宅の固定資産税の減額は5年延長、床面積の要件は40〜240㎡に。住宅ローン控除に使える税額の推計に使用。',
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
    note: '新築一戸建て 物件価格の約7〜8%、中古 約6〜10%（仲介手数料込み）。「価格の割合」で計算するときの初期値。内訳で計算するときは、司法書士12万円・表示登記10万円・融資手数料2.2%を目安に置く。',
  },
  {
    id: 'registration-tax',
    title: '住宅用家屋の登録免許税の軽減',
    org: '財務省',
    url: 'https://www.mof.go.jp/tax_policy/summary/property/e08.htm',
    published: '—',
    checked: CHECKED_TAX,
    kind: 'law',
    note: '所有権保存0.15%（長期優良・低炭素0.1%）、建物の移転0.3%、抵当権設定0.1%（2027年3月31日まで）。土地の売買による移転1.5%（2029年3月31日まで、国土交通省「土地の取得に係る税制の概要」）。',
  },
  {
    id: 'acquisition-tax',
    title: '土地の取得に係る税制の概要（不動産取得税）',
    org: '国土交通省',
    url: 'https://www.mlit.go.jp/totikensangyo/totikensangyo_tk5_000072.html',
    published: '—',
    checked: CHECKED_TAX,
    kind: 'law',
    note: '税率3%（本則4%）・宅地の課税標準1/2（2027年3月31日まで）。新築住宅は評価額から1,200万円（認定長期優良住宅1,300万円）を控除。住宅の土地は「4.5万円」と「1㎡あたりの価格×床面積の2倍（200㎡まで）×3%」の多い方を減額。',
  },
  {
    id: 'stamp-tax',
    title: '不動産売買契約書・建設工事請負契約書の印紙税の軽減',
    org: '国税庁',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7108.htm',
    published: '—',
    checked: CHECKED_TAX,
    kind: 'law',
    note: '2027年3月31日まで軽減（1,000万円超5,000万円以下 1万円、5,000万円超1億円以下 3万円）。ローンの契約書（金銭消費貸借）は軽減なし（1,000万円超5,000万円以下 2万円）。',
  },
  {
    id: 'gift-housing',
    title: '住宅取得等資金に係る贈与税の非課税措置',
    org: '財務省（令和9年度税制改正要望・国土交通省）',
    url: 'https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2027/request/mlit/09y_mlit_k_25.pdf',
    published: '2026-08',
    checked: CHECKED_TAX,
    kind: 'law',
    note: '親・祖父母からの住宅資金の贈与は、質の高い住宅1,000万円・一般住宅500万円まで非課税（2026年12月31日までの贈与。延長を要望中）。110万円の基礎控除と併用。翌年3月15日までに申告が必要。',
  },
  {
    id: 'sale-3000',
    title: 'マイホームを売ったときの特例（3,000万円の特別控除）',
    org: '国税庁',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3302.htm',
    published: '—',
    checked: CHECKED_TAX,
    kind: 'law',
    note: '居住用の家の売却益から3,000万円を控除。残りに所有期間5年超20.315%（10年超は6,000万円以下の部分14.21%）、5年以下39.63%。建物の取得費は非事業用の減価償却（木造0.031・鉄筋コンクリート0.015）。',
  },
  {
    id: 'property-tax',
    title: '新築住宅の固定資産税の減額・住宅用地の特例',
    org: '地方税法（HOME\'S不動産投資の解説、令和8年度改正は三井のリハウスの解説で照合）',
    url: 'https://toushi.homes.co.jp/column/tax/tax_system_amendment/law08/',
    published: '—',
    checked: CHECKED_TAX,
    kind: 'law',
    note: '固定資産税1.4%・都市計画税0.3%（上限）。住宅用地は200㎡まで固定資産税1/6・都市計画税1/3、超える部分は1/3・2/3。新築住宅は120㎡分の固定資産税を戸建て3年度・マンション5年度（長期優良住宅5年度・7年度）1/2（床面積40〜240㎡）。新築の建物は完成の翌年から課税、評価は3年ごとの評価替え（2027年度が基準年度）。',
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
  elem: { public: { school: 110_110, outside: 256_489 }, private: { school: 1_031_849, outside: 709_667 } },
  middle: { public: { school: 186_432, outside: 356_018 }, private: { school: 1_137_378, outside: 422_981 } },
  high: { public: { school: 351_523, outside: 245_431 }, private: { school: 832_650, outside: 346_611 } },
} as const;

/**
 * 学校外活動費のうち学習塾費（同じ調査の表6・年額）。avg = 学校種の平均、grade = 学年別（中1〜3・高1〜3）。
 * 塾は中学生から通う前提にし、幼稚園・小学校の初期値からは学習塾費を除く（家庭学習・通信教育・習い事は残す）。
 * 中学・高校は学年別の学習塾費にする（受験の学年ほど高い）。
 */
export const EDU_JUKU = {
  kinder: { public: { avg: 14_167 }, private: { avg: 25_261 } },
  elem: { public: { avg: 75_194 }, private: { avg: 259_492 } },
  middle: { public: { avg: 230_385, grade: [133_647, 213_759, 341_220] }, private: { avg: 168_058, grade: [151_796, 151_425, 202_127] } },
  high: { public: { avg: 147_140, grade: [89_760, 148_775, 206_454] }, private: { avg: 166_867, grade: [109_647, 180_326, 214_709] } },
} as const;

/** 塾を始める学年（中1）。gradeAt の値で 7 */
export const JUKU_FROM_GRADE = 7;

/** 学校外活動費の初期値（年額）。gradeInStage = その学校種での学年（0始まり。中1 = 0） */
export function eduOutside(stage: keyof typeof EDU_MEXT, choice: 'public' | 'private', gradeInStage = 0): number {
  const total = EDU_MEXT[stage][choice].outside;
  const j = EDU_JUKU[stage][choice] as { avg: number; grade?: readonly number[] };
  if (!j.grade) return total - j.avg;
  return total - j.avg + j.grade[Math.max(0, Math.min(j.grade.length - 1, gradeInStage))];
}

/** EDU_MEXT の school のうち学校給食費（同じ調査・年額）。公立小は2026年4月から国の負担軽減で保護者負担0円とする */
export const EDU_LUNCH = { kinderPublic: 15_235, elemPublic: 35_774, middlePublic: 35_671 } as const;
/** 公立小学校の給食費の負担軽減が始まる月 */
export const LUNCH_RELIEF_FROM = 2026 * 12 + 3; // 2026年4月（YM = 年×12 + 月−1）

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

/* ---------- 住宅ローン控除（令和8年度改正後・2026〜2030年入居） ---------- */
/**
 * 借入限度額（normal = 一般、kosodate = 子育て世帯・若者夫婦世帯）と控除期間。
 * 国土交通省「住宅ローン減税」説明資料（令和8年度改正）。
 * 新築の省エネ基準適合住宅は2027年末入居まで（2028年以降は2027年末までに建築確認を受けたものだけ 2,000万円×10年）。
 * その他の住宅（省エネ基準を満たさない）は新築は対象外、中古は2,000万円×10年。
 */
export const DEDUCTION = {
  rate: 0.007,
  residentTaxCap: 97_500,
  /** 住民税から控除できるのは所得税の課税総所得金額等の5%まで */
  residentTaxRate: 0.05,
  limits: {
    longlife: { normal: 45_000_000, kosodate: 50_000_000, years: 13 },
    zeh: { normal: 35_000_000, kosodate: 45_000_000, years: 13 },
    standard: { normal: 20_000_000, kosodate: 30_000_000, years: 13 },
    other: { normal: 0, kosodate: 0, years: 0 },
  },
  usedLimits: {
    longlife: { normal: 35_000_000, kosodate: 45_000_000, years: 13 },
    zeh: { normal: 35_000_000, kosodate: 45_000_000, years: 13 },
    standard: { normal: 20_000_000, kosodate: 30_000_000, years: 13 },
    other: { normal: 20_000_000, kosodate: 20_000_000, years: 10 },
  },
  /** 新築の省エネ基準適合住宅を入居できる最後の年（2028年以降は 2,000万円×10年・2027年末までに建築確認のもの） */
  standardNewLastYear: 2027,
  standardNewLate: { limit: 20_000_000, years: 10 },
  lastYear: 2030,
  /** 子育て世帯・若者夫婦世帯: 夫婦のどちらかが40歳未満、または19歳未満の子がいる（入居した年の12月31日時点） */
  youngAge: 40,
  childAge: 19,
} as const;

/* ---------- 固定資産税・都市計画税の推計 ---------- */
export const PROPERTY_TAX = {
  fixedRate: 0.014,
  cityRate: 0.003,
  landEvalRatio: 0.7, // 固定資産税評価額 ≒ 公示価格の7割
  landFixedFactor: 1 / 6, // 小規模住宅用地（200㎡まで）
  landCityFactor: 1 / 3,
  landFixedFactorLarge: 1 / 3, // 一般住宅用地（200㎡を超える部分）
  landCityFactorLarge: 2 / 3,
  smallLandArea: 200,
  bldgEvalRatio: 0.6, // 新築家屋の評価額 ≒ 請負価格の5〜7割（目安）
  bldgFloor: 0.2, // 経年減点補正率の下限
  woodYears: 25,
  rcYears: 47,
  /** 評価替えの基準年度（3年ごと。建物の評価はこの年度にだけ下がる） */
  reevalBaseYear: 2027,
  newBuildCut: 0.5,
  newBuildYears: 3,
  newBuildYearsLonglife: 5,
  newBuildYearsMansion: 5, // 3階建て以上の耐火・準耐火建築物
  newBuildYearsMansionLonglife: 7,
  newBuildArea: 120, // 減額の対象は120㎡分まで
  newBuildAreaMin: 40, // 床面積の要件（令和8年度改正で 50→40㎡、280→240㎡）
  newBuildAreaMax: 240,
} as const;

/* ---------- 不動産取得税（都道府県税。取得から半年〜1年ほどで納税通知書が届く） ---------- */
export const ACQUISITION_TAX = {
  rate: 0.03, // 住宅・土地の特例税率（本則4%、2027年3月31日まで）
  landHalf: 0.5, // 宅地の課税標準を1/2（2027年3月31日まで）
  bldgDeduct: 12_000_000, // 新築住宅の控除（床面積50〜240㎡）
  bldgDeductLonglife: 13_000_000,
  usedDeduct: 12_000_000, // 中古（1997年4月以降の新築）の控除。古い家はもっと少ない
  landMinReduce: 45_000,
  landFloorMax: 200, // 土地の減額: 1㎡あたりの価格 × 床面積の2倍（200㎡まで）× 3%
  floorMin: 50,
  floorMax: 240,
  /** 納付の時期（購入から何か月後） */
  payAfterMonths: 6,
} as const;

/* ---------- 登録免許税（登記のときに払う。司法書士が代わりに納める） ---------- */
export const REGISTRATION_TAX = {
  preserve: 0.0015, // 新築建物の所有権保存（本則0.4%、2027年3月31日まで）
  preserveCertified: 0.001, // 長期優良・低炭素住宅
  transferBldg: 0.003, // 中古建物の所有権移転（本則2%）
  transferBldgLonglifeDetached: 0.002,
  transferLand: 0.015, // 土地の売買による所有権移転（本則2%、2029年3月31日まで）
  mortgage: 0.001, // 抵当権設定（本則0.4%）
} as const;

/* ---------- 印紙税（軽減措置は2027年3月31日まで） ---------- */
/** 不動産売買契約書・建設工事請負契約書（軽減後） */
export const STAMP_CONTRACT: [number, number][] = [
  [1_000_000, 200], [2_000_000, 200], [3_000_000, 500], [5_000_000, 1_000], [10_000_000, 5_000],
  [50_000_000, 10_000], [100_000_000, 30_000], [500_000_000, 60_000], [Infinity, 160_000],
];
/** 金銭消費貸借契約書（ローンの契約。軽減なし） */
export const STAMP_LOAN: [number, number][] = [
  [1_000_000, 1_000], [5_000_000, 2_000], [10_000_000, 10_000], [50_000_000, 20_000], [100_000_000, 60_000],
  [500_000_000, 100_000], [Infinity, 200_000],
];

/* ---------- 購入時の手数料（目安） ---------- */
export const PURCHASE_FEES = {
  /** 融資手数料（定率型・借入額×2.2%が多い）。保証料型なら保証料（約2%）に置き換える */
  loanFeeRate: 0.022,
  /** 司法書士の報酬（保存・移転・抵当権設定） */
  scrivener: 120_000,
  /** 建物の表示登記（土地家屋調査士。新築戸建て） */
  surveyor: 100_000,
  /** 仲介手数料 = (価格×3% + 6万円) × 消費税 */
  brokerRate: 0.03,
  brokerFixed: 60_000,
  consumptionTax: 0.1,
  /** 建物の評価額がわからないときに仮置きする床面積（㎡） */
  floorDetached: 100,
  floorMansion: 70,
  landDetached: 150,
} as const;

/* ---------- 贈与税（親などからの住宅資金の援助） ---------- */
export const GIFT_TAX = {
  basic: 1_100_000,
  /** 住宅取得等資金の贈与の非課税（省エネ等住宅 1,000万円・一般 500万円）。2026年12月31日までの贈与 */
  exemptHigh: 10_000_000,
  exemptGeneral: 5_000_000,
  exemptLastYear: 2026,
  /** 相続時精算課税の特別控除（累計） */
  settlement: 25_000_000,
  settlementRate: 0.2,
  /** 直系尊属から18歳以上への贈与（特例税率）: [上限, 税率, 控除額] */
  table: [
    [2_000_000, 0.1, 0], [4_000_000, 0.15, 100_000], [6_000_000, 0.2, 300_000], [10_000_000, 0.3, 900_000],
    [15_000_000, 0.4, 1_900_000], [30_000_000, 0.45, 2_650_000], [45_000_000, 0.5, 4_150_000], [Infinity, 0.55, 6_400_000],
  ] as [number, number, number][],
} as const;

/* ---------- 家を売るときの税（譲渡所得） ---------- */
export const SALE_TAX = {
  /** 居住用財産の3,000万円特別控除 */
  special: 30_000_000,
  /** 所有期間（売った年の1月1日時点）5年超 / 5年以下 / 10年超で6,000万円以下の部分 */
  longRate: 0.20315,
  shortRate: 0.3963,
  longLowRate: 0.1421,
  longLowLimit: 60_000_000,
  /** 非事業用の建物の減価償却（耐用年数×1.5の旧定額法）: 木造33年 0.031、鉄筋コンクリート70年 0.015 */
  depWood: 0.031,
  depRC: 0.015,
} as const;

/**
 * 子育て費用（生活費の部分・年額・円）。0〜6歳は年齢別、7番目以降は小1〜高3の学年別。
 * 竹原健二ほか「日本における0〜18歳の子育てに要する費用の調査：ウェブアンケート調査2024」
 * 日本公衆衛生雑誌 73(2):176-187, 2026（2024年11月調査、第一子の母親4,166人、各項目は3SD超を除いた平均）。
 * 教育費（保育費・学校教育費・学校外教育費・学校外活動費）は教育費の計算（文部科学省「子供の学習費調査」）で別に計上し、
 * 預貯金・保険は消費ではないため含めない。
 */
export const CHILD_COST_SOURCE = '竹原ほか「0〜18歳の子育てに要する費用の調査2024」日本公衆衛生雑誌73(2), 2026';
export const CHILD_COST: { food: number; clothes: number; goods: number; medical: number; phone: number; allowance: number; events: number; leisure: number }[] = [
  // 0〜6歳
  { food: 169_719, clothes: 140_616, goods: 223_810, medical: 7_827, phone: 1_862, allowance: 1_605, events: 2_048, leisure: 19_396 },
  { food: 277_417, clothes: 183_101, goods: 235_915, medical: 7_224, phone: 0, allowance: 530, events: 15_978, leisure: 43_732 },
  { food: 243_957, clothes: 120_857, goods: 164_691, medical: 5_049, phone: 304, allowance: 779, events: 8_829, leisure: 49_043 },
  { food: 321_123, clothes: 168_665, goods: 162_549, medical: 9_399, phone: 477, allowance: 299, events: 18_396, leisure: 66_704 },
  { food: 286_920, clothes: 113_549, goods: 169_775, medical: 7_976, phone: 663, allowance: 2_187, events: 17_403, leisure: 75_892 },
  { food: 313_000, clothes: 85_632, goods: 139_602, medical: 7_098, phone: 386, allowance: 1_525, events: 20_334, leisure: 86_760 },
  { food: 336_380, clothes: 92_730, goods: 128_377, medical: 5_825, phone: 995, allowance: 1_436, events: 19_170, leisure: 113_385 },
  // 小1〜小6
  { food: 352_103, clothes: 163_468, goods: 202_476, medical: 7_316, phone: 6_821, allowance: 6_416, events: 32_779, leisure: 88_867 },
  { food: 395_837, clothes: 123_060, goods: 127_740, medical: 7_520, phone: 11_841, allowance: 6_494, events: 18_217, leisure: 91_345 },
  { food: 413_918, clothes: 152_058, goods: 139_664, medical: 6_918, phone: 18_918, allowance: 7_849, events: 18_786, leisure: 121_762 },
  { food: 361_027, clothes: 138_502, goods: 151_326, medical: 5_326, phone: 16_239, allowance: 8_708, events: 12_999, leisure: 78_860 },
  { food: 413_118, clothes: 154_912, goods: 139_304, medical: 7_955, phone: 22_235, allowance: 8_644, events: 14_625, leisure: 94_157 },
  { food: 387_350, clothes: 116_474, goods: 111_488, medical: 6_305, phone: 28_186, allowance: 12_663, events: 12_990, leisure: 93_238 },
  // 中1〜中3
  { food: 471_906, clothes: 128_536, goods: 135_022, medical: 8_950, phone: 65_724, allowance: 27_868, events: 29_627, leisure: 99_258 },
  { food: 480_578, clothes: 173_345, goods: 165_893, medical: 6_209, phone: 81_179, allowance: 35_369, events: 11_751, leisure: 84_836 },
  { food: 428_986, clothes: 150_296, goods: 147_492, medical: 9_098, phone: 71_387, allowance: 38_372, events: 19_126, leisure: 75_567 },
  // 高1〜高3
  { food: 446_316, clothes: 169_984, goods: 182_029, medical: 16_002, phone: 112_508, allowance: 73_499, events: 45_585, leisure: 108_180 },
  { food: 544_724, clothes: 141_008, goods: 172_871, medical: 18_437, phone: 124_644, allowance: 75_090, events: 12_302, leisure: 78_805 },
  { food: 476_571, clothes: 128_463, goods: 168_780, medical: 17_600, phone: 120_987, allowance: 77_881, events: 16_226, leisure: 55_622 },
];

/**
 * 子供の食費・衣類・日用品の基準（月額・円）。
 * 子育て費用の調査（母親の回答の平均）は、家計調査をもとにした標準生計費の「1人増えたときの増え方」より
 * 食費で約2倍、衣類で約4倍高く、ふつうの家計より高く出るため、金額は公的統計に合わせる。
 *  - 食費: 標準生計費（人事院 令和7年4月）の世帯が1人増えるごとの食料費 × 年齢ごとの推定エネルギー必要量の比
 *  - 衣類: 標準生計費の世帯が1人増えるごとの被服・履物費 × 調査の年齢ごとの比
 *  - 日用品: 家計調査（2024年）の家具・家事用品の1人あたり × 調査の年齢ごとの比
 * 比は0歳〜高3の平均が1になるようにする（子供1人の平均が統計の値と一致）。
 */
export const CHILD_STD = {
  /** 標準生計費（令和7年4月）2〜5人世帯の食料費・被服履物費（月） */
  stdFood: [48_320, 61_800, 75_270, 88_750],
  stdClothes: [4_480, 7_140, 9_800, 12_450],
  /** 家計調査 2024年 二人以上の世帯: 家具・家事用品（月）と平均世帯人員 */
  kakeiGoods: 12_788,
  kakeiMembers: 2.88,
  /** 推定エネルギー必要量（ふつう・男女平均 kcal/日）。CHILD_COST の行（0〜6歳、小1〜高3）ごと */
  kcal: [588, 925, 925, 1_275, 1_275, 1_275, 1_500, 1_500, 1_500, 1_775, 1_775, 2_175, 2_175, 2_500, 2_500, 2_500, 2_575, 2_575, 2_575],
  /** 30〜49歳の大人（男女平均）。表示用 */
  adultKcal: 2_400,
} as const;

const perMember = (a: readonly number[]) => (a[a.length - 1] - a[0]) / (a.length - 1);
const meanOf = (a: readonly number[]) => a.reduce((t, x) => t + x, 0) / a.length;
/** 子供1人の平均（月）: 食費・衣類・日用品 */
export const CHILD_STD_AVG = {
  food: perMember(CHILD_STD.stdFood),
  clothes: perMember(CHILD_STD.stdClothes),
  goods: CHILD_STD.kakeiGoods / CHILD_STD.kakeiMembers,
};

/** 中高生のスマホ代（月・全国平均）。フコク生命「47Life」の調査（2026年）3,385円を100円未満切り捨て */
export const CHILD_PHONE_TEEN = 3_300;

/**
 * 子供の生活費（年額・円）。CHILD_COST の食費・衣類・日用品を統計に合わせ、中高生の携帯代をスマホ代の平均にしたもの。
 * それ以外は調査の値のまま。どの項目も月額で100円未満を切り捨てる（年額 = 月額 × 12）。
 */
export const CHILD_LIVING: (typeof CHILD_COST)[number][] = (() => {
  const kc = meanOf(CHILD_STD.kcal);
  const cl = meanOf(CHILD_COST.map((r) => r.clothes));
  const gd = meanOf(CHILD_COST.map((r) => r.goods));
  const yr = (monthly: number) => Math.floor(monthly / 100) * 100 * 12;
  return CHILD_COST.map((r, i) => ({
    food: yr(CHILD_STD_AVG.food * (CHILD_STD.kcal[i] / kc)),
    clothes: yr(CHILD_STD_AVG.clothes * (r.clothes / cl)),
    goods: yr(CHILD_STD_AVG.goods * (r.goods / gd)),
    medical: yr(r.medical / 12),
    phone: i >= 13 ? CHILD_PHONE_TEEN * 12 : yr(r.phone / 12),
    allowance: yr(r.allowance / 12),
    events: yr(r.events / 12),
    leisure: yr(r.leisure / 12),
  }));
})();
export const CHILD_LIVING_SOURCE = '食費・衣類は人事院「標準生計費」（令和7年4月）、食費の年齢差は厚生労働省「日本人の食事摂取基準」、日用品は総務省「家計調査」2024年、中高生の携帯代はフコク生命「47Life」の調査（2026年）、医療・小学生までの携帯・おこづかい・行事・レジャーは竹原ほか「0〜18歳の子育てに要する費用の調査2024」。月額の100円未満は切り捨て';

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
