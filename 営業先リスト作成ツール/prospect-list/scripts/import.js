// 候補データ（seed フォルダのJSON）を取り込む。
// 使い方：npm run import -- seed/fukui-2026-11.json
// - アプリが起動中なら、起動中のアプリ経由で取り込む（画面を再読み込みすると表示される）
// - 起動していなければ、data/prospects.json に直接書き込む
// - 登録済みの企業は取り込まずに知らせる。営業履歴のない【見本】データは取り除く
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importSeed } from '../lib/prospects.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataFile = path.join(root, 'data', 'prospects.json');
const seedArg = process.argv[2];
if (!seedArg) {
  console.error('取り込むファイルを指定してください。例：npm run import -- seed/fukui-2026-11.json');
  process.exit(1);
}
const seed = JSON.parse(fs.readFileSync(path.resolve(root, seedArg), 'utf8'));
const port = Number(process.env.PORT || 3100);

let result;
let running = false;
try {
  await fetch(`http://127.0.0.1:${port}/api/prospects/meta`, { signal: AbortSignal.timeout(1500) });
  running = true;
} catch {
  running = false;
}

if (running) {
  const res = await fetch(`http://127.0.0.1:${port}/api/prospects/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(seed),
  });
  if (!res.ok) {
    console.error(`取り込みに失敗しました（${res.status}）。アプリを再起動してから、もう一度実行してください。`);
    process.exit(1);
  }
  result = await res.json();
} else {
  let current = [];
  try {
    current = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    current = [];
  }
  const r = importSeed(current, seed);
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(`${dataFile}.tmp`, JSON.stringify(r.items, null, 2), 'utf8');
  fs.renameSync(`${dataFile}.tmp`, dataFile);
  result = { ...r, total: r.items.length };
}

console.log(`取り込み完了：${result.added.length}件を追加しました（合計${result.total}件）。`);
if (result.removedSamples) console.log(`見本データ${result.removedSamples}件を取り除きました。`);
if (result.skipped.length) {
  console.log(`取り込まなかった候補：${result.skipped.length}件`);
  for (const s of result.skipped) console.log(`  ・${s}`);
}
if (running) console.log('ブラウザの画面を再読み込みすると表示されます。');
