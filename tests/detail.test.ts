// 月の収支の内訳・お小遣い・学資保険
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { monthPie, pieDetails, toYears } from '../src/engine/aggregate';
import { sampleData, uid } from '../src/engine/defaults';
import { computeAll } from '../src/engine/index';
import { makeContext } from '../src/engine/recommend';
import { resolvePlan } from '../src/engine/resolve';
import { simulate } from '../src/engine/simulate';
import type { AppData, Insurance } from '../src/engine/types';
import { toYM } from '../src/engine/ym';
import { BASE, household, withPlan } from './helpers';

const edu = (childId: string, o: Partial<NonNullable<Insurance['child']>> = {}): Insurance => ({
  id: uid('ins'),
  name: '学資保険',
  kind: 'education',
  monthly: 15_000,
  payEndYM: null,
  payout: { type: 'none' },
  child: { childId, payUntilAge: 10, payouts: [{ age: 12, amount: 300_000 }, { age: 18, amount: 1_600_000 }], ...o },
});

/** 想定どおり・購入なしの推移（内訳つき） */
const baseSim = (d: AppData, detail = false) => {
  const r = resolvePlan(d.plan);
  return { r, sim: simulate(r, null, makeContext(r).sc.base, { detail }) };
};

describe('月の収支の内訳', () => {
  const datas: [string, AppData][] = [
    ['サンプル', sampleData(BASE)],
    [
      '子供2人・学資保険・お小遣い・イベント',
      withPlan(household({ children: 2 }), (p) => {
        p.pocket = { self: 30_000, spouse: 20_000, free: 15_000 };
        p.insurances.push(edu(p.children[0].id));
        p.events.push({ id: uid(), name: '車の買い替え', icon: 'car', kind: 'expense', pattern: 'repeat', amount: 2_000_000, startYM: toYM(2030, 6), endYM: null, everyYears: 7, inflate: true });
        p.debts.push({ id: uid(), name: '車のローン', monthly: 11_800, endYM: toYM(2029, 12) });
      }),
    ],
  ];
  for (const [name, d] of datas) {
    it(`${name}: 各項目の内訳の合計は、円グラフの値と毎年すべて円単位で一致する`, () => {
      const c = computeAll(d);
      const fp = c.fp!;
      const det = pieDetails(fp.sim, fp.years);
      assert.equal(det.length, fp.years.length);
      fp.years.forEach((y, i) => {
        const pie = monthPie(y);
        for (const sl of pie.slices) {
          const rows = det[i][sl.key];
          const sum = rows.reduce((t, r) => t + (sl.key === 'rest' && r.op === '−' ? -r.value : r.value), 0);
          assert.equal(sum, sl.value, `${y.year} ${sl.label}`);
        }
      });
    });
    it(`${name}: 内訳を記録しても計算結果（毎月の残高）は変わらない`, () => {
      const r = resolvePlan(d.plan);
      const sc = makeContext(r).sc.base;
      const a = simulate(r, null, sc);
      const b = simulate(r, null, sc, { detail: true });
      assert.deepEqual(b.rows.map((x) => x.cash), a.rows.map((x) => x.cash));
      assert.ok(b.parts && b.parts.length > 5);
    });
  }

  it('住宅費の内訳: 購入年の頭金・諸費用は「一時」、購入後は家賃が消えてローンと維持費になる', () => {
    const d = sampleData(BASE);
    const c = computeAll(d);
    const fp = c.fp!;
    const det = pieDetails(fp.sim, fp.years);
    const py = Math.floor(c.resolved.purchaseYM / 12);
    const iy = fp.years.findIndex((y) => y.year === py);
    const h = det[iy].housing;
    assert.ok(h.find((x) => x.key === 'down')?.once, '頭金・諸費用は一時的な支出');
    const later = det[iy + 3].housing.map((x) => x.key);
    assert.ok(!later.includes('rent'), '購入後は家賃なし');
    assert.ok(later.includes('loan') && later.includes('tax'));
    for (const x of det[iy].housing) assert.ok(x.sheet, `${x.label} から入力を開ける`);
  });
});

