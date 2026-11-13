# OSINT Radar / SIGNAL

興味のある技術テーマの公開情報を集め、日本語の要約・関連性・新規性・実用性を見比べる OSINT ダッシュボードです。

## 主な機能

- **テーマ別の収集**: 検索語を設定し、GitHub の公開リポジトリと Hacker News を取得
- **日本語ブリーフィング**: 要約、関連理由、重要度、評価の根拠、出典を一覧表示
- **検索・比較**: 保存済み要約の検索、絞り込み、ページング、2〜3件の比較
- **並べ替え**: 要約の更新日時、重要度、新規性、総合点で並べ替え。初期表示は要約が新しい順
- **サムネイル**: GitHub の公開プレビューを表示。取得できない資料は代替アイコン
- **モバイル対応**: スマートフォンでも一覧と詳細を閲覧可能

収集設定・取得履歴・資料・要約は Cloudflare D1 に保存します。手動メモと保存ボードはブラウザのローカルストレージを使います。

## 仕組み

1. 設定した検索語で公開 API から資料を収集します。
2. 外部のアシスタントや処理が原文を確認し、日本語要約と評価を API に保存します。
3. ダッシュボードで要約・根拠・出典を確認し、読む資料を選びます。

定期収集は外部スケジューラーから API を呼び出して実行します。要約生成は、別途用意するアシスタントや処理で行います。連携方法は [COLLECTION.md](COLLECTION.md) を参照してください。

取得件数や期間は各 API の制限に従います。GitHub の日付は最終 push 日、Hacker News は投稿日です。新規性の判断とは区別し、新規性を評価できない資料の総合点は未採点として表示します。

## 技術構成

TypeScript / React / Vinext / Vite / Tailwind CSS / Cloudflare Workers / D1 / Drizzle

## ローカルで動かす

Node.js **[26.13.1 LTS](https://nodejs.org/en/blog/release/v26.13.1)** を `mise.toml` で固定しています。[mise](https://mise.jdx.dev/getting-started.html) を導入し、このリポジトリ内で次を実行してください。

```sh
mise install
mise exec -- npm ci
mise exec -- npm run configure:example
mise exec -- npm run build
```

以下のコマンドも、mise をシェルで有効にするか、`mise exec --` を前置して実行してください。CI も同じ `mise.toml` の Node.js を使用します。

`configure:example` は `.openai/hosting.example.json` からローカル設定を作成します。既存の設定は上書きしません。

**新規の空のローカル DB に一度だけ**、次のマイグレーションを順番に適用します。

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_left_deathstrike.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_hard_rhino.sql
npm start
```

開発時は `npm run dev` を使います。上記の DB 操作はローカル限定です。既存 DB には再実行せず、以降の変更はマイグレーションで管理してください。

### 検証

```sh
npm run typecheck
npm test
```

API テストはインメモリ SQLite とテスト用データで実行します。

## デプロイとアクセス制御

このアプリは、**単一オーナー用の非公開 ChatGPT Sites** で動かす構成です。非公開 Site と D1 を用意し、`.openai/hosting.json` のプレースホルダーを自分の設定に置き換えて、Sites の公式手順でデプロイしてください。

アプリ内に独立したログイン機能やユーザー別のデータ分離はありません。別の環境でホストする場合は、すべてのページ・API に認証とオーナー認可を実装し、CSRF 対策を含めて検証してください。**認証なしの公開 Worker としてデプロイしないでください。**

`.openai/hosting.json` にデプロイ先の設定を保存します。このファイルと環境ファイルは Git の追跡対象外です。

## 詳細資料

- [COLLECTION.md](COLLECTION.md): 収集、要約保存、評価、ページング、スケジュール連携
- [THUMBNAILS.md](THUMBNAILS.md): 画像取得、キャッシュ、プライバシー
- [SECURITY.md](SECURITY.md): セキュリティと運用上の注意

## ライセンス

プロジェクト全体のライセンスは未指定です。依存パッケージと同梱の第三者コードには、それぞれのライセンスが適用されます。

- [Sites Vite plugin](scripts/vite/sites-vite-plugin.LICENSE)
- [shadcn CSS](vendor/shadcn-tailwind-4.13.0.LICENSE.md)
