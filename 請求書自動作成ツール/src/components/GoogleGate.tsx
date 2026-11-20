"use client";
// データの保存先が Google スプレッドシートのとき、使える状態になるまで
// 「ログイン → （初回だけ）スプレッドシートの準備 → 読み込み」の画面を出す門番
import { useCallback, useEffect, useState } from "react";
import { OFFICE } from "@/config";
import {
  hasValidToken, isGoogleConfigured, loadGoogleIdentity, onAuthChange, signIn, wasConnected,
} from "@/services/googleAuth";
import { DATA_BACKEND } from "@/services/repository";
import {
  connectSpreadsheet, createDataSpreadsheet, forgetSpreadsheet, isLoaded, parseSpreadsheetId, savedSpreadsheetId,
  spreadsheetUrl,
} from "@/services/sheetsRepository";

type Step =
  | { kind: "preparing" }
  | { kind: "signin"; error?: string }
  | { kind: "setup"; error?: string }
  | { kind: "loading" }
  | { kind: "error"; message: string; id: string }
  | { kind: "ready" };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function GoogleGate({ children }: { children: React.ReactNode }) {
  if (DATA_BACKEND !== "sheets") return <>{children}</>;
  return <SheetsGate>{children}</SheetsGate>;
}

function SheetsGate({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState<Step>({ kind: "preparing" });
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  // 接続の状態（期限切れなど）を見張る
  useEffect(() => {
    const update = () => setConnected(hasValidToken());
    const off = onAuthChange(update);
    const t = setInterval(update, 30_000);
    update();
    return () => {
      off();
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!isGoogleConfigured()) return;
    loadGoogleIdentity()
      .then(() => setStep(isLoaded() ? { kind: "ready" } : { kind: "signin" }))
      .catch((e) => setStep({ kind: "signin", error: errText(e) }));
  }, []);

  /** スプレッドシートを読み込む */
  const load = useCallback(async (id: string) => {
    setStep({ kind: "loading" });
    try {
      await connectSpreadsheet(id);
      setStep({ kind: "ready" });
    } catch (e) {
      if (!hasValidToken()) setStep({ kind: "signin", error: errText(e) });
      else setStep({ kind: "error", message: errText(e), id });
    }
  }, []);

  // ログインボタン：押したらすぐにログイン画面を出す（待たずに呼ぶ）
  const onSignIn = () => {
    setBusy(true);
    signIn()
      .then(() => {
        if (isLoaded()) return setStep({ kind: "ready" });
        const id = savedSpreadsheetId();
        if (id) return load(id);
        setStep({ kind: "setup" });
      })
      .catch((e) => setStep({ kind: "signin", error: errText(e) }))
      .finally(() => setBusy(false));
  };

  if (!isGoogleConfigured()) {
    return (
      <div className="card gate">
        <h1>設定が必要です</h1>
        <p>Google 連携の設定（クライアントID）がありません。README の「Google スプレッドシート連携の設定」を確認してください。</p>
      </div>
    );
  }

  if (step.kind === "ready") {
    return (
      <>
        {!connected && (
          <div className="reconnect-bar" role="alert">
            <span>Google との接続が切れました（約1時間で切れます）。保存する前に再接続してください。入力中の内容は消えません。</span>
            <button className="btn btn-small btn-primary" onClick={onSignIn} disabled={busy}>
              再接続
            </button>
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="card gate">
      {step.kind === "preparing" && <p className="muted">準備しています…</p>}

      {step.kind === "signin" && (
        <>
          <h1>{wasConnected() ? "Google に再接続してください" : "Google でログインしてください"}</h1>
          <p>出欠・会員のデータは、Google ドライブのスプレッドシートに保存します。使う前に、データを保存する Google アカウントでログインしてください。</p>
          {step.error && <p className="gate-error">{step.error}</p>}
          <button className="btn btn-primary" onClick={onSignIn} disabled={busy}>
            {busy ? "ログイン中…" : "Google でログイン"}
          </button>
        </>
      )}

      {step.kind === "setup" && <SetupSpreadsheet error={step.error} onOpen={load} onError={(error) => setStep({ kind: "setup", error })} />}

      {step.kind === "loading" && <p className="muted">データを読み込んでいます…</p>}

      {step.kind === "error" && (
        <>
          <h1>データを読み込めませんでした</h1>
          <p className="gate-error" style={{ whiteSpace: "pre-line" }}>{step.message}</p>
          <p className="small muted">
            スプレッドシート：
            <a href={spreadsheetUrl(step.id)} target="_blank" rel="noopener noreferrer">開く</a>
            （手で書き換えた場合は、Google スプレッドシートの「ファイル」→「変更履歴」で元に戻せます）
          </p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => load(step.id)}>もう一度読み込む</button>
            <button
              className="btn"
              onClick={() => {
                if (!window.confirm("このPCで使うスプレッドシートを選び直します（スプレッドシート自体は消えません）。よろしいですか？")) return;
                forgetSpreadsheet();
                setStep({ kind: "setup" });
              }}
            >
              別のスプレッドシートを選ぶ
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** 初回：データ用のスプレッドシートを作る／URLで開く */
function SetupSpreadsheet({ error, onOpen, onError }: { error?: string; onOpen: (id: string) => void; onError: (e: string) => void }) {
  const [title, setTitle] = useState(`利用記録・請求書データ（${OFFICE.name}）`);
  const [url, setUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!title.trim()) return onError("ファイル名を入力してください");
    setCreating(true);
    try {
      const id = await createDataSpreadsheet(title.trim());
      onOpen(id);
    } catch (e) {
      onError(errText(e));
    } finally {
      setCreating(false);
    }
  };

  const open = () => {
    const id = parseSpreadsheetId(url);
    if (!id) return onError("スプレッドシートの URL を貼り付けてください（https://docs.google.com/spreadsheets/d/… の形）");
    onOpen(id);
  };

  return (
    <>
      <h1>データ用のスプレッドシートを準備します</h1>
      <p>このPCで初めて使うときだけの設定です。</p>
      {error && <p className="gate-error" style={{ whiteSpace: "pre-line" }}>{error}</p>}

      <div className="gate-choice">
        <h2>はじめて使う：新しく作る</h2>
        <p className="small muted">ログインした Google アカウントの「マイドライブ」に、データ用のスプレッドシートを作ります。</p>
        <label className="label" htmlFor="sheet-title">ファイル名</label>
        <input id="sheet-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={create} disabled={creating}>
            {creating ? "作成中…" : "新しく作る"}
          </button>
        </div>
      </div>

      <div className="gate-choice">
        <h2>前に作ったものを使う：URLで開く</h2>
        <p className="small muted">
          ブラウザのデータを消した場合などに使います。このアプリで作ったスプレッドシートの URL を貼り付けてください。
        </p>
        <input className="input" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={open}>開く</button>
        </div>
      </div>
    </>
  );
}