describe('お小遣い・自由費', () => {
  const d = household({ children: 0 });
  const withPocket = withPlan(d, (p) => void (p.pocket = { self: 30_000, spouse: 20_000, free: 10_000 }));
  it('生活費に加えて毎月支出し、物価に合わせて増える', () => {
    const a = baseSim(d).sim;
    const b = baseSim(withPocket).sim;
    assert.equal(b.rows[0].living - a.rows[0].living, 60_000);
    const y5 = b.rows.findIndex((x) => x.ym === toYM(2031, 1));
    assert.ok(b.rows[y5].living - a.rows[y5].living > 60_000, '5年後は物価の分だけ多い');
  });
  it('住宅購入予算は下がる（生活費として差し引く）', () => {
    assert.ok(computeAll(withPocket).rec.tiers!.standard.maxLoan < computeAll(d).rec.tiers!.standard.maxLoan);
  });
  it('老後の生活費（未入力の場合 = いまの生活費）にも含まれる', () => {
    const unset = (x: AppData) => withPlan(x, (p) => void (p.assumptions.retireLivingMonthly = null));
    assert.equal(resolvePlan(unset(withPocket).plan).retireLiving - resolvePlan(unset(d).plan).retireLiving, 60_000);
  });
  it('単身世帯では配偶者のお小遣いを数えない', () => {
    const single = withPlan(household({ spouse: false }), (p) => void (p.pocket = { self: 30_000, spouse: 99_000, free: null }));
    assert.equal(resolvePlan(single.plan).pocketTotal, 30_000);
  });
  it('内訳に名前つきで出る', () => {
    const c = computeAll(withPocket);
    const det = pieDetails(c.fp!.sim, c.fp!.years);
    const labels = det[1].living.map((x) => x.label);
    assert.ok(labels.some((l) => l.includes('お小遣い')));
    assert.ok(labels.includes('自由費'));
  });
});

describe('学資保険', () => {
  const d = withPlan(household({ children: 1 }), (p) => void p.insurances.push(edu(p.children[0].id)));
  const child = d.plan.children[0];
  const { sim } = baseSim(d);
  const at = (ym: number) => sim.rows.find((x) => x.ym === ym)!;
  it('保険料は子供が生まれた月から、払込の年齢になる前の月まで', () => {
    assert.equal(at(child.birthYM - 1).insurance, 0);
    assert.equal(at(child.birthYM).insurance, 15_000);
    assert.equal(at(child.birthYM + 10 * 12 - 1).insurance, 15_000);
    assert.equal(at(child.birthYM + 10 * 12).insurance, 0);
    const months = sim.rows.filter((x) => x.insurance > 0).length;
    assert.equal(months, 120);
  });
  it('祝い金・満期金は子供がその年齢になる月に収入として入る', () => {
    const base = baseSim(withPlan(d, (p) => void (p.insurances = []))).sim;
    const diff = (ym: number) => at(ym).otherIncome - base.rows.find((x) => x.ym === ym)!.otherIncome;
    assert.equal(diff(child.birthYM + 12 * 12), 300_000);
    assert.equal(diff(child.birthYM + 18 * 12), 1_600_000);
    assert.equal(diff(child.birthYM + 18 * 12 + 1), 0);
  });
  it('子供の誕生（予定）を変えると、払込と受取の時期もずれる', () => {
    const later = withPlan(d, (p) => void (p.children[0].birthYM += 24));
    const s2 = baseSim(later).sim;
    const first = s2.rows.find((x) => x.insurance > 0)!;
    assert.equal(first.ym, child.birthYM + 24);
  });
  it('対象の子供がいない学資保険は計算に入れない', () => {
    const orphan = withPlan(d, (p) => void (p.children = []));
    assert.equal(resolvePlan(orphan.plan).insurances.length, 0);
  });
  it('払込中は予算を下げ、内訳では「保険」と受取の年の収入に名前つきで出る', () => {
    const c = computeAll(d);
    const det = pieDetails(c.fp!.sim, c.fp!.years);
    const years = toYears(c.fp!.sim);
    const iy = years.findIndex((y) => y.year === Math.floor((child.birthYM + 18 * 12) / 12));
    assert.ok(det[iy].rest.some((x) => x.label === '学資保険の受取' && x.once));
    const iy2 = years.findIndex((y) => y.year === Math.floor((child.birthYM + 24) / 12));
    assert.ok(det[iy2].insurance.some((x) => x.label === '学資保険'));
  });
});

