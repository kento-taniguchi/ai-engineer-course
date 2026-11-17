// 営業先リスト（新規営業の候補企業を整理するツール）のサーバー
// - public フォルダの画面を配信する
// - 候補データを data/prospects.json に保存する（このPC内だけに保存）
// - 電話・メールなどの自動送信や、外部サイトからの自動収集は行わない
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProspectRouter } from './lib/prospects.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.use('/api/prospects/import', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(here, 'public')));
app.use('/api/prospects', createProspectRouter({ dataDir: path.join(here, 'data') }));

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('==============================================');
  console.log(' 営業先リストを起動しました');
  console.log(` ブラウザで開く： http://localhost:${PORT}`);
  console.log(' 終了するには、この画面で Ctrl + C を押します');
  console.log('==============================================');
});
