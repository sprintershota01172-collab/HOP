import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { emptyData, sampleData } from '../engine/defaults';
import type { AppData } from '../engine/types';
import type { Lever } from '../engine/explain';
import { computeLevers, computeLoan, computeView, type LoanRequest, type LoanView, type ViewModel } from '../engine/view';
import { nowYM } from '../engine/ym';
import { initStorage, loadData, saveData, type StorageKind } from '../storage/db';
import { connectCloud, connectShared, type Cloud, type Shared, type SharedState } from '../storage/platform';

declare const __WORKER_SRC__: string;

/* ---------- 計算エンジン（Web Worker、使えなければメインスレッド） ---------- */
type Req = { kind: 'view'; data: AppData } | { kind: 'loan'; req: LoanRequest } | { kind: 'levers' };
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
          resolve(msg.kind === 'view' ? computeView(msg.data) : msg.kind === 'loan' ? computeLoan(msg.req) : computeLevers());
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
  /** 内部で付ける番号（表示の識別用） */
  id?: number;
  /** 閉じるアニメーション中 */
  closing?: boolean;
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
  levers: () => Promise<Lever[]>;
  tab: Tab;
  setTab: (t: Tab) => void;
  viewYear: number | null;
  setViewYear: (y: number | null) => void;
  sheets: SheetSpec[];
  open: (s: SheetSpec) => void;
  close: () => void;
  closeAll: () => void;
  toast: Toast | null;
  notify: (text: string, action?: Toast['action']) => void;
  share: ShareView;
  startShare: (mode: 'mine' | 'theirs') => Promise<void>;
  stopShare: () => void;
  setShareNotify: (v: boolean) => void;
}

/** 夫婦での共有（claude.ai で開いたときだけ使える） */
export interface ShareView {
  available: boolean;
  on: boolean;
  /** 相手が更新したら知らせる（端末ごと・本人ごとの設定） */
  notify: boolean;
  status: 'ok' | 'error' | 'too-big';
  /** 共有データの最終更新（まだ誰も共有していなければ null） */
  last: { at: number; mine: boolean; name: string } | null;
}

