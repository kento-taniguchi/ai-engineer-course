# ToDoリストアプリ（Python / Flask + Google スプレッドシート）

## できること
- やることの **登録**・**編集**（タイトル・内容・期日）
- 登録したやることの **一覧ページ**（期日ごとに見出しを付けてまとめて表示。期日が近い順、期日なしは最後。期限切れは赤、今日は「今日」の目印）
- **業務セット**：コアの ToDo に付随する「決まった業務」をセットとして登録しておくと、
  ToDo の登録時にセットを選ぶだけで、付随する業務も ToDo として自動で登録されます
  - 例：「新規入会」セット ＝ 入会書類の確認（3日前）／ユニフォーム発注（当日）／LINE登録案内（7日後）
  - 付随する ToDo の期日は「コアの期日 ＋ 期日のずれ」。コアの期日が空なら、付随する ToDo も期日なし
  - 一覧では、付随する ToDo に「〇〇の付随業務」と表示されます
- データは Google スプレッドシートに保存（シートは初回起動時に自動で作られます）
  - 「todos」シート：やること（G列「親ID」＝どのコアの ToDo から作られたか）
  - 「業務セット」シート：業務セット（1行に業務1つ）

## ファイル構成
| ファイル | 役割 |
|---|---|
| `app.py` | 画面（ページ）の処理。Flask アプリ本体 |
| `sheets.py` | スプレッドシートへの保存・読み込み |
| `templates/` | 画面の HTML（一覧・登録/編集フォーム・業務セット） |
| `static/style.css` | 見た目 |
| `.env.example` | 設定ファイルのひな形 |

## 準備（初回だけ）

### 1. Google 側の準備
1. [Google Cloud コンソール](https://console.cloud.google.com/) でプロジェクトを作る
2. 「API とサービス」→「ライブラリ」で **Google Sheets API** を有効にする
3. 「API とサービス」→「認証情報」→「認証情報を作成」→ **サービスアカウント** を作る
4. 作ったサービスアカウントの「鍵」タブ →「鍵を追加」→ **JSON** → ダウンロードしたファイルを
   このフォルダに `credentials.json` という名前で置く
5. 新しい Google スプレッドシートを作り、「共有」から サービスアカウントのメールアドレス
   （`xxxx@xxxx.iam.gserviceaccount.com`）を **編集者** として追加する

### 2. 設定ファイル
`.env.example` をコピーして `.env` にし、`SPREADSHEET_ID` を書き換えます。
スプレッドシートの URL `https://docs.google.com/spreadsheets/d/【ここ】/edit` の部分が ID です。

### 3. ライブラリのインストール
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## 起動
```powershell
.venv\Scripts\activate
python app.py
```
ブラウザで http://127.0.0.1:5000 を開きます。

> `credentials.json` と `.env` は秘密の情報です。`.gitignore` で GitHub に上がらないようにしてあります。

## 毎朝の LINE 通知

期日が今日の ToDo を、毎朝 7 時（日本時間）に LINE 公式アカウントから自分に送ります。
GitHub Actions（GitHub のコンピューター）で動くので、自分の PC の電源が入っていなくても届きます。

- 送信プログラム：`notify_line.py`（`python notify_line.py --dry-run` で、送らずに文面だけ確認できます）
- 自動実行の設定：リポジトリ直下の `.github/workflows/todo-line-notify.yml`
- 合鍵は GitHub の Secrets に登録します：`SPREADSHEET_ID` / `GOOGLE_CREDENTIALS_JSON`（credentials.json の中身）/ `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_USER_ID`（省略可。省略すると公式アカウントの友だち全員に送ります）
- GitHub の「Actions」タブ →「ToDo LINE通知」→「Run workflow」で、手動でも送れます
