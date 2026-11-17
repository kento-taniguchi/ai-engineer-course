// 営業先リスト（画面）
// 画面：#/ 一覧 ／ #/p/:id 候補詳細 ／ #/p/:id/edit 編集 ／ #/new 候補追加
const DAILY_GOAL = 30;
const view = document.getElementById('view');

let meta = null;
let items = [];
const ui = loadUi();
const selected = new Set();

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDate = (s) => (s ? s.replaceAll('-', '/') : '');
const fmtDateTime = (iso) => {
  const d = new Date(iso);
  return `${localDate(d).replaceAll('-', '/')} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const UNKNOWN = '<span class="unknown">公開情報では未確認</span>';

function loadUi() {
  const base = { tab: 'today', sort: 'priority', municipality: '', industry: '', clue: '', contact: '' };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem('prospects-ui') || '{}') };
  } catch {
    return base;
  }
}
function saveUi() {
  try {
    localStorage.setItem('prospects-ui', JSON.stringify(ui));
  } catch {
    /* 保存できなくても動作は続ける */
  }
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '保存に失敗しました。もう一度お試しください。');
  return data;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}

function replaceItem(p) {
  const i = items.findIndex((x) => x.id === p.id);
  if (i >= 0) items[i] = p;
  else items.unshift(p);
}

// ---------------------------------------------------------------------------
// 判定
// ---------------------------------------------------------------------------
const hasContact = (p) => p.contacts.length > 0;
const doneToday = (p) => (p.activities || []).some((a) => localDate(new Date(a.at)) === localDate());
const isWaiting = (p) => !p.archived && (!hasContact(p) || p.needsReview);

/** 優先度：分かっている項目だけの平均（不明は0点にしない） */
function priorityOf(p) {
  const known = Object.values(p.scores).filter((s) => s.value !== null);
  if (!known.length) return { value: null, known: 0 };
  const avg = known.reduce((a, s) => a + s.value, 0) / known.length;
  return { value: Math.round(avg * 10) / 10, known: known.length };
}

function approachesToday() {
  return items.reduce((n, p) => n + (p.activities || []).filter((a) => localDate(new Date(a.at)) === localDate()).length, 0);
}

function tabItems(tab) {
  const t = localDate();
  const active = items.filter((p) => !p.archived);
  switch (tab) {
    case 'today':
      return active.filter(
        (p) =>
          !isWaiting(p) &&
          (p.status === '未着手' || doneToday(p) || (p.nextActionDate && p.nextActionDate <= t && !['アポ獲得', '見送り'].includes(p.status))),
      );
    case 'waiting':
      return active.filter(isWaiting);
    case 'follow':
      return active.filter((p) => p.nextActionDate && !['見送り'].includes(p.status));
    case 'archived':
      return items.filter((p) => p.archived);
    default:
      return active;
  }
}

function filtered() {
  const kw = ui.industry.trim().toLowerCase();
  let list = tabItems(ui.tab).filter(
    (p) =>
      (!ui.municipality || p.municipality === ui.municipality) &&
      (!kw || `${p.industry} ${p.name}`.toLowerCase().includes(kw)) &&
      (!ui.clue || p.clues.includes(ui.clue)) &&
      (!ui.contact || (ui.contact === 'yes') === hasContact(p)),
  );
  const byPriority = (a, b) => (priorityOf(b).value ?? -1) - (priorityOf(a).value ?? -1) || priorityOf(b).known - priorityOf(a).known;
  if (ui.tab === 'follow') list.sort((a, b) => a.nextActionDate.localeCompare(b.nextActionDate));
  else if (ui.sort === 'new') list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else list.sort(byPriority);
  if (ui.tab === 'today') {
    // 未対応を先に、本日対応済みを後に並べ、最大30件
    list = [...list.filter((p) => !doneToday(p)), ...list.filter(doneToday)].slice(0, DAILY_GOAL);
  }
  return list;
}

// ---------------------------------------------------------------------------
// 一覧画面
// ---------------------------------------------------------------------------
function contactLinks(p, { compact = false } = {}) {
  if (!hasContact(p)) return UNKNOWN;
  return p.contacts
    .map((c) => {
      const label = meta.contactTypes[c.type];
      let href = '';
      if (c.type === 'phone') href = `tel:${c.value.replace(/[^\d+]/g, '')}`;
      else if (c.type === 'email') href = `mailto:${c.value}`;
      else href = safeUrl(c.value);
      const ext = c.type === 'form' || c.type === 'sns' ? ' target="_blank" rel="noopener noreferrer"' : '';
      const text = compact ? (c.type === 'phone' ? `電話 ${c.value}` : label) : c.value;
      return href ? `<a href="${esc(href)}"${ext}>${esc(text)}</a>` : `<span>${esc(text)}</span>`;
    })
    .join('');
}

function priorityHtml(p) {
  const pr = priorityOf(p);
  const reasons = Object.entries(p.scores)
    .map(([k, s]) => `${meta.scoreKeys[k]} ${s.value ?? '不明'}`)
    .join('、');
  const firstReason = Object.values(p.scores).find((s) => s.reason && s.value !== null)?.reason;
  return `<div class="priority"><strong>${pr.value ?? '不明'}</strong><span class="note">${pr.known}/4項目で評価</span></div>
    <p class="priority-reason">${esc(reasons)}${firstReason ? `。${esc(firstReason)}` : ''}</p>`;
}

function statusControls(p) {
  return `<div class="state">
    <label class="sr-only" for="st-${p.id}">営業状況</label>
    <select id="st-${p.id}" data-act="status" data-id="${p.id}">
      ${meta.statuses.map((s) => `<option${s === p.status ? ' selected' : ''}>${esc(s)}</option>`).join('')}
    </select>
    <label class="note" for="nd-${p.id}">次回対応日</label>
    <input id="nd-${p.id}" type="date" value="${esc(p.nextActionDate)}" data-act="next" data-id="${p.id}" />
  </div>`;
}

function rowHtml(p) {
  const clueTags = p.clues.map((k) => `<span class="tag">${esc(meta.clues[k])}</span>`).join('');
  const done = doneToday(p) ? '<span class="tag tag-gold">本日対応済み</span>' : '';
  const review = p.needsReview ? '<span class="tag tag-gold">要確認</span>' : '';
  return `<div class="row${selected.has(p.id) ? ' is-selected' : ''}">
    <div class="check"><input type="checkbox" aria-label="${esc(p.name)}を選択" data-act="select" data-id="${p.id}"${selected.has(p.id) ? ' checked' : ''} /></div>
    <div>
      <p class="company-name"><a href="#/p/${p.id}">${esc(p.name)}</a></p>
      <p class="company-meta">${esc([p.municipality, p.industry].filter(Boolean).join('　')) || '所在地は公開情報では未確認'}</p>
      ${done || review ? `<div class="tags" style="margin-top:8px">${done}${review}</div>` : ''}
    </div>
    <div>
      <span class="cell-label">業務の手がかりと提案仮説</span>
      <div class="tags">${clueTags || '<span class="unknown">手がかり未登録</span>'}</div>
      <p class="summary">${p.hypotheses[0] ? `仮説：${esc(p.hypotheses[0])}` : '<span class="unknown">提案仮説は未登録</span>'}</p>
    </div>
    <div><span class="cell-label">優先度</span>${priorityHtml(p)}</div>
    <div><span class="cell-label">連絡方法</span><div class="contact-links">${contactLinks(p, { compact: true })}</div></div>
    <div><span class="cell-label">営業状況</span>${statusControls(p)}</div>
  </div>`;
}

function renderList() {
  const list = filtered();
  const counts = Object.fromEntries(['today', 'waiting', 'follow', 'all', 'archived'].map((t) => [t, tabItems(t).length]));
  counts.today = Math.min(counts.today, DAILY_GOAL);
  const tabs = [
    ['today', '今日の候補'],
    ['waiting', '確認待ち'],
    ['follow', 'フォロー予定'],
    ['all', 'すべて'],
    ['archived', 'アーカイブ'],
  ];
  const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const selCount = [...selected].filter((id) => items.some((p) => p.id === id)).length;

  view.innerHTML = `
    <header class="topbar">
      <h1>営業先</h1>
      <div class="topbar-right">
        <p class="today-count">今日のアプローチ数 <strong>${approachesToday()}</strong> / ${DAILY_GOAL}</p>
        <a class="btn btn-primary" href="#/new">候補を追加</a>
      </div>
    </header>

    <section class="filters" aria-label="絞り込み">
      <label class="field"><span>地域</span>
        <select data-filter="municipality">${opt('', '福井県内すべて', ui.municipality)}${meta.municipalities.map((m) => opt(m, m, ui.municipality)).join('')}</select>
      </label>
      <label class="field"><span>業種</span>
        <input type="search" data-filter="industry" value="${esc(ui.industry)}" placeholder="例：建設、食品" />
      </label>
      <label class="field"><span>業務の手がかり</span>
        <select data-filter="clue">${opt('', 'すべて', ui.clue)}${Object.entries(meta.clues).map(([k, v]) => opt(k, v, ui.clue)).join('')}</select>
      </label>
      <label class="field"><span>連絡先</span>
        <select data-filter="contact">${opt('', 'すべて', ui.contact)}${opt('yes', '確認済み', ui.contact)}${opt('no', '未確認', ui.contact)}</select>
      </label>
    </section>

    <nav class="tabs" role="tablist" aria-label="表示の切り替え">
      ${tabs.map(([k, l]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l} <span class="count">${counts[k]}</span></button>`).join('')}
    </nav>

    <div class="listbar">
      <div class="listbar-left">
        <p class="muted">${list.length}件を表示${ui.tab === 'today' ? `（連絡先を確認できた候補から最大${DAILY_GOAL}件）` : ''}</p>
        ${
          ui.tab === 'follow'
            ? '<p class="note">次回対応日が近い順</p>'
            : `<label class="sr-only" for="sort">並び順</label><select id="sort" data-act="sort">${opt('priority', '優先度順', ui.sort)}${opt('new', '新着順', ui.sort)}</select>`
        }
      </div>
      <div class="listbar-right">
        ${selCount ? '<button class="btn-text" data-act="clear-selection">選択を解除</button>' : ''}
        <button class="btn-text" data-act="select-all">表示中をすべて選択</button>
        <button class="btn btn-plain" data-act="csv">${selCount ? `選択した${selCount}件をCSV出力` : '表示中の一覧をCSV出力'}</button>
      </div>
    </div>

    <div class="rows" role="list">
      <div class="row-head" aria-hidden="true"><span></span><span>企業名・所在地</span><span>業務の手がかり・提案仮説</span><span>優先度と評価理由</span><span>連絡方法</span><span>営業状況・次回対応日</span></div>
      ${list.length ? list.map(rowHtml).join('') : `<p class="empty">${emptyMessage()}</p>`}
    </div>`;
}

function emptyMessage() {
  if (ui.tab === 'today') return '今日連絡できる候補はありません。確認待ちの候補の連絡先を調べるか、候補を追加してください。';
  if (ui.tab === 'waiting') return '確認待ちの候補はありません。';
  if (ui.tab === 'follow') return '次回対応日が設定された候補はありません。';
  return '該当する候補はありません。';
}

view.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.filter) {
    ui[el.dataset.filter] = el.value;
    saveUi();
    selected.clear(); // 表示が変わったら選択を解除（見えていない候補をCSV出力しないため）
    return renderList();
  }
  const act = el.dataset.act;
  if (act === 'sort') {
    ui.sort = el.value;
    saveUi();
    return renderList();
  }
  if (act === 'select') {
    el.checked ? selected.add(el.dataset.id) : selected.delete(el.dataset.id);
    return renderList();
  }
  if (act === 'status' || act === 'next') {
    const body = act === 'status' ? { status: el.value } : { nextActionDate: el.value };
    try {
      replaceItem(await api('PATCH', `/api/prospects/${el.dataset.id}`, body));
      toast(act === 'status' ? `営業状況を「${el.value}」にしました` : '次回対応日を保存しました');
      if (location.hash.startsWith('#/p/')) renderDetail(el.dataset.id);
    } catch (err) {
      toast(err.message);
    }
  }
});

