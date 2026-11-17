// 営業先候補（新規営業リスト）の保存とAPI。
// - データは data/prospects.json に保存する（PC内保存。data/ は .gitignore 済み）
// - 公開情報を「確認できた事実（出典URL・確認日つき）」「提案仮説」「未確認事項」に分けて持つ
// - 外部への自動送信・自動収集は行わない
import express from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// 福井県内の市町（17市町）
export const MUNICIPALITIES = [
  '福井市', '敦賀市', '小浜市', '大野市', '勝山市', '鯖江市', 'あわら市', '越前市', '坂井市',
  '永平寺町', '池田町', '南越前町', '越前町', '美浜町', '高浜町', 'おおい町', '若狭町',
];

// 業種を問わず探す「業務の手がかり」
export const CLUES = {
  documents: '見積・請求・報告・記録を繰り返し扱う',
  handoff: '問い合わせ・依頼・進捗を複数人で引き継ぐ',
  hiring: '採用情報に事務・管理・営業支援・現場報告',
  multisite: '複数の店舗・拠点・現場・サービス',
  recurring: '申込・点検・顧客対応など定期業務',
};

export const STATUSES = ['未着手', '連絡済み', 'フォロー中', 'アポ獲得', '見送り'];
export const CONTACT_TYPES = { phone: '電話', email: '代表メール', form: '問い合わせフォーム', sns: '公式SNS' };
export const METHODS = ['電話', 'メール', '問い合わせフォーム', '公式SNS', '訪問', 'その他'];
export const RESULTS = ['担当者と話せた', '不在・つながらず', '送信済み・返信待ち', '興味あり', 'アポ獲得', '断り', 'その他'];
export const SCORE_KEYS = {
  fit: '業務改善との相性',
  needs: 'ニーズの手がかり',
  feasibility: '提案の実現性',
  reach: '連絡可能性',
};

// ---------------------------------------------------------------------------
// 入力の整形（不正な値・危険なURLを保存しない）
// ---------------------------------------------------------------------------
const text = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const date = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
function url(v) {
  const s = text(v, 1000);
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}
const list = (v, max = 50) => (Array.isArray(v) ? v.slice(0, max) : []);

export class InputError extends Error {}

function normalizeContact(c) {
  const type = Object.hasOwn(CONTACT_TYPES, c?.type) ? c.type : null;
  if (!type) return null;
  let value = text(c.value, 300);
  if (type === 'phone') value = value.replace(/[^\d\-+() ]/g, '');
  if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) value = '';
  if (type === 'form' || type === 'sns') value = url(value);
  if (!value) return null;
  const sourceUrl = url(c.sourceUrl);
  if (!sourceUrl) throw new InputError(`連絡先「${value}」の出典URLを入力してください（公開ページで確認できた連絡先だけを登録します）。`);
  return { type, value, sourceUrl, checkedAt: date(c.checkedAt) || today() };
}

function normalizeFact(f) {
  const body = text(f?.text, 500);
  if (!body) return null;
  const sourceUrl = url(f.sourceUrl);
  if (!sourceUrl) throw new InputError(`「${body.slice(0, 20)}…」の出典URLを入力してください。出典がない内容は「提案仮説」か「未確認事項」に入れてください。`);
  return { text: body, sourceUrl, checkedAt: date(f.checkedAt) || today() };
}

function normalizeScores(s) {
  const out = {};
  for (const key of Object.keys(SCORE_KEYS)) {
    const raw = s?.[key]?.value;
    const n = raw === '' || raw === null || raw === undefined ? null : Number(raw);
    out[key] = {
      value: Number.isInteger(n) && n >= 0 && n <= 5 ? n : null, // null = 不明
      reason: text(s?.[key]?.reason, 300),
    };
  }
  return out;
}

