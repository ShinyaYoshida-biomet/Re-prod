# Re-prod への貢献

Re-prod に興味を持っていただきありがとうございます。コミュニティからの貢献を歓迎します。

## はじめる前に

1. [README.md](./README.md) を読み、プロジェクトのビジョンと目標を理解する
2. Re-prod が「タイムラインによる再現性」と「AI 支援」を備えた R 分析環境を目指していることに賛同する
3. 方向性に賛同できれば、貢献を始めましょう

## 取り組めること

### Issue から取り組む

**[GitHub Issues](https://github.com/ShinyaYoshida-biomet/Re-prod/issues) にある未解決の課題であれば自由に取り組めます。**

- 興味がある Issue を選ぶ
- 自分が取り組む旨をコメントで共有
- リポジトリを fork し、ブランチを切って開発を進める

### 事前に相談すべきこと

**Issue として登録されていないアイデアや変更を加える場合は、事前に相談してください。**

- Discussion または Issue を立てる
- [@ShinyaYoshida-biomet](https://github.com/ShinyaYoshida-biomet) をメンションしてフィードバックを得る
- 承認を得てから作業を開始
- 重複した作業を避け、プロジェクトの一貫性を保つためです

## 開発ワークフロー

### 1. セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/ShinyaYoshida-biomet/Re-prod.git
cd Re-prod

# 依存関係をインストール
pnpm install

# Husky による Git フックは `pnpm install` 時に自動設定されます
```

### 2. ブランチを作成

```bash
git checkout -b feat/your-feature-name
# または
git checkout -b fix/issue-number-description
```

### 3. 変更を加える

- 読みやすいコードを書く
- 既存のスタイルとパターンに従う
- 複雑なロジックにはコメントを追加

### 4. テストを書く

**ユニットテストと CI を通過させてからマージします。**

```bash
# フロントエンドテスト
pnpm --filter client test

# バックエンドテスト
cd core && cargo test
```

### 5. ローカルでチェックを実行

```bash
# TypeScript lint
pnpm --filter client run lint

# Rust フォーマットチェック
cargo fmt --check

# Rust lint
cargo clippy

# ビルドチェック
pnpm --filter client run build
cargo build
```

### 6. コミット

```bash
git add <files>
git commit -m "feat: 新機能を追加 (#123)"
# または
git commit -m "fix: Y のバグを修正 (#456)"
```

**コミットメッセージ形式**
- `feat:` 新機能
- `fix:` バグ修正
- `docs:` ドキュメント
- `test:` テスト関連
- `refactor:` リファクタ

### 7. Push＆PR

```bash
git push origin feat/your-feature-name
```

その後 GitHub でプルリクエストを作成し、以下を明示しておくとレビューしやすくなります。

- **What**: この PR で何をするか
- **Why**: どの Issue を解決するか
- **How**: 取り組んだ手法の概要
- **Testing**: 実行/追加したテスト

## プルリクエスト要件

1. すべてのユニットテストが通過していること
2. CI/CD パイプラインが成功していること
3. コードがプロジェクトの規約に沿っていること
4. 既存の Issue に対応している、もしくは事前に承認されていること
5. 新機能/修正に対してテストが含まれていること
6. ドキュメントの更新が必要な場合は反映済みであること

## コードスタイル

### TypeScript/React
- フックを活用した関数コンポーネントを使用
- `let` より `const` を優先
- TypeScript の型を利用（`any` は避ける）
- 既存ファイル構成や命名規則に従う

### Rust
- コミット前に `cargo fmt` を実行
- `cargo clippy` の警告に対処
- イディオマティックな Rust を書く
- パブリック API にはドキュメントコメントを追加

## テストガイドライン

- **バックエンド**: `core/src/**/*_test.rs` や `#[cfg(test)]` モジュールにユニットテスト
- **フロントエンド**: `client/src/**/*.test.ts` や `client/src/**/__tests__/` など
- **統合テスト**: `client/src/**/*.integration.test.ts` などでエンドツーエンドを検証

## Git フック

コード品質の担保のために Husky 管理の Git フックを利用しています。`pnpm install` 実行時に自動設定され、pre-push で以下をチェックします:
- Rust フォーマット (`cargo fmt --check`)
- Rust lint (`cargo clippy`)
- TypeScript lint (`pnpm run lint`)

## ヘルプを得るには

- **質問**: [Discussion](https://github.com/ShinyaYoshida-biomet/Re-prod/discussions) を活用
- **バグを発見**: [Issue](https://github.com/ShinyaYoshida-biomet/Re-prod/issues) を投稿
- **新機能案**: Issue を立てて [@ShinyaYoshida-biomet](https://github.com/ShinyaYoshida-biomet) をタグ付け

## コミュニティガイドライン

- **敬意を持って**: 互いに親切に接する
- **建設的に**: 有益なフィードバックを心掛ける
- **辛抱強く**: レビューには時間がかかることもある
- **協調的に**: プロジェクトを共に育てる姿勢で

## ライセンス

Re-prod に貢献することで、[LICENSE](./LICENSE) に記載されたプロジェクトのライセンスの下で提供することに同意したものとします。
