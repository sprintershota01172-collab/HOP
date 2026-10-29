// 招待リンクの同期（暗号化ルーム）: 暗号化・招待リンク・相手の更新の取り込み・同時に保存したとき
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sampleData } from '../src/engine/defaults';
import { nowYM } from '../src/engine/ym';
import { createRoom, inviteLink, openRoom, parseInvite, readRoom, ROOM_API, type RoomMeta } from '../src/storage/room';
import type { SharedState } from '../src/storage/platform';

/** 同期サービスと同じ動きをする、メモリ上の偽サーバー */
function fakeServer() {
  const rooms = new Map<string, { auth: string; body: Uint8Array; rev: number }>();
  const seen: Uint8Array[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const id = String(url).slice(ROOM_API.length);
    const h = init.headers as Record<string, string>;
    const room = rooms.get(id);
    const res = (status: number, body?: Uint8Array, rev?: number) => new Response(body as BodyInit | undefined, { status, headers: rev ? { 'X-Tabi-Revision': String(rev) } : {} });
    if (init.method === 'POST') {
      if (room) return res(409);
      const body = new Uint8Array(init.body as Uint8Array);
      seen.push(body);
      rooms.set(id, { auth: h.Authorization, body, rev: 1 });
      return res(201, undefined, 1);
    }
    if (!room) return res(404);
    if (room.auth !== h.Authorization) return res(403);
    if (init.method === 'GET') {
      if (h['If-None-Match'] === `"${room.rev}"`) return res(304, undefined, room.rev);
      return res(200, room.body, room.rev);
    }
    if (init.method === 'PUT') {
      if (Number(h['X-Tabi-Revision']) !== room.rev) return res(409, undefined, room.rev);
      room.body = new Uint8Array(init.body as Uint8Array);
      seen.push(room.body);
      room.rev++;
      return res(200, undefined, room.rev);
    }
    return res(405);
  }) as unknown as typeof fetch;
  return { f, rooms, seen };
}

const data = (net: number, at: number) => {
  const d = sampleData(nowYM());
  d.plan.self.netMonthly = net;
  d.updatedAt = at;
  return d;
};
const next = (watch: (fn: (s: SharedState) => void) => void) => new Promise<SharedState>((ok) => watch(ok));

describe('招待リンクの同期', () => {
  it('招待リンクから部屋と鍵を読み取れる（違う形は null）', () => {
    const m = { roomId: '0f8fad5b-d9cb-469f-a165-70867728950e', key: 'A'.repeat(43) };
    const link = inviteLink('https://example.github.io/HOP/#fp', m);
    assert.equal(link, `https://example.github.io/HOP/#join=${m.roomId}.${m.key}`);
    assert.deepEqual(parseInvite(link), m);
    assert.deepEqual(parseInvite(`#join=${m.roomId}.${m.key}`), m);
    assert.equal(parseInvite('https://example.github.io/HOP/#join=abc.def'), null);
    assert.equal(parseInvite(''), null);
  });

  it('部屋を作ったデータを、招待リンクの鍵で読める。サーバーには暗号化したものしか届かない', async () => {
    const sv = fakeServer();
    const d = data(345_678, 1000);
    const meta = await createRoom(d, { id: 'shota', name: 'しょうた' }, sv.f);
    const r = await readRoom(meta, sv.f);
    assert.equal(r.state.data.plan.self.netMonthly, 345_678);
    assert.equal(r.state.updatedBy, 'shota');
    assert.equal(r.name, 'しょうた');
    const text = new TextDecoder().decode(sv.seen[0]);
    assert.ok(!text.includes('しょうた') && !text.includes('345678') && !text.includes('plan'), '平文が含まれない');
    // 鍵が違うと読めない
    await assert.rejects(readRoom({ ...meta, key: 'B'.repeat(43) }, sv.f), /invalid/);
  });

  it('相手の保存を、つないだ側が受け取る（だれが更新したか・呼び名つき）', async () => {
    const sv = fakeServer();
    const meta = await createRoom(data(300_000, 1000), { id: 'shota', name: 'しょうた' }, sv.f);
    let mB: RoomMeta = meta;
    const B = openRoom(meta, { id: 'shiho', name: () => 'しほ' }, (m) => (mB = m), sv.f);
    await B.save(data(280_000, 2000));
    assert.equal(mB.revision, 2);
    const A = openRoom(meta, { id: 'shota', name: () => 'しょうた' }, () => {}, sv.f);
    const st = await next((fn) => A.watch(fn, () => {}));
    assert.equal(st.data.plan.self.netMonthly, 280_000);
    assert.equal(st.updatedBy, 'shiho');
    assert.equal(await A.nameOf('shiho'), 'しほ');
    A.dispose();
    B.dispose();
  });

  it('同時に保存したとき: 後から変えたほうが残り、古いほうは送り直さない', async () => {
    const sv = fakeServer();
    const meta = await createRoom(data(300_000, 1000), { id: 'shota', name: '' }, sv.f);
    const A = openRoom(meta, { id: 'shota', name: () => '' }, () => {}, sv.f);
    const B = openRoom(meta, { id: 'shiho', name: () => '' }, () => {}, sv.f);
    const got: SharedState[] = [];
    A.watch((s) => got.push(s), () => {});
    await new Promise((r) => setTimeout(r, 50));
    got.length = 0;
    // B が先に保存（新しい変更）。A は古い版のまま、もっと前に変えた内容を送ろうとする
    await B.save(data(250_000, 3000));
    await A.save(data(400_000, 2000));
    const r = await readRoom(meta, sv.f);
    assert.equal(r.state.data.plan.self.netMonthly, 250_000, '新しい B の変更が残る');
    assert.equal(got.at(-1)?.updatedBy, 'shiho', 'A には B の変更が届く');
    // A がもっと新しく変えた場合は、最新を読んだうえで送り直す
    await A.save(data(410_000, 4000));
    assert.equal((await readRoom(meta, sv.f)).state.data.plan.self.netMonthly, 410_000);
    A.dispose();
    B.dispose();
  });
});
