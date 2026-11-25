// 1 画面を headless で撮影する。notes で指定した要素を番号付きの赤い枠で囲む。
// CLI:
//   node annotate-shot.mjs --url <URL> --out <out.png> [--notes notes.json] [--ready <selector>] ...
//   node annotate-shot.mjs --storybook <port> <story-id> --out <out.png> [--notes notes.json]
// オプション: --width --height --scale(デフォルト 2) --full --ready <selector> --wait-ms <ms>
//   --hide-css <css> --pre-click <selector>(複数可) --scroll-to <文字|__bottom__> --keep-focus
// notes.json は [{ "steps": [...] }, { "hover": "セレクタ" }, { "n": 1, "css": "..." }, ...] の配列（枠の指定は README）。
// 環境変数 PR_SHOTS_CHROMIUM に Chromium の実行ファイルのパスを指定すると、Playwright 標準のブラウザの代わりにそれを起動する。
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function launch() {
  const executablePath = process.env.PR_SHOTS_CHROMIUM || undefined;
  return chromium.launch({ args: ['--lang=ja-JP'], executablePath });
}

// opts: { url, out, notes, width, height, scale, full, ready, waitMs, hideCss, preClick[], scrollTo, keepFocus, browser }
export async function shoot(opts) {
  const raw = opts.notes ?? [];
  const steps = raw.find(r => r.steps)?.steps ?? [];
  const hover = raw.find(r => r.hover)?.hover;
  const notes = raw.filter(r => r.n);
  const W = opts.width ?? 1512, H = opts.height ?? 822;
  const ownBrowser = !opts.browser;
  const browser = opts.browser ?? await launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, locale: 'ja-JP', deviceScaleFactor: opts.scale ?? 2 });
  try {
    let lastErr;
    for (let i = 0; i < (opts.retries ?? 30); i++) {
      try { await page.goto(opts.url, { timeout: 5000 }); lastErr = null; break; } catch (e) { lastErr = e; await page.waitForTimeout(2000); }
    }
    if (lastErr) throw lastErr;
    if (opts.ready) await page.locator(opts.ready).first().waitFor({ timeout: 120000 });
    if (opts.hideCss) await page.addStyleTag({ content: opts.hideCss });
    await page.waitForTimeout(opts.waitMs ?? 1200);
    // 撮影前にクリックする要素（サイドバーの折りたたみなど）。オーバーレイが重なっていてもクリックできるよう、要素の click() を直接呼ぶ
    for (const sel of opts.preClick ?? []) {
      const el = page.locator(sel);
      if (await el.count()) { await el.first().evaluate(e => e.click()); await page.waitForTimeout(500); }
    }
    for (const s of steps) {
      if (s.click) await page.getByText(s.click, { exact: s.exact ?? true }).nth(s.nth ?? 0).click();
      if (s.css) await page.locator(s.css).nth(s.nth ?? 0).click();
      if (s.role) await page.getByRole(s.role, { name: s.name, exact: s.exact ?? true }).nth(s.nth ?? 0).click();
      if (s.scroll === '__bottom__') await scrollBottom(page);
      else if (s.scroll) await page.getByText(s.scroll, { exact: false }).first().scrollIntoViewIfNeeded();
      if (s.fill) await page.getByPlaceholder(s.fill[0]).first().fill(s.fill[1]);
      if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval', JSON.stringify(r)); }
      await page.waitForTimeout(s.wait ?? 600);
    }
    if (opts.scrollTo === '__bottom__') { await scrollBottom(page); await page.waitForTimeout(500); }
    else if (opts.scrollTo) {
      await page.getByText(opts.scrollTo, { exact: false }).first().evaluate(el => { const m = el.closest('main'); if (m) m.scrollTop += el.getBoundingClientRect().top - 120; });
      await page.waitForTimeout(500);
    }
    if (opts.full) {
      // 縦スクロールする要素のうち、はみ出しが最も大きいものが全部収まる高さまでビューポートを広げる
      const h = await page.evaluate(() => {
        let best = null, over = 0;
        for (const el of document.querySelectorAll('main, div')) {
          const st = getComputedStyle(el).overflowY;
          if ((st === 'auto' || st === 'scroll') && el.scrollHeight - el.clientHeight > over) { over = el.scrollHeight - el.clientHeight; best = el; }
        }
        if (!best) return document.documentElement.scrollHeight;
        best.scrollTop = 0;
        return window.innerHeight + over + 2;
      });
      await page.setViewportSize({ width: W, height: Math.max(H, Math.ceil(h)) });
      await page.waitForTimeout(500);
    }
    await page.mouse.move(W - 4, 4);
    // hover で表示されるもの（ツールチップなど）も枠で囲めるよう、枠の位置を計算する前に hover する
    if (hover) { await page.locator(hover).first().hover(); await page.waitForTimeout(800); }
    if (!opts.keepFocus) await page.evaluate(() => document.activeElement?.blur());
    const boxes = [];
    for (const n of notes) {
      const rect = await rectOf(page, n);
      if (!rect) { console.log('NOT FOUND', JSON.stringify(n)); continue; }
      boxes.push({ n: n.n, ...rect, pad: n.pad ?? 4 });
    }
    if (boxes.length) await drawBoxes(page, boxes);
    await page.waitForTimeout(250);
    await page.screenshot({ path: opts.out });
    console.log(opts.out, 'boxes', boxes.map(b => b.n).join(','));
    return { boxes: boxes.length, missing: notes.length - boxes.length };
  } finally {
    await page.close();
    if (ownBrowser) await browser.close();
  }
}