view.addEventListener('input', (e) => {
  if (e.target.dataset.filter === 'industry') {
    ui.industry = e.target.value;
    saveUi();
    selected.clear();
    clearTimeout(renderList.t);
    renderList.t = setTimeout(() => {
      renderList();
      const box = view.querySelector('[data-filter="industry"]');
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    }, 300);
  }
});

view.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-tab],[data-act]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  if (el.dataset.tab) {
    ui.tab = el.dataset.tab;
    saveUi();
    selected.clear();
    return renderList();
  }
  const act = el.dataset.act;
  if (act === 'clear-selection') {
    selected.clear();
    return renderList();
  }
  if (act === 'select-all') {
    filtered().forEach((p) => selected.add(p.id));
    return renderList();
  }
  if (act === 'csv') return exportCsv();
  const id = el.dataset.id;
  if (act === 'archive' || act === 'unarchive') {
    replaceItem(await api('PATCH', `/api/prospects/${id}`, { archived: act === 'archive' }));
    toast(act === 'archive' ? 'アーカイブしました' : 'アーカイブから戻しました');
    return renderDetail(id);
  }
  if (act === 'to-waiting' || act === 'resolve-review') {
    replaceItem(await api('PATCH', `/api/prospects/${id}`, { needsReview: act === 'to-waiting' }));
    toast(act === 'to-waiting' ? '確認待ちにしました' : '確認済みにしました');
    return renderDetail(id);
  }
});

