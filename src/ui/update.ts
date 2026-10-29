/**
 * ホーム画面のアプリが新しい版に気づく仕組み（GitHub Pages 版のみ）。
 * 起動時と、アプリに戻ってきたとき（10分に1回まで）に version.json を確かめ、版が違えば知らせる。
 */
import { useEffect, useState } from 'react';

declare const __BUILD__: string;
declare const __BUILT_AT__: string;
declare const __PWA__: boolean;

export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
export const BUILT_AT = typeof __BUILT_AT__ !== 'undefined' ? __BUILT_AT__ : '';
const PWA = typeof __PWA__ !== 'undefined' && __PWA__;

export async function latestBuild(): Promise<string | null> {
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v?.build === 'string' ? v.build : null;
  } catch {
    return null;
  }
}

/** 新しい版があれば true */
export function useUpdateAvailable(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!PWA || BUILD === 'dev') return;
    let last = 0;
    const check = async () => {
      if (document.hidden || Date.now() - last < 10 * 60_000) return;
      last = Date.now();
      const b = await latestBuild();
      if (b && b !== BUILD) setReady(true);
    };
    void check();
    const on = () => void check();
    document.addEventListener('visibilitychange', on);
    window.addEventListener('focus', on);
    return () => {
      document.removeEventListener('visibilitychange', on);
      window.removeEventListener('focus', on);
    };
  }, []);
  return ready;
}

/** 新しい版を読み込む（オフライン用の保存も新しくする） */
export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* 更新の確認に失敗しても、読み込み直せば画面は新しくなる */
  }
  location.reload();
}
