# Re-prod

---

<p align="center">
[English](README.md) | [日本語](README.ja.md)
</p>

AI 駆動の R 分析 IDE — RStudio に代わる AI ネイティブな次世代統合開発環境

![image](https://private-user-images.githubusercontent.com/33049408/530954930-95408ef3-14a7-4dec-9cf2-f77598166418.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NjcwOTI0NDgsIm5iZiI6MTc2NzA5MjE0OCwicGF0aCI6Ii8zMzA0OTQwOC81MzA5NTQ5MzAtOTU0MDhlZjMtMTRhNy00ZGVjLTljZjItZjc3NTk4MTY2NDE4LnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTEyMzAlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUxMjMwVDEwNTU0OFomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWE5NjI5NDRjOTljMzliN2FkZDRjZTdkZmQ5ZmRkNGRkN2JlYWM5NDE5NDE5ODc1MzFmMzBjOTY0NTk1MWUxNDgmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.JEjhasFCUhM05dKKykFK9c1TXrpXEU-ENlDCvSxO31g)

## ミッション

R は強力ですが、再現性が崩れやすく、環境がドリフトし、研究者は科学的なアイデアに集中する代わりにツールの修正に時間を費やすことになります。この非効率性は、生物学者、統計学者、データサイエンティストを問わず、科学コミュニティにとって大きな機会損失を意味します。

Re-prod は **R や補助ツールを自然言語に変換** し、AI が複雑な部分を処理することで、ユーザーは洞察に集中できるようにします。

さらに、従来の IDE とは異なり、Re-prod は完全な実行履歴を通じて **再現性を保証** します。私たちは、R 分析がすべての人にとってアクセス可能で、再現可能で、効率的な未来を築いています。

---

## アーキテクチャ

Re-prod は Rust、Tauri、React/TypeScript を組み合わせたマルチパッケージのワークスペースです。

### バックエンド

- `core/` は R 実行、タイムラインの管理、AI プロンプトのオーケストレーションなどのプラットフォーム非依存ロジックを提供します。
- `desktop/` は Tauri シェルに Rust コアを組み込んで、ネイティブメニューやコマンド、フロントエンドのバンドルを提供します。
- `server/` は Axum ベースの HTTP + WebSocket API を提供し、`pnpm dev` でブラウザ版を動かす際に使用されます。デスクトップビルドには含まれませんが、Web UI をデスクトップと足並みをそろえて維持するために管理されています。

### フロントエンド

- `client/` は Monaco ベースのエディタやその他のペインを描画する React + TypeScript + Vite アプリケーションです。すべての TypeScript 型は `client/src/types/` に配置され、プロトコル型は ts-rs により Rust から自動生成されます。

## 前提条件

- **Rust** (最新の安定版) — [rustup.rs](https://rustup.rs/) からインストール
- **Node.js** 18 以上
- **pnpm** 9 以上 (`corepack enable pnpm` または `npm install -g pnpm`)
- **R** 4.0+ (`Rscript` が PATH に含まれていること)
- **AI API キー** (任意、AI 機能用) - Anthropic または OpenAI
- **書き込み可能なワークスペース**: プロジェクトルートは `.reprod/` にタイムライン/プロット成果物を保存できるよう書き込み可能である必要があります。また、OS の一時ディレクトリ（例: `/tmp/reprod`）も実行時のスクラッチファイル用に書き込み可能である必要があります。

### mise による簡単セットアップ（推奨）

最も簡単なセットアップ方法として、[mise](https://mise.jdx.dev/) を使用して Rust、Node.js、pnpm のバージョンを自動管理することをお勧めします：

```bash
# mise をインストール (macOS/Linux)
curl https://mise.run | sh

# または Homebrew 経由
brew install mise

# プロジェクトディレクトリに移動
cd re-prod

# 必要なツールを自動インストール
mise install
```

プロジェクトルートの `.mise.toml` ファイルにより、すべての貢献者が一貫したランタイムバージョンを使用でき、環境関連の問題を減らすことができます。

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

### 4. アプリケーションの設定（任意）

AI 機能を使用するには `~/.reprod/auth.json` を作成します：

```bash
mkdir -p ~/.reprod
cat > ~/.reprod/auth.json <<'EOF'
{
  "anthropic_api_key": "sk-ant-...",
  "openai_api_key": "sk-proj-...",
  "r_path": "Rscript"
}
EOF
```

どちらか一方または両方の AI プロバイダーを設定できます。AI 機能を使用するには、少なくとも 1 つの API キーが必要です。

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
