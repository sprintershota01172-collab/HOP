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
    const iw = innerWidth;
    // 表示中の画面（切り替えの途中で残る前の画面は除く）
    const live = (el) => !el.closest('.pane.out');
    const scrollers = [...document.querySelectorAll('.main .screen, .main .pane')].filter(live);
    const vOverflow = Math.max(0, ...scrollers.map((el) => el.scrollHeight - el.clientHeight));
    const wide = [...document.querySelectorAll('.app *')].filter((el) => {
      if (!live(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > iw + 0.5 && getComputedStyle(el).position !== 'fixed';
    }).map((el) => el.className || el.tagName);
    // 高さが足りずに中身が切れている部品（.fill は残りの高さに合わせて縮む領域）
    const clipped = [...document.querySelectorAll('.main .fill, .main .card')]
      .filter(live)
      .filter((el) => el.scrollHeight - el.clientHeight > 2)
      .map((el) => `${el.className}:${el.scrollHeight - el.clientHeight}`);
    return { vOverflow, docW: document.documentElement.scrollWidth, iw, wide: wide.slice(0, 5), clipped };
  });
}

/** シートの中身が収まっているか（中のページ切り替えも含めて） */
async function sheetOverflow(page) {
  return page.evaluate(() => {
    const sheet = [...document.querySelectorAll('.sheet:not(.closing)')].pop();
    if (!sheet) return 0;
    const els = [sheet.querySelector('.sheet-body'), ...sheet.querySelectorAll('.pane:not(.out)')].filter(Boolean).filter((el) => !el.closest('.pane.out'));
    return Math.max(0, ...els.map((el) => el.scrollHeight - el.clientHeight));
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
      const o = await sheetOverflow(page);
      assert.ok(o <= 1, `${t}: ${o}px はみ出し`);
      await page.click('.sheet:not(.closing) .sheet-head .iconbtn');
      await page.waitForTimeout(320);
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

  it('空の状態から「かんたん入力」で推奨予算が出て、入力した値が編集画面にそのまま出る', async () => {
    const { ctx, page } = await open([375, 667]);
    await page.click('button:has-text("自分の家計で始める")');
    await page.click('.sheet .btn.danger:has-text("消して入力する")');
    await page.waitForSelector('.sheet h2:has-text("かんたん入力 1/")');
    const sheet = () => page.locator('.sheet:not(.closing)').last();
    const field = (label) => sheet().locator(`.field:has-text("${label}"):not(.pane.out .field)`).first();
    const money = async (label, v) => {
      const inp = field(label).locator('input');
      await inp.fill(v);
      await inp.press('Enter');
    };
    const next = async () => {
      await sheet().locator('.sheet-foot .btn.primary').click();
      await page.waitForTimeout(380);
    };
    // 1 収入
    await field('生まれた年月').locator('select').first().selectOption('1995');
    await money('手取り月収', '35');
    assert.match(await field('手取り月収').locator('.pv').textContent(), /35万円\/月/, '万円の入力が円で確認できる');
    await next();
    // 2 貯蓄
    await money('現金・預金', '500');
    await next();
    // 3 生活費
    await money('毎月の生活費', '15');
    await next();
    // 4 住まい・購入時期
    await money('家賃', '7');
    await sheet().locator('.seg button:has-text("購入計画")').click();
    await page.waitForTimeout(380);
    await field('購入の予定').locator('select').first().selectOption(String(new Date().getFullYear() + 2));
    // 5〜8 は任意（そのまま進める）
    for (let i = 0; i < 4; i++) await next();
    assert.equal(await sheet().locator('.sheet-foot .btn.primary').textContent(), '結果を見る');
    await sheet().locator('.sheet-foot .btn.primary').click();
    await page.waitForSelector('.hero .amount', { timeout: 20000 });
    await settle(page);
    assert.match(await heroText(page), /\d/);
    assert.equal(await page.locator('text=入力が必要です').count(), 0);

    // あとから編集する画面に、同じ項目名・同じ単位で同じ値が出る
    await page.click('nav button:nth-child(2)');
    await page.click('text=ライフプランを入力');
    const checks = [
      ['収入', '手取り月収', '35'],
      ['貯蓄', '現金・預金', '500'],
      ['生活費', '毎月の生活費', '15'],
      ['住まい', '家賃', '7', 'いまの住まい'],
    ];
    for (const [tile, label, v, pg] of checks) {
      await page.click(`.tile:has-text("${tile}")`);
      await page.waitForTimeout(380);
      if (pg) {
        await sheet().locator(`.seg button:has-text("${pg}")`).click();
        await page.waitForTimeout(380);
      }
      assert.equal(await field(label).locator('input').inputValue(), v, `${tile}: ${label}`);
      await sheet().locator('.sheet-head .iconbtn').click();
      await page.waitForTimeout(320);
    }
    // 再読み込み後も残っている
    await page.waitForTimeout(800);
    await page.reload();
    await page.waitForSelector('.main .pane', { timeout: 20000 });
    await page.click('nav button:nth-child(2)');
    await page.click('text=ライフプランを入力');
    await page.click('.tile:has-text("収入")');
    await page.waitForTimeout(380);
    assert.equal(await field('手取り月収').locator('input').inputValue(), '35');
    await ctx.close();
  });

  it('計算の内訳から該当する入力を開いて変えると、その場で予算が変わる', async () => {
    const { ctx, page } = await open([390, 844]);
    await settle(page);
    const before = await heroText(page);
    await page.click('button[aria-label="返済余力の内訳を見る"]');
    await page.waitForSelector('.sheet .wf .ln');
    await page.locator('.sheet .wf .ln:has-text("手取り収入")').first().click();
    await page.waitForTimeout(380);
    const sheet = page.locator('.sheet:not(.closing)').last();
    assert.equal(await sheet.locator('h2').textContent(), '収入');
    const inp = sheet.locator('.pane:not(.out) .field:has-text("手取り月収") input').first();
    const cur = Number(await inp.inputValue());
    await inp.fill(String(cur + 5));
    await inp.press('Enter');
    // シート下の予算プレビューが、その場で増えた額を表示する
    await page.waitForSelector('.sheet:not(.closing) .preview .diff.pos', { timeout: 15000 });
    // Esc は一番上のシートだけを閉じる
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.sheet:not(.closing) h2').last().textContent(), '計算の内訳');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    await settle(page);
    assert.notEqual(await heroText(page), before, '収入を増やすと予算が変わる');
    await ctx.close();
  });

  it('タブを素早く連打しても、最後に選んだ画面1枚だけが残る', async () => {
    const { ctx, page } = await open([390, 844]);
    for (const i of [2, 3, 4, 5, 1, 4, 2, 3]) await page.click(`nav button:nth-child(${i})`, { delay: 0 });
    await page.waitForTimeout(600);
    const panes = await page.$$eval('.main > .switcher > .pane', (els) => els.map((e) => e.dataset.pane));
    assert.deepEqual(panes, ['in']);
    assert.equal(await page.locator('nav button[aria-current="page"]').count(), 1);
    assert.equal(await page.locator('nav button:nth-child(3)').getAttribute('aria-current'), 'page');
    await ctx.close();
  });

  it('「視差効果を減らす」設定では横移動なしのフェードになる', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(srv.url);
    await page.waitForSelector('.hero .amount', { timeout: 20000 });
    await page.click('nav button:nth-child(2)');
    const tf = await page.$eval('.main .pane', (e) => getComputedStyle(e).transform);
    assert.ok(tf === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(tf), `transform: ${tf}`);
    await ctx.close();
  });
});

describe('エラー', () => {
  it('ブラウザのエラーが出ていない', () => {
    assert.deepEqual(errors, []);
  });
});