async function scrollBottom(page) {
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => { if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = el.scrollHeight; });
    window.scrollTo(0, document.body.scrollHeight);
  });
}

function union(a, b) {
  if (!a) return b;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// 1 つの指定から枠の矩形を計算する。to がある場合は、その指定の矩形までを含めて 1 つの枠にする
async function rectOf(page, n) {
  let rect = null;
  if (n.box) rect = { x: n.box[0], y: n.box[1], w: n.box[2], h: n.box[3] };
  else if (n.column) {
    // 見出しのテキストで表の列を探し、見出しから表の下端までを囲む
    rect = await page.evaluate(([t, k]) => {
      const ths = [...document.querySelectorAll('th')].filter(th => th.textContent.trim() === t && th.getBoundingClientRect().width > 0);
      const th = ths[k ?? 0]; if (!th) return null;
      const a = th.getBoundingClientRect(), b = th.closest('table').getBoundingClientRect();
      return { x: a.x, y: a.y, w: a.width, h: b.bottom - a.y };
    }, [n.column, n.nth]);
  } else if (n.row) {
    rect = await page.evaluate(([t, k]) => {
      const tds = [...document.querySelectorAll('td')].filter(td => td.textContent.includes(t) && td.getBoundingClientRect().width > 0);
      const tr = tds[k ?? 0]?.closest('tr'); if (!tr) return null;
      const a = tr.getBoundingClientRect(); return { x: a.x, y: a.y, w: a.width, h: a.height };
    }, [n.row, n.nth]);
  } else if (n.css || n.text) {
    // all: 一致した要素すべてを 1 つの枠で囲む。up: 一致した要素の n 階層上の親要素を囲む
    // 非表示の要素は数えず、表示されている要素の中で nth 番目を使う
    const base = n.css ? page.locator(n.css) : page.getByText(n.text, { exact: n.exact ?? false });
    const visible = [];
    for (const l of await base.all()) { const bb = await l.boundingBox().catch(() => null); if (bb && bb.width > 0) visible.push(l); }
    const locs = n.all ? visible : visible.slice(n.nth ?? 0, (n.nth ?? 0) + 1);
    for (const loc of locs) {
      const b = n.up
        ? await loc.evaluate((el, up) => { let e = el; for (let i = 0; i < up; i++) e = e.parentElement; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, n.up).catch(() => null)
        : await loc.boundingBox().catch(() => null);
      if (!b || b.width === 0) continue;
      rect = union(rect, { x: b.x, y: b.y, w: b.width, h: b.height });
    }
  }
  if (rect && n.to) { const r2 = await rectOf(page, n.to); if (r2) rect = union(rect, r2); }
  return rect;
}

async function drawBoxes(page, boxes) {
  await page.evaluate(list => {
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    for (const b of list) {
      const f = document.createElement('div');
      f.style.cssText = `position:fixed;left:${b.x - b.pad}px;top:${b.y - b.pad}px;width:${b.w + b.pad * 2}px;height:${b.h + b.pad * 2}px;border:2.5px solid #e11d48;border-radius:6px;box-sizing:border-box`;
      const t = document.createElement('div');
      t.textContent = String(b.n);
      const tx = Math.max(2, b.x - b.pad - 11), ty = Math.max(2, b.y - b.pad - 11);
      t.style.cssText = `position:fixed;left:${tx}px;top:${ty}px;min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:#e11d48;color:#fff;font:700 13px/22px -apple-system,'Hiragino Sans',sans-serif;text-align:center;box-sizing:border-box`;
      layer.append(f, t);
    }
    document.body.append(layer);
  }, boxes);
}

export function storybookUrl(origin, id) {
  return `${origin.replace(/\/$/, '')}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`;
}

// ---- CLI ----
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const o = { preClick: [] };
  let notesFile;
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--url') o.url = a[++i];
    else if (k === '--storybook') { o.url = storybookUrl(`http://localhost:${a[++i]}`, a[++i]); o.ready ??= '#storybook-root > *, #root > *'; }
    else if (k === '--out') o.out = a[++i];
    else if (k === '--notes') notesFile = a[++i];
    else if (k === '--ready') o.ready = a[++i];
    else if (k === '--width') o.width = Number(a[++i]);
    else if (k === '--height') o.height = Number(a[++i]);
    else if (k === '--scale') o.scale = Number(a[++i]);
    else if (k === '--wait-ms') o.waitMs = Number(a[++i]);
    else if (k === '--hide-css') o.hideCss = a[++i];
    else if (k === '--pre-click') o.preClick.push(a[++i]);
    else if (k === '--scroll-to') o.scrollTo = a[++i];
    else if (k === '--full') o.full = true;
    else if (k === '--keep-focus') o.keepFocus = true;
    else { console.error('不明な引数', k); process.exit(2); }
  }
  if (!o.url || !o.out) { console.error('--url（または --storybook <port> <id>）と --out を指定してください'); process.exit(2); }
  if (notesFile) o.notes = JSON.parse(readFileSync(notesFile, 'utf8'));
  await shoot(o);
}
