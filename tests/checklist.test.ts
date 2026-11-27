import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MANUAL_CHECKS, checklistSummary, yearRanges } from '../src/engine/checklist';
import { computeView } from '../src/engine/view';
import { household, withPlan } from './helpers';

const checks = (d: ReturnType<typeof household>) => computeView(d).buyChecks;
const get = (d: ReturnType<typeof household>, id: string) => checks(d).find((c) => c.id === id)!;

describe('買う前のチェックリスト', () => {
  it('ユーザーが挙げた「AIで値段を比較」と「家賃とローンの重なり」が入っている', () => {
    assert.ok(MANUAL_CHECKS.some((m) => m.text.includes('AIで値段を比較')));
    assert.ok(checks(household()).some((c) => c.id === 'overlap'));
    assert.equal(new Set(MANUAL_CHECKS.map((m) => m.id)).size, MANUAL_CHECKS.length, 'IDが重複しない');
  });

  it('家賃とローンが重なる月数を入れると、その月数と家賃・返済を出す', () => {
    const c = get(withPlan(household(), (p) => void (p.housing.overlapMonths = 3)), 'overlap');
    assert.match(c.detail, /^2か月、家賃9万円と返済/);
    assert.ok(['ok', 'warn', 'ng'].includes(c.status));
    assert.deepEqual(c.to, { sheet: 'housing', props: { page: 'now' } });
  });

  it('重なりが0か月でも、退去が2か月遅れた場合を確かめる', () => {
    const c = get(household(), 'overlap');
    assert.match(c.detail, /0か月で計算中.*2か月遅れ/);
  });

  it('重なる期間に現金が予備資金を下回ると「要注意」', () => {
    const d = withPlan(household(), (p) => {
      p.housing.overlapMonths = 6;
      p.housing.rentMonthly = 250_000;
      p.assumptions.reserveMonths = 36;
    });
    assert.equal(get(d, 'overlap').status, 'ng');
  });

  it('購入しない前提では、家賃とローンの判定はしない', () => {
    const c = get(withPlan(household(), (p) => void (p.housing.fpBasis = 'none')), 'overlap');
    assert.equal(c.status, 'na');
  });

  it('家計がきつい年があると「要注意」になり、その年を出す', () => {
    const c = get(household({ children: 3, spouseNet: 0 }), 'health');
    assert.equal(c.status, 'ng');
    assert.match(c.detail, /きつい（赤）年: 20\d\d/);
  });

  it('メモの確認事項が残っていると「要確認」', () => {
    const d = household();
    d.memos.push({ id: 'm1', category: 'check', houseId: null, title: '境界を確認', body: '', date: null, done: false, pinned: false, createdAt: 0, updatedAt: 0 });
    const c = get(d, 'memoCheck');
    assert.equal(c.status, 'warn');
    assert.match(c.detail, /境界を確認/);
    d.memos[0].done = true;
    assert.equal(get(d, 'memoCheck').status, 'ok');
  });

  it('済んだ数は、自動の「問題なし」・手動のチェック・追加した項目のチェックを数える', () => {
    const d = household();
    const auto = checks(d);
    const base = checklistSummary(undefined, auto);
    assert.equal(base.total, auto.filter((a) => a.status !== 'na').length + MANUAL_CHECKS.length);
    const s = checklistSummary({ done: { aiPrice: true, hazard: true }, custom: [{ id: 'x', text: '駐車場', done: true }, { id: 'y', text: '収納', done: false }] }, auto);
    assert.equal(s.done, base.done + 3);
    assert.equal(s.total, base.total + 2);
  });

  it('年の並びをまとめて書く', () => {
    assert.equal(yearRanges([2031, 2032, 2033, 2040]), '2031〜2033年、2040年');
    assert.equal(yearRanges([2030, 2032, 2034, 2036]), '2030年、2032年、2034年 ほか');
  });
});

describe('買う前のチェックリストの保存', () => {
  it('読み込みでチェックと追加した項目が残り、形の合わない値は捨てる', async () => {
    const { migrate } = await import('../src/storage/schema');
    const d = household();
    const raw = JSON.parse(JSON.stringify({ ...d, checklist: { done: { aiPrice: true, hazard: 'yes' }, custom: [{ id: 'a', text: '駐車場', done: true }, { text: 'IDなし' }, 3] } }));
    const m = migrate(raw);
    assert.deepEqual(m.checklist, { done: { aiPrice: true }, custom: [{ id: 'a', text: '駐車場', done: true }] });
    assert.equal(migrate(JSON.parse(JSON.stringify(d))).checklist, undefined);
  });
});
