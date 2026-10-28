// 画面の検証（実際のブラウザ・スマートフォンの画面サイズ）
//   npm run test:e2e   （先に npm run build）
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const DIST = new URL('../dist/pages', import.meta.url).pathname;
const TABS = ['home', 'fp', 'compare', 'loan', 'memo'];
let srv, browser;
const errors = [];

before(async () => {
  srv = await serve(DIST);
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  srv?.close();
});

async function open(size = [375, 667], scheme = 'light') {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(srv.url);
  await page.waitForSelector('.hero .amount', { timeout: 20000 });
  return { ctx, page };
}

const heroText = (page) => page.$eval('.hero .amount', (e) => e.textContent);
const settle = (page) => page.waitForFunction(() => !document.querySelector('.hero .micro')?.textContent?.includes('再計算中'), null, { timeout: 15000 }).then(() => page.waitForTimeout(400));

async function layoutReport(page) {
  return page.evaluate(() => {
    const s = document.querySelector('.screen');
    const iw = innerWidth;
    const wide = [...document.querySelectorAll('.app *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > iw + 0.5 && getComputedStyle(el).position !== 'fixed';
    }).map((el) => el.className || el.tagName);
    // 高さが足りずに中身が切れている部品（.fill は残りの高さに合わせて縮む領域）
    const clipped = [...document.querySelectorAll('.screen .fill, .screen .card')]
      .filter((el) => el.scrollHeight - el.clientHeight > 2)
      .map((el) => `${el.className}:${el.scrollHeight - el.clientHeight}`);
    return { vOverflow: s.scrollHeight - s.clientHeight, docW: document.documentElement.scrollWidth, iw, wide: wide.slice(0, 5), clipped };
  });
}

describe('スクロールなしのレイアウト', () => {
  const sizes = [[375, 667], [390, 844], [430, 932], [375, 560]];
  for (const size of sizes) {
    for (const scheme of size[0] === 390 ? ['light', 'dark'] : ['light']) {
      it(`${size.join('×')} ${scheme}: 5画面とも縦横にはみ出さない`, async () => {
        const { ctx, page } = await open(size, scheme);
        // 各画面と、その中の切り替え表示
        const views = [
          ['home', []],
          ['fp', []], ['fp', ['年の収支']], ['fp', ['資産の推移']], ['fp', ['ライフプランを入力']],
          ['compare', []], ['compare', ['ランキング']],
          ['loan', []], ['loan', ['金利・収入の変化']], ['loan', ['返済予定表']],
          ['memo', []],
        ];
        for (const [t, clicks] of views) {
          await page.click(`nav button:nth-child(${TABS.indexOf(t) + 1})`);
          for (const c of clicks) await page.click(`.screen .seg button:has-text("${c}")`);
          await page.waitForTimeout(450);
          const name = [t, ...clicks].join('/');
          const r = await layoutReport(page);
          assert.ok(r.vOverflow <= 1, `${name}: 縦に ${r.vOverflow}px はみ出し`);
          assert.ok(r.docW <= r.iw, `${name}: 横幅 ${r.docW} > ${r.iw}`);
          assert.deepEqual(r.wide, [], `${name}: 画面外に出る要素`);
          assert.deepEqual(r.clipped, [], `${name}: 中身が切れている部品`);
        }
        await ctx.close();
      });
    }
  }

  it('375×667: ライフプランの入力シート12種がスクロールなしで収まる', async () => {
    const { ctx, page } = await open([375, 667]);
    await page.click('nav button:nth-child(2)');
    await page.click('text=ライフプランを入力');
    const tiles = await page.$$eval('.tile .t', (els) => els.map((e) => e.textContent));
    assert.equal(tiles.length, 12);
    for (const t of tiles) {
      await page.click(`.tile:has-text("${t}")`);
      await page.waitForSelector('.sheet-body');
      await page.waitForTimeout(300);
      const o = await page.evaluate(() => { const b = [...document.querySelectorAll('.sheet-body')].pop(); return b.scrollHeight - b.clientHeight; });
      assert.ok(o <= 1, `${t}: ${o}px はみ出し`);
      await page.click('.sheet-head .iconbtn');
      await page.waitForTimeout(120);
    }
    await ctx.close();
  });
});

