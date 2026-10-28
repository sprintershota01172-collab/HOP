// ほっぽさん ビルド（esbuild）
//   node scripts/build.mjs            → dist/pages（GitHub Pages / PWA）と dist/artifact（claude.ai 用の1ファイル）
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = (...p) => path.join(root, 'dist', ...p);

async function bundle(entry, define) {
  const r = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020', 'safari15'],
    platform: 'browser',
    write: false,
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"', ...define },
    logLevel: 'warning',
  });
  return r.outputFiles[0].text;
}

const css = await readFile(path.join(root, 'src/ui/styles.css'), 'utf8');
const worker = await bundle('src/engine/worker.ts', {});
const define = (pwa) => ({ __WORKER_SRC__: JSON.stringify(worker), __PWA__: String(pwa) });
const appPages = await bundle('src/ui/main.tsx', define(true));
const appArtifact = await bundle('src/ui/main.tsx', define(false));
const hash = createHash('sha256').update(appPages + css).digest('hex').slice(0, 10);
const minCss = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*/g, '\n');

await rm(out(), { recursive: true, force: true });
await mkdir(out('pages', 'assets'), { recursive: true });
await mkdir(out('artifact'), { recursive: true });

/* ---------- GitHub Pages（PWA） ---------- */
const jsName = `assets/app.${hash}.js`;
await writeFile(out('pages', jsName), appPages);
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f5f1e9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161a17" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="ほっぽさん">
<meta name="description" content="住宅購入とライフプランを一緒に考える家計アプリ">
<title>ほっぽさん</title>
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icon-180.png">
<style>${minCss}</style>
</head>
<body>
<div id="root"></div>
<noscript>JavaScript を有効にしてください。</noscript>
<script src="./${jsName}" defer></script>
</body>
</html>
`;
await writeFile(out('pages', 'index.html'), html);
await writeFile(
  out('pages', 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'ほっぽさん',
      short_name: 'ほっぽさん',
      description: '住宅購入とライフプランを一緒に考える家計アプリ',
      lang: 'ja',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: '#f5f1e9',
      theme_color: '#1f4d3a',
      icons: [
        { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: './icon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  ),
);
await copyFile(path.join(root, 'public/icon.svg'), out('pages', 'icon.svg'));
// アイコン（public/icon.svg から作成済みの PNG をコピー）
for (const size of [180, 192, 512]) await copyFile(path.join(root, `public/icon-${size}.png`), out('pages', `icon-${size}.png`));
const precache = ['./', './index.html', `./${jsName}`, './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];
await writeFile(
  out('pages', 'sw.js'),
  `// ほっぽさん オフライン用（ビルド ${hash}）
const CACHE = 'hoppo-${hash}';
const FILES = ${JSON.stringify(precache)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('hoppo-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // 画面（HTML）は新しい版を優先し、オフラインならキャッシュ。その他はキャッシュ優先。
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`,
);
await writeFile(out('pages', '.nojekyll'), '');

/* ---------- claude.ai アーティファクト（1ファイル） ---------- */
// 公開時の雛形が :root を安全領域の分だけ余白にするため、アプリ側の上下の安全領域は 0 にする
const artifact = `<title>ほっぽさん</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${minCss}
:root{--safe-top:0px;--safe-bottom:0px}</style>
<div id="root"></div>
<script>${appArtifact.replace(/<\/script/gi, '<\\/script')}</script>
`;
await writeFile(out('artifact', 'hoppo.html'), artifact);

console.log(`built ${hash}: pages app ${(appPages.length / 1024).toFixed(0)}KB (worker ${(worker.length / 1024).toFixed(0)}KB), artifact ${(artifact.length / 1024).toFixed(0)}KB`);
