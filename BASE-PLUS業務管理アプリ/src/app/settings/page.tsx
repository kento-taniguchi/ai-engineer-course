"use client";

import { useState } from "react";
import type { AppData } from "@/lib/types";
import Link from "next/link";
import { useApp } from "@/store/AppStore";
import { STORAGE_WARN_BYTES } from "@/services/storage";
import { PRODUCTION_READINESS, cloudConfig } from "@/services/cloudStore";
import { formatSummary, realLookingRecords, summarizeData, validateAppDataShape } from "@/lib/cloudSync";
import { formatDateTime, formatTime, toISO } from "@/lib/time";
import { DemoBadge, Modal, OffBadge, PageHead } from "@/components/ui";

const INTEGRATIONS = [
  { name: "Googleカレンダー", now: "連携機能あり（Google Cloud での初期設定と接続が必要。「Google連携」画面）", future: "予定の読み込み・予約との紐づけ・変更の反映・作業予定の登録に対応済み。共有のための公開とログインは今後" },
  { name: "LINE（個別連絡）", now: "未連携（コピー・端末の共有機能のみ）", future: "公式LINEからの送信可否を調査" },
  { name: "公式LINE 予約配信", now: "未連携・予約未完了（配信内容と日時の下書きのみ）", future: "プチセミナー動画の配信予約（実現方法・動画の扱いは公式情報とアカウント設定を確認して決定）" },
  { name: "メール", now: "未連携（メールアプリを開くのみ）", future: "必要に応じて送信サービスと連携" },
  { name: "Instagram", now: "未連携（投稿はしません）", future: "投稿準備の管理のみを想定。自動投稿の可否は調査" },
  { name: "AI（SNSのテーマ提案・投稿文・台本・撮影カット）", now: "デモ（架空のサンプルとテンプレート）・接続先未確定", future: "「Muse」などのAIサービスを検討。どのサービスか・APIの有無を確認してから接続" },
  { name: "参考リール（Instagram）の動画解析", now: "未対応（URLの保存と、本人が入力したメモのみ）", future: "Instagramから他アカウントの動画の中身を取得する公式の方法はない。自分で用意した動画を、動画対応のAIで解析する方法を検討" },
  { name: "動画からサムネイル作成", now: "このブラウザ内で処理（外部送信なし）", future: "クラウド保存に移行しても同じ方法で作成可能" },
  { name: "音声認識", now: "デモ（サンプル文章を表示）", future: "端末の音声認識 または 音声認識API" },
  { name: "AI（項目の振り分け）", now: "デモ（キーワードによる簡易振り分け）", future: "AI APIで項目へ振り分け（未入力は空欄のまま）" },
  { name: "ホームページ予約枠", now: "未連携（読み取り専用の公開データがあることを確認・書き込み方法なし）", future: "ホームページ側の仕組み（保存場所・書き込み方法）を確認してから決定。docs/ホームページ連携調査.md 参照" },
  { name: "データ保存", now: "このブラウザ内のみ", future: "クラウドのデータベースで、パソコンとiPhoneの間で共有" },
  { name: "画像・動画（プチセミナー）", now: "このブラウザ内（IndexedDB）のみ・消える可能性あり", future: "クラウドのファイル保存（例：Supabase Storage、Firebase Storage、Google Drive）" },
];

