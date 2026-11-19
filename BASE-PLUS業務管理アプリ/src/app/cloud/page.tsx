"use client";

// クラウド保存（試験中）：Googleアカウントでログインし、この端末のデータをクラウドに保存・読み込みする。
//
// 方針
//  - 自動では送らない。アップロード・読み込み・上書きは、件数を確認してから本人が押す
//  - 保存は版番号つき。別の端末が先に保存していたら上書きせず知らせる
//  - クラウドから読み込む前に、この端末のデータを同じブラウザ内に退避する（AppStore.replaceData）
//  - 写真・動画のアップロードは次の段階（今はブラウザ内のまま）

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppData } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { cloudConfig, type CloudSession, type RemoteSnapshot } from "@/services/cloudStore";
import { supabaseCloudStore as cloud } from "@/services/supabaseCloudStore";
import { dataFingerprint, decideInitialSync, formatSummary, mergeDeviceSettings, prepareForCloud, realLookingRecords, sameSummary, summarizeData } from "@/lib/cloudSync";
import { formatDateTime, toISO } from "@/lib/time";
import { Modal, PageHead } from "@/components/ui";
import { deviceLabel, downloadJson, loadMeta, saveMeta, type CloudMeta } from "@/services/cloudMeta";
import { SYNC_STATE_LABEL, useCloudSync } from "@/store/CloudSyncStore";

type Phase = "loading" | "signed-out" | "not-allowed" | "ready" | "error";

export default function CloudPage() {
  const cfg = cloudConfig();
  if (!cfg.configured) return <NotConfigured />;
  return <CloudReady />;
}

function NotConfigured() {
  return (
    <>
      <PageHead title="クラウド保存" sub="PC・iPhoneでデータを共有するための準備（試験中）">
        <span className="badge badge-off">未設定</span>
      </PageHead>
      <section className="card section stack-2">
        <p className="small">
          クラウド保存の接続先が設定されていません。データはこのブラウザの中だけに保存されています。設定方法は <code>docs/データ共有の設計.md</code> を参照してください。
        </p>
      </section>
    </>
  );
}

