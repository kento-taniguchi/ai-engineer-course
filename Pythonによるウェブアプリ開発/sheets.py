"""Google スプレッドシートに ToDo を保存・読み込みする処理。

スプレッドシートの「todos」シートを、次の列を持つ表として使います。
    A: ID / B: タイトル / C: 内容 / D: 期日 / E: 作成日時 / F: 更新日時
"""

import time
import uuid
from datetime import datetime

import gspread
import requests

SHEET_NAME = "todos"
HEADERS = ["ID", "タイトル", "内容", "期日", "作成日時", "更新日時"]

# 通信の待ち時間の上限（秒）：(接続するまで, 返事が来るまで)
TIMEOUT = (10, 20)
# 一時的な失敗とみなして、やり直す HTTP ステータス
RETRY_STATUS = {429, 500, 502, 503, 504}


class SheetError(Exception):
    """スプレッドシートとの通信に、やり直しても失敗したときのエラー。"""


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _is_temporary(error: Exception) -> bool:
    """やり直せば成功しそうな失敗かどうか。"""
    if isinstance(error, (requests.exceptions.ConnectionError, requests.exceptions.Timeout)):
        return True  # 接続が切れていた・時間切れ
    if isinstance(error, gspread.exceptions.APIError):
        return error.response.status_code in RETRY_STATUS
    return False


def _with_retry(action, before_retry=None):
    """action() を実行し、一時的な失敗なら少し待ってもう1回だけやり直す。

    before_retry() が True を返したら「実はもう成功していた」とみなして終わる。
    """
    try:
        return action()
    except Exception as first_error:
        if not _is_temporary(first_error):
            raise
        time.sleep(1)
        try:
            if before_retry and before_retry():
                return None
            return action()
        except Exception as second_error:
            if _is_temporary(second_error):
                raise SheetError("スプレッドシートとの通信に失敗しました。") from second_error
            raise


class TodoSheet:
    def __init__(self, credentials_file: str, spreadsheet_id: str):
        client = gspread.service_account(filename=credentials_file)
        client.set_timeout(TIMEOUT)
        spreadsheet = _with_retry(lambda: client.open_by_key(spreadsheet_id))
        self.ws = _with_retry(lambda: self._get_or_create_worksheet(spreadsheet))

    @staticmethod
    def _get_or_create_worksheet(spreadsheet):
        """「todos」シートを取得。なければ作って見出し行を書き込む。"""
        try:
            ws = spreadsheet.worksheet(SHEET_NAME)
        except gspread.WorksheetNotFound:
            ws = spreadsheet.add_worksheet(title=SHEET_NAME, rows=100, cols=len(HEADERS))
        if ws.row_values(1) != HEADERS:
            ws.update([HEADERS], "A1")
        return ws

    @staticmethod
    def _row_to_todo(row: list) -> dict:
        row = row + [""] * (len(HEADERS) - len(row))  # 空欄の列を補う
        return {
            "id": row[0],
            "title": row[1],
            "content": row[2],
            "due_date": row[3],
            "created_at": row[4],
            "updated_at": row[5],
        }

    def list_todos(self) -> list[dict]:
        """全件を取得し、期日が近い順（期日なしは最後）に並べて返す。"""
        rows = _with_retry(self.ws.get_all_values)[1:]  # 1行目は見出し
        todos = [self._row_to_todo(r) for r in rows if r and r[0]]
        todos.sort(key=lambda t: (t["due_date"] == "", t["due_date"]))
        return todos

    def _find_row_number(self, todo_id: str):
        ids = _with_retry(lambda: self.ws.col_values(1))
        for i, value in enumerate(ids[1:], start=2):  # 2行目から
            if value == todo_id:
                return i
        return None

    def get_todo(self, todo_id: str):
        row_number = self._find_row_number(todo_id)
        if row_number is None:
            return None
        return self._row_to_todo(_with_retry(lambda: self.ws.row_values(row_number)))

    def add_todo(self, title: str, content: str, due_date: str) -> str:
        todo_id = uuid.uuid4().hex[:8]
        now = _now()
        # value_input_option="RAW" で、期日などが勝手に別の形式へ変換されないようにする
        _with_retry(
            lambda: self.ws.append_row(
                [todo_id, title, content, due_date, now, now],
                value_input_option="RAW",
                table_range="A1",
            ),
            # 失敗したように見えても、実は書き込めていることがある。
            # やり直す前に同じIDの行があるか確かめて、二重登録を防ぐ。
            before_retry=lambda: self._find_row_number(todo_id) is not None,
        )
        return todo_id

    def update_todo(self, todo_id: str, title: str, content: str, due_date: str) -> bool:
        row_number = self._find_row_number(todo_id)
        if row_number is None:
            return False
        # 同じ値を書き直すだけなので、やり直しても問題ない。1回の通信でまとめて書く。
        _with_retry(
            lambda: self.ws.batch_update(
                [
                    {"range": f"B{row_number}:D{row_number}", "values": [[title, content, due_date]]},
                    {"range": f"F{row_number}", "values": [[_now()]]},
                ],
                value_input_option="RAW",
            )
        )
        return True
