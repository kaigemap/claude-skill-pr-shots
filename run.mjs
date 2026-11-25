// 計画 1 つから、変更前・変更後・注釈つきを撮り、別々の画像ファイルとして出す。
// ファイル名は名前順で 変更前 → 変更後 → 注釈つき になる: 01-<名前>-before.png、02-<名前>-after.png、03-<名前>-annotated.png
// beforeNotes があるときは変更前の注釈つき（02-<名前>-before-annotated.png）が入り、後ろの番号が 1 つずつ下がる。
// 使い方: node run.mjs <plan.json> --before <変更前のURL> --after <変更後のURL> [--label <略称-番号>] [--out <dir>] [--only <名前の一部>...]
// 出力先の既定は ~/Downloads/<label>/ 。label を省くと plan の name を使う。
// 撮る前に、同じ画面の古い画像を消す。撮り直しても最新の 1 セットだけが残る。
import { shoot, launch, storybookUrl } from './annotate-shot.mjs';
import { readFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const a = process.argv.slice(2);
const planFile = a.shift();
const opt = { only: [] };
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--before') opt.before = a[++i];
  else if (a[i] === '--after') opt.after = a[++i];
  else if (a[i] === '--label') opt.label = a[++i];
  else if (a[i] === '--out') opt.out = a[++i];
  else if (a[i] === '--only') { while (a[i + 1] && !a[i + 1].startsWith('--')) opt.only.push(a[++i]); }
  else { console.error('不明な引数', a[i]); process.exit(2); }
}
if (!planFile || !opt.before || !opt.after) { console.error('使い方: node run.mjs <plan.json> --before <URL> --after <URL> [--label X-1] [--out dir] [--only 名前...]'); process.exit(2); }
const plan = JSON.parse(readFileSync(planFile, 'utf8'));
const label = opt.label ?? plan.name ?? 'pr-shots';
const outDir = resolve((opt.out ?? join(homedir(), 'Downloads', label)).replace(/^~/, homedir()));
mkdirSync(outDir, { recursive: true });
const D = plan.defaults ?? {};

function urlFor(origin, shot) {
  if (shot.storybook) return storybookUrl(origin, shot.storybook);
  return origin.replace(/\/$/, '') + (shot.path ?? '');
}
const merged = (shot, k) => shot[k] ?? D[k];
const opts = (shot, origin, out, notes) => ({
  url: urlFor(origin, shot), out, notes,
  width: merged(shot, 'width'), height: merged(shot, 'height'), scale: merged(shot, 'scale'),
  full: merged(shot, 'full'),
  ready: merged(shot, 'ready') ?? (shot.storybook ? '#storybook-root > *, #root > *' : undefined),
  waitMs: merged(shot, 'waitMs'), hideCss: merged(shot, 'hideCss'), preClick: merged(shot, 'preClick'),
  scrollTo: merged(shot, 'scrollTo'), keepFocus: merged(shot, 'keepFocus'), browser,
});

const browser = await launch();
for (const shot of plan.shots) {
  if (opt.only.length && !opt.only.some(s => shot.name.includes(s))) continue;
  const steps = shot.steps ? [{ steps: shot.steps }] : [];
  const hover = shot.hover ? [{ hover: shot.hover }] : [];
  const base = [...steps, ...hover];
  const notes = shot.notes ?? [];
  const beforeNotes = shot.beforeNotes ?? [];
  // 画面ごとに、出す画像へ 01 から連番を振る
  const old = new RegExp(`^\\d{2}-${shot.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(before|before-annotated|after|annotated)\\.png$`);
  for (const f of readdirSync(outDir)) if (old.test(f)) rmSync(join(outDir, f));
  let seq = 0;
  const f = k => join(outDir, `${String(++seq).padStart(2, '0')}-${shot.name}-${k}.png`);
  // 変更後が別の story のときは afterStorybook / afterPath で上書きする
  const afterShot = { ...shot, storybook: shot.afterStorybook ?? shot.storybook, path: shot.afterPath ?? shot.path };
  await shoot(opts(shot, opt.before, f('before'), base));
  if (beforeNotes.length) await shoot(opts(shot, opt.before, f('before-annotated'), [...base, ...beforeNotes]));
  await shoot(opts(afterShot, opt.after, f('after'), base));
  await shoot(opts(afterShot, opt.after, f('annotated'), [...base, ...notes]));
}
await browser.close();
