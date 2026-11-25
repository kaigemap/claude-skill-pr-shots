# pr-shots（PR 用の画面写真）

Claude Code 用のスキル。PR に貼る画面写真を、変更前・変更後・注釈つきの画像を別々のファイルで撮る道具です。headless の playwright だけを使い、ブラウザの窓は開きません。

## 入れ方

```sh
git clone https://github.com/kaigemap/claude-skill-pr-shots.git ~/.claude/skills/pr-shots
cd ~/.claude/skills/pr-shots && npm install && npx playwright install chromium-headless-shell
```

手元の chromium を使うときは、環境変数 `PR_SHOTS_CHROMIUM` に実行ファイルのパスを渡します。

## 使い方

変更前（base）と変更後（PR）を別のポートで立て、URL を 2 つ渡します。出力先の既定は `~/Downloads/<label>/` です。

```
node ~/.claude/skills/pr-shots/run.mjs plan.json --before http://localhost:6071 --after http://localhost:6061 --label 12-list-filter
node ~/.claude/skills/pr-shots/run.mjs plan.json --before ... --after ... --only detail   # 名前に一致する shot だけ
node ~/.claude/skills/pr-shots/annotate-shot.mjs --url http://localhost:3000/list --out a.png --notes notes.json --full   # 1 枚だけ
```

出力は `<out>/` に画面ごと 3 枚で、名前順に 変更前 → 変更後 → 注釈つき と並びます。`01-<shot名>-before.png`、`02-<shot名>-after.png`（枠なし）、`03-<shot名>-annotated.png`（枠つき）。`beforeNotes` を書いた shot は、変更前の注釈つき `02-<shot名>-before-annotated.png` が入り、after と annotated は 03・04 になります。画像を 1 枚に結合はしません。撮る前に、同じ画面の古い画像（`NN-<shot名>-*.png`）を消すので、撮り直してもフォルダには最新の 1 セットだけが残ります。

## 計画ファイル

`example-plan.json` を参照してください。

- `defaults` と各 shot の共通項目: `width`、`height`、`scale`（既定 2）、`full`（はみ出しが収まるまで窓を伸ばす）、`ready`（待つセレクタ）、`hideCss`（撮る前に足す CSS）、`preClick`（撮る前に押す要素のセレクタ）、`scrollTo`、`waitMs`、`keepFocus`
- shot ごと: `name`、`path`（URL の origin に続けるパス）または `storybook`（story id。`/iframe.html?id=...` に変換）、`steps`、`hover`、`notes`、`beforeNotes`、変更後だけ別の画面のときは `afterPath` / `afterStorybook`
- 既定では何も隠さず、何も押さず、何も待ちません（storybook は story の描画を待ちます）

## steps

`click`（画面の文字、`exact` 既定 true）、`css`、`role` + `name`、`scroll`（文字、または `__bottom__`）、`fill: [placeholder, 値]`、`eval`（JS 式。結果を出力）。いずれも `nth` と `wait`（ms）を付けられます。

## 枠の指定（notes）

どれも `n`（番号）が必須で、`pad`（既定 4px）と `to` を付けられます。

- `css`: セレクタ。見えている要素のうち `nth` 番目（既定 0）
- `text`: 画面の文字（`exact` で完全一致）。見えている要素だけ数えます
- `box`: `[x, y, 幅, 高さ]`
- `column`: 表の見出し文字。見出しから表の下端までを囲みます
- `row`: セルの文字。その行を囲みます
- `up`: `css` / `text` に付け、当たった要素の n 段上の親を囲みます
- `all`: `css` / `text` に付け、当たった要素すべてを 1 つの枠で囲みます
- `to`: 別の指定（上のどれでもよい）までを含めて 1 つの枠にします

## English

A Claude Code skill and headless Playwright script for PR screenshots: from one plan JSON it takes before, after and annotated (numbered red boxes) images of each changed screen as separate files. Install with `git clone https://github.com/kaigemap/claude-skill-pr-shots.git ~/.claude/skills/pr-shots`, then `npm install && npx playwright install chromium-headless-shell` in that folder. The skill text is in Japanese.

## License

MIT
