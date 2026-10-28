import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './store';

declare const __PWA__: boolean;

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);

// GitHub Pages 版のみ: オフライン用の Service Worker（アーティファクトでは使えないため登録しない）
if (typeof __PWA__ !== 'undefined' && __PWA__ && 'serviceWorker' in navigator && window.self === window.top) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
