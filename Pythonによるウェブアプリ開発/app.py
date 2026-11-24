"""ToDo リストアプリ（Flask + Google スプレッドシート）

起動方法:  python app.py  →  ブラウザで http://127.0.0.1:5000 を開く
"""

import os
from datetime import date
from itertools import groupby

from dotenv import load_dotenv
from flask import Flask, abort, flash, redirect, render_template, request, url_for

from sheets import SheetError, TodoSheet

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key")

# 業務セットの編集画面に出す、業務の入力欄の数
TASK_ROWS = 10
# 期日のずれとして入力できる範囲（日）
MAX_OFFSET = 365

_sheet = None


def get_sheet() -> TodoSheet:
    """スプレッドシートへの接続を1回だけ作って使い回す。"""
    global _sheet
    if _sheet is None:
        _sheet = TodoSheet(
            credentials_file=os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials.json"),
            spreadsheet_id=os.environ["SPREADSHEET_ID"],
        )
    return _sheet


def validate(form) -> tuple[dict, list[str]]:
    """フォームの入力を取り出して、間違いがないか確認する。"""
    data = {
        "title": form.get("title", "").strip(),
        "content": form.get("content", "").strip(),
        "due_date": form.get("due_date", "").strip(),
    }
    errors = []
    if not data["title"]:
        errors.append("タイトルを入力してください。")
    elif len(data["title"]) > 100:
        errors.append("タイトルは100文字以内で入力してください。")
    if len(data["content"]) > 1000:
        errors.append("内容は1000文字以内で入力してください。")
    if data["due_date"]:
        try:
            date.fromisoformat(data["due_date"])
        except ValueError:
            errors.append("期日の形式が正しくありません。")
    return data, errors


def validate_set(form) -> tuple[dict, list[str]]:
    """業務セットのフォームの入力を取り出して、間違いがないか確認する。

    業務の入力欄は複数あり、タイトルが空の欄は「使っていない欄」として無視する。
    """
    name = form.get("name", "").strip()
    titles = form.getlist("task_title")
    contents = form.getlist("task_content")
    offsets = form.getlist("task_offset")

    errors = []
    if not name:
        errors.append("セット名を入力してください。")
    elif len(name) > 50:
        errors.append("セット名は50文字以内で入力してください。")

    tasks = []      # 保存する業務
    rows = []       # 入力し直しのときに画面へ戻す値（入力されたそのまま）
    for i, (title, content, offset) in enumerate(zip(titles, contents, offsets), start=1):
        title, content, offset = title.strip(), content.strip(), offset.strip()
        rows.append({"title": title, "content": content, "offset": offset})
        if not title:
            continue
        if len(title) > 100:
            errors.append(f"{i}行目：業務タイトルは100文字以内で入力してください。")
        if len(content) > 1000:
            errors.append(f"{i}行目：業務内容は1000文字以内で入力してください。")
        try:
            offset_days = int(offset or 0)
            if abs(offset_days) > MAX_OFFSET:
                raise ValueError
        except ValueError:
            errors.append(f"{i}行目：期日のずれは -{MAX_OFFSET}〜{MAX_OFFSET} の整数で入力してください。")
            continue
        tasks.append({"title": title, "content": content, "offset": offset_days})

    if not tasks:
        errors.append("業務を1つ以上入力してください。")
    return {"name": name, "tasks": tasks, "rows": rows}, errors


def set_form_rows(task_set: dict) -> list[dict]:
    """業務セットの編集画面に出す入力欄（足りない分は空欄で埋める）。"""
    rows = list(task_set.get("rows") or task_set.get("tasks") or [])
    return rows + [{"title": "", "content": "", "offset": ""}] * max(0, TASK_ROWS - len(rows))


CONNECTION_ERROR = "スプレッドシートとの通信に失敗しました。少し待ってから、もう一度お試しください。"


@app.errorhandler(SheetError)
def handle_sheet_error(error):
    """一覧などの表示中に通信に失敗したとき、エラー画面の代わりにお知らせを出す。"""
    return render_template("error.html", message=CONNECTION_ERROR), 503


@app.template_filter("offset_label")
def offset_label(days) -> str:
    """期日のずれを「3日前」「当日」「7日後」のような言葉にする。"""
    days = int(days or 0)
    if days == 0:
        return "当日"
    return f"{abs(days)}日{'前' if days < 0 else '後'}"


# ---------- ToDo ----------


WEEKDAYS = "月火水木金土日"


def date_label(due_date: str) -> str:
    """「2026-12-07」を「2026年12月7日（月）」のような日本語の日付にする。"""
    try:
        d = date.fromisoformat(due_date)
    except ValueError:
        return due_date  # 形が違う日付（シートを手で書き換えた場合など）は、そのまま出す
    return f"{d.year}年{d.month}月{d.day}日（{WEEKDAYS[d.weekday()]}）"


