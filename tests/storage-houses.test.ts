import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { newHouse, sampleData, SCHEMA_VERSION } from '../src/engine/defaults';
import { fitScore, performanceScore } from '../src/engine/houses';
import { computeAll } from '../src/engine/index';
import { estimateDeductibleTax, estimatePropertyTax } from '../src/engine/tax';
import { DataError, migrate, toExport } from '../src/storage/schema';
import { BASE, clone } from './helpers';

describe('保存データ', () => {
  it('書き出し → 読み込みで内容が変わらない', () => {
    const d = sampleData(BASE);
    const back = migrate(JSON.parse(JSON.stringify(toExport(d))));
    assert.deepEqual(back.plan, d.plan);
    assert.deepEqual(back.houses, d.houses);
    assert.deepEqual(back.memos, d.memos);
  });

  it('古い形式（項目が足りない）でも既定値で補って読み込める', () => {
    const d = clone(sampleData(BASE)) as unknown as Record<string, any>;
    delete d.plan.assumptions.endAge;
    delete d.plan.housing.loan;
    delete d.weights;
    d.schema = 0;
    const m = migrate(d);
    assert.equal(m.schema, SCHEMA_VERSION);
    assert.equal(m.plan.assumptions.endAge, 95);
    assert.equal(m.plan.housing.loan.years, 35);
    assert.equal(m.plan.self.netMonthly, 280_000);
    assert.equal(m.weights.price, 3);
  });

  it('新しすぎる形式・別アプリのデータは読み込まない', () => {
    const d = clone(sampleData(BASE));
    assert.throws(() => migrate({ ...d, schema: SCHEMA_VERSION + 1 }), DataError);
    assert.throws(() => migrate({ hello: 1 }), DataError);
    assert.throws(() => migrate(null), DataError);
  });

  it('型の違う値は既定値のまま（壊れた値で計算しない）', () => {
    const d = clone(sampleData(BASE)) as unknown as Record<string, any>;
    d.plan.assumptions.inflation = 'abc';
    const m = migrate(d);
    assert.equal(m.plan.assumptions.inflation, 0.015);
  });
});

describe('住宅比較', () => {
  const d = sampleData(BASE);
  const c = computeAll(d);

  it('登録した住宅ごとに取得総額・月々の住宅費・35年の住宅関連支出を出す', () => {
    assert.equal(c.houses.length, 3);
    for (const h of c.houses) {
      const src = d.houses.find((x) => x.id === h.id)!;
      assert.equal(h.total, src.price! + Math.round(src.price! * d.plan.housing.miscRate));
      assert.ok(h.metrics.monthlyHousing > 0);
      assert.ok(h.cost35 > h.total * 0.5);
    }
  });

  it('いちばん安い住宅が自動的に1位になるわけではない', () => {
    const cheapest = [...c.houses].sort((a, b) => a.total - b.total)[0];
    assert.notEqual(cheapest.rank, 1);
    const first = c.houses.find((h) => h.rank === 1)!;
    assert.ok(first.strengths.length > 0, '1位には理由がある');
  });

  it('資金不足（危険）の住宅は点数に関係なく後ろに並ぶ', () => {
    const big = clone(d);
    const h = { ...newHouse(), name: '豪邸', price: 150_000_000, ratings: { location: 5, layout: 5, satisfaction: 5, resale: 5 } };
    h.perf = { ...h.perf, insulation: 7, quake: 3 };
    big.houses.push(h);
    const cc = computeAll(big);
    const e = cc.houses.find((x) => x.name === '豪邸')!;
    assert.equal(e.tier, 'danger');
    const okRanks = cc.houses.filter((x) => x.tier !== 'danger').map((x) => x.rank);
    assert.ok(okRanks.every((r) => r < e.rank), '資金不足でない住宅より後ろ');
    assert.ok(e.weakness && e.weakness.includes('資金不足'));
  });

  it('重み付けを変えると順位が変わりうる（立地だけを重視）', () => {
    const w = clone(d);
    w.weights = { price: 0, location: 5, layout: 0, performance: 0, upkeep: 0, warranty: 0, resale: 0, satisfaction: 0 };
    const cc = computeAll(w);
    // 重みを変えると点数が変わる（立地だけなら立地の評価が最も高い住宅が最高点）。並びは同じ段階の中で点数順
    const best = [...cc.houses].sort((x, y) => y.totalScore - x.totalScore)[0];
    assert.equal(best.name, 'B社 駅近');
    assert.notEqual(cc.houses.find((x) => x.name === 'A社 2階建て')!.totalScore, c.houses.find((x) => x.name === 'A社 2階建て')!.totalScore);
    const same = cc.houses.filter((x) => x.tier === 'caution').sort((x, y) => x.rank - y.rank);
    for (let i = 1; i < same.length; i++) assert.ok(same[i - 1].totalScore >= same[i].totalScore);
  });

  it('適合度は 安心 > 標準 > 注意 > 危険 の順', () => {
    const b = { safe: 30_000_000, standard: 50_000_000, caution: 60_000_000 };
    const s = fitScore('safe', 25_000_000, b);
    const t = fitScore('standard', 40_000_000, b);
    const u = fitScore('caution', 55_000_000, b);
    const x = fitScore('danger', 70_000_000, b);
    assert.ok(s > t && t > u && u > x);
    assert.ok(fitScore('standard', 31_000_000, b) > fitScore('standard', 49_000_000, b));
  });

  it('性能スコア: 断熱等級7・耐震3は等級4・耐震1より高い', () => {
    const hi = newHouse();
    hi.perf.insulation = 7;
    hi.perf.quake = 3;
    const lo = newHouse();
    lo.perf.insulation = 4;
    lo.perf.quake = 1;
    assert.ok(performanceScore(hi)! > performanceScore(lo)!);
    assert.equal(performanceScore(newHouse()), null);
  });
});

describe('税の推計', () => {
  it('固定資産税: 新築減額は3年間、建物は年々下がる', () => {
    const h = { kind: 'detached' as const, newBuild: true, landPrice: 15_000_000, buildingPrice: 25_000_000, floorArea: 100, energy: 'zeh' as const, cutEnabled: true };
    const y0 = estimatePropertyTax(h, 0);
    const y3 = estimatePropertyTax(h, 3);
    const y10 = estimatePropertyTax(h, 10);
    assert.ok(y3 > y0, '減額が終わると上がる');
    assert.ok(y10 < y3, '経年で下がる');
    const noCut = estimatePropertyTax({ ...h, cutEnabled: false }, 0);
    assert.ok(noCut > y0);
  });

  it('控除に使える税額の推計は収入とともに増え、0円なら0', () => {
    assert.equal(estimateDeductibleTax(0), 0);
    assert.ok(estimateDeductibleTax(8_000_000) > estimateDeductibleTax(4_000_000));
  });
});
