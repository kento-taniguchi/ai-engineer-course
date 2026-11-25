/**
 * ToDo アプリ（Supabase）の予定と売上を LINE に送る。
 *
 *   node scripts/line-report.mjs morning   … 今日のタスク（毎朝）
 *   node scripts/line-report.mjs evening   … 本日の売上。日曜なら今週の売上、月末なら今月の売上も一緒に送る（毎晩22時）
 *   node scripts/line-report.mjs daily | weekly | monthly … その報告だけ送る（試すとき用）
 *   最後に --dry を付けると、送らずに画面に表示するだけ
 *
 * 必要な設定（環境変数。手元で動かすときは .env の VITE_ の値も使える）
 *   SUPABASE_URL / SUPABASE_ANON_KEY … データベースの場所と公開用の鍵
 *   LINE_CHANNEL_ACCESS_TOKEN        … LINE 公式アカウントの合鍵
 *   LINE_USER_ID                     … （省略可）送り先。無ければ友だち全員に送る
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ---- 設定を読む -------------------------------------------------------------
function loadDotEnv() {
  try {
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
    const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
    const env = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}
const dot = loadDotEnv();
const SUPABASE_URL = process.env.SUPABASE_URL || dot.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || dot.VITE_SUPABASE_ANON_KEY;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || dot.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID || dot.LINE_USER_ID || '';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const mode = args.find((a) => !a.startsWith('--')) || 'morning';

// ---- 日付（日本時間で考える） --------------------------------------------------
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const pad = (n) => String(n).padStart(2, '0');
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7)); // 月曜始まり
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
const hm = (d) => `${d.getHours()}:${pad(d.getMinutes())}`;
const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;

// ---- データを読む -------------------------------------------------------------
async function fetchTodos() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/todos?select=*&order=created_at.desc`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`タスクを読み込めませんでした（${res.status}）：${await res.text()}`);
  return res.json();
}

/** 売上を数える日：実施日時、無ければ期限 */
const salesDate = (t) => {
  const iso = t.scheduled_at ?? t.due_at;
  return iso ? new Date(iso) : null;
};

function summarize(todos, from, to) {
  const items = todos
    .filter((t) => t.price > 0 && salesDate(t) && salesDate(t) >= from && salesDate(t) < to)
    .sort((a, b) => salesDate(a) - salesDate(b));
  const cats = new Map();
  let done = 0;
  let planned = 0;
  let doneCount = 0;
  for (const t of items) {
    planned += t.price;
    const c = cats.get(t.category || '') ?? { done: 0, planned: 0 };
    c.planned += t.price;
    if (t.completed) {
      done += t.price;
      doneCount++;
      c.done += t.price;
    }
    cats.set(t.category || '', c);
  }
  const byCategory = [...cats.entries()].map(([name, v]) => ({ name: name || '未分類', ...v })).sort((a, b) => b.done - a.done || b.planned - a.planned);
  return { items, done, planned, doneCount, count: items.length, byCategory };
}

const limit = (lines, n) => (lines.length > n ? [...lines.slice(0, n), `　ほか${lines.length - n}件`] : lines);

// ---- 文面を作る -------------------------------------------------------------
function morningText(todos, now) {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const open = todos.filter((t) => !t.completed);
  const inDay = (iso) => iso && new Date(iso) >= today && new Date(iso) < tomorrow;

  const scheduled = open.filter((t) => inDay(t.scheduled_at)).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const dueToday = open.filter((t) => inDay(t.due_at) && !inDay(t.scheduled_at));
  const overdue = open.filter((t) => t.due_at && new Date(t.due_at) < today);
  const anytime = open
    .filter((t) => !t.scheduled_at && !t.recurrence_id && t.due_at && new Date(t.due_at) >= tomorrow)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));

  const price = (t) => (t.price ? ` ${yen(t.price)}` : '');
  const lines = [`おはようございます。${md(today)}のタスクです。`];
  const section = (title, list, fmt) => {
    if (list.length === 0) return;
    lines.push('', `■ ${title}（${list.length}件）`, ...limit(list.map(fmt), 15));
  };
  section('今日の予定', scheduled, (t) => `${hm(new Date(t.scheduled_at))} ${t.title}${price(t)}`);
  section('今日が期限', dueToday, (t) => `・${t.title}${price(t)}`);
  section('期限切れ', overdue, (t) => `・${t.title}（${md(new Date(t.due_at))}まで）`);
  section('期限までに行う', anytime, (t) => `・${t.title}（${md(new Date(t.due_at))}まで）`);
  if (lines.length === 1) lines.push('', '今日のタスクはありません。');

  const s = summarize(todos, today, tomorrow);
  if (s.planned) lines.push('', `今日の売上見込み：${yen(s.planned)}（${s.count}件）`);
  return lines.join('\n');
}