// ---------------------------------------------------------------------------
// CSV出力（Excelで文字化けしないようBOM付き）
// ---------------------------------------------------------------------------
function exportCsv() {
  const ids = [...selected].filter((id) => items.some((p) => p.id === id));
  const rows = ids.length ? items.filter((p) => ids.includes(p.id)) : filtered();
  if (!rows.length) return toast('出力する候補がありません');
  const contact = (p, type) => p.contacts.filter((c) => c.type === type).map((c) => c.value).join(' / ');
  const head = ['企業名', '市町', '所在地', '業種', '法人番号', '優先度', ...Object.values(meta.scoreKeys), '業務の手がかり', '提案仮説', '電話', '代表メール', '問い合わせフォーム', '公式SNS', '公式サイト', '営業状況', '次回対応日', '最終接触日', '最終接触結果', '取得日', '最終確認日'];
  const lines = rows.map((p) => {
    const last = (p.activities || [])[0];
    return [
      p.name, p.municipality, p.address, p.industry, p.corporateNumber, priorityOf(p).value ?? '不明',
      ...Object.keys(meta.scoreKeys).map((k) => p.scores[k].value ?? '不明'),
      p.clues.map((k) => meta.clues[k]).join(' / '), p.hypotheses.join(' / '),
      contact(p, 'phone'), contact(p, 'email'), contact(p, 'form'), contact(p, 'sns'), p.links.website,
      p.status, p.nextActionDate, last ? fmtDateTime(last.at) : '', last ? last.result : '', p.acquiredAt, p.verifiedAt,
    ];
  });
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // 表計算ソフトでの数式実行を防ぐ
    return `"${s.replaceAll('"', '""')}"`;
  };
  const csv = '﻿' + [head, ...lines].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `営業先_${localDate()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`${rows.length}件をCSV出力しました`);
}

// ---------------------------------------------------------------------------
// 候補詳細画面
// ---------------------------------------------------------------------------
function srcHtml(sourceUrl, checkedAt) {
  const u = safeUrl(sourceUrl);
  return `<p class="item-src">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">出典を開く</a><span>${esc(u)}</span>` : '<span>出典未記録</span>'}<span>確認日 ${esc(fmtDate(checkedAt)) || '未記録'}</span></p>`;
}