describe('以前の版の保存データ', () => {
  it('お小遣い・学資保険の項目がないデータも、そのまま読み込んで同じ予算になる', async () => {
    const { migrate } = await import('../src/storage/schema');
    const d = household({ children: 1 });
    const old = JSON.parse(JSON.stringify(d));
    delete old.plan.pocket;
    const m = migrate(old);
    assert.deepEqual(m.plan.pocket, { self: null, spouse: null, free: null });
    assert.equal(computeAll(m).rec.final.total, computeAll(d).rec.final.total);
  });
});

describe('旅行などの逆算積立', () => {
  const trip = (o: Partial<import('../src/engine/types').LifeEvent> = {}) => ({
    id: uid('ev'), name: '旅行', icon: 'plane', kind: 'expense' as const, pattern: 'once' as const, amount: 600_000,
    startYM: BASE + 24, endYM: null, everyYears: 1, inflate: false, fund: true, ...o,
  });
  const run = (ev: ReturnType<typeof trip>) => baseSim(withPlan(household(), (p) => void p.events.push(ev))).sim;
  const plain = baseSim(household()).sim;

  it('支払いの時期から逆算して、今月から前月まで毎月同じ額を積み立てる', () => {
    const sim = run(trip());
    const contrib = sim.rows.filter((x) => x.fundIn > 0);
    assert.equal(contrib.length, 24);
    assert.equal(contrib[0].fundIn, 25_000);
    assert.equal(contrib.reduce((t, x) => t + x.fundIn, 0), 600_000);
  });
  it('支払いの月は積立から払うので、現金は減らず、積立の残高は0に戻る', () => {
    const sim = run(trip());
    const i = sim.rows.findIndex((x) => x.ym === BASE + 24);
    assert.equal(sim.rows[i].fundOut, 600_000);
    assert.equal(sim.rows[i].otherExpense, 0);
    assert.equal(sim.rows[i].fund, 0);
    assert.equal(sim.rows[i - 1].fund, 600_000);
    // 積立をしない場合と比べて、支払い後の現金は同じ
    assert.equal(sim.rows[i].cash, plain.rows[i].cash - 600_000);
  });
  it('数年ごとの支出は、前回の支払いの翌月から次の支払いの前月までで積み立てる', () => {
    const sim = run(trip({ pattern: 'repeat', everyYears: 2, startYM: BASE + 12, endYM: BASE + 12 + 48 }));
    const pays = sim.rows.filter((x) => x.fundOut > 0).map((x) => x.ym);
    assert.deepEqual(pays, [BASE + 12, BASE + 36, BASE + 60]);
    const between = sim.rows.filter((x) => x.ym > BASE + 12 && x.ym < BASE + 36 && x.fundIn > 0).length;
    assert.equal(between, 23);
  });
  it('積立をしない設定なら、その月の支出として現金から払う', () => {
    const sim = run(trip({ fund: false }));
    const i = sim.rows.findIndex((x) => x.ym === BASE + 24);
    assert.equal(sim.rows[i].otherExpense, 600_000);
    assert.equal(sim.rows.every((x) => x.fundIn === 0), true);
  });
  it('円グラフでは「貯蓄・投資」に積立として出て、内訳の合計も一致する', () => {
    const d = withPlan(household(), (p) => void p.events.push(trip()));
    const c = computeAll(d);
    const det = pieDetails(c.fp!.sim, c.fp!.years);
    assert.ok(det[1].saving.some((x) => x.label === '旅行の積立'));
    const y = c.fp!.years.findIndex((x) => x.year === Math.floor((BASE + 24) / 12));
    assert.ok(det[y].fundPaid.some((x) => x.label === '旅行' && x.value === 600_000));
  });
});