def group_by_due_date(todos: list[dict]) -> list[dict]:
    """期日が近い順に並んだ「やること」を、同じ期日ごとのまとまりに分ける。

    期日なしのものは、最後に「期日なし」としてまとめる。
    """
    groups = []
    for due_date, items in groupby(todos, key=lambda t: t["due_date"]):
        groups.append({
            "due_date": due_date,
            "label": date_label(due_date) if due_date else "期日なし",
            "todos": list(items),
        })
    return groups


@app.route("/")
def index():
    todos = get_sheet().list_todos()
    titles = {t["id"]: t["title"] for t in todos}
    return render_template(
        "index.html",
        todos=todos,
        groups=group_by_due_date(todos),
        titles=titles,
        today=date.today().isoformat(),
    )


@app.route("/todos/new", methods=["GET", "POST"])
def new_todo():
    sets = get_sheet().list_sets()
    if request.method == "POST":
        data, errors = validate(request.form)
        set_id = request.form.get("set_id", "")
        task_set = next((s for s in sets if s["id"] == set_id), None)
        if set_id and task_set is None:
            errors.append("選んだ業務セットが見つかりません。もう一度選んでください。")
        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("form.html", todo=data, mode="new", sets=sets, set_id=set_id), 400
        try:
            count = get_sheet().add_todo(**data, task_set=task_set)
        except SheetError:
            flash(CONNECTION_ERROR, "error")
            return render_template("form.html", todo=data, mode="new", sets=sets, set_id=set_id), 503
        if count > 1:
            flash(f"「{data['title']}」と、付随する業務{count - 1}件を登録しました。", "success")
        else:
            flash(f"「{data['title']}」を登録しました。", "success")
        return redirect(url_for("index"))
    return render_template("form.html", todo={}, mode="new", sets=sets, set_id="")


@app.route("/todos/<todo_id>/edit", methods=["GET", "POST"])
def edit_todo(todo_id):
    if request.method == "POST":
        data, errors = validate(request.form)
        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("form.html", todo={**data, "id": todo_id}, mode="edit"), 400
        try:
            updated = get_sheet().update_todo(todo_id, **data)
        except SheetError:
            flash(CONNECTION_ERROR, "error")
            return render_template("form.html", todo={**data, "id": todo_id}, mode="edit"), 503
        if not updated:
            abort(404)
        flash(f"「{data['title']}」を更新しました。", "success")
        return redirect(url_for("index"))

    todo = get_sheet().get_todo(todo_id)
    if todo is None:
        abort(404)
    return render_template("form.html", todo=todo, mode="edit")


# ---------- 業務セット ----------


@app.route("/sets")
def list_sets():
    return render_template("sets.html", sets=get_sheet().list_sets())


@app.route("/sets/new", methods=["GET", "POST"])
def new_set():
    if request.method == "POST":
        data, errors = validate_set(request.form)
        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("set_form.html", task_set=data, rows=set_form_rows(data), mode="new"), 400
        try:
            get_sheet().save_set(None, data["name"], data["tasks"])
        except SheetError:
            flash(CONNECTION_ERROR, "error")
            return render_template("set_form.html", task_set=data, rows=set_form_rows(data), mode="new"), 503
        flash(f"業務セット「{data['name']}」を登録しました。", "success")
        return redirect(url_for("list_sets"))
    return render_template("set_form.html", task_set={}, rows=set_form_rows({}), mode="new")


@app.route("/sets/<set_id>/edit", methods=["GET", "POST"])
def edit_set(set_id):
    if request.method == "POST":
        data, errors = validate_set(request.form)
        data["id"] = set_id
        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("set_form.html", task_set=data, rows=set_form_rows(data), mode="edit"), 400
        try:
            saved = get_sheet().save_set(set_id, data["name"], data["tasks"])
        except SheetError:
            flash(CONNECTION_ERROR, "error")
            return render_template("set_form.html", task_set=data, rows=set_form_rows(data), mode="edit"), 503
        if not saved:
            abort(404)
        flash(f"業務セット「{data['name']}」を更新しました。", "success")
        return redirect(url_for("list_sets"))

    task_set = get_sheet().get_set(set_id)
    if task_set is None:
        abort(404)
    return render_template("set_form.html", task_set=task_set, rows=set_form_rows(task_set), mode="edit")


@app.route("/sets/<set_id>/delete", methods=["POST"])
def delete_set(set_id):
    try:
        deleted = get_sheet().delete_set(set_id)
    except SheetError:
        flash(CONNECTION_ERROR, "error")
        return redirect(url_for("edit_set", set_id=set_id))
    if not deleted:
        abort(404)
    flash("業務セットを削除しました。（すでに作られた ToDo はそのまま残ります）", "success")
    return redirect(url_for("list_sets"))


if __name__ == "__main__":
    app.run(debug=True)