function linkOrUnknown(u, label) {
  const s = safeUrl(u);
  return s ? `<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(label)}を開く</a>` : UNKNOWN;
}

function renderDetail(id) {
  const p = items.find((x) => x.id === id);
  if (!p) {
    view.innerHTML = '<a class="back" href="#/">一覧へ戻る</a><p class="empty">候補が見つかりません。</p>';
    return;
  }
  const pr = priorityOf(p);
  const now = new Date();
  const nowLocal = `${localDate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const opts = (arr, cur) => arr.map((s) => `<option${s === cur ? ' selected' : ''}>${esc(s)}</option>`).join('');

  view.innerHTML = `
  <a class="back" href="#/">一覧へ戻る</a>
  <article class="detail">
    <header class="detail-head">
      <h1>${esc(p.name)}</h1>
      <div class="head-meta">
        <span>${esc([p.municipality, p.address].filter(Boolean).join('　')) || '所在地は公開情報では未確認'}</span>
        <span>業種 <strong>${esc(p.industry) || '未確認'}</strong></span>
        <span>優先度 <strong class="gold">${pr.value ?? '不明'}</strong>（${pr.known}/4項目で評価）</span>
        <span>営業状況 <strong>${esc(p.status)}</strong></span>
        <span>次回対応日 <strong>${esc(fmtDate(p.nextActionDate)) || '未設定'}</strong></span>
      </div>
      <p class="note" style="margin-top:8px">取得日 ${esc(fmtDate(p.acquiredAt))}　最終確認日 ${esc(fmtDate(p.verifiedAt))}</p>
      ${
        p.needsReview
          ? `<div class="review-note"><p>確認待ち：${esc(p.reviewNote)}</p>
              ${p.duplicates.length ? `<p>重複の可能性がある候補：${p.duplicates.map((d) => `<a href="#/p/${d.id}">${esc(d.name)}</a>（${esc(d.reasons.join('・'))}）`).join('、')}</p>` : ''}
              <div class="head-actions"><button class="btn btn-plain" data-act="resolve-review" data-id="${p.id}">確認済みにする（別企業として扱う）</button></div></div>`
          : !hasContact(p)
            ? '<div class="review-note"><p>確認待ち：公式の連絡先がまだ確認できていません。</p></div>'
            : ''
      }
      <div class="head-actions">
        <a class="btn btn-primary" href="#/p/${p.id}/edit">編集</a>
        ${p.needsReview ? '' : `<button class="btn btn-plain" data-act="to-waiting" data-id="${p.id}">確認待ちにする</button>`}
        <button class="btn btn-plain" data-act="${p.archived ? 'unarchive' : 'archive'}" data-id="${p.id}">${p.archived ? 'アーカイブから戻す' : 'アーカイブ'}</button>
      </div>
    </header>

    <section class="section">
      <h2>公式連絡先</h2>
      ${
        hasContact(p)
          ? `<div class="items">${p.contacts
              .map(
                (c) => `<div class="contact-item"><span class="muted">${esc(meta.contactTypes[c.type])}</span>
                  <div><p class="value">${contactLinks({ contacts: [c] })}</p>${srcHtml(c.sourceUrl, c.checkedAt)}</div></div>`,
              )
              .join('')}</div>`
          : `<p>${UNKNOWN}</p>`
      }
    </section>

    <section class="section">
      <h2>営業結果の記録</h2>
      <form id="activity-form" class="form-grid" data-id="${p.id}">
        <label class="field"><span>接触日時</span><input type="datetime-local" name="at" value="${nowLocal}" required /></label>
        <label class="field"><span>方法</span><select name="method">${opts(meta.methods, p.contacts[0]?.type === 'phone' ? '電話' : '')}</select></label>
        <label class="field"><span>結果</span><select name="result" required><option value="" selected>選んでください</option>${opts(meta.results)}</select></label>
        <label class="field"><span>営業状況</span><select name="status">${opts(meta.statuses, p.status === '未着手' ? '連絡済み' : p.status)}</select></label>
        <label class="field"><span>次回対応日</span><input type="date" name="nextActionDate" value="${esc(p.nextActionDate)}" /></label>
        <label class="field wide"><span>メモ</span><textarea name="note" placeholder="話した相手、聞けたこと、次にすること"></textarea></label>
        <div class="wide"><button class="btn btn-primary" type="submit">記録する</button></div>
      </form>
    </section>

    <section class="section">
      <h2>企業情報</h2>
      <dl class="kv">
        <dt>公式サイト</dt><dd>${linkOrUnknown(p.links.website, '公式サイト')}</dd>
        <dt>Googleマップ</dt><dd>${linkOrUnknown(p.links.googleMaps, 'Googleマップ')}</dd>
        <dt>法人情報</dt><dd>${linkOrUnknown(p.links.gbiz, 'Gビズインフォ')}${p.corporateNumber ? `<span class="note">　法人番号 ${esc(p.corporateNumber)}</span>` : ''}</dd>
        <dt>業務の手がかり</dt><dd>${p.clues.length ? `<div class="tags">${p.clues.map((k) => `<span class="tag">${esc(meta.clues[k])}</span>`).join('')}</div>` : UNKNOWN}</dd>
      </dl>
    </section>

    <section class="section">
      <h2>確認できたこと<span class="note">公開ページに記載された事実</span></h2>
      ${p.facts.length ? `<ul class="items">${p.facts.map((f) => `<li><p>${esc(f.text)}</p>${srcHtml(f.sourceUrl, f.checkedAt)}</li>`).join('')}</ul>` : `<p>${UNKNOWN}</p>`}
    </section>

    <section class="section">
      <h2>提案の仮説<span class="note">事実から考えた可能性。先方には未確認</span></h2>
      ${p.hypotheses.length ? `<ul class="items">${p.hypotheses.map((h) => `<li><span class="tag tag-gold">仮説</span> ${esc(h)}</li>`).join('')}</ul>` : '<p class="unknown">提案仮説は未登録</p>'}
    </section>

    <section class="section">
      <h2>商談で確認したいこと<span class="note">未確認事項。最大3件</span></h2>
      ${p.questions.length ? `<ol class="items">${p.questions.map((q, i) => `<li>${i + 1}. ${esc(q)}</li>`).join('')}</ol>` : '<p class="unknown">未登録</p>'}
    </section>

    <section class="section">
      <h2>優先度の評価<span class="note">仮評価。編集から修正できます</span></h2>
      <div class="score-grid">
        ${Object.entries(meta.scoreKeys)
          .map(([k, label]) => `<div class="score-row"><span class="muted">${esc(label)}</span><span class="val">${p.scores[k].value ?? '不明'}</span><span>${esc(p.scores[k].reason) || '<span class="unknown">理由未記入</span>'}</span></div>`)
          .join('')}
      </div>
    </section>

    <section class="section">
      <h2>営業履歴</h2>
      ${
        p.activities?.length
          ? `<ul class="history">${p.activities
              .map(
                (a) => `<li><span class="muted">${esc(fmtDateTime(a.at))}</span>
                <div><p><strong>${esc(a.method)}</strong>　${esc(a.result)}${a.nextActionDate ? `<span class="note">　次回 ${esc(fmtDate(a.nextActionDate))}</span>` : ''}</p>${a.note ? `<p class="muted">${esc(a.note)}</p>` : ''}</div></li>`,
              )
              .join('')}</ul>`
          : '<p class="unknown">まだ接触していません</p>'
      }
    </section>

    ${p.memo ? `<section class="section"><h2>メモ</h2><p>${esc(p.memo)}</p></section>` : ''}
  </article>`;

  document.getElementById('activity-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    fd.at = new Date(fd.at).toISOString();
    try {
      replaceItem(await api('POST', `/api/prospects/${p.id}/activities`, fd));
      toast(`記録しました。今日のアプローチ数 ${approachesToday()} / ${DAILY_GOAL}`);
      renderDetail(p.id);
    } catch (err) {
      toast(err.message);
    }
  });
}

// ---------------------------------------------------------------------------
// 追加・編集画面
// ---------------------------------------------------------------------------
const blankProspect = () => ({
  name: '', municipality: '', address: '', industry: '', corporateNumber: '',
  links: { website: '', googleMaps: '', gbiz: '' },
  contacts: [], facts: [], clues: [], hypotheses: [], questions: [],
  scores: { fit: { value: null, reason: '' }, needs: { value: null, reason: '' }, feasibility: { value: null, reason: '' }, reach: { value: null, reason: '' } },
  status: '未着手', nextActionDate: '', acquiredAt: localDate(), verifiedAt: localDate(), memo: '',
});

const contactLine = (c = {}) => `<div class="repeat-line contact" data-row="contact">
  <label class="field"><span>種類</span><select name="type">${Object.entries(meta.contactTypes).map(([k, v]) => `<option value="${k}"${k === c.type ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
  <label class="field"><span>電話番号・メール・URL</span><input name="value" value="${esc(c.value)}" /></label>
  <label class="field"><span>出典URL（必須）</span><input name="sourceUrl" type="url" value="${esc(c.sourceUrl)}" placeholder="https://" /></label>
  <label class="field"><span>確認日</span><input name="checkedAt" type="date" value="${esc(c.checkedAt || localDate())}" /></label>
  <button type="button" class="btn-text" data-remove>削除</button></div>`;
const factLine = (f = {}) => `<div class="repeat-line" data-row="fact">
  <label class="field"><span>公開ページに書かれている事実</span><input name="text" value="${esc(f.text)}" /></label>
  <label class="field"><span>出典URL（必須）</span><input name="sourceUrl" type="url" value="${esc(f.sourceUrl)}" placeholder="https://" /></label>
  <label class="field"><span>確認日</span><input name="checkedAt" type="date" value="${esc(f.checkedAt || localDate())}" /></label>
  <button type="button" class="btn-text" data-remove>削除</button></div>`;
const singleLine = (kind, label, v = '') => `<div class="repeat-line single" data-row="${kind}">
  <label class="field"><span>${label}</span><input name="text" value="${esc(v)}" /></label>
  <button type="button" class="btn-text" data-remove>削除</button></div>`;

function renderForm(id) {
  const p = id ? items.find((x) => x.id === id) : blankProspect();
  if (!p) return renderDetail(id);
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  view.innerHTML = `
  <a class="back" href="${id ? `#/p/${id}` : '#/'}">${id ? '候補詳細へ戻る' : '一覧へ戻る'}</a>
  <form id="prospect-form" class="detail" novalidate>
    <header class="detail-head"><h1>${id ? '候補を編集' : '候補を追加'}</h1>
      <p class="muted" style="margin-top:16px">公開ページで確認できた内容だけを「確認できたこと」と「連絡先」に入れます。推測は「提案の仮説」、分からないことは「商談で確認したいこと」に入れてください。</p></header>

    <section class="section"><h2>企業情報</h2><div class="form-grid">
      <label class="field wide"><span>企業名（必須）</span><input name="name" value="${esc(p.name)}" required /></label>
      <label class="field"><span>市町</span><select name="municipality">${opt('', '未選択', p.municipality)}${meta.municipalities.map((m) => opt(m, m, p.municipality)).join('')}</select></label>
      <label class="field"><span>所在地</span><input name="address" value="${esc(p.address)}" /></label>
      <label class="field"><span>業種</span><input name="industry" value="${esc(p.industry)}" placeholder="例：建設業（リフォーム）" /></label>
      <label class="field"><span>法人番号（13桁）</span><input name="corporateNumber" inputmode="numeric" value="${esc(p.corporateNumber)}" /></label>
      <label class="field"><span>公式サイト</span><input name="website" type="url" value="${esc(p.links.website)}" placeholder="https://" /></label>
      <label class="field"><span>GoogleマップのURL</span><input name="googleMaps" type="url" value="${esc(p.links.googleMaps)}" placeholder="https://" /></label>
      <label class="field"><span>GビズインフォのURL</span><input name="gbiz" type="url" value="${esc(p.links.gbiz)}" placeholder="https://" /></label>
      <label class="field"><span>情報の取得日</span><input name="acquiredAt" type="date" value="${esc(p.acquiredAt)}" /></label>
      <label class="field"><span>最終確認日</span><input name="verifiedAt" type="date" value="${esc(p.verifiedAt)}" /></label>
    </div></section>

    <section class="section"><h2>公式連絡先</h2>
      <div class="repeat" id="contacts">${p.contacts.map(contactLine).join('')}</div>
      <button type="button" class="btn btn-plain" data-add="contact" style="margin-top:16px">連絡先を追加</button></section>

    <section class="section"><h2>業務の手がかり</h2><div class="checks">
      ${Object.entries(meta.clues).map(([k, v]) => `<label><input type="checkbox" name="clue" value="${k}"${p.clues.includes(k) ? ' checked' : ''} />${esc(v)}</label>`).join('')}
    </div></section>

    <section class="section"><h2>確認できたこと</h2>
      <div class="repeat" id="facts">${p.facts.map(factLine).join('')}</div>
      <button type="button" class="btn btn-plain" data-add="fact" style="margin-top:16px">事実を追加</button></section>

    <section class="section"><h2>提案の仮説</h2>
      <div class="repeat" id="hypotheses">${p.hypotheses.map((h) => singleLine('hypothesis', '仮説', h)).join('')}</div>
      <button type="button" class="btn btn-plain" data-add="hypothesis" style="margin-top:16px">仮説を追加</button></section>

    <section class="section"><h2>商談で確認したいこと<span class="note">最大3件</span></h2>
      <div class="repeat" id="questions">${p.questions.map((q) => singleLine('question', '質問', q)).join('')}</div>
      <button type="button" class="btn btn-plain" data-add="question" style="margin-top:16px">質問を追加</button></section>

    <section class="section"><h2>優先度の仮評価<span class="note">0〜5点。分からない項目は「不明」のままにします</span></h2><div class="repeat">
      ${Object.entries(meta.scoreKeys)
        .map(
          ([k, label]) => `<div class="repeat-line score" data-score="${k}"><span>${esc(label)}</span>
          <label class="field"><span class="sr-only">点数</span><select name="value">${opt('', '不明', p.scores[k].value === null ? '' : 'x')}${[0, 1, 2, 3, 4, 5].map((n) => opt(String(n), `${n}点`, String(p.scores[k].value))).join('')}</select></label>
          <label class="field"><span class="sr-only">評価理由</span><input name="reason" value="${esc(p.scores[k].reason)}" placeholder="評価の理由" /></label></div>`,
        )
        .join('')}
    </div></section>

    <section class="section"><h2>メモ</h2><textarea name="memo">${esc(p.memo)}</textarea></section>

    <div id="form-error"></div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">保存する</button><a class="btn btn-plain" href="${id ? `#/p/${id}` : '#/'}">キャンセル</a></div>
  </form>`;

  const form = document.getElementById('prospect-form');
  form.addEventListener('click', (e) => {
    if (e.target.matches('[data-remove]')) e.target.closest('[data-row]').remove();
    const add = e.target.dataset.add;
    if (!add) return;
    const html = { contact: contactLine(), fact: factLine(), hypothesis: singleLine('hypothesis', '仮説'), question: singleLine('question', '質問') }[add];
    const box = { contact: 'contacts', fact: 'facts', hypothesis: 'hypotheses', question: 'questions' }[add];
    const target = document.getElementById(box);
    if (add === 'question' && target.children.length >= 3) return toast('商談で確認したいことは最大3件です');
    target.insertAdjacentHTML('beforeend', html);
    target.lastElementChild.querySelector('input').focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements;
    const rows = (kind) => [...form.querySelectorAll(`[data-row="${kind}"]`)].map((r) => Object.fromEntries([...r.querySelectorAll('[name]')].map((i) => [i.name, i.value])));
    const body = {
      name: f.name.value, municipality: f.municipality.value, address: f.address.value, industry: f.industry.value, corporateNumber: f.corporateNumber.value,
      links: { website: f.website.value, googleMaps: f.googleMaps.value, gbiz: f.gbiz.value },
      acquiredAt: f.acquiredAt.value, verifiedAt: f.verifiedAt.value, memo: f.memo.value,
      contacts: rows('contact').filter((c) => c.value.trim()),
      facts: rows('fact').filter((x) => x.text.trim()),
      hypotheses: rows('hypothesis').map((x) => x.text),
      questions: rows('question').map((x) => x.text),
      clues: [...form.querySelectorAll('input[name="clue"]:checked')].map((i) => i.value),
      scores: Object.fromEntries([...form.querySelectorAll('[data-score]')].map((r) => [r.dataset.score, { value: r.querySelector('[name=value]').value, reason: r.querySelector('[name=reason]').value }])),
      status: p.status, nextActionDate: p.nextActionDate,
    };
    try {
      const saved = id ? await api('PATCH', `/api/prospects/${id}`, body) : await api('POST', '/api/prospects', body);
      replaceItem(saved);
      toast(saved.needsReview && !id ? '保存しました。重複の可能性があるため確認待ちにしました' : '保存しました');
      location.hash = `#/p/${saved.id}`;
    } catch (err) {
      document.getElementById('form-error').innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  });
}

// ---------------------------------------------------------------------------
// 画面の切り替え
// ---------------------------------------------------------------------------
function route() {
  const h = location.hash || '#/';
  let m;
  if (h === '#/new') renderForm(null);
  else if ((m = h.match(/^#\/p\/([\w-]+)\/edit$/))) renderForm(m[1]);
  else if ((m = h.match(/^#\/p\/([\w-]+)$/))) renderDetail(m[1]);
  else renderList();
  if (h.startsWith('#/p/') || h === '#/new') selected.clear(); // 一覧を離れたら選択を解除
  document.title = h.startsWith('#/p/') ? `${items.find((x) => h.includes(x.id))?.name || '候補詳細'}｜営業先` : '営業先';
  window.scrollTo(0, 0);
}

async function start() {
  try {
    [meta, items] = await Promise.all([api('GET', '/api/prospects/meta'), api('GET', '/api/prospects')]);
  } catch {
    view.innerHTML = '<p class="empty">データを読み込めませんでした。サーバーが起動しているか確認してください。</p>';
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}
start();
