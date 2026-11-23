"""Google スプレッドシートに ToDo を保存・読み込みする処理。

スプレッドシートの「todos」シートを、次の列を持つ表として使います。
    A: ID / B: タイトル / C: 内容 / D: 期日 / E: 作成日時 / F: 更新日時
"""

import uuid
from datetime import datetime

import gspread

SHEET_NAME = "todos"
HEADERS = ["ID", "タイトル", "内容", "期日", "作成日時", "更新日時"]


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class TodoSheet:
    def __init__(self, credentials_file: str, spreadsheet_id: str):
        client = gspread.service_account(filename=credentials_file)
        spreadsheet = client.open_by_key(spreadsheet_id)
        self.ws = self._get_or_create_worksheet(spreadsheet)

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
        rows = self.ws.get_all_values()[1:]  # 1行目は見出し
        todos = [self._row_to_todo(r) for r in rows if r and r[0]]
        todos.sort(key=lambda t: (t["due_date"] == "", t["due_date"]))
        return todos

    def _find_row_number(self, todo_id: str):
        ids = self.ws.col_values(1)
        for i, value in enumerate(ids[1:], start=2):  # 2行目から
            if value == todo_id:
                return i
        return None

    def get_todo(self, todo_id: str):
        row_number = self._find_row_number(todo_id)
        if row_number is None:
            return None
        return self._row_to_todo(self.ws.row_values(row_number))

    def add_todo(self, title: str, content: str, due_date: str) -> str:
        todo_id = uuid.uuid4().hex[:8]
        now = _now()
        # value_input_option="RAW" で、期日などが勝手に別の形式へ変換されないようにする
        self.ws.append_row(
            [todo_id, title, content, due_date, now, now],
            value_input_option="RAW",
            table_range="A1",
        )
        return todo_id

    def update_todo(self, todo_id: str, title: str, content: str, due_date: str) -> bool:
        row_number = self._find_row_number(todo_id)
        if row_number is None:
            return False
        self.ws.update(
            [[title, content, due_date]], f"B{row_number}:D{row_number}",
            value_input_option="RAW",
        )
        self.ws.update([[_now()]], f"F{row_number}", value_input_option="RAW")
        return True
