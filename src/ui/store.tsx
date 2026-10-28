import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { emptyData, sampleData } from '../engine/defaults';
import type { AppData } from '../engine/types';
import { computeLoan, computeView, type LoanRequest, type LoanView, type ViewModel } from '../engine/view';
import { nowYM } from '../engine/ym';
import { initStorage, loadData, saveData, type StorageKind } from '../storage/db';
import { connectCloud, type Cloud } from '../storage/platform';

declare const __WORKER_SRC__: string;

/* ---------- 計算エンジン（Web Worker、使えなければメインスレッド） ---------- */
type Req = { kind: 'view'; data: AppData } | { kind: 'loan'; req: LoanRequest };
class Engine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; msg: Req }>();
  constructor() {
    try {
      if (typeof __WORKER_SRC__ === 'string' && __WORKER_SRC__.length > 0 && typeof Worker !== 'undefined') {
        const url = URL.createObjectURL(new Blob([__WORKER_SRC__], { type: 'text/javascript' }));
        const w = new Worker(url);
        w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
          const p = this.pending.get(e.data.id);
          if (!p) return;
          this.pending.delete(e.data.id);
          if (e.data.ok) p.resolve(e.data.result);
          else p.reject(new Error(e.data.error));
        };
        w.onerror = () => this.fallback();
        this.worker = w;
      }
    } catch {
      this.worker = null;
    }
  }
  private fallback() {
    this.worker?.terminate();
    this.worker = null;
    const items = [...this.pending.values()];
    this.pending.clear();
    for (const p of items) this.local(p.msg).then(p.resolve, p.reject);
  }
  private local(msg: Req): Promise<unknown> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(msg.kind === 'view' ? computeView(msg.data) : computeLoan(msg.req));
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
  }
  call<T>(msg: Req): Promise<T> {
    if (!this.worker) return this.local(msg) as Promise<T>;
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, msg });
      this.worker!.postMessage({ id, ...msg });
    });
  }
}

export type Tab = 'home' | 'fp' | 'compare' | 'loan' | 'memo';
export interface SheetSpec {
  kind: string;
  props?: Record<string, unknown>;
}
export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export interface Store {
  data: AppData;
  loaded: boolean;
  vm: ViewModel | null;
  computing: boolean;
  update: (fn: (d: AppData) => void, label?: string) => void;
  replace: (d: AppData, label?: string) => void;
  undo: () => void;
  canUndo: boolean;
  saveState: 'saved' | 'saving' | 'error';
  storage: StorageKind;
  cloud: 'off' | 'on' | 'error' | 'too-big';
  loan: (req: LoanRequest) => Promise<LoanView | null>;
  tab: Tab;
  setTab: (t: Tab) => void;
  viewYear: number | null;
  setViewYear: (y: number | null) => void;
  sheets: SheetSpec[];
  open: (s: SheetSpec) => void;
  close: () => void;
  toast: Toast | null;
  notify: (text: string, action?: Toast['action']) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('store');
  return s;
};

const TABS: Tab[] = ['home', 'fp', 'compare', 'loan', 'memo'];
const tabFromHash = (): Tab => {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace('#', '') as Tab;
  return TABS.includes(h) ? h : 'home';
};