export default function SettingsPage() {
  const { data, now, update, resetDemo, replaceData, storage, notify } = useApp();
  const [importing, setImporting] = useState<{ name: string; data: AppData } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [memo, setMemo] = useState(data.settings.futureMemo);
  const offset = data.settings.clockOffsetMin;
  const setOffset = (min: number, msg: string) => update((d) => ({ ...d, settings: { ...d.settings, clockOffsetMin: min } }), msg);
  const pct = Math.min(100, Math.round((storage.bytes / STORAGE_WARN_BYTES) * 100));

  return (
    <>
      <PageHead title="設定" sub="試作版の情報とデモ用の操作" />

      <section className="section card stack" aria-labelledby="h-storage">
        <h2 id="h-storage">データの保存について</h2>
        <div className="notice notice-warn small">
          <strong>このアプリのデータは、今お使いのブラウザの中にだけ保存されています。</strong>
          <br />
          別のブラウザ・別の端末（例：パソコンとiPhone）では共有されません。ブラウザの履歴やサイトデータを消すと、データも消えます。
        </div>
        <p className="small">
          保存先：{storage.label} ・ 使用量 約{Math.round(storage.bytes / 1024)}KB
          {storage.error && <span style={{ color: "var(--danger)" }}>（⚠ 保存エラー：{storage.error}）</span>}
        </p>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="xs muted">
          選手・チームの写真・動画は、ダミー表示とファイル名のみを記録しています（このデータの保存容量は約5MBが目安のため）。
          プチセミナーのサムネイル・動画は、別の保存領域（IndexedDB）にこのブラウザ内だけ保存します。書き出し（JSON）には画像・動画は含まれません。
        </p>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `baseplus-demo-${toISO(new Date()).slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
              notify("データをファイルに書き出しました");
            }}
          >
            データを書き出す（JSON）
          </button>
          <label className="btn">
            書き出したファイルから戻す
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setImportError(null);
                try {
                  const v = validateAppDataShape(JSON.parse(await f.text()));
                  if (!v.ok) throw new Error(v.error);
                  setImporting({ name: f.name, data: v.data });
                } catch (err) {
                  setImportError(err instanceof Error ? err.message : "ファイルを読み込めませんでした");
                }
              }}
            />
          </label>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm("すべてのデータを削除し、デモデータを初期状態に戻しますか？\n（入力したレポートや変更、登録したサムネイル・動画はすべて消えます）")) resetDemo();
            }}
          >
            デモデータを初期状態に戻す
          </button>
        </div>
        {importError && <div className="notice notice-danger small" role="alert">⚠ 読み込めませんでした：{importError}（今のデータは変更していません）</div>}
        <p className="xs muted">
          ファイルの書き出し・読み込みはこの端末の中だけで行い、外部には送信しません。書き出したファイルには選手の情報が含まれるため、取り扱いに注意してください（画像・動画は含まれません）。
        </p>
        <p className="xs muted">デモデータ作成日時：{formatDateTime(data.seededAt)}（この日を基準に架空の予定が作られています）</p>
      </section>

      {importing && (
        <Modal
          title="このファイルのデータに置き換えますか？"
          onClose={() => setImporting(null)}
          actions={
            <>
              <button className="btn" onClick={() => setImporting(null)}>
                やめる
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  replaceData(importing.data);
                  setImporting(null);
                }}
              >
                置き換える
              </button>
            </>
          }
        >
          <dl className="fields">
            <dt>ファイル</dt>
            <dd>{importing.name}</dd>
            <dt>内容</dt>
            <dd>{formatSummary(summarizeData(importing.data))}</dd>
          </dl>
          <p className="small" style={{ marginTop: 12 }}>
            今このブラウザにあるデータは、置き換える前に同じブラウザ内へ退避します。画像・動画はファイルに含まれないため移りません。
          </p>
        </Modal>
      )}

      <section className="section card stack" aria-labelledby="h-cloud">
        <div className="row">
          <h2 id="h-cloud">PC・iPhoneでの共有（クラウド保存）</h2>
          <span className="badge badge-off">{cloudConfig().configured ? "試験中（架空データのみ）" : "未設定（準備中）"}</span>
        </div>
        <div className="notice notice-warn small">
          <strong>クラウド保存は試験中です。</strong>「クラウド保存」画面でボタンを押したときだけ送信します（自動では送りません）。
          実在する選手の情報は、下の「本番利用の前に必要なもの」がすべて整うまで入力しないでください。
        </div>
        {(() => {
          const r = realLookingRecords(data);
          const n = r.players.length + r.teams.length;
          return n > 0 ? (
            <p className="small" role="status">
              ⚠ 「（架空）」の付いていない選手・チームが {n}件 あります。実在の情報の場合は、このブラウザ内だけで扱い、書き出したファイルの取り扱いに注意してください。
            </p>
          ) : null;
        })()}
        <p className="small">今のデータ：{formatSummary(summarizeData(data))}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>本番利用の前に必要なもの</th>
                <th>状態</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTION_READINESS.map((r) => (
                <tr key={r.item}>
                  <td>
                    <strong>{r.item}</strong>
                  </td>
                  <td>
                    <span className={`badge ${r.status === "done" ? "badge-ok" : "badge-off"}`}>{r.status === "done" ? "✓ 完了" : r.status === "prepared" ? "設計・準備のみ" : "未対応"}</span>
                  </td>
                  <td className="small">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="xs muted">設計と手順：docs/データ共有の設計.md ／ データベースの設定：supabase/schema.sql</p>
      </section>

      <section className="section card stack" aria-labelledby="h-clock">
        <div className="row">
          <h2 id="h-clock">デモ用の時刻</h2>
          <DemoBadge />
        </div>
        <p className="small">
          時刻を進めると「指導終了1時間後のお礼」「翌日のフィードバック強調」などを待たずに確認できます。
          <br />
          現在のアプリ内時刻：<strong>{formatDateTime(toISO(now))}</strong>
          {offset !== 0 && <span className="badge badge-demo" style={{ marginLeft: 8 }}>実際の時刻から {offset > 0 ? "+" : ""}{Math.round(offset / 6) / 10}時間</span>}
        </p>
        <div className="row">
          <button className="btn btn-sm" onClick={() => setOffset(offset - 60, "1時間戻しました")}>
            −1時間
          </button>
          <button className="btn btn-sm" onClick={() => setOffset(offset + 60, "1時間進めました")}>
            ＋1時間
          </button>
          <button className="btn btn-sm" onClick={() => setOffset(offset + 180, "3時間進めました")}>
            ＋3時間
          </button>
          <button className="btn btn-sm" onClick={() => setOffset(offset + 1440, "1日進めました")}>
            ＋1日
          </button>
          <button className="btn btn-sm btn-primary" disabled={offset === 0} onClick={() => setOffset(0, "実際の時刻に戻しました")}>
            実際の時刻に戻す
          </button>
        </div>
        <p className="xs muted">※ 現在 {formatTime(toISO(new Date()))}（実際の日本時間）</p>
      </section>

      <section className="section card stack" aria-labelledby="h-sync">
        <div className="row">
          <h2 id="h-sync">カレンダー同期の失敗を試す</h2>
          <DemoBadge />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={data.settings.simulateSyncFailure}
            onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, simulateSyncFailure: e.target.checked } }), e.target.checked ? "同期失敗のシミュレーションをオンにしました" : "オフにしました")}
          />
          「月間予定」の再同期（デモ）を失敗させる
        </label>
        <p className="xs muted">失敗時の表示と「再試行」ボタンを確認できます。</p>
      </section>

      <section className="section" aria-labelledby="h-integrations">
        <h2 id="h-integrations" style={{ marginBottom: 8 }}>
          外部サービスとの連携状況
        </h2>
        <p className="small" style={{ marginBottom: 8 }}>
          Googleカレンダーの接続状態と設定は <Link href="/google">Google連携</Link> 画面で確認できます。
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>サービス</th>
                <th>現在（試作版）</th>
                <th>将来の予定</th>
              </tr>
            </thead>
            <tbody>
              {INTEGRATIONS.map((i) => (
                <tr key={i.name}>
                  <td>
                    <strong>{i.name}</strong>
                  </td>
                  <td>
                    <OffBadge>{i.now}</OffBadge>
                  </td>
                  <td className="small">{i.future}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="xs muted" style={{ marginTop: 8 }}>
          APIキーは使いません。Googleカレンダーは、接続した場合に限り、選んだカレンダーの予定の読み込みと、確認画面で「登録する」を押した作業予定の登録だけを行います。それ以外は外部へ送信していません。
        </p>
      </section>

      <section className="section card stack" aria-labelledby="h-future">
        <div className="row">
          <h2 id="h-future">今後追加予定のメモ</h2>
          <span className="badge badge-off">今後追加予定</span>
        </div>
        <p className="small muted">新規顧客向けの申込フォーム・事前ヒアリングシートの自動送信などは、今回の試作版では実装していません。</p>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} style={{ minHeight: 140 }} />
        <div>
          <button className="btn btn-primary" disabled={memo === data.settings.futureMemo} onClick={() => update((d) => ({ ...d, settings: { ...d.settings, futureMemo: memo } }), "メモを保存しました")}>
            保存する
          </button>
        </div>
      </section>
    </>
  );
}
