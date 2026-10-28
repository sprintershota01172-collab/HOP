/**
 * 実行環境ごとの機能。
 *  - claude.ai のアーティファクトとして開いた場合: アカウントの非公開領域に保存（db）、ファイル保存（downloads）
 *  - それ以外（GitHub Pages / ホーム画面のアプリ）: 端末内の IndexedDB のみ、ファイルはブラウザのダウンロード
 */
import type { AppData } from '../engine/types';
import { migrate } from './schema';

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
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
