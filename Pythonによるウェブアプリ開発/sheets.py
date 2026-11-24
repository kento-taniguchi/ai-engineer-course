"""Google スプレッドシートに ToDo を保存・読み込みする処理。

スプレッドシートの次の2つのシートを、表として使います。

「todos」シート（やること）
    A: ID / B: タイトル / C: 内容 / D: 期日 / E: 作成日時 / F: 更新日時 / G: 親ID
    ※ 親ID は、業務セットから自動で作られた ToDo にだけ入ります（元になったコアの ToDo の ID）。

「業務セット」シート（コアの ToDo に付随する、決まった業務の一覧）
    A: セットID / B: セット名 / C: 業務タイトル / D: 業務内容 / E: 期日のずれ(日)
    ※ 1行に業務1つ。同じセットの業務は、同じセットIDの行として並びます。
"""

import time
import uuid
from datetime import date, datetime, timedelta

import gspread
import requests

SHEET_NAME = "todos"
HEADERS = ["ID", "タイトル", "内容", "期日", "作成日時", "更新日時", "親ID"]

SETS_SHEET_NAME = "業務セット"
SETS_HEADERS = ["セットID", "セット名", "業務タイトル", "業務内容", "期日のずれ(日)"]

# 通信の待ち時間の上限（秒）：(接続するまで, 返事が来るまで)
TIMEOUT = (10, 20)
# 一時的な失敗とみなして、やり直す HTTP ステータス
RETRY_STATUS = {429, 500, 502, 503, 504}


class SheetError(Exception):
    """スプレッドシートとの通信に、やり直しても失敗したときのエラー。"""


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _new_id() -> str:
    return uuid.uuid4().hex[:8]


def shift_date(due_date: str, offset_days: int) -> str:
    """期日を offset_days 日ずらす（マイナスなら前）。期日が空なら空のまま。"""
    if not due_date:
        return ""
    return (date.fromisoformat(due_date) + timedelta(days=offset_days)).isoformat()


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
        self.ws = _with_retry(lambda: self._get_or_create_worksheet(spreadsheet, SHEET_NAME, HEADERS))
        self.sets_ws = _with_retry(
            lambda: self._get_or_create_worksheet(spreadsheet, SETS_SHEET_NAME, SETS_HEADERS)
        )

    @staticmethod
    def _get_or_create_worksheet(spreadsheet, name: str, headers: list[str]):
        """シートを取得。なければ作って見出し行を書き込む。"""
        try:
            ws = spreadsheet.worksheet(name)
        except gspread.WorksheetNotFound:
            ws = spreadsheet.add_worksheet(title=name, rows=100, cols=len(headers))
        if ws.col_count < len(headers):
            # 列が足りない（以前の版で作ったシートなど）ときは、列を増やす
            ws.add_cols(len(headers) - ws.col_count)
        if ws.row_values(1) != headers:
            ws.update([headers], "A1")
        return ws

    # ---------- ToDo ----------

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
            "parent_id": row[6],
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

    def add_todo(self, title: str, content: str, due_date: str, task_set: dict | None = None) -> int:
        """ToDo を1件登録する。

        task_set（業務セット）を渡すと、そのセットの業務も ToDo として一緒に登録する。
        付随する ToDo の期日は「コアの期日 ＋ 期日のずれ」。登録した件数を返す。
        """
        todo_id = _new_id()
        now = _now()
        rows = [[todo_id, title, content, due_date, now, now, ""]]
        for task in (task_set or {}).get("tasks", []):
            rows.append([
                _new_id(),
                task["title"],
                task["content"],
                shift_date(due_date, task["offset"]),
                now,
                now,
                todo_id,  # 親ID：どのコアの ToDo から作られたか
            ])
        # 1回の通信でまとめて書き込む（途中まで書けた、という状態を作らないため）。
        # value_input_option="RAW" で、期日などが勝手に別の形式へ変換されないようにする
        _with_retry(
            lambda: self.ws.append_rows(rows, value_input_option="RAW", table_range="A1"),
            # 失敗したように見えても、実は書き込めていることがある。
            # やり直す前に同じIDの行があるか確かめて、二重登録を防ぐ。
            before_retry=lambda: self._find_row_number(todo_id) is not None,
        )
        return len(rows)

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

    # ---------- 業務セット ----------

    def _set_rows(self) -> list[list]:
        """業務セットのシートの中身（見出しを除く）。空欄の列は補っておく。"""
        rows = _with_retry(self.sets_ws.get_all_values)[1:]
        n = len(SETS_HEADERS)
        return [(r + [""] * n)[:n] for r in rows if r and r[0]]

    def list_sets(self) -> list[dict]:
        """業務セットを、シートに並んでいる順で返す。"""
        sets: dict[str, dict] = {}
        for set_id, name, title, content, offset in self._set_rows():
            item = sets.setdefault(set_id, {"id": set_id, "name": name, "tasks": []})
            try:
                offset_days = int(offset or 0)
            except ValueError:
                offset_days = 0  # シートを手で書き換えて数字でなくなった場合
            item["tasks"].append({"title": title, "content": content, "offset": offset_days})
        return list(sets.values())

    def get_set(self, set_id: str):
        return next((s for s in self.list_sets() if s["id"] == set_id), None)

    def _write_sets(self, new_rows: list[list], old_count: int) -> None:
        """業務セットのシートの2行目以降を、new_rows で丸ごと書き直す。

        前より行が減ったときは、余った行を空欄で上書きして消す。
        同じ内容を書くだけなので、やり直しても問題ない。
        """
        blank = [""] * len(SETS_HEADERS)
        values = new_rows + [blank] * max(0, old_count - len(new_rows))
        if not values:
            return
        needed = len(values) + 1  # 見出し行の分
        if self.sets_ws.row_count < needed:
            _with_retry(lambda: self.sets_ws.add_rows(needed - self.sets_ws.row_count))
        _with_retry(lambda: self.sets_ws.update(values, "A2", value_input_option="RAW"))

    def save_set(self, set_id: str | None, name: str, tasks: list[dict]) -> bool:
        """業務セットを保存する。set_id が None なら新規、あれば上書き。

        上書きしようとしたセットが見つからなければ False を返す。
        """
        old_rows = self._set_rows()
        if set_id is None:
            set_id = _new_id()
        elif not any(r[0] == set_id for r in old_rows):
            return False
        new_set_rows = [[set_id, name, t["title"], t["content"], t["offset"]] for t in tasks]

        # 元の並び順を保つ：上書きのときは、元のセットがあった場所に差し込む
        new_rows, inserted = [], False
        for r in old_rows:
            if r[0] == set_id:
                if not inserted:
                    new_rows.extend(new_set_rows)
                    inserted = True
            else:
                new_rows.append(r)
        if not inserted:
            new_rows.extend(new_set_rows)

        self._write_sets(new_rows, len(old_rows))
        return True

    def delete_set(self, set_id: str) -> bool:
        old_rows = self._set_rows()
        new_rows = [r for r in old_rows if r[0] != set_id]
        if len(new_rows) == len(old_rows):
            return False
        self._write_sets(new_rows, len(old_rows))
        return True