export function StoreProvider({ children }: { children?: ReactNode }) {
  const engine = useMemo(() => new Engine(), []);
  const [data, setData] = useState<AppData>(() => emptyData(nowYM()));
  const [loaded, setLoaded] = useState(false);
  const [vm, setVm] = useState<ViewModel | null>(null);
  const [computing, setComputing] = useState(true);
  const [undoStack, setUndoStack] = useState<AppData[]>([]);
  const [saveState, setSaveState] = useState<Store['saveState']>('saved');
  const [storage, setStorage] = useState<StorageKind>('memory');
  const [cloudState, setCloudState] = useState<Store['cloud']>('off');
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [viewYear, setViewYear] = useState<number | null>(null);
  const [sheets, setSheets] = useState<SheetSpec[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const cloud = useRef<Cloud | null>(null);
  const dirty = useRef(false);
  const compSeq = useRef(0);

  const notify = useCallback((text: string, action?: Toast['action']) => {
    const id = Date.now();
    setToast({ id, text, action });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), action ? 5000 : 2600);
  }, []);

  // 起動: 保存先を確かめて読み込む（なければサンプルを表示）
  useEffect(() => {
    let alive = true;
    (async () => {
      const kind = await initStorage();
      if (!alive) return;
      setStorage(kind);
      const local = await loadData();
      if (!alive) return;
      setData(local ?? sampleData(nowYM()));
      if (!local) dirty.current = true;
      setLoaded(true);
      // アカウントの保存領域（claude.ai で開いた場合のみ）
      const c = await connectCloud();
      if (!alive || !c) return;
      cloud.current = c;
      setCloudState('on');
      try {
        const remote = await c.load();
        if (remote && (!local || remote.updatedAt > local.updatedAt)) {
          setData(remote);
          dirty.current = true;
          notify('アカウントに保存されていた新しいデータを読み込みました');
        } else if (local) {
          await c.save(local);
        }
      } catch {
        setCloudState('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [notify]);

  // 計算（入力が変わったときだけ。画面の切り替えや表示年の変更では再計算しない）
  useEffect(() => {
    if (!loaded) return;
    const id = ++compSeq.current;
    setComputing(true);
    const t = setTimeout(() => {
      engine
        .call<ViewModel>({ kind: 'view', data })
        .then((v) => {
          if (id === compSeq.current) {
            setVm(v);
            setComputing(false);
          }
        })
        .catch(() => {
          if (id === compSeq.current) setComputing(false);
        });
    }, 120);
    return () => clearTimeout(t);
  }, [data, loaded, engine]);

  // 自動保存（端末 → アカウント）
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await saveData(data);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 400);
    const t2 = setTimeout(async () => {
      if (!cloud.current) return;
      try {
        await cloud.current.save(data);
        setCloudState('on');
      } catch (e) {
        setCloudState((e as Error)?.message === 'too-big' ? 'too-big' : 'error');
      }
    }, 2000);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [data, loaded]);

  const update = useCallback(
    (fn: (d: AppData) => void, label?: string) => {
      setData((prev) => {
        const next = structuredClone(prev);
        fn(next);
        next.updatedAt = Date.now();
        setUndoStack((h) => [prev, ...h].slice(0, 30));
        dirty.current = true;
        if (label) notify(label);
        return next;
      });
    },
    [notify],
  );

  const replace = useCallback(
    (d: AppData, label?: string) => {
      setData((prev) => {
        setUndoStack((h) => [prev, ...h].slice(0, 30));
        dirty.current = true;
        return { ...d, updatedAt: Date.now() };
      });
      if (label) notify(label);
    },
    [notify],
  );

  const undo = useCallback(() => {
    setUndoStack((h) => {
      if (!h.length) return h;
      const [prev, ...rest] = h;
      dirty.current = true;
      setData({ ...prev, updatedAt: Date.now() });
      notify('元に戻しました');
      return rest;
    });
  }, [notify]);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    try {
      history.replaceState(null, '', `#${t}`);
    } catch {
      /* 埋め込み表示などでは無視 */
    }
  }, []);

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loan = useCallback((req: LoanRequest) => engine.call<LoanView | null>({ kind: 'loan', req }), [engine]);
  const open = useCallback((s: SheetSpec) => setSheets((st) => [...st, s]), []);
  const close = useCallback(() => setSheets((st) => st.slice(0, -1)), []);

  const value: Store = {
    data, loaded, vm, computing, update, replace, undo, canUndo: undoStack.length > 0, saveState, storage, cloud: cloudState,
    loan, tab, setTab, viewYear, setViewYear, sheets, open, close, toast, notify,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
