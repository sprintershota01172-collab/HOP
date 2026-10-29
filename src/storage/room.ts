/**
 * 招待リンクで夫婦の端末をつなぐ同期（GitHub Pages 版・ホーム画面のアプリ用）。
 *  - TABI・家賃デスと同じ「暗号化ルーム」API を使う。サーバーには暗号化したデータだけを置く
 *  - 鍵は招待リンクの # 以降にだけ入る（サーバーには送られない）。リンクを知っている人は同じデータを編集できる
 *  - 同じルームの変更は数秒ごとに確かめ、相手の更新を取り込む（後から保存したほうが残る）
 */
import type { AppData } from '../engine/types';
import { migrate } from './schema';
import type { Shared, SharedState } from './platform';

export const ROOM_API = 'https://tabi-planner-sync.prettybell7.chatgpt.site/api/rooms/';
const POLL_MS = 3000;
const LIMIT = 4 * 1024 * 1024;

export interface RoomMeta {
  roomId: string;
  key: string;
  revision: number;
}
export interface Invite {
  roomId: string;
  key: string;
}
interface Envelope {
  format: 1;
  app: 'hoppo';
  data: AppData;
  by: { id: string; name: string };
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (v: string) => Uint8Array.from(atob(v.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (v.length % 4)) % 4)), (c) => c.charCodeAt(0));

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
/** 招待リンク（または # 以降）から部屋と鍵を取り出す。違う形なら null */
export function parseInvite(input: string): Invite | null {
  const s = String(input ?? '').trim();
  const hash = s.includes('#') ? s.slice(s.indexOf('#')) : s;
  const m = hash.match(new RegExp(`^#join=(${UUID})\\.([A-Za-z0-9_-]{43})$`));
  return m ? { roomId: m[1], key: m[2] } : null;
}
export const inviteLink = (base: string, m: Invite) => `${base.split('#')[0]}#join=${m.roomId}.${m.key}`;

async function auth(key: string) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`tabi-auth-v1:${key}`))));
}
const aesKey = (key: string) => crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['encrypt', 'decrypt']);

async function gzip(bytes: Uint8Array, dir: 'c' | 'd') {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(dir === 'c' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encrypt(env: Envelope, m: Invite): Promise<Uint8Array> {
  let bytes = enc.encode(JSON.stringify(env));
  let flag = 0;
  if (typeof CompressionStream === 'function') {
    bytes = await gzip(bytes, 'c');
    flag = 1;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`hoppo:${m.roomId}:1:${flag}`) }, await aesKey(m.key), bytes));
  const out = new Uint8Array(13 + data.length);
  out[0] = flag;
  out.set(iv, 1);
  out.set(data, 13);
  if (out.length > LIMIT) throw new Error('too-big');
  return out;
}

export async function decrypt(body: ArrayBuffer, m: Invite): Promise<Envelope> {
  const bytes = new Uint8Array(body);
  const flag = bytes[0];
  if (bytes.length < 29 || flag > 1) throw new Error('invalid');
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(1, 13), additionalData: enc.encode(`hoppo:${m.roomId}:1:${flag}`) }, await aesKey(m.key), bytes.slice(13)));
  } catch {
    throw new Error('invalid');
  }
  if (flag === 1) plain = await gzip(plain, 'd');
  const v = JSON.parse(dec.decode(plain));
  if (v?.format !== 1 || v.app !== 'hoppo' || !v.data) throw new Error('invalid');
  return { ...v, data: migrate(v.data) };
}

