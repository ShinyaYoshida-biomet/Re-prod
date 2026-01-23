# Re-prod への貢献

Re-prod に興味を持っていただきありがとうございます。コミュニティからの貢献を歓迎します。

**AI エージェント向け**: AI コーディングエージェントの場合、追加のコーディング原則とガイドラインについては [AGENTS.md](./AGENTS.md) もお読みください。

## はじめる前に

1. **[README.md](./README.md) を読み**、プロジェクトのビジョンと目標を理解する
2. **ビジョンに賛同する** - Re-prod は、タイムライン追跡と AI アシストを備えた再現可能な R データ分析環境を目指しています
3. この方向性に賛同できれば、貢献を始めましょう

## 取り組めること

### Issue から取り組む

**[GitHub Issues](https://github.com/ShinyaYoshida-biomet/Re-prod/issues) にある課題であれば自由に取り組めます。**

- 興味がある Issue を選ぶ
- 自分が取り組む旨をコメントで共有
- リポジトリを fork し、ブランチを切って開発を進める。現在のデフォルトブランチは `main` ではなく `develop` です。

### 事前に相談すべきこと

**Issue として登録されていないアイデアや変更を加える場合:**

- Discussion または Issue を立てる
- [@ShinyaYoshida-biomet](https://github.com/ShinyaYoshida-biomet) をメンションしてフィードバックを得る
- 承認を得てから作業を開始
- 重複した作業を避け、プロジェクトの一貫性を保つためです

## プロジェクト構成

コードベースをナビゲートするために、プロジェクト構成を理解しておきましょう:

- **ルートの Rust ワークスペース**:
  - `core/` - ビジネスロジックと R オーケストレーション
  - `server/` - Web ビルド用の Axum API
  - `desktop/` - デスクトップアプリケーション用の Tauri シェル
  - `shared/` - 共有 TypeScript メタデータ
- **フロントエンド**: `client/` (React + Vite)
  - ユニット/UI テストはコンポーネントと並置
  - Vitest 設定はパッケージ内にあります
- **テスト**:
  - Rust 統合テスト: `core/tests/`
  - デスクトップ E2E テスト: `desktop/e2e/`
- **ドキュメント**: `docs/` ディレクトリ
- **スクリプトとフック**: `.husky/` および `scripts/` ディレクトリ

## 開発ワークフロー

### 1. セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/ShinyaYoshida-biomet/Re-prod.git
cd Re-prod

# 依存関係をインストール
# Husky による Git フックは自動的にセットアップされます
pnpm install
```

**必要な環境**:
- Node 18+ (`corepack` を有効にするか pnpm 9+ をインストール)
- 最新の Rust ツールチェーン

### 2. ブランチを作成

```bash
git checkout -b feature/your-feature-name
# または
git checkout -b fix/issue-number-description
```

`test-XX` や `issue-YYY` のようなブランチ名は認められません。

### 3. 開発コマンド

開発ニーズに応じて適切なコマンドを選択してください:

```bash
# ブラウザ用に Axum バックエンド + Vite クライアントを実行 (http://localhost:5173)
pnpm dev

# バンドルされたバックエンド/フロントエンドでデスクトップアプリを起動
cd desktop && cargo tauri dev

# フロントエンドのみ (Rust バックエンドなし)
pnpm --filter client dev

# プロダクションビルド
pnpm build                      # 全パッケージ
pnpm --filter client build      # クライアントのみ
```

### 4. 変更を加える

- 読みやすいコードを書く
- 既存のコードスタイルとパターンに従う (下記の[コードスタイル](#コードスタイル)を参照)
- 複雑なロジックにのみコメントを追加 (自己文書化コードを優先)

### 5. テストを書く

**ユニットテストと CI/CD を通過させてからマージします。**

```bash
# Rust ユニット/統合テストスイート
cargo test                      # 全テスト
cargo test -p reprod-core       # 特定パッケージ

# フロントエンドテスト
pnpm --filter client test
```

### 6. ローカルでチェックを実行

コミット前にこれらのチェックを実行して、早期に問題を発見します:

```bash
# TypeScript lint/format チェック
pnpm -r lint
pnpm biome:check

# フォーマット適用
pnpm format

# Rust フォーマット
cargo fmt --check
cargo fmt              # フォーマット適用

# Rust lint
cargo clippy

# ビルドチェック
pnpm --filter client run build
cargo build
```

### 7. コミット

```bash
git add <specific-files>  # -A や . は絶対に使用しない
git commit -m "feat: 機能 X を追加"
```

**コミットメッセージガイドライン:**

- **形式**: `<type>: <短い概要>` (現在形、動詞から開始)
- **長さ**: 概要は約 72 文字以内に収める
- **タイプ**:
  - `feat:` 新機能
  - `fix:` バグ修正
  - `docs:` ドキュメント
  - `test:` テスト関連
  - `refactor:` リファクタ
- **例**:
  - "Add model selection constants"
  - "Fix timeline export edge case"
  - "Refactor buffer state management"
- **スコーププレフィックス**: 明確さが増す場合のみ含める

**重要**: 論理的な作業単位を完了したら、頻繁にコミットしてください。

### 8. Push と PR

```bash
git push origin feature/your-feature-name
```

その後、`.github` ディレクトリにある PR テンプレートに従って GitHub でプルリクエストを作成します。

## プルリクエスト要件

PR がマージされる前に、以下を確認してください:

1. **すべてのユニットテストが通過** (Rust と TypeScript の両方)
2. **CI/CD パイプラインが成功** (pre-push フックを含む)
3. **コードがプロジェクト規約に従っている** ([コードスタイル](#コードスタイル)を参照)
4. **既存の Issue に対応している** (または Discussion で事前承認済み)
5. **新機能/修正にテストカバレッジが含まれている**
6. **ドキュメントが更新されている** (該当する場合)

**プルリクエストに含めるべき内容:**
- 変更の簡潔な要約
- リンクされた Issue/ID (`Fixes #123`)
- 動作変更の前後の注記
- UI 変更のスクリーンショットまたはクリップ
- 実行したテストコマンドのリスト (cargo tests, Vitest, lint/format)

すべてのチェックが通過し、TODO がクリアされてからレビューをリクエストしてください。

## コードスタイル

### TypeScript/React

- **Strict モード**: TypeScript strict モードを有効化、明示的な戻り値の型を使用
- **インデント**: 2 スペース
- **コンポーネント**: React コンポーネントは PascalCase
- **関数/フック**: フックとユーティリティは camelCase
- **環境変数**: SCREAMING_SNAKE_CASE
- **インポート整理**: 外部 → 共有 → ローカルの順にグループ化
- **コンポーネントスタイル**: フック付き関数コンポーネントを優先
- **副作用**: 副作用にはカスタムフックを抽出
- **型**: `any` を避け、適切な TypeScript 型を使用
- **フォーマット**: TS には Biome を使用 (`pnpm format`)

### Rust

- **エラーハンドリング**: `anyhow::Result` + `?` 演算子を優先
- **パニック回避**: `unwrap()`/`expect()` を使用しない (clippy で拒否される)
- **モジュールサイズ**: モジュールを小さく集中的に保つ
- **フォーマット**: コミット前に `cargo fmt` を使用
- **Lint**: すべての `cargo clippy` 警告に対処
- **イディオマティック**: コミュニティ標準に従ったイディオマティックな Rust を書く
- **ドキュメント**: パブリック API にドキュメントコメントを追加

### 一般

- **自己文書化コード**: コメントよりも明確な名前を優先
- **コメント**: 自明でない複雑なロジックにのみ追加
- **一貫性**: コードベース内の既存パターンに従う

## テストガイドライン

### Rust テスト

- **場所**: 統合テストスイートは `core/tests/` に配置
- **目的**: タイムライン/エクスポート/ワークフロー動作を検証
- **整理**: 関連モジュールの近くに新しいケースを追加
- **安定性**: 決定論的な ID とロギングを使用してテストを安定させる
- **ユニットテスト**: `#[cfg(test)]` モジュールまたは別の `*_test.rs` ファイルを使用

### フロントエンドテスト

- **フレームワーク**: Vitest + Testing Library
- **コマンド**: `pnpm --filter client test`
- **場所**: テスト対象のコンポーネントまたはユーティリティと `*.test.ts(x)` を並置
- **カバレッジ**: 新しいユーティリティ/フックと回帰をカバーすることを目指す
- **スナップショット**: 最小限に保ち、明示的なアサーションを優先
- **統合**: E2E テストは `client/src/**/*.integration.test.ts` に配置

### デスクトップテスト

- **場所**: E2E テストは `desktop/e2e/` に配置
- **目的**: デスクトップ固有のワークフローを検証
- **ローカル実行**: Docker を使用 (Docker/CI 以外のローカル実行は無効)
  - Playwright (Web): `pnpm --filter @reprod/e2e test:docker`
  - WebDriverIO (Desktop, メイン): `pnpm --filter @reprod/e2e test:docker:webdriver`
  - 任意: `REPROD_E2E_DOCKER_MEMORY=8g REPROD_E2E_DOCKER_CPUS=6 pnpm --filter @reprod/e2e test:docker`

## Git フック

コード品質を担保するために [Husky](https://typicode.github.io/husky/) で Git フックを管理しています。`pnpm install` 実行時に自動的にインストールされます。

**Pre-push フックのチェック項目:**

- Rust フォーマット (`cargo fmt --check`)
- Rust lint (`cargo clippy`)
- TypeScript lint (`pnpm run lint`)

**フックをバイパスする** (非推奨): `git push --no-verify`

コミット後は、`.husky/` の pre-push フックと `.github/` の CI/CD ワークフローの両方を通過することを確認してください。

## セキュリティと設定

- **API キー**: API キーや機密変数をコミットしない
- **ローカル成果物**: `.reprod/` 成果物はローカルに保持し、git から除外
- **環境ファイル**: ローカル設定には `.env` ファイルを使用 (git-ignored)
- **設定ファイル**: ユーザー設定は `~/.reprod/auth.json` に配置可能

## 許可される Git コマンド

参考として、以下の Git 操作は特別な許可なしに実行できます:

### 読み取り専用コマンド

- `git status`, `git log`, `git diff`, `git branch`, `git show`
- `git branch -a`, `git branch -r`
- `git remote`, `git remote -v`
- 日次レポート: `git log --all --author="$(git config user.name)" --since="00:00:00" --format="%h %s"`

### 書き込み操作

- `git add <specific-files>` (**絶対に** `git add -A` や `git add .` を使用しない)
- `git commit` (**絶対に** `--amend` や `--force` オプションを使用しない)
- `git push` (**絶対に** `--force` を使用しない)
- `git checkout`, `git checkout -b`, `git switch`, `git switch -c`

### Worktree 管理

- `git worktree add`, `git worktree remove`
- `git worktree prune`, `git worktree list`

**重要**: worktree ディレクトリで作業する場合、メインディレクトリを破損させないでください。worktree 内でのみ作業してください。

### GitHub CLI (gh)

- `gh pr create`, `gh pr list`, `gh pr view`, `gh pr status`
- `gh issue create`, `gh issue list`, `gh issue view`
- `gh repo view`

## ヘルプを得るには

- **質問** - [Discussion](https://github.com/ShinyaYoshida-biomet/Re-prod/discussions) を活用
- **バグを発見** - [Issue](https://github.com/ShinyaYoshida-biomet/Re-prod/issues) を投稿
- **新機能案** - Issue を立てて [@ShinyaYoshida-biomet](https://github.com/ShinyaYoshida-biomet) をタグ付け

## コミュニティガイドライン

- **敬意を持って** - 互いに親切に接する
- **建設的に** - 有益なフィードバックを心掛ける
- **辛抱強く** - レビューには時間がかかることもある
- **協調的に** - プロジェクトを共に育てる姿勢で

## ライセンス

Re-prod に貢献することで、[LICENSE](./LICENSE) に記載されたプロジェクトのライセンスの下で提供することに同意したものとします。

---

Re-prod への貢献に感謝します。

どんなに小さな貢献でも、Re-prod を R 研究コミュニティにとってより良いものにするのに役立ちます。
