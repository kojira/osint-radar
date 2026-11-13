# OSINT Radar / SIGNAL

公開情報を集め、日本語の概要・関連理由・新規性・実用性を見比べるための、設定可能な OSINT ダッシュボードです。

**これはソースコードの公開版です。運用中の Site・保存データ・個人用の検索設定・定期タスク・認証情報は含みません。既存 Site の公開や自動同期を行うものではありません。**

## 主な機能

- テーマと情報源を編集可能。GitHub の公開リポジトリと Hacker News を取得
- 収集設定・取得履歴・資料・日本語要約を Cloudflare D1 に保存
- 関連性、新規性、実用性、重要度、確認範囲、出典と判断根拠を表示
- 初期表示は「要約が新しい順」。重要度・新規性・総合点でも並べ替え
- 保存済み要約の検索、絞り込み、ページング、2〜3件の比較
- GitHub の公開プレビューを同一オリジン経由で表示。取得できない資料は代替アイコン
- モバイル対応。個人の手動メモ・保存ボードはブラウザのローカルストレージを使用

## できることと、別途必要なもの

アプリ自体にモデル実行・常駐スケジューラーはありません。日本語要約は、別途設定する認可済みのアシスタントや処理が実際の資料を確認して API に保存します。定期収集も外部の認可済みスケジューラーが必要です。リポジトリを複製しただけでは自動収集も要約も開始しません。現在の利用者の私的な資料や業務背景も含まれません。

収集は API の件数・期間・レート制限内のスナップショットです。GitHub は最終 push 日、Hacker News は投稿日であり、原記事の公開日や新規性を保証しません。新規性が未評価の資料は総合点を未採点にし、重要度とは分けて扱います。

## セキュリティ境界

**このアプリは単一オーナー用の非公開 Sites の認証・認可境界を前提とします。ルート内で独立したログインやテナント分離を実装していません。認証なしの公開 Worker としてデプロイしないでください。**

独立ホスティングに移す場合は、ページ、すべての読み取り/書き込み API、画像エンドポイントを含むオーナー認可と必要な CSRF 対策を先に実装・検証してください。単なる認証ヘッダーの存在チェックでは十分ではありません。複数ユーザーで同じ D1 を共有する設計ではありません。

公開リポジトリと、アプリやデータの公開設定は別です。個人のデプロイ識別子は `.openai/hosting.json` に置き、Git の追跡対象から除外しています。秘密値をソース、履歴、スクリーンショット、コミットメッセージに入れないでください。

## 技術構成

TypeScript / React / Vinext / Vite / Tailwind CSS、Cloudflare Workers / D1、Drizzle。依存バージョンは `package-lock.json` を参照してください。

## ローカル準備と検証

Node.js **24 以上を推奨**します（テストでは組み込み SQLite と TypeScript 読み込みを利用）。

```sh
npm ci
npm run configure:example
npm run typecheck
npm test
npm run build
```

`configure:example` は安全なプレースホルダーだけを含む設定を作成し、既存設定は上書きしません。開発は `npm run dev`。ローカル D1 に `drizzle/` のマイグレーションを適用する必要があります。**新規の空のローカル DB に一度だけ**、ビルド後に次を順番に実行します。

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_left_deathstrike.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_hard_rhino.sql
npm start
```

本番 DB や `--remote` は使いません。既存 DB への再実行ではなく、以降の変更にはマイグレーション管理を用意してください。保存データのサンプルは同梱していません。API テストは合成データだけを使うインメモリ SQLite で実行します。

Sites へ配置する場合は、自分の新しい非公開 Site と D1 を用意し、Sites の公式ワークフローに従って `.openai/hosting.json` のプレースホルダーを置き換えてください。既存運用の ID・認証・スケジュールは再利用しません。デプロイと公開範囲の変更はこのリポジトリから自動実行されません。

## API と運用

- [COLLECTION.md](COLLECTION.md): 収集、要約保存、重要度修正、個別取得、ページング、スケジュール連携
- [THUMBNAILS.md](THUMBNAILS.md): 画像の許可先、サイズ制限、キャッシュとプライバシー
- [SECURITY.md](SECURITY.md): 公開版に含めない情報と運用上の注意

## 公開版の範囲

元の履歴を引き継がないクリーンなスナップショットです。ソースと合成テストを含み、運用 DB、収集結果、要約本文、個人設定、内部の配備先 URL、アーカイブ、環境ファイル、元の Git 履歴は含みません。開発用スクリプトは汎用の portable 構成に整理しています。コードと設定例を公開用に確認していますが、第三者によるセキュリティ監査を済ませた製品という意味ではありません。

独自コード全体のライセンスは未指定です。依存パッケージと同梱された第三者コードには、それぞれのライセンスが適用されます。既存の `scripts/vite/sites-vite-plugin.LICENSE` と `vendor/shadcn-tailwind-4.13.0.LICENSE.md` を保持しています。