type Fetch = typeof fetch;
async function request(f: Fetch, m: Invite, method: 'GET' | 'POST' | 'PUT', opts: { body?: Uint8Array; revision?: number; ifNoneMatch?: number } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${await auth(m.key)}` };
    if (opts.body) headers['Content-Type'] = 'application/octet-stream';
    if (opts.ifNoneMatch) headers['If-None-Match'] = `"${opts.ifNoneMatch}"`;
    if (opts.revision) headers['X-Tabi-Revision'] = String(opts.revision);
    const r = await f(`${ROOM_API}${m.roomId}`, { method, body: opts.body as BodyInit | undefined, headers, cache: 'no-store', credentials: 'omit', signal: ctl.signal });
    if (![200, 201, 304, 409].includes(r.status)) throw new Error(r.status === 413 ? 'too-big' : r.status === 404 || r.status === 401 || r.status === 403 ? 'invalid' : 'connection');
    return r;
  } finally {
    clearTimeout(t);
  }
}
const revOf = (r: Response) => {
  const v = Number(r.headers.get('X-Tabi-Revision'));
  if (!Number.isSafeInteger(v) || v < 1) throw new Error('connection');
  return v;
};

export const roomSupported = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof fetch === 'function';

/** 新しい部屋を作り、いまのデータを置く */
export async function createRoom(data: AppData, by: Envelope['by'], f: Fetch = fetch): Promise<RoomMeta> {
  const key = b64(crypto.getRandomValues(new Uint8Array(32)));
  const m = { roomId: crypto.randomUUID(), key };
  const r = await request(f, m, 'POST', { body: await encrypt({ format: 1, app: 'hoppo', data, by }, m) });
  if (r.status !== 201 && r.status !== 200) throw new Error('connection');
  return { ...m, revision: Number(r.headers.get('X-Tabi-Revision')) || 1 };
}

/** 招待リンクの部屋のデータを読む */
export async function readRoom(inv: Invite, f: Fetch = fetch): Promise<{ meta: RoomMeta; state: SharedState; name: string }> {
  const r = await request(f, inv, 'GET');
  const revision = revOf(r);
  const env = await decrypt(await r.arrayBuffer(), inv);
  return { meta: { ...inv, revision }, state: { data: env.data, updatedAt: env.data.updatedAt, updatedBy: env.by.id }, name: env.by.name };
}

/**
 * 部屋につないだ同期。store からは claude.ai の共有と同じ形（Shared）で使う。
 *  - watch: 画面を開いている間 3秒ごと（と画面に戻ったとき）に確かめ、変わっていれば知らせる
 *  - save: 自分の変更を送る。相手が先に保存していたら（409）最新を読んで知らせ、こちらが新しければ送り直す
 */
export function openRoom(
  meta: RoomMeta,
  me: { id: string; name: () => string },
  onMeta: (m: RoomMeta) => void,
  f: Fetch = fetch,
): Shared & { meta: () => RoomMeta; dispose: () => void } {
  let cur = { ...meta };
  const names = new Map<string, string>();
  const listeners = new Set<(s: SharedState) => void>();
  const errs = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;
  const setRev = (revision: number) => {
    cur = { ...cur, revision };
    onMeta(cur);
  };
  const emit = (env: Envelope) => {
    names.set(env.by.id, env.by.name);
    const st = { data: env.data, updatedAt: env.data.updatedAt, updatedBy: env.by.id };
    listeners.forEach((fn) => fn(st));
  };
  const pull = async (conditional: boolean) => {
    const r = await request(f, cur, 'GET', conditional ? { ifNoneMatch: cur.revision } : {});
    if (r.status === 304) return null;
    const revision = revOf(r);
    const env = await decrypt(await r.arrayBuffer(), cur);
    setRev(revision);
    return env;
  };
  const tick = async () => {
    if (busy || (typeof document !== 'undefined' && document.hidden)) return;
    busy = true;
    try {
      const env = await pull(true);
      if (env) emit(env);
    } catch (e) {
      if ((e as Error).message === 'invalid') errs.forEach((fn) => fn());
    } finally {
      busy = false;
    }
  };
  const wake = () => void tick();
  return {
    me: me.id,
    meta: () => cur,
    async load() {
      const env = await pull(false);
      return env ? { data: env.data, updatedAt: env.data.updatedAt, updatedBy: env.by.id } : null;
    },
    async save(data: AppData) {
      const body = await encrypt({ format: 1, app: 'hoppo', data, by: { id: me.id, name: me.name() } }, cur);
      for (let i = 0; i < 4; i++) {
        const r = await request(f, cur, 'PUT', { body, revision: cur.revision });
        if (r.status !== 409) {
          setRev(revOf(r));
          return;
        }
        // 相手が先に保存していた: 最新を読んで知らせる。相手のほうが新しければ送らない
        const env = await pull(false);
        if (!env) continue;
        emit(env);
        if (env.data.updatedAt >= data.updatedAt) return;
      }
      throw new Error('connection');
    },
    watch(fn, onError) {
      listeners.add(fn);
      errs.add(onError);
      if (!timer) {
        timer = setInterval(wake, POLL_MS);
        if (typeof window !== 'undefined') {
          window.addEventListener('focus', wake);
          window.addEventListener('online', wake);
          document.addEventListener('visibilitychange', wake);
        }
        void (async () => {
          // つないだ直後は、いまの内容を必ず一度知らせる（閉じていた間の相手の更新を拾う）
          try {
            const env = await pull(false);
            if (env) emit(env);
          } catch (e) {
            if ((e as Error).message === 'invalid') onError();
          }
        })();
      }
      return () => {
        listeners.delete(fn);
        errs.delete(onError);
      };
    },
    async nameOf(id: string) {
      return names.get(id) ?? '';
    },
    dispose() {
      if (timer) clearInterval(timer);
      timer = null;
      listeners.clear();
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', wake);
        window.removeEventListener('online', wake);
        document.removeEventListener('visibilitychange', wake);
      }
    },
  };
}
