# pr-shots

PR に貼るスクリーンショットを撮るための Claude Code スキルです。変更前・変更後・注釈つきの画像を、別々のファイルとして出力します。headless の Playwright を使うので、ブラウザのウィンドウは開きません。

## インストール

```sh
git clone https://github.com/kaigemap/claude-skill-pr-shots.git ~/.claude/skills/pr-shots
cd ~/.claude/skills/pr-shots && npm install && npx playwright install chromium-headless-shell
```

インストール済みの Chromium を使う場合は、環境変数 `PR_SHOTS_CHROMIUM` に実行ファイルのパスを指定してください。

## 使い方

変更前（base）と変更後（PR）のアプリを別々のポートで起動し、2 つの URL を指定します。出力先のデフォルトは `~/Downloads/<label>/` です。

```
node ~/.claude/skills/pr-shots/run.mjs plan.json --before http://localhost:6071 --after http://localhost:6061 --label 12-list-filter
node ~/.claude/skills/pr-shots/run.mjs plan.json --before ... --after ... --only detail   # 名前が一致する shot だけ撮影
node ~/.claude/skills/pr-shots/annotate-shot.mjs --url http://localhost:3000/list --out a.png --notes notes.json --full   # 1 枚だけ撮影
```

画面ごとに 3 枚の画像を出力し、ファイル名順に変更前 → 変更後 → 注釈つきの順で並びます。

- `01-<shot名>-before.png`
- `02-<shot名>-after.png`（枠なし）
- `03-<shot名>-annotated.png`（枠あり）

`beforeNotes` を指定した shot では、変更前に枠を描いた `02-<shot名>-before-annotated.png` が加わり、after と annotated は 03・04 になります。画像は 1 枚に結合しません。撮影の前に同じ画面の古い画像（`NN-<shot名>-*.png`）を削除するので、撮り直してもフォルダには最新の 1 セットだけが残ります。

## 撮影内容の JSON

`example-plan.json` を参照してください。

- `defaults` と各 shot に共通の項目: `width`、`height`、`scale`（デフォルト 2）、`full`（スクロールする領域が全部収まるまでウィンドウの高さを広げる）、`ready`（表示を待つセレクタ）、`hideCss`（撮影前に追加する CSS）、`preClick`（撮影前にクリックする要素のセレクタ）、`scrollTo`、`waitMs`、`keepFocus`
- shot ごとの項目: `name`、`path`（URL の origin の後ろに付けるパス）または `storybook`（story の ID。`/iframe.html?id=...` に変換されます）、`steps`、`hover`、`notes`、`beforeNotes`。変更後だけ別の画面を撮る場合は `afterPath` / `afterStorybook`
- デフォルトでは、要素を隠す・クリックする・表示を待つといった処理は何もしません（Storybook の場合だけ、story の描画を待ちます）

## steps

`click`（画面上のテキスト。`exact` のデフォルトは true）、`css`、`role` + `name`、`scroll`（テキスト、または `__bottom__`）、`fill: [placeholder, 値]`、`eval`（JS の式。結果をコンソールに出力）。どれにも `nth` と `wait`（ミリ秒）を指定できます。

## 枠の指定（notes）

どの指定も `n`（番号）が必須で、`pad`（デフォルト 4px）と `to` を追加で指定できます。

- `css`: セレクタ。表示されている要素のうち `nth` 番目（デフォルト 0）
- `text`: 画面上のテキスト（`exact` で完全一致）。表示されている要素だけを対象にします
- `box`: `[x, y, 幅, 高さ]`
- `column`: 表の見出しのテキスト。見出しから表の下端までを囲みます
- `row`: セルのテキスト。その行を囲みます
- `up`: `css` / `text` と一緒に指定し、一致した要素の n 階層上の親要素を囲みます
- `all`: `css` / `text` と一緒に指定し、一致した要素すべてを 1 つの枠で囲みます
- `to`: 別の指定（上のどれでも可）までを含めて 1 つの枠にします

## English

A Claude Code skill and headless Playwright script for PR screenshots: from one plan JSON it takes before, after and annotated (numbered red boxes) images of each changed screen as separate files. Install with `git clone https://github.com/kaigemap/claude-skill-pr-shots.git ~/.claude/skills/pr-shots`, then `npm install && npx playwright install chromium-headless-shell` in that folder. The skill text is in Japanese.

## License

MIT
