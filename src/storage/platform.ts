/**
 * 実行環境ごとの機能。
 *  - claude.ai のアーティファクトとして開いた場合: アカウントの非公開領域に保存（db）、ファイル保存（downloads）
 *  - それ以外（GitHub Pages / ホーム画面のアプリ）: 端末内の IndexedDB のみ、ファイルはブラウザのダウンロード
 */
import type { AppData } from '../engine/types';
import { migrate } from './schema';

interface Snap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata?: { hasPendingWrites?: boolean };
}
interface DocRef {
  get(): Promise<Snap>;
  set(data: Record<string, unknown>): Promise<void>;
  onSnapshot?(next: (s: Snap) => void, error?: (e: { code: string }) => void): () => void;
}
interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

const host = (): ClaudeHost | null => {
  const c = (globalThis as unknown as { claude?: ClaudeHost }).claude;
  return c && typeof c.use === 'function' ? c : null;
};

export const isFramed = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

export interface Cloud {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}

const LIMIT = 240_000;

/** アカウントの非公開領域（本人だけが読み書きできる場所）への保存。使えなければ null */
export async function connectCloud(): Promise<Cloud | null> {
  const c = host();
  if (!c) return null;
  try {
    const [db, user] = (await Promise.all([c.use('db'), c.use('user')])) as [
      { doc(path: string): DocRef } | null,
      { id(): Promise<string | null> } | null,
    ];
    if (!db || !user) return null;
    const id = await user.id();
    if (!id) return null;
    const ref = db.doc(`data/users/${id}/hoppo`);
    return {
      async load() {
        const snap = await ref.get();
        if (!snap.exists) return null;
        const body = snap.data();
        if (!body || typeof body.payload !== 'string') return null;
        return migrate(JSON.parse(body.payload));
      },
      async save(data: AppData) {
        const payload = JSON.stringify(data);
        if (payload.length > LIMIT) throw new Error('too-big');
        await ref.set({ updatedAt: data.updatedAt, schema: data.schema, payload });
      },
    };
  } catch {
    return null;
  }
}

/** 夫婦で共有するデータ（このアーティファクトを開ける人みんなが読める場所。書けるのは編集権限のある人） */
export interface SharedState {
  data: AppData;
  updatedAt: number;
  updatedBy: string | null;
}
export interface Shared {
  me: string;
  load(): Promise<SharedState | null>;
  save(data: AppData): Promise<void>;
  /** 共有データが変わったら呼ばれる（自分の書き込みの反映待ちは除く） */
  watch(fn: (s: SharedState) => void, onError: () => void): () => void;
  /** 人の名前（その人の表示名。わからなければ ""） */
  nameOf(id: string): Promise<string>;
}

const SHARED_PATH = 'shared/household';

const parseShared = (s: Snap): SharedState | null => {
  if (!s.exists) return null;
  const b = s.data();
  if (!b || typeof b.payload !== 'string') return null;
  try {
    return { data: migrate(JSON.parse(b.payload)), updatedAt: Number(b.updatedAt) || 0, updatedBy: typeof b.updatedBy === 'string' ? b.updatedBy : null };
  } catch {
    return null;
  }
};

/** 共有の場所につなぐ。claude.ai で開いていない場合などは null */
export async function connectShared(): Promise<Shared | null> {
  const c = host();
  if (!c) return null;
  try {
    const [db, user] = (await Promise.all([c.use('db'), c.use('user')])) as [
      { doc(path: string): DocRef } | null,
      { id(): Promise<string | null>; profiles(ids: string[]): Promise<Record<string, { name: string }>> } | null,
    ];
    if (!db || !user) return null;
    const me = await user.id();
    if (!me) return null;
    const ref = db.doc(SHARED_PATH);
    return {
      me,
      async load() {
        return parseShared(await ref.get());
      },
      async save(data: AppData) {
        const payload = JSON.stringify(data);
        if (payload.length > LIMIT) throw new Error('too-big');
        await ref.set({ updatedAt: data.updatedAt, updatedBy: me, schema: data.schema, payload });
      },
      watch(fn, onError) {
        if (!ref.onSnapshot) return () => {};
        return ref.onSnapshot(
          (s) => {
            if (s.metadata?.hasPendingWrites) return;
            const v = parseShared(s);
            if (v) fn(v);
          },
          () => onError(),
        );
      },
      async nameOf(id: string) {
        try {
          const ps = await user.profiles([id]);
          return ps[id]?.name || '';
        } catch {
          return '';
        }
      },
    };
  } catch {
    return null;
  }
}

/** ファイルとして保存する。成功したら true */
export async function saveFile(filename: string, text: string): Promise<'saved' | 'unavailable' | 'declined'> {
  const c = host();
  if (c) {
    try {
      const dl = (await c.use('downloads')) as { save(r: { filename: string; data: string }): Promise<{ status: string }> } | null;
      if (dl) {
        await dl.save({ filename, data: text });
        return 'saved';
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return 'declined';
    }
    if (isFramed()) return 'unavailable';
  }
  if (isFramed()) return 'unavailable';
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'saved';
  } catch {
    return 'unavailable';
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * データをファイルで相手に送る（スマートフォンの共有メニュー: LINE・AirDrop・メールなど）。
 * 共有メニューが使えない環境では 'unavailable'
 */
export async function shareFile(filename: string, text: string): Promise<'shared' | 'cancelled' | 'unavailable'> {
  try {
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
    if (!nav.share || !nav.canShare || isFramed()) return 'unavailable';
    const file = new File([text], filename, { type: 'application/json' });
    if (!nav.canShare({ files: [file] })) return 'unavailable';
    await nav.share({ files: [file], title: 'ほっぽさんのデータ' });
    return 'shared';
  } catch (e) {
    return (e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'unavailable';
  }
}
