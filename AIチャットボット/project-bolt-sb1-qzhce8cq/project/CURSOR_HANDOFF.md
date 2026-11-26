# Dify チャットボット Webアプリ — Cursor 引き継ぎドキュメント

## プロジェクト概要

Difyで作成したチャットボットとAPI連携するチャットボットWebアプリ。
React + TypeScript + Tailwind CSS + Vite + Supabase構成。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React 18, TypeScript, Tailwind CSS 3, Vite 7 |
| アイコン | lucide-react |
| バックエンド | Supabase (PostgreSQL, Edge Functions) |
| AI API | Dify Chatbot API (`/chat-messages`) |
| パスエイリアス | `@/` → `src/` (vite.config.ts で定義) |

## ディレクトリ構成

```
src/
├── App.tsx                      # メイン画面（チャットUI全体のレイアウト）
├── main.tsx                     # エントリーポイント
├── index.css                    # Tailwind ディレクティブのみ
├── types.ts                     # Conversation, Message, DifyStreamEvent 型定義
├── lib/
│   └── supabase.ts              # Supabaseクライアント（シングルトン）
├── hooks/
│   └── useChat.ts               # チャットのコアロジック（CRUD + ストリーミング）
└── components/
    ├── Sidebar.tsx              # 左サイドバー（会話履歴一覧）
    ├── ChatMessage.tsx          # 個別メッセージ表示
    ├── StreamingMessage.tsx     # ストリーミング中のメッセージ表示
    ├── ChatInput.tsx            # 入力欄（送信/停止ボタン）
    └── EmptyState.tsx           # 空状態ウェルカム画面

supabase/
├── config.toml                  # Edge Function 設定（verify_jwt = false）
├── functions/
│   └── dify-chat/
│       └── index.ts             # Dify API プロキシ Edge Function
└── migrations/
    └── 20261125232128_create_chatbot_tables.sql
```

## データベーススキーマ

### conversations テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | 会話ID（アプリ側で生成） |
| dify_conversation_id | text (nullable) | Dify APIが返す会話ID（初回メッセージ後に保存） |
| title | text | 会話タイトル（最初のメッセージから自動生成、40文字で省略） |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

### messages テーブル

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid (PK) | メッセージID |
| conversation_id | uuid (FK) | conversations.id への参照（CASCADE削除） |
| role | text | `'user'` または `'assistant'` |
| content | text | メッセージ本文 |
| created_at | timestamptz | 作成日時 |

### RLS ポリシー

- 両テーブルとも RLS 有効
- 認証なしアプリのため `TO anon, authenticated` で全CRUD許可（`USING (true)` / `WITH CHECK (true)`）
- `service_role` にもCRUD許可（Edge Function用）

## Edge Function: dify-chat

### 役割

Dify APIキーをブラウザに露出させないためのサーバーサイドプロキシ。

### エンドポイント

```
POST {SUPABASE_URL}/functions/v1/dify-chat
```

### 必須シークレット（環境変数）

| 変数名 | 説明 |
|--------|------|
| `DIFY_API_URL` | DifyインスタンスのベースURL（例: `https://api.dify.ai/v1`） |
| `DIFY_API_KEY` | DifyアプリのAPIキー（`app-` で始まる） |

> ⚠️ **これら2つのシークレットは未設定です。** Supabaseダッシュボード → Edge Functions → Secrets から設定してください。
> 設定しないとEdge Functionは503エラーを返します。

### リクエスト形式

```json
{
  "query": "ユーザーの質問",
  "conversation_id": "Difyの会話ID（初回は空文字）",
  "user": "ユーザー識別子",
  "inputs": {},
  "files": []
}
```

`Accept: text/event-stream` ヘッダーを付けるとストリーミングモード、付けないとブロッキングモードで動作。

### ストリーミング仕組み

1. Edge FunctionがDify APIに `response_mode: "streaming"` でリクエスト
2. DifyからのSSEレスポンスを `message` / `message_replace` / `error` / `end` イベントのみフィルタリングしてクライアントに転送
3. クライアント（`useChat.ts`）でSSEをパースし、`streamingContent` ステートを更新しながらリアルタイム表示
4. ストリーム終了後、完全な回答をDBに保存

### Dify SSEイベント仕様

| event | 含まれるフィールド | 処理 |
|-------|-------------------|------|
| `message` | `answer`（累積テキスト） | ストリーミング表示を更新 |
| `message_replace` | `answer` | 回答を置換（モデレーション等） |
| `end` | `conversation_id` | Difyの会話IDを保存 |
| `error` | — | エラーとして処理 |

> **注意:** `message` イベントの `answer` は**差分ではなく累積全文**。そのまま `streamingContent` にセットすればよい。

## コアロジック: useChat.ts

### 状態

| ステート | 型 | 説明 |
|---------|-----|------|
| `conversations` | `Conversation[]` | 全会話履歴（updated_at降順） |
| `activeConversationId` | `string \| null` | 現在選択中の会話ID |
| `messages` | `Message[]` | 現在の会話のメッセージ一覧 |
| `isStreaming` | `boolean` | ストリーミング中フラグ |
| `streamingContent` | `string` | ストリーミング中の回答テキスト |
| `error` | `string \| null` | エラーメッセージ |

### メッセージ送信フロー（sendMessage）

1. 会話が未選択なら `conversations` テーブルに新規挿入
2. ユーザーメッセージをDB + UIに追加
3. 最初のメッセージの場合、テキストから会話タイトルを自動生成
4. Edge Function にストリーミングリクエスト送信（`AbortController` で停止可能）
5. SSEをパースしながら `streamingContent` を更新
6. ストリーム終了後、AI回答をDB + UIに追加
7. `dify_conversation_id` を取得・保存（Dify側の会話コンテキストを維持するため）
8. `conversations.updated_at` を更新してソート順を維持

### ストリーミング停止（stopStreaming）

- `AbortController.abort()` でfetchを中断
- 中断時、部分的な回答があれば保存
- `isStreaming` をfalseに戻す

## 注意点・改善余地

### Dify APIキー未設定（最重要）

`DIFY_API_URL` と `DIFY_API_KEY` シークレットが未設定。Supabaseダッシュボードで設定が必要。

### 認証なし

現在は認証なしだが、マルチユーザー化する場合は：
- `conversations` / `messages` に `user_id` カラム追加
- RLSポリシーを `auth.uid()` ベースの所有者チェックに変更
- Supabase Auth でサインイン/サインアップ画面を追加

### Difyのconversation_id管理

Dify APIは `conversation_id` で会話コンテキストを維持。`conversations.dify_conversation_id` に保存済み。新規チャット時は空文字を送信し、`end` イベントで返ってきたIDを保存して次回以降使用。

### 入力ファイル対応

Dify APIは `files` パラメータで画像アップロード等に対応可能。現在は空配列で送信。対応する場合は `ChatInput` にファイルアップロードUIを追加し、Edge Function経由でDifyに転送。

### マークダウンレンダリング

現在メッセージは `whitespace-pre-wrap` でプレーンテキスト表示。AI回答のマークダウンをレンダリングする場合は `react-markdown` 等の導入を推奨。

## ビルドコマンド

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド
npm run typecheck  # 型チェック
npm run lint       # ESLint
```

## 参考リンク

- Dify API ドキュメント: https://docs.dify.ai/en/api-reference/chat-messages/send-chat-message
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