function CloudReady() {
  const { data, replaceData, notify } = useApp();
  const sync = useCloudSync();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<CloudSession | null>(null);
  const [remote, setRemote] = useState<RemoteSnapshot | null | undefined>(undefined);
  const [meta, setMeta] = useState<CloudMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [realConfirm, setRealConfirm] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "load-remote" | "overwrite" | "load-history"; snapshot?: AppData; historyId?: number; label: string }>(null);
  const [history, setHistory] = useState<{ id: number; revision: number; savedAt: string; device?: string }[] | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const s = await cloud.getSession();
    setSession(s);
    if (!s) {
      setPhase("signed-out");
      return;
    }
    // ログイン後に付くURLの一時的な情報（?code=…）を消す
    if (window.location.search.includes("code=")) router.replace("/cloud");
    const allowed = await cloud.isAllowed();
    if (!allowed.ok) {
      setError(allowed.message);
      setPhase("error");
      return;
    }
    if (!allowed.value) {
      setPhase("not-allowed");
      return;
    }
    const r = await cloud.pull();
    if (!r.ok) {
      setError(r.message);
      setPhase("error");
      return;
    }
    setRemote(r.value);
    setMeta(loadMeta(s.userId));
    setPhase("ready");
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 自動同期で保存・読み込みが行われたら、この画面の表示も更新する
  const syncedAt = sync.lastSyncedAt;
  useEffect(() => {
    if (!syncedAt || !session) return;
    let alive = true;
    void cloud.pull().then((r) => {
      if (!alive) return;
      if (r.ok) setRemote(r.value);
      setMeta(loadMeta(session.userId));
    });
    return () => {
      alive = false;
    };
  }, [syncedAt, session]);

  const localFp = dataFingerprint(data);
  const decision = phase === "ready" ? decideInitialSync(data, remote?.data ?? null) : null;

  // 内容が同じなら、この端末の同期の記録を最新の版にそろえる
  const sameRev = decision?.action === "same" && remote ? remote.revision : null;
  useEffect(() => {
    if (sameRev === null || !session) return;
    const cur = loadMeta(session.userId);
    if (cur && cur.revision === sameRev && cur.fingerprint === localFp) return;
    const m: CloudMeta = { userId: session.userId, revision: sameRev, fingerprint: localFp, syncedAt: cur?.revision === sameRev ? cur.syncedAt : toISO(new Date()) };
    saveMeta(m);
    setMeta(m);
  }, [sameRev, session, localFp]);
  const linked = !!meta && !!remote && meta.revision === remote.revision;
  const localChanged = linked && meta!.fingerprint !== localFp;
  const remoteNewer = !!meta && !!remote && remote.revision > meta.revision;
  const real = realLookingRecords(data);
  const needsRealConfirm = real.players.length + real.teams.length > 0;

  const remember = (revision: number, d: AppData) => {
    if (!session) return;
    const m: CloudMeta = { userId: session.userId, revision, fingerprint: dataFingerprint(d), syncedAt: toISO(new Date()) };
    saveMeta(m);
    setMeta(m);
    // 自動同期にも伝える（この画面での操作のあとから自動同期が始まる）
    sync.refreshMeta();
  };

  /** 保存して、読み戻して件数が一致するか確かめる */
  const pushAndVerify = async (base: number, what: string) => {
    setBusy(`${what}中…`);
    setError(null);
    setVerified(null);
    try {
      const payload = prepareForCloud(data);
      const r = await cloud.push(payload, base, deviceLabel());
      if (!r.ok) {
        setError(r.message);
        if (r.kind === "conflict") await refreshRemoteOnly();
        notify(r.message, "error");
        return;
      }
      const back = await cloud.pull();
      if (!back.ok || !back.value) {
        setError(`保存しましたが、読み戻しての確認ができませんでした：${back.ok ? "データがありません" : back.message}`);
        return;
      }
      const ok = back.value.revision === r.value.revision && sameSummary(summarizeData(back.value.data), summarizeData(payload)) && dataFingerprint(back.value.data) === dataFingerprint(payload);
      setRemote(back.value);
      if (!ok) {
        setError("保存後に読み戻した内容が一致しませんでした。もう一度お試しください（この端末のデータはそのままです）");
        return;
      }
      remember(r.value.revision, data);
      setVerified(`${what}しました（読み戻して内容が一致することを確認済み・版 ${r.value.revision}）`);
      notify(`${what}しました`);
    } finally {
      setBusy(null);
    }
  };

  const refreshRemoteOnly = async () => {
    const r = await cloud.pull();
    if (r.ok) setRemote(r.value);
  };

  const loadSnapshot = (d: AppData, revision: number | null, msg: string) => {
    const merged = mergeDeviceSettings(d, data);
    replaceData(merged);
    // 控えを読み込んだ場合は版番号の記録を変えない → 自動同期がオンなら、この内容がクラウドにも保存される
    if (revision !== null) remember(revision, merged);
    else sync.checkNow();
    setVerified(msg);
  };

  const openHistory = async () => {
    setBusy("保存履歴を読み込み中…");
    const r = await cloud.listHistory();
    setBusy(null);
    if (!r.ok) setError(r.message);
    else setHistory(r.value);
  };

  return (
    <>
      <PageHead title="クラウド保存" sub="PC・iPhoneでデータを共有するための準備（試験中・架空データのみ）">
        <span className="badge badge-warning">試験中</span>
      </PageHead>

      <div className="notice notice-warn small section">
        <strong>試験中です。実在する選手の情報は入力・アップロードしないでください。</strong>
        最初にこの画面で「どのデータを使うか」を選ぶと、そのあとは自動で同期します（オフにもできます）。写真・動画はまだクラウドに送っていません（このブラウザの中だけ）。
      </div>

      {/* ---- ログイン ---- */}
      <section className="card section stack-2" aria-labelledby="h-c-login">
        <h2 id="h-c-login">1. ログイン</h2>
        {phase === "loading" && <p className="small">確認中…</p>}
        {phase === "signed-out" && (
          <>
            <p className="small">Googleアカウントでログインします。利用を許可したアカウント以外は、ログインしてもデータを読み書きできません。</p>
            <div>
              <button
                className="btn btn-primary"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("Googleの画面へ移動中…");
                  const r = await cloud.signIn();
                  if (!r.ok) {
                    setError(r.message);
                    setBusy(null);
                  }
                }}
              >
                {busy ?? "Googleでログイン"}
              </button>
            </div>
          </>
        )}
        {session && phase !== "signed-out" && (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="small">
              ログイン中：<strong>{session.email}</strong>
              {phase === "ready" && <span className="badge badge-ok" style={{ marginLeft: 8 }}>✓ 利用を許可されたアカウント</span>}
            </p>
            <button
              className="btn btn-sm btn-ghost"
              onClick={async () => {
                await cloud.signOut();
                setSession(null);
                setRemote(undefined);
                setMeta(null);
                setPhase("signed-out");
                notify("ログアウトしました");
              }}
            >
              ログアウト
            </button>
          </div>
        )}
        {phase === "not-allowed" && (
          <div className="notice notice-danger small" role="alert">
            ⚠ このGoogleアカウントには利用の許可がありません。データは1件も読み書きできません。許可したアカウントでログインし直してください。
          </div>
        )}
        {error && (
          <div className="notice notice-danger small" role="alert">
            ⚠ {error}
            {phase === "error" && (
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-sm" onClick={() => void refresh()}>
                  再試行
                </button>
              </div>
            )}
          </div>
        )}
        {verified && (
          <div className="notice notice-info small" role="status">
            ✓ {verified}
          </div>
        )}
      </section>

      {phase === "ready" && decision && (
        <>
          {/* ---- 状態 ---- */}
          <section className="card section stack-2" aria-labelledby="h-c-state">
            <h2 id="h-c-state">2. この端末とクラウドの状態</h2>
            <dl className="fields">
              <dt>この端末</dt>
              <dd>{formatSummary(summarizeData(data))}</dd>
              <dt>クラウド</dt>
              <dd>
                {remote ? (
                  <>
                    {formatSummary(summarizeData(remote.data))}
                    <div className="xs muted">
                      版 {remote.revision}・最終保存 {formatDateTime(remote.updatedAt)}
                      {remote.updatedByDevice && `（${remote.updatedByDevice}）`}
                    </div>
                  </>
                ) : (
                  "まだ何も保存されていません"
                )}
              </dd>
              <dt>同期の状態</dt>
              <dd>
                {!remote
                  ? "未アップロード"
                  : decision.action === "same"
                    ? "✓ クラウドと同じ内容です"
                    : remoteNewer
                      ? "! 他の端末でクラウドが更新されています（読み込むか、内容を確認してください）"
                      : localChanged
                        ? "この端末にクラウドへ未保存の変更があります"
                        : linked
                          ? "クラウドと内容が異なります"
                          : "! この端末とクラウドの内容が異なります（どちらを使うか選んでください）"}
                {meta && <div className="xs muted">この端末の最後の同期：{formatDateTime(meta.syncedAt)}（版 {meta.revision}）</div>}
              </dd>
            </dl>
          </section>

          {/* ---- 自動同期 ---- */}
          {meta && (
            <section className="card section stack-2" aria-labelledby="h-c-auto">
              <h2 id="h-c-auto">自動同期</h2>
              <label className="check">
                <input type="checkbox" checked={sync.autoSync} onChange={(e) => sync.setAutoSync(e.target.checked)} />
                自動で同期する（変更は数秒後に保存。アプリを開いたとき・画面に戻ったときに他の端末の変更を読み込む）
              </label>
              <p className="small">
                現在：<strong>{SYNC_STATE_LABEL[sync.state]}</strong>
                {sync.message && <span className="muted">　{sync.message}</span>}
              </p>
              <p className="xs muted">両方の端末で別々に変更した場合だけ、どちらの内容を使うかを選ぶ画面が出ます（自動で上書きはしません）。</p>
            </section>
          )}

          {/* ---- 最初のアップロード ---- */}
          {decision.action === "offer-upload" && (
            <section className="card section stack-2" aria-labelledby="h-c-upload">
              <h2 id="h-c-upload">3. この端末のデータをアップロード</h2>
              <p className="small">クラウドはまだ空です。この端末のデータ（{formatSummary(decision.local)}）をアップロードします。</p>
              {decision.local.localMedia > 0 && <p className="xs muted">プチセミナーの画像・動画（{decision.local.localMedia}件）は含まれません（この段階ではブラウザ内に残ります）。</p>}
              {needsRealConfirm && (
                <label className="check">
                  <input type="checkbox" checked={realConfirm} onChange={(e) => setRealConfirm(e.target.checked)} />
                  「（架空）」の付いていない選手・チームが{real.players.length + real.teams.length}件あります。実在の情報ではない（または同意の取得とアクセス制御の確認が済んでいる）ことを確認しました
                </label>
              )}
              <div className="row">
                <button className="btn" onClick={() => downloadJson(data, `baseplus-before-upload-${toISO(new Date()).slice(0, 10)}.json`)}>
                  先にファイルへ書き出す（おすすめ）
                </button>
                <button className="btn btn-primary" disabled={!!busy || (needsRealConfirm && !realConfirm)} onClick={() => void pushAndVerify(0, "アップロード")}>
                  {busy ?? "アップロードする"}
                </button>
              </div>
            </section>
          )}

          {/* ---- 内容が違うとき ---- */}
          {remote && decision.action !== "same" && decision.action !== "offer-upload" && (
            <section className="card section stack-2" aria-labelledby="h-c-sync">
              <h2 id="h-c-sync">3. 保存・読み込み</h2>
              {linked && !remoteNewer ? (
                sync.autoSync ? (
                  <p className="small">この端末の変更は、数秒後に自動でクラウドに保存されます（現在：{SYNC_STATE_LABEL[sync.state]}）。</p>
                ) : (
                  <>
                    <p className="small">この端末で変更した内容を、クラウドに保存します。</p>
                    <div className="row">
                      <button className="btn btn-primary" disabled={!!busy} onClick={() => void pushAndVerify(meta!.revision, "クラウドに保存")}>
                        {busy ?? "クラウドに保存"}
                      </button>
                    </div>
                  </>
                )
              ) : (
                <>
                  <p className="small">
                    {remoteNewer ? "他の端末でクラウドが更新されています。" : "この端末とクラウドで内容が違います。"}
                    どちらの内容を使うか選んでください。自動では上書きしません。
                  </p>
                  <div className="row">
                    <button className="btn btn-primary" disabled={!!busy} onClick={() => setConfirm({ kind: "load-remote", snapshot: remote.data, label: `クラウドの内容（版 ${remote.revision}）` })}>
                      クラウドの内容をこの端末に読み込む
                    </button>
                    <button className="btn" disabled={!!busy} onClick={() => setConfirm({ kind: "overwrite", label: "この端末の内容" })}>
                      この端末の内容でクラウドを上書き
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ---- 履歴 ---- */}
          {remote && (
            <section className="card section stack-2" aria-labelledby="h-c-history">
              <h2 id="h-c-history">4. クラウドの保存履歴（自動の控え）</h2>
              <p className="xs muted">保存のたびに、直前の内容を1時間に1回まで控えとして残しています（最大500件）。</p>
              {history === null ? (
                <div>
                  <button className="btn btn-sm" disabled={!!busy} onClick={() => void openHistory()}>
                    保存履歴を表示
                  </button>
                </div>
              ) : history.length === 0 ? (
                <p className="small">まだ控えはありません</p>
              ) : (
                <ul className="list">
                  {history.map((h) => (
                    <li key={h.id} className="row" style={{ padding: "8px 16px", justifyContent: "space-between" }}>
                      <span className="small">
                        {formatDateTime(h.savedAt)}・版 {h.revision}
                        {h.device && `（${h.device}）`}
                      </span>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={!!busy}
                        onClick={async () => {
                          const r = await cloud.getHistory(h.id);
                          if (!r.ok) setError(r.message);
                          else setConfirm({ kind: "load-history", snapshot: r.value, historyId: h.id, label: `${formatDateTime(h.savedAt)}の控え（版 ${h.revision}）` });
                        }}
                      >
                        この控えをこの端末に読み込む
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      <p className="xs muted section">
        ログインの情報はこのブラウザに保存されます（ログアウトで消えます）。手動のバックアップは <Link href="/settings">設定</Link> の「データを書き出す」から。
      </p>

      {confirm && (
        <Modal
          title={confirm.kind === "overwrite" ? "クラウドを上書きしますか？" : "この端末のデータを置き換えますか？"}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>
                やめる
              </button>
              <button
                className="btn btn-danger"
                disabled={!!busy}
                onClick={async () => {
                  const c = confirm;
                  setConfirm(null);
                  if (c.kind === "overwrite" && remote) {
                    // 上書きで消える前のクラウドの内容を、念のためファイルに残す
                    downloadJson(remote.data, `baseplus-cloud-before-overwrite-v${remote.revision}.json`);
                    await pushAndVerify(remote.revision, "クラウドを上書き");
                  } else if (c.snapshot) {
                    loadSnapshot(c.snapshot, c.kind === "load-remote" && remote ? remote.revision : null, `${c.label}をこの端末に読み込みました（読み込み前のデータは同じブラウザ内に退避しました）`);
                  }
                }}
              >
                {confirm.kind === "overwrite" ? "上書きする" : "読み込む"}
              </button>
            </>
          }
        >
          {confirm.kind === "overwrite" ? (
            <p className="small">
              この端末の内容（{formatSummary(summarizeData(data))}）でクラウドを上書きします。上書き前のクラウドの内容（{remote ? formatSummary(summarizeData(remote.data)) : ""}）は、ファイルとしてこの端末に書き出します。
            </p>
          ) : (
            <p className="small">
              {confirm.label}（{confirm.snapshot ? formatSummary(summarizeData(confirm.snapshot)) : ""}）をこの端末に読み込みます。今この端末にあるデータ（{formatSummary(summarizeData(data))}）は、置き換える前に同じブラウザ内へ退避します。
              {confirm.kind === "load-history" && " 自動同期がオンなら、読み込んだ内容はクラウドにも保存されます。"}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