interface SharePrefs {
  on: boolean;
  notify: boolean;
}
const PREF_KEY = 'hoppo-san:share';
const readPrefs = (): SharePrefs => {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null');
    return { on: !!v?.on, notify: v?.notify !== false };
  } catch {
    return { on: false, notify: true };
  }
};
const writePrefs = (p: SharePrefs) => {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* 保存できない環境ではこの画面を開いている間だけ有効 */
  }
};

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
  const shared = useRef<Shared | null>(null);
  const prefs = useRef<SharePrefs>(readPrefs());
  const dataRef = useRef<AppData>(data);
  dataRef.current = data;
  /** 相手の更新を取り込んだ直後は、共有の場所へ書き戻さない */
  const fromShared = useRef(false);
  const firstSnap = useRef(true);
  const [share, setShare] = useState<ShareView>({ available: false, on: prefs.current.on, notify: prefs.current.notify, status: 'ok', last: null });
  const dirty = useRef(false);
  const compSeq = useRef(0);

  const notify = useCallback((text: string, action?: Toast['action']) => {
    const id = Date.now();
    setToast({ id, text, action });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), action ? 5000 : 2600);
  }, []);

  // 共有データが変わったとき: 表示を更新し、相手の新しい更新なら取り込む
  const onShared = useCallback(
    async (st: SharedState) => {
      const sh = shared.current;
      if (!sh) return;
      const mine = st.updatedBy === sh.me;
      const name = mine ? '' : st.updatedBy ? await sh.nameOf(st.updatedBy) : '';
      setShare((v) => ({ ...v, status: 'ok', last: { at: st.updatedAt, mine, name } }));
      const first = firstSnap.current;
      firstSnap.current = false;
      if (!prefs.current.on) return;
      // 共有していない間にこの端末で変えた分は、開いたときに共有の場所へ送る
      if (first && st.updatedAt < dataRef.current.updatedAt) {
        sh.save(dataRef.current).catch(() => setShare((v) => ({ ...v, status: 'error' })));
        return;
      }
      if (mine || st.updatedAt <= dataRef.current.updatedAt) return;
      fromShared.current = true;
      dirty.current = true;
      setUndoStack((h) => [dataRef.current, ...h].slice(0, 30));
      setData({ ...st.data, sample: false, updatedAt: st.updatedAt });
      if (prefs.current.notify) {
        const who = name ? `${name}さん` : '相手';
        notify(first ? `前回のあとに${who}が更新した内容を読み込みました` : `${who}が更新しました`, { label: '元に戻す', run: () => undoRef.current() });
      }
    },
    [notify],
  );
  const undoRef = useRef<() => void>(() => {});

  // 起動: 保存先を確かめて読み込む（なければサンプルを表示）
  useEffect(() => {
    let alive = true;
    let unwatch: (() => void) | null = null;
    (async () => {
      const kind = await initStorage();
      if (!alive) return;
      setStorage(kind);
      const local = await loadData();
      if (!alive) return;
      setData(local ?? sampleData(nowYM()));
      if (!local) dirty.current = true;
      setLoaded(true);
      // 夫婦で共有（claude.ai で開いた場合のみ）。購読は1つだけ
      connectShared().then((sh) => {
        if (!alive || !sh) return;
        shared.current = sh;
        setShare((v) => ({ ...v, available: true }));
        unwatch = sh.watch(
          (st) => void onShared(st),
          () => setShare((v) => ({ ...v, status: 'error' })),
        );
      });
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
      unwatch?.();
    };
  }, [notify, onShared]);

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
    const skipShared = fromShared.current;
    fromShared.current = false;
    const t3 = setTimeout(async () => {
      const sh = shared.current;
      if (!sh || !prefs.current.on || skipShared) return;
      try {
        await sh.save(data);
        setShare((v) => ({ ...v, status: 'ok' }));
      } catch (e) {
        setShare((v) => ({ ...v, status: (e as Error)?.message === 'too-big' ? 'too-big' : 'error' }));
      }
    }, 1500);
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
      clearTimeout(t3);
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

  undoRef.current = undo;

  const startShare = useCallback(
    async (mode: 'mine' | 'theirs') => {
      const sh = shared.current;
      if (!sh) return;
      prefs.current = { ...prefs.current, on: true };
      writePrefs(prefs.current);
      setShare((v) => ({ ...v, on: true }));
      try {
        if (mode === 'theirs') {
          const st = await sh.load();
          if (st) {
            fromShared.current = true;
            dirty.current = true;
            setUndoStack((h) => [dataRef.current, ...h].slice(0, 30));
            setData({ ...st.data, sample: false, updatedAt: st.updatedAt });
            notify('共有データを読み込みました。これからは2人の変更が自動でそろいます');
            return;
          }
        }
        const d = { ...dataRef.current, sample: false, updatedAt: Date.now() };
        await sh.save(d);
        setData(d);
        notify('共有を始めました。相手もこの画面を開くと同じデータになります');
      } catch (e) {
        setShare((v) => ({ ...v, status: (e as Error)?.message === 'too-big' ? 'too-big' : 'error' }));
        notify('共有の保存に失敗しました。編集の権限があるか確かめてください');
      }
    },
    [notify],
  );
  const stopShare = useCallback(() => {
    prefs.current = { ...prefs.current, on: false };
    writePrefs(prefs.current);
    setShare((v) => ({ ...v, on: false }));
    notify('共有をやめました。いまのデータはこの端末に残ります');
  }, [notify]);
  const setShareNotify = useCallback((v: boolean) => {
    prefs.current = { ...prefs.current, notify: v };
    writePrefs(prefs.current);
    setShare((x) => ({ ...x, notify: v }));
  }, []);

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
  const levers = useCallback(() => engine.call<Lever[]>({ kind: 'levers' }), [engine]);
  const sheetSeq = useRef(1);
  const open = useCallback((sp: SheetSpec) => setSheets((st) => [...st, { ...sp, id: sheetSeq.current++, closing: false }]), []);
  // 閉じるときは下へ滑らせてから取り除く（連続で押した場合は、その下のシートを順に閉じる）
  const close = useCallback(() => {
    setSheets((st) => {
      const i = st.map((x) => !x.closing).lastIndexOf(true);
      if (i < 0) return st;
      const id = st[i].id;
      setTimeout(() => setSheets((cur) => cur.filter((x) => x.id !== id)), 240);
      return st.map((x, j) => (j === i ? { ...x, closing: true } : x));
    });
  }, []);
  const closeAll = useCallback(() => {
    setSheets((st) => {
      setTimeout(() => setSheets((cur) => cur.filter((x) => !x.closing)), 240);
      return st.map((x) => ({ ...x, closing: true }));
    });
  }, []);

  const value: Store = {
    data, loaded, vm, computing, update, replace, undo, canUndo: undoStack.length > 0, saveState, storage, cloud: cloudState,
    loan, levers, tab, setTab, viewYear, setViewYear, sheets, open, close, closeAll, toast, notify,
    share, startShare, stopShare, setShareNotify,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
