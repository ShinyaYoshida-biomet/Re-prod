[English](README.md) | [日本語](README.ja.md)

---

# Re-prod

AI 駆動の R 分析 IDE — RStudio に代わる AI ネイティブな次世代統合開発環境

## ミッション

研究者やデータアナリストが、単なる分析のために R パッケージのドキュメントを何時間も読み込み、ツール間を行き来する必要はありません。Re-prod は **R や補助ツールを自然言語に変換** し、AI が複雑な部分を引き受けることで、ユーザーは洞察に集中できる未来を目指しています。

さらに Re-prod は、完全な実行履歴による **再現性の担保** と、継続的なコンテキストスイッチを排除する **エンドツーエンドのワークフロー** を提供します。

---

## アーキテクチャ

Re-prod は Rust、Tauri、React/TypeScript を組み合わせたマルチパッケージのワークスペースです。

### バックエンド

- `core/` は R 実行、タイムラインの管理、AI プロンプトのオーケストレーションなどのプラットフォーム非依存ロジックを提供します。
- `desktop/` は Tauri シェルに Rust コアを組み込んで、ネイティブメニューやコマンド、フロントエンドのバンドルを提供します。
- `server/` は Axum ベースの HTTP + WebSocket API を提供し、`pnpm dev` でブラウザ版を動かす際に使用されます。デスクトップビルドには含まれませんが、Web UI をデスクトップと足並みをそろえて維持するために管理されています。

### フロントエンド

- `client/` は Monaco ベースのエディタ、統合されたボトムペイン（コンソール・タイムライン・プロットなど）、AI アシスタントを描画する React + TypeScript + Vite アプリケーションです。すべての TypeScript 型は `client/src/types/` に配置され、プロトコル型は ts-rs により Rust から自動生成されます。
- `scripts/` はオンボーディング、デモ、開発者ワークフローを支援します。

## 前提条件

- **Rust** (最新の安定版) — [rustup.rs](https://rustup.rs/) からインストール
- **Node.js** 18 以上
- **pnpm** 9 以上 (`corepack enable pnpm` または `npm install -g pnpm`)
- **R** 4.0+ (`Rscript` が PATH に含まれていること)
- **Anthropic API キー** (任意、AI 機能用)

## インストール手順

### 1. Rust をインストール

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Tauri CLI をインストール

```bash
cargo install tauri-cli --version "^2.0"
```

### 3. JavaScript 依存をインストール (pnpm)

```bash
pnpm install
```

### 4. (任意) AI 設定

`~/.reprod/auth.json` を作成し、Anthropic API キーや R のパスを設定します。

```bash
mkdir -p ~/.reprod
cat > ~/.reprod/auth.json <<'EOF'
{
  "anthropic_api_key": "your-api-key-here",
  "r_path": "Rscript"
}
EOF
```

## アプリケーションの起動

### オプション 1: デスクトップアプリ (推奨)

```bash
cd desktop
cargo tauri dev
```

Tauri ウィンドウが起動し、フロントエンドとバックエンドが自動で立ち上がります。

### オプション 2: Web 版

```bash
pnpm dev
```

このスクリプトは Axum + WebSocket API（`reprod-server`）と Vite クライアントを同時に起動します:
- Axum サーバー: `http://localhost:3001`
- React クライアント: `http://localhost:5173`

両方のサービスが立ち上がったらブラウザで `http://localhost:5173` にアクセスしてください。

### オプション 3: フロントエンドのみ

```bash
pnpm --filter client dev
```

R バックエンドや Axum API を起動せずに Vite 開発サーバー（`http://localhost:5173`）だけを利用します。

## プロジェクト構成

```
Re-prod/
├── Cargo.toml                 # Rust ワークスペース（core + desktop + server）
├── core/                      # プラットフォーム非依存の Rust ビジネスロジック
├── desktop/                   # Tauri デスクトップアプリ
├── server/                    # Axum HTTP/WebSocket API
├── client/                    # React + TypeScript フロントエンド
│   └── src/types/             # TypeScript 型（ts-rs により Rust から自動生成）
├── scripts/                   # セットアップヘルパー＆git hook
├── AGENTS.md                  # AI エージェント開発ガイド
└── package.json               # pnpm ワークスペース設定 & スクリプト
```

## 利用方法

1. **Re-prod** をブラウザまたは Tauri デスクトップで開きます（`http://localhost:5173` を利用）。
2. 画面左上で Monaco エディタに R コードを書きます。
3. "▶ Run" ボタンやショートカットで選択コード/セルを実行します。
4. ボトムペインの Console タブで標準出力やエラーを確認します。
5. Timeline タブで実行履歴を辿り、再実行や状態確認をします。
6. Plots タブで描画結果を閲覧します。
7. 右側の AI アシスタントパネルで質問や補完を行います。

### レイアウト概要

- **左カラム**: 上部がエディタ、下部が Console/Timeline/Plots などを切り替えるボトムペインです。
- **ボトムペインタブ**: Console・Timeline・Plots・Drafts などのタブを切り替えて、作業ログやビジュアライゼーションを集約します。
- **右カラム**: AI アシスタントが全高で表示され、常にコードと並列で操作できます。
- **リサイズ**: スプリッターをドラッグしてカラムやペインのサイズを自由に変更できます。

### AI アシスタント

複数の AI プロバイダーと連携して、インテリジェントに R コードを支援します。

**対応プロバイダー:**
- **Anthropic Claude**（claude-sonnet-4-5）: R の知識に強い
- **OpenAI GPT**（gpt-4, gpt-4-turbo）: 汎用的なコード生成・デバッグ

**設定方法:**

1. **設定ファイル（推奨）**:
```bash
~/.reprod/auth.json
{
  "anthropic_api_key": "sk-ant-...",
  "openai_api_key": "sk-proj-...",
  "r_path": "Rscript"
}
```

2. **環境変数（補足）**:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-proj-..."
```

### キーボードショートカット

- `Cmd/Ctrl + Enter`: カーソル位置/セルを実行
- `Shift + Enter`: カーソル位置のセルを実行し、次のセルへ
- `Cmd/Ctrl + Shift + Enter`: すべてのコードを実行

## 開発ワークフロー

### TypeScript 型チェック

```bash
pnpm -r lint
```

### ビルド

```bash
pnpm -r build
```

### 一時ファイルの削除

一時的な R プロットやスクリプトは OS によりクリーンアップされますが、手動で削除も可能です。

```bash
rm -rf server/temp/*
```

## トラブルシューティング

### R が見つからない場合
- `Rscript` が PATH に含まれているか確認
- `~/.reprod/auth.json` の `r_path` を設定

### WebSocket 接続に失敗する場合
- バックエンドがポート 3001 で起動しているか確認
- 他のプロセスがポート 3001 を使用していないか (`lsof -i :3001`)
- フロントエンドが `ws://localhost:3001/ws` に接続しているか確認

### AI が応答しない場合
- `~/.reprod/auth.json` もしくは環境変数で API キーを設定
- サーバー / デスクトップのログを確認
- API の利用制限に達していないか確認

## 貢献

変更を提案する前に [CONTRIBUTING.md](./CONTRIBUTING.md) および日本語版 [CONTRIBUTING.ja.md](./CONTRIBUTING.ja.md) をご覧ください。

## ライセンス

MIT

## 謝辞

- RStudio の UI/UX にインスパイアされています
- React, Monaco Editor, Axum, Tauri などの OSS に感謝します