export function normalizeProspect(input) {
  const name = text(input?.name, 120);
  if (!name) throw new InputError('企業名を入力してください。');
  return {
    name,
    municipality: MUNICIPALITIES.includes(input.municipality) ? input.municipality : '',
    address: text(input.address, 200),
    industry: text(input.industry, 100),
    corporateNumber: text(input.corporateNumber, 13).replace(/\D/g, ''),
    links: {
      website: url(input.links?.website),
      googleMaps: url(input.links?.googleMaps),
      gbiz: url(input.links?.gbiz),
    },
    contacts: list(input.contacts).map(normalizeContact).filter(Boolean),
    facts: list(input.facts).map(normalizeFact).filter(Boolean),
    clues: list(input.clues).filter((k) => Object.hasOwn(CLUES, k)),
    hypotheses: list(input.hypotheses).map((h) => text(h, 300)).filter(Boolean),
    questions: list(input.questions).map((q) => text(q, 200)).filter(Boolean).slice(0, 3),
    scores: normalizeScores(input.scores),
    status: STATUSES.includes(input.status) ? input.status : '未着手',
    nextActionDate: date(input.nextActionDate),
    acquiredAt: date(input.acquiredAt) || today(),
    verifiedAt: date(input.verifiedAt) || today(),
    memo: text(input.memo, 1000),
  };
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// 重複の確認（自動では統合せず「要確認」にする）
// ---------------------------------------------------------------------------
const normName = (s) =>
  s
    .normalize('NFKC')
    .replace(/株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|\(株\)|\(有\)|（株）|（有）/g, '')
    .replace(/[\s・]/g, '')
    .toLowerCase();
const normPhone = (s) => s.replace(/\D/g, '');
const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export function findDuplicates(p, all) {
  const out = [];
  const phones = new Set(p.contacts.filter((c) => c.type === 'phone').map((c) => normPhone(c.value)).filter((x) => x.length >= 9));
  const site = host(p.links.website);
  for (const o of all) {
    if (o.id === p.id) continue;
    const reasons = [];
    if (p.corporateNumber && p.corporateNumber === o.corporateNumber) reasons.push('法人番号が同じ');
    if (normName(p.name) && normName(p.name) === normName(o.name)) reasons.push('企業名が同じ');
    if (site && site === host(o.links.website)) reasons.push('公式サイトが同じ');
    if (o.contacts.some((c) => c.type === 'phone' && phones.has(normPhone(c.value)))) reasons.push('電話番号が同じ');
    if (reasons.length) out.push({ id: o.id, name: o.name, reasons });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 候補データ（seed フォルダのJSON）の一括取り込み
// - 登録済みの企業（企業名・法人番号・公式サイト・電話番号が同じ）は取り込まない
// - 営業履歴のない【見本】データは取り除く
// ---------------------------------------------------------------------------
export function importSeed(current, seed) {
  const checkedAt = date(seed.checkedAt) || today();
  const src = (u) => {
    const m = /^([A-Z]+):(\d+)$/.exec(u || '');
    if (!m || !seed.sources?.[m[1]]) return u;
    return seed.sources[m[1]].replace('{n}', m[1] === 'CITY' ? m[2].padStart(2, '0') : m[2]);
  };
  let items = current.filter((p) => !(p.name.startsWith('【見本】') && !(p.activities || []).length));
  const removedSamples = current.length - items.length;
  const added = [];
  const skipped = [];
  for (const raw of list(seed.prospects, 500)) {
    let p;
    try {
      p = normalizeProspect({
        ...raw,
        acquiredAt: raw.acquiredAt || checkedAt,
        verifiedAt: raw.verifiedAt || checkedAt,
        links: {
          ...raw.links,
          googleMaps: raw.links?.googleMaps || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${raw.name} ${raw.address || ''}`)}`,
        },
        contacts: list(raw.contacts).map((c) => ({ ...c, sourceUrl: src(c.sourceUrl), checkedAt: c.checkedAt || checkedAt })),
        facts: list(raw.facts).map((f) => ({ ...f, sourceUrl: src(f.sourceUrl), checkedAt: f.checkedAt || checkedAt })),
      });
    } catch (e) {
      if (e instanceof InputError) {
        skipped.push(`${raw?.name || '（企業名なし）'}：${e.message}`);
        continue;
      }
      throw e;
    }
    const dups = findDuplicates(p, items.filter((o) => !o.archived));
    if (dups.length) {
      skipped.push(`${p.name}：登録済みの「${dups[0].name}」と${dups[0].reasons.join('・')}ため取り込みませんでした`);
      continue;
    }
    const now = new Date().toISOString();
    const needsReview = Boolean(raw.needsReview);
    items.push({ id: randomUUID(), ...p, archived: false, needsReview, reviewNote: needsReview ? '公式の代表連絡先が未確認です' : '', activities: [], createdAt: now, updatedAt: now });
    added.push(p.name);
  }
  return { items, added, skipped, removedSamples };
}

// ---------------------------------------------------------------------------
// 保存
// ---------------------------------------------------------------------------
export function createProspectRouter({ dataDir }) {
  const file = path.join(dataDir, 'prospects.json');
  let items = [];

  try {
    items = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    items = []; // 初回は空。候補は画面から追加するか、npm run import で取り込む
  }

  function save() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  const find = (id) => items.find((p) => p.id === id);
  const withDup = (p) => ({ ...p, duplicates: p.archived ? [] : findDuplicates(p, items.filter((o) => !o.archived)) });

  const router = express.Router();

  router.get('/meta', (req, res) => {
    res.json({ municipalities: MUNICIPALITIES, clues: CLUES, statuses: STATUSES, contactTypes: CONTACT_TYPES, methods: METHODS, results: RESULTS, scoreKeys: SCORE_KEYS });
  });

  router.get('/', (req, res) => res.json(items.map(withDup)));

  // 候補データの一括取り込み（npm run import から呼ばれる）
  router.post('/import', (req, res) => {
    const result = importSeed(items, req.body || {});
    items = result.items;
    save();
    res.json({ added: result.added, skipped: result.skipped, removedSamples: result.removedSamples, total: items.length });
  });

  router.get('/:id', (req, res) => {
    const p = find(req.params.id);
    if (!p) return res.status(404).json({ error: '候補が見つかりません' });
    res.json(withDup(p));
  });

  router.post('/', (req, res) => {
    try {
      const now = new Date().toISOString();
      const p = { id: randomUUID(), ...normalizeProspect(req.body), archived: false, needsReview: false, reviewNote: '', activities: [], createdAt: now, updatedAt: now };
      const dups = findDuplicates(p, items.filter((o) => !o.archived));
      if (dups.length) {
        p.needsReview = true;
        p.reviewNote = `重複の可能性：${dups.map((d) => `${d.name}（${d.reasons.join('・')}）`).join('、')}`;
      }
      items.unshift(p);
      save();
      res.status(201).json(withDup(p));
    } catch (e) {
      if (e instanceof InputError) return res.status(400).json({ error: e.message });
      throw e;
    }
  });

  // 一部の項目だけの更新（一覧からの営業状況・次回対応日の更新、要確認の解除など）にも使う
  router.patch('/:id', (req, res) => {
    const p = find(req.params.id);
    if (!p) return res.status(404).json({ error: '候補が見つかりません' });
    try {
      const b = req.body || {};
      if ('name' in b) Object.assign(p, normalizeProspect({ ...p, ...b }));
      if ('status' in b && STATUSES.includes(b.status)) p.status = b.status;
      if ('nextActionDate' in b) p.nextActionDate = date(b.nextActionDate);
      if ('archived' in b) p.archived = Boolean(b.archived);
      if ('needsReview' in b) {
        p.needsReview = Boolean(b.needsReview);
        p.reviewNote = p.needsReview ? text(b.reviewNote, 300) || '利用者が確認待ちにしました' : '';
      }
      p.updatedAt = new Date().toISOString();
      save();
      res.json(withDup(p));
    } catch (e) {
      if (e instanceof InputError) return res.status(400).json({ error: e.message });
      throw e;
    }
  });

  // 営業結果の記録
  router.post('/:id/activities', (req, res) => {
    const p = find(req.params.id);
    if (!p) return res.status(404).json({ error: '候補が見つかりません' });
    const b = req.body || {};
    const method = METHODS.includes(b.method) ? b.method : null;
    const result = RESULTS.includes(b.result) ? b.result : null;
    if (!method || !result) return res.status(400).json({ error: '接触方法と結果を選んでください。' });
    const at = typeof b.at === 'string' && !Number.isNaN(Date.parse(b.at)) ? new Date(b.at).toISOString() : new Date().toISOString();
    const activity = { id: randomUUID(), at, method, result, note: text(b.note, 1000), nextActionDate: date(b.nextActionDate) };
    p.activities = [activity, ...(p.activities || [])];
    p.status = STATUSES.includes(b.status) ? b.status : p.status === '未着手' ? '連絡済み' : p.status;
    p.nextActionDate = activity.nextActionDate;
    p.updatedAt = new Date().toISOString();
    save();
    res.status(201).json(withDup(p));
  });

  return router;
}