function breakdown(s) {
  if (s.byCategory.length === 0 || (s.byCategory.length === 1 && s.byCategory[0].name === '未分類')) return [];
  return ['', '■ 事業ごと', ...s.byCategory.map((c) => `・${c.name} ${yen(c.done)}${c.planned > c.done ? `（見込み ${yen(c.planned)}）` : ''}`)];
}

function dailyText(todos, day) {
  const from = startOfDay(day);
  const s = summarize(todos, from, addDays(from, 1));
  const lines = [`【本日の売上】${md(from)}`, '', `売上：${yen(s.done)}（${s.doneCount}件）`];
  if (s.planned > s.done) {
    const left = s.items.filter((t) => !t.completed);
    lines.push(`未完了：${yen(s.planned - s.done)}（${left.length}件）`, ...limit(left.map((t) => `・${t.title} ${yen(t.price)}`), 10));
    lines.push('※ 終わっていたら、アプリで「完了」にすると売上に入ります。');
  }
  lines.push(...breakdown(s));
  return lines.join('\n');
}

function weeklyText(todos, day) {
  const from = startOfWeek(day);
  const to = addDays(from, 7);
  const s = summarize(todos, from, to);
  const prev = summarize(todos, addDays(from, -7), from);
  const lines = [`【今週の売上】${md(from)}〜${md(addDays(from, 6))}`, '', `売上：${yen(s.done)}（${s.doneCount}件）`];
  if (prev.done) lines.push(`先週：${yen(prev.done)}（${s.done >= prev.done ? '+' : '−'}${yen(Math.abs(s.done - prev.done))}）`);
  lines.push('', '■ 日ごと');
  for (let d = from; d < to; d = addDays(d, 1)) {
    const one = summarize(s.items, d, addDays(d, 1));
    lines.push(`${md(d)} ${yen(one.done)}`);
  }
  lines.push(...breakdown(s));
  return lines.join('\n');
}

function monthlyText(todos, day) {
  const from = new Date(day.getFullYear(), day.getMonth(), 1);
  const to = new Date(day.getFullYear(), day.getMonth() + 1, 1);
  const s = summarize(todos, from, to);
  const prev = summarize(todos, new Date(day.getFullYear(), day.getMonth() - 1, 1), from);
  const lines = [`【今月の売上】${from.getFullYear()}年${from.getMonth() + 1}月`, '', `売上：${yen(s.done)}（${s.doneCount}件）`];
  if (prev.done) lines.push(`先月：${yen(prev.done)}（${s.done >= prev.done ? '+' : '−'}${yen(Math.abs(s.done - prev.done))}）`);
  // 週ごと（月曜始まり。月をまたぐ週は、その月の日だけ数える）
  lines.push('', '■ 週ごと');
  for (let w = startOfWeek(from); w < to; w = addDays(w, 7)) {
    const a = w < from ? from : w;
    const b = addDays(w, 7) > to ? to : addDays(w, 7);
    const one = summarize(s.items, a, b);
    lines.push(`${a.getMonth() + 1}/${a.getDate()}〜${addDays(b, -1).getMonth() + 1}/${addDays(b, -1).getDate()} ${yen(one.done)}`);
  }
  lines.push(...breakdown(s));
  return lines.join('\n');
}

// ---- LINE に送る -------------------------------------------------------------
async function sendLine(texts) {
  const messages = texts.map((text) => ({ type: 'text', text: text.slice(0, 4900) })).slice(0, 5);
  const url = LINE_USER_ID ? 'https://api.line.me/v2/bot/message/push' : 'https://api.line.me/v2/bot/message/broadcast';
  const body = LINE_USER_ID ? { to: LINE_USER_ID, messages } : { messages };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LINE に送れませんでした（${res.status}）：${await res.text()}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY が設定されていません。');
  if (!dry && !LINE_TOKEN) throw new Error('LINE_CHANNEL_ACCESS_TOKEN が設定されていません。');

  const now = new Date();
  // 夜の報告が遅れて日付をまたいでも（0〜5時）、前の日の分として報告する
  const reportDay = now.getHours() < 6 && mode === 'evening' ? addDays(startOfDay(now), -1) : now;
  const todos = await fetchTodos();

  const texts = [];
  if (mode === 'morning') texts.push(morningText(todos, now));
  if (mode === 'evening' || mode === 'daily') texts.push(dailyText(todos, reportDay));
  // 日曜の夜は今週の分、月末の夜は今月の分も送る
  if ((mode === 'evening' && reportDay.getDay() === 0) || mode === 'weekly') texts.push(weeklyText(todos, reportDay));
  if ((mode === 'evening' && addDays(reportDay, 1).getDate() === 1) || mode === 'monthly') texts.push(monthlyText(todos, reportDay));
  if (texts.length === 0) throw new Error(`使い方：morning / evening / daily / weekly / monthly のどれかを付けてください（今：${mode}）`);

  if (dry) {
    console.log(texts.join('\n\n────────\n\n'));
    return;
  }
  await sendLine(texts);
  console.log(`${now.toLocaleString('ja-JP')} に ${texts.length}通 送りました（${mode}）`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
