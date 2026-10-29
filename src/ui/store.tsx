import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { emptyData, sampleData } from '../engine/defaults';
import type { AppData } from '../engine/types';
import type { Lever } from '../engine/explain';
import { computeLevers, computeLoan, computeView, type LoanRequest, type LoanView, type ViewModel } from '../engine/view';
import { nowYM } from '../engine/ym';
import { initStorage, loadData, saveData, type StorageKind } from '../storage/db';
import { connectCloud, connectShared, hasHost, type Cloud, type Shared, type SharedState } from '../storage/platform';
import { createRoom, inviteLink, openRoom, parseInvite, readRoom, roomSupported, type Invite, type RoomMeta } from '../storage/room';

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
  setMyName: (name: string) => void;
  /** 招待リンクを開いた（または貼り付けた）とき: 部屋の中身を確かめる */
  peekInvite: (link: string) => Promise<{ invite: Invite; name: string; houses: number } | null>;
  joinInvite: (invite: Invite) => Promise<boolean>;
  /** 起動したときの URL に入っていた招待（まだ参加していないもの） */
  pendingInvite: Invite | null;
  clearPendingInvite: () => void;
}

/** 夫婦での共有: claude.ai で開いたときはアカウントの共有領域、ホーム画面のアプリ（GitHub Pages）では招待リンクの暗号化ルーム */
export interface ShareView {
  available: boolean;
  kind: 'claude' | 'room' | null;
  /** 相手に送る招待リンク（ルームのときだけ） */
  invite: string | null;
  /** 相手に表示する自分の呼び名 */
  myName: string;
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
  name: string;
  /** この端末の識別子（だれが更新したかを見分ける） */
  client: string;
  room: RoomMeta | null;
}
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `c${Date.now()}${Math.random().toString(36).slice(2)}`);
const PREF_KEY = 'hoppo-san:share';
const readPrefs = (): SharePrefs => {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null');
    return { on: !!v?.on, notify: v?.notify !== false, name: typeof v?.name === 'string' ? v.name : '', client: typeof v?.client === 'string' ? v.client : newId(), room: v?.room?.roomId ? v.room : null };
  } catch {
    return { on: false, notify: true, name: '', client: newId(), room: null };
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
  const [share, setShare] = useState<ShareView>({ available: false, kind: null, invite: null, myName: prefs.current.name, on: prefs.current.on, notify: prefs.current.notify, status: 'ok', last: null });
  const unwatch = useRef<(() => void) | null>(null);
  const [pendingInvite, setPendingInvite] = useState<Invite | null>(() => {
    const inv = typeof location !== 'undefined' ? parseInvite(location.hash) : null;
    return inv && inv.roomId !== prefs.current.room?.roomId ? inv : null;
  });
  const savePrefs = (p: Partial<SharePrefs>) => {
    prefs.current = { ...prefs.current, ...p };
    writePrefs(prefs.current);
  };
  const base = () => (typeof location !== 'undefined' ? location.origin + location.pathname : '');
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

  /** 共有の場所につなぐ（つなぎ直すときは前の購読を外す） */
  const attach = useCallback(
    (sh: Shared) => {
      unwatch.current?.();
      (shared.current as { dispose?: () => void } | null)?.dispose?.();
      shared.current = sh;
      firstSnap.current = true;
      unwatch.current = sh.watch(
        (st) => void onShared(st),
        () => setShare((v) => ({ ...v, status: 'error' })),
      );
    },
    [onShared],
  );
  const attachRoom = useCallback(
    (meta: RoomMeta) => {
      const room = openRoom(meta, { id: prefs.current.client, name: () => prefs.current.name }, (m) => savePrefs({ room: m }));
      attach(room);
      setShare((v) => ({ ...v, invite: inviteLink(base(), meta) }));
    },
    [attach],
  );

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
      // 夫婦で共有。claude.ai ではアカウントの共有領域、ホーム画面のアプリでは招待リンクのルーム。購読は1つだけ
      if (hasHost()) {
        connectShared().then((sh) => {
          if (!alive || !sh) return;
          setShare((v) => ({ ...v, available: true, kind: 'claude' }));
          attach(sh);
        });
      } else if (roomSupported()) {
        setShare((v) => ({ ...v, available: true, kind: 'room' }));
        if (prefs.current.on && prefs.current.room) attachRoom(prefs.current.room);
      }
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
      unwatch.current?.();
      (shared.current as { dispose?: () => void } | null)?.dispose?.();
    };
  }, [notify, attach, attachRoom]);

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
      if (share.kind === 'room') {
        // 新しい部屋を作って、いまのデータを置く → 招待リンクを相手に送る
        try {
          const d = { ...dataRef.current, sample: false, updatedAt: Date.now() };
          const meta = await createRoom(d, { id: prefs.current.client, name: prefs.current.name });
          savePrefs({ on: true, room: meta });
          setShare((v) => ({ ...v, on: true, status: 'ok', last: { at: d.updatedAt, mine: true, name: '' } }));
          setData(d);
          attachRoom(meta);
          notify('共有を始めました。招待リンクを相手に送ってください');
        } catch (e) {
          setShare((v) => ({ ...v, status: (e as Error)?.message === 'too-big' ? 'too-big' : 'error' }));
          notify('共有を始められませんでした。インターネットにつながっているか確かめてください');
        }
        return;
      }
      const sh = shared.current;
      if (!sh) return;
      savePrefs({ on: true });
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
    [notify, share.kind, attachRoom],
  );
  const stopShare = useCallback(() => {
    if (share.kind === 'room') {
      unwatch.current?.();
      unwatch.current = null;
      (shared.current as { dispose?: () => void } | null)?.dispose?.();
      shared.current = null;
      savePrefs({ on: false, room: null });
      setShare((v) => ({ ...v, on: false, invite: null, last: null, status: 'ok' }));
    } else {
      savePrefs({ on: false });
      setShare((v) => ({ ...v, on: false }));
    }
    notify('共有をやめました。いまのデータはこの端末に残ります');
  }, [notify, share.kind]);
  const setMyName = useCallback((name: string) => {
    savePrefs({ name: name.trim().slice(0, 20) });
    setShare((v) => ({ ...v, myName: prefs.current.name }));
  }, []);
  const peekInvite = useCallback(async (link: string) => {
    const invite = parseInvite(link);
    if (!invite) return null;
    try {
      const r = await readRoom(invite);
      return { invite, name: r.name, houses: r.state.data.houses.length };
    } catch {
      return null;
    }
  }, []);
  const joinInvite = useCallback(
    async (invite: Invite) => {
      try {
        const r = await readRoom(invite);
        savePrefs({ on: true, room: r.meta });
        fromShared.current = true;
        dirty.current = true;
        setUndoStack((h) => [dataRef.current, ...h].slice(0, 30));
        setData({ ...r.state.data, sample: false, updatedAt: r.state.updatedAt });
        setShare((v) => ({ ...v, on: true, status: 'ok', last: { at: r.state.updatedAt, mine: r.state.updatedBy === prefs.current.client, name: r.name } }));
        attachRoom(r.meta);
        setPendingInvite(null);
        notify(`${r.name ? `${r.name}さんの` : ''}共有データに参加しました。これからは2人の変更が自動でそろいます`);
        return true;
      } catch {
        notify('参加できませんでした。招待リンクが正しいか、インターネットにつながっているか確かめてください');
        return false;
      }
    },
    [notify, attachRoom],
  );
  const clearPendingInvite = useCallback(() => setPendingInvite(null), []);
  const setShareNotify = useCallback((v: boolean) => {
    savePrefs({ notify: v });
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
    share, startShare, stopShare, setShareNotify, setMyName, peekInvite, joinInvite, pendingInvite, clearPendingInvite,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
