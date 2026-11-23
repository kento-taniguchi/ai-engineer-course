"""ToDo リストアプリ（Flask + Google スプレッドシート）

起動方法:  python app.py  →  ブラウザで http://127.0.0.1:5000 を開く
"""

import os
from datetime import date

from dotenv import load_dotenv
from flask import Flask, abort, flash, redirect, render_template, request, url_for

from sheets import TodoSheet

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-secret-key")

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


@app.route("/")
def index():
    todos = get_sheet().list_todos()
    return render_template("index.html", todos=todos, today=date.today().isoformat())


@app.route("/todos/new", methods=["GET", "POST"])
def new_todo():
    if request.method == "POST":
        data, errors = validate(request.form)
        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("form.html", todo=data, mode="new"), 400
        get_sheet().add_todo(**data)
        flash(f"「{data['title']}」を登録しました。", "success")
        return redirect(url_for("index"))
    return render_template("form.html", todo={}, mode="new")


@app.route("/todos/<todo_id>/edit", methods=["GET", "POST"])
def edit_todo(todo_id):
    sheet = get_sheet()
    if request.method == "POST":
        data, errors = validate(request.form)
        if errors:
            for e in errors:
                flash(e, "error")
            return render_template("form.html", todo={**data, "id": todo_id}, mode="edit"), 400
        if not sheet.update_todo(todo_id, **data):
            abort(404)
        flash(f"「{data['title']}」を更新しました。", "success")
        return redirect(url_for("index"))

    todo = sheet.get_todo(todo_id)
    if todo is None:
        abort(404)
    return render_template("form.html", todo=todo, mode="edit")


if __name__ == "__main__":
    app.run(debug=True)
