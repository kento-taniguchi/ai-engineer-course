"""本日の ToDo を、LINE 公式アカウントから自分に送るプログラム。

使い方:
    python notify_line.py            → LINE に送る
    python notify_line.py --dry-run  → 送らずに、送る文面を画面に表示するだけ

毎朝の自動送信は、Windows の「タスク スケジューラ」からこのプログラムを動かします。
（タスク スケジューラから動くときは画面が出ないので、結果は notify_line.log に書き残します）

.env に次の設定を書きます。
    LINE_CHANNEL_ACCESS_TOKEN … LINE 公式アカウントの合鍵（チャネルアクセストークン）（必須）
    LINE_USER_ID              … 送り先（あなた）の LINE ユーザーID（省略可）
                                 省略すると、公式アカウントの友だち全員に送ります。
"""

import logging
import os
import sys
import traceback
from datetime import date
from pathlib import Path

import requests
from dotenv import load_dotenv

from sheets import TodoSheet

# タスク スケジューラから動かすと「今いるフォルダ」が違う場所になるので、
# このファイルがあるフォルダを基準に .env や鍵ファイルを探す
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push"
LINE_BROADCAST_URL = "https://api.line.me/v2/bot/message/broadcast"
WEEKDAYS = "月火水木金土日"
# LINE の1通のメッセージに入れられる文字数の上限
MAX_TEXT_LENGTH = 5000

logging.basicConfig(
    filename=BASE_DIR / "notify_line.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    encoding="utf-8",
)


def todays_todos(sheet: TodoSheet, today: date) -> list[dict]:
    """期日が今日の ToDo だけを取り出す。"""
    return [t for t in sheet.list_todos() if t["due_date"] == today.isoformat()]


def build_message(todos: list[dict], today: date) -> str:
    """LINE に送る文面を作る。"""
    header = f"おはようございます！\n{today.month}/{today.day}（{WEEKDAYS[today.weekday()]}）のToDo"
    if not todos:
        return f"{header}\n\n今日が期日のToDoはありません。"

    lines = [f"{header}（{len(todos)}件）", ""]
    for i, todo in enumerate(todos, start=1):
        lines.append(f"{i}. {todo['title']}")
        if todo["content"]:
            lines.append(f"　{todo['content']}")
    text = "\n".join(lines)
    if len(text) > MAX_TEXT_LENGTH:
        text = text[: MAX_TEXT_LENGTH - 20] + "\n…（続きはアプリで）"
    return text


def send_line(text: str) -> None:
    """LINE の Messaging API でメッセージを送る。

    LINE_USER_ID があれば、その人だけに送る（プッシュメッセージ）。
    なければ、公式アカウントの友だち全員に送る（一斉送信）。
    """
    body = {"messages": [{"type": "text", "text": text}]}
    user_id = os.getenv("LINE_USER_ID", "").strip()
    if user_id:
        url = LINE_PUSH_URL
        body["to"] = user_id
    else:
        url = LINE_BROADCAST_URL
    response = requests.post(
        url,
        headers={"Authorization": f"Bearer {os.environ['LINE_CHANNEL_ACCESS_TOKEN']}"},
        json=body,
        timeout=(10, 20),
    )
    if response.status_code != 200:
        raise RuntimeError(f"LINE への送信に失敗しました（{response.status_code}）: {response.text}")


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    today = date.today()
    try:
        credentials = Path(os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials.json"))
        if not credentials.is_absolute():
            credentials = BASE_DIR / credentials
        sheet = TodoSheet(credentials_file=str(credentials), spreadsheet_id=os.environ["SPREADSHEET_ID"])
        todos = todays_todos(sheet, today)
        text = build_message(todos, today)

        if dry_run:
            print(text)
            return 0
        send_line(text)
        logging.info("送信しました（%d件）", len(todos))
        return 0
    except Exception:
        logging.exception("失敗しました")
        if sys.stderr:  # 画面がある（手で動かした）ときは、画面にもエラーを出す
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
