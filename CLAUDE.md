# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

このプロジェクトは、Google Apps Script（GAS）で動作する自動投稿ボットです。以下のSNSアカウントに対して自動的にポストを投稿します:

- X（Twitter）アカウント × 2
- Blueskyアカウント × 1

TypeScriptで記述され、claspを使ってGASにデプロイします。トリガー機能を使用して定期的に関数を実行し、自動投稿を実現します。

**タイムゾーン**: JST (Asia/Tokyo)

## 開発コマンド

### clasp関連
```bash
# GASにプッシュ（デプロイ）
clasp push

# GASから最新のコードを取得
clasp pull

# GASプロジェクトを開く
clasp open

# ログを確認
clasp logs
```

### TypeScript
```bash
# 型チェック
npx tsc --noEmit

# ビルド（declarationファイル生成）
npx tsc
```

## アーキテクチャ

### 環境変数の管理

APIキーやアクセストークンなどの機密情報は、GASの `PropertiesService` を使用して管理します。

GASのスクリプトエディタで「プロジェクトの設定」→「スクリプト プロパティ」から以下を設定:

**X（Twitter）日本語アカウント用:**
- `X_RND_SHOSHA_API_KEY`
- `X_RND_SHOSHA_API_KEY_SECRET`
- `X_RND_SHOSHA_ACCESS_TOKEN`
- `X_RND_SHOSHA_ACCESS_TOKEN_SECRET`

**X（Twitter）英語アカウント用:**
- `X_RND_SHOSHA_EN_API_KEY`
- `X_RND_SHOSHA_EN_API_KEY_SECRET`
- `X_RND_SHOSHA_EN_ACCESS_TOKEN`
- `X_RND_SHOSHA_EN_ACCESS_TOKEN_SECRET`

**Bluesky用:**
- `BSKY_HANDLE` (例: shosha.rmc-8.com)
- `BSKY_RND_SHOSHA_APP_PASS` (App Password)

```typescript
// スクリプトプロパティから取得例
const properties = PropertiesService.getScriptProperties();
const apiKey = properties.getProperty('X_RND_SHOSHA_API_KEY');
const blueskyHandle = properties.getProperty('BSKY_HANDLE');
```

### トリガー関数

GASのトリガーから呼び出される関数は、グローバルスコープに配置する必要があります。

**利用可能な関数:**
- `postToXJapanese()` - 日本語文章をX日本語アカウントに投稿
- `postToXEnglish()` - 英語文章をX英語アカウントに投稿
- `postToBlueskyJapanese()` - 日本語文章をBlueskyに投稿
- `postToBlueskyEnglish()` - 英語文章をBlueskyに投稿

トリガーは、GASのスクリプトエディタで「トリガー」から設定します。

**トリガー設定例:**
- 日本語投稿: 毎日 JST 5:00 に `postToXJapanese()` と `postToBlueskyJapanese()`
- 英語投稿: 毎日 JST 18:00 に `postToXEnglish()` と `postToBlueskyEnglish()`

### コード構成

投稿処理は各SNSごとに分離することを推奨:

- X（Twitter）投稿用の関数（2アカウント分）
- Bluesky投稿用の関数
- 共通のユーティリティ関数

各SNSのAPI仕様に合わせて、適切なHTTPリクエストを `UrlFetchApp.fetch()` で実行します。

### claspの設定

`.clasp.json` ファイルでGASプロジェクトとの紐付けを管理します。このファイルには `scriptId` が含まれるため、`.gitignore` に追加することを推奨します。

`appsscript.json` ファイルでGASプロジェクトの設定（タイムゾーン、実行API、権限など）を管理します。