describe('入力・保存・再計算', () => {
  it('収入を変えると推奨予算が変わり、再読み込み後も保持される。表示年を変えても推奨予算は変わらない', async () => {
    const { ctx, page } = await open([390, 844]);
    await settle(page);
    const before = await heroText(page);
    await page.click('nav button:nth-child(2)');
    await page.click('text=ライフプランを入力');
    await page.click('.tile:has-text("収入")');
    const input = page.locator('.sheet .field:has-text("手取り月収") input').first();
    await input.fill('40');
    await input.press('Enter');
    await page.click('.sheet-foot .btn.primary');
    await page.click('nav button:nth-child(1)');
    await settle(page);
    const after1 = await heroText(page);
    assert.notEqual(after1, before, '収入の変更が推奨額に反映される');
    // 元に戻す → やり直す
    await page.click('button[aria-label="元に戻す"]');
    await settle(page);
    assert.equal(await heroText(page), before, '元に戻せる');
    await page.click('nav button:nth-child(2)');
    await page.click('text=ライフプランを入力');
    await page.click('.tile:has-text("収入")');
    const input2 = page.locator('.sheet .field:has-text("手取り月収") input').first();
    await input2.fill('40');
    await input2.press('Enter');
    await page.click('.sheet-foot .btn.primary');
    await page.click('nav button:nth-child(1)');
    await settle(page);
    assert.equal(await heroText(page), after1);
    // 保存の反映を待って再読み込み
    await page.waitForTimeout(800);
    await page.reload();
    await page.waitForSelector('.hero .amount');
    await settle(page);
    assert.equal(await heroText(page), after1, '再読み込みしても同じ');
    // 表示年を変えても推奨額は変わらない
    await page.click('nav button:nth-child(2)');
    for (const q of ['30年後', '老後', '5年後']) await page.click(`.quickyears button:has-text("${q}")`);
    await page.click('.yearbar button[aria-label="次の年"]');
    await page.click('nav button:nth-child(1)');
    await page.waitForTimeout(500);
    assert.equal(await heroText(page), after1, '表示年の変更で推奨額が変わらない');
    await ctx.close();
  });

  it('住宅を登録すると比較とランキングに出る', async () => {
    const { ctx, page } = await open([390, 844]);
    await page.click('nav button:nth-child(3)');
    await page.click('button:has-text("追加")');
    await page.fill('.sheet .field:has-text("物件名") input', 'テスト邸');
    await page.locator('.sheet .field:has-text("物件名") input').press('Enter');
    await page.click('.sheet-foot .btn.primary'); // 価格へ
    const price = page.locator('.sheet .field:has-text("物件価格") input').first();
    await price.fill('3900');
    await price.press('Enter');
    await page.click('.sheet-head .iconbtn');
    await page.click('.seg button:has-text("ランキング")');
    await page.waitForSelector('.item:has-text("テスト邸")', { timeout: 15000 });
    const chip = await page.locator('.item:has-text("テスト邸") .chip').textContent();
    assert.match(chip, /安心|標準|注意|危険/);
    await ctx.close();
  });

  it('メモを追加し、ワンタップ整理で確認事項に分類される', async () => {
    const { ctx, page } = await open([390, 844]);
    await page.click('nav button:nth-child(5)');
    await page.click('.btn.primary:has-text("メモ")');
    await page.fill('#memo-title', '外構の費用');
    await page.fill('#memo-body', '外構は見積もりに含まれる？');
    await page.click('.sheet-foot .btn.primary');
    await page.click('button:has-text("ワンタップ整理")');
    await page.click('.chips button:has-text("確認事項")');
    await page.waitForSelector('.memo:has-text("外構の費用")');
    await ctx.close();
  });

  it('書き出したデータを貼り付けて読み込むと元に戻る', async () => {
    const { ctx, page } = await open([390, 844]);
    await settle(page);
    const before = await heroText(page);
    await page.click('button[aria-label="データと設定"]');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }));
    await page.click('.sheet .btn:has-text("コピー")');
    const json = await page.locator('.sheet textarea[readonly]').inputValue();
    assert.ok(json.includes('"app": "hoppo-san"'));
    // 初期化 → 入力が必要な状態
    await page.click('.sheet .btn.danger:has-text("すべて初期化")');
    await page.click('.sheet .btn.danger:has-text("初期化する")');
    await page.waitForSelector('text=入力が必要です');
    // 貼り付けて読み込む
    await page.click('button[aria-label="データと設定"]');
    await page.click('.sheet .btn:has-text("貼り付けて読む")');
    await page.fill('.sheet textarea:not([readonly])', json);
    await page.click('.sheet .btn:has-text("読み込む")');
    await page.locator('.sheet').last().locator('.btn.primary:has-text("読み込む")').click();
    await page.click('.sheet-head .iconbtn').catch(() => {});
    await page.waitForSelector('.hero .amount');
    await settle(page);
    assert.equal(await heroText(page), before);
    await ctx.close();
  });

  it('空の状態から「かんたん入力」で推奨予算が出る', async () => {
    const { ctx, page } = await open([375, 667]);
    await page.click('button:has-text("自分の家計で始める")');
    await page.click('.sheet .btn.danger:has-text("消して入力する")');
    await page.waitForSelector('text=かんたん入力');
    const field = (label) => page.locator(`.sheet .field:has-text("${label}")`).first();
    await field('あなたの生まれた年月').locator('select').first().selectOption('1995');
    await page.click('.sheet-foot .btn.primary');
    const inc = field('あなたの手取り月収').locator('input');
    await inc.fill('35');
    await inc.press('Enter');
    await page.click('.sheet-foot .btn.primary');
    const cash = field('あなたの現金・預金').locator('input');
    await cash.fill('500');
    await cash.press('Enter');
    const liv = field('毎月の生活費').locator('input');
    await liv.fill('15');
    await liv.press('Enter');
    const rent = field('いまの家賃').locator('input');
    await rent.fill('70000');
    await rent.press('Enter');
    await page.click('.sheet-foot .btn.primary');
    await field('家を買う時期').locator('select').first().selectOption(String(new Date().getFullYear() + 2));
    await page.click('.seg button:has-text("なし")');
    await page.click('.sheet-foot .btn.primary:has-text("結果を見る")');
    await page.waitForSelector('.hero .amount', { timeout: 20000 });
    const t = await heroText(page);
    assert.match(t, /\d/);
    assert.equal(await page.locator('text=入力が必要です').count(), 0);
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => {
    assert.deepEqual(errors, []);
  });
});
