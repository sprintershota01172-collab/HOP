import type { AppData } from '../engine/types';
import { migrate } from './schema';

/**
 * 保存先: IndexedDB（使えない環境では localStorage、それも無理ならメモリのみ）。
 * - 'data'    : 最新のデータ
 * - 'backups' : 自動バックアップ（1日1回、最新5件）
 */
const DB = 'hoppo-san';
const STORE = 'kv';
const LS_KEY = 'hoppo-san:data';
const LS_BACKUP = 'hoppo-san:backups';

export type StorageKind = 'indexeddb' | 'localstorage' | 'memory';
export interface Backup {
  at: number;
  data: AppData;
}

let kind: StorageKind = 'memory';
let dbp: Promise<IDBDatabase> | null = null;
const mem = new Map<string, unknown>();

function openDB(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    } catch (e) {
      reject(e);
    }
  });
  return dbp;
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function get<T>(key: string): Promise<T | undefined> {
  if (kind === 'indexeddb') return idbGet<T>(key);
  if (kind === 'localstorage') {
    const raw = localStorage.getItem(key === 'data' ? LS_KEY : LS_BACKUP);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }
  return mem.get(key) as T | undefined;
}

async function set(key: string, value: unknown): Promise<void> {
  if (kind === 'indexeddb') return idbSet(key, value);
  if (kind === 'localstorage') {
    localStorage.setItem(key === 'data' ? LS_KEY : LS_BACKUP, JSON.stringify(value));
    return;
  }
  mem.set(key, value);
}

/** 使える保存先を確かめる */
export async function initStorage(): Promise<StorageKind> {
  try {
    if (typeof indexedDB !== 'undefined') {
      await idbSet('probe', Date.now());
      kind = 'indexeddb';
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* 永続化の要求は失敗しても動作に影響しない */
      }
      return kind;
    }
  } catch {
    /* 次の候補へ */
  }
  try {
    localStorage.setItem('hoppo-san:probe', '1');
    localStorage.removeItem('hoppo-san:probe');
    kind = 'localstorage';
  } catch {
    kind = 'memory';
  }
  return kind;
}

export const storageKind = (): StorageKind => kind;

export async function loadData(): Promise<AppData | null> {
  try {
    const raw = await get<unknown>('data');
    return raw ? migrate(raw) : null;
  } catch {
    // 壊れたデータは直近のバックアップから復元を試みる
    const backups = await listBackups();
    for (const b of backups) {
      try {
        return migrate(b.data);
      } catch {
        /* 次のバックアップ */
      }
    }
    return null;
  }
}

export async function saveData(data: AppData): Promise<void> {
  await set('data', data);
  const backups = (await get<Backup[]>('backups')) ?? [];
  const day = (t: number) => new Date(t).toDateString();
  if (!backups.length || day(backups[0].at) !== day(Date.now())) {
    backups.unshift({ at: Date.now(), data });
    await set('backups', backups.slice(0, 5));
  }
}

export async function listBackups(): Promise<Backup[]> {
  try {
    return (await get<Backup[]>('backups')) ?? [];
  } catch {
    return [];
  }
}

export async function clearAll(): Promise<void> {
  await set('data', null);
}
