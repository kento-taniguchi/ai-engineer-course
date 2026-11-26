import { useState } from 'react';
import { CalendarCheck2, Eye, EyeOff, KeyRound, Loader2, Mail, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { OAUTH_PROVIDERS, authErrorText, redirectUrl, type OAuthId } from '@/lib/auth';
import { Field, inputClass, primaryButton } from '@/components/ui';

/** ログイン方法のマーク（ブランドの形をまねず、頭文字で表す） */
function ProviderMark({ id }: { id: OAuthId }) {
  const letter = id === 'google' ? 'G' : '?';
  return (
    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-black/10 px-1 text-[11px] font-black" aria-hidden>
      {letter}
    </span>
  );
}

export function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const oauth = async (id: OAuthId) => {
    setError('');
    setBusy(id);
    const { error: e } = await supabase.auth.signInWithOAuth({ provider: id, options: { redirectTo: redirectUrl() } });
    // 成功すると、そのままログインの画面へ移動する
    if (e) {
      setError(authErrorText(e.message));
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!email.trim() || !password) return;
    setError('');
    setNotice('');
    setBusy('email');
    if (mode === 'login') {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (e) setError(authErrorText(e.message));
    } else {
      const { data, error: e } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectUrl() } });
      if (e) setError(authErrorText(e.message));
      else if (!data.session) setNotice('確認メールを送りました。メールのリンクを押すと登録が終わります。');
    }
    setBusy(null);
  };

  /** パスワードなしで入る：メールに届くリンクを押すとログインできる */
  const sendMagicLink = async () => {
    if (!email.trim()) return setError('先にメールアドレスを入れてください。');
    setError('');
    setNotice('');
    setBusy('magic');
    const { error: e } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: redirectUrl() } });
    if (e) setError(authErrorText(e.message));
    else setNotice('ログイン用のリンクをメールで送りました。この端末でメールを開いて、リンクを押してください。');
    setBusy(null);
  };

  /** パスワードを忘れたとき：メールのリンクから新しいパスワードを決め直す */
  const sendReset = async () => {
    if (!email.trim()) return setError('先にメールアドレスを入れてください。');
    setError('');
    setNotice('');
    setBusy('reset');
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl() });
    if (e) setError(authErrorText(e.message));
    else setNotice('パスワードを決め直すためのメールを送りました。リンクを押すと、新しいパスワードを入れる画面が開きます。');
    setBusy(null);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-navy-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy text-white">
            <CalendarCheck2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-bold text-navy">ToDo・売上管理</h1>
            <p className="text-xs text-slate-500">ログインして使います</p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {OAUTH_PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => void oauth(p.id)}
              disabled={!!busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: p.color, color: p.text, borderColor: p.border }}
            >
              {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ProviderMark id={p.id} />}
              {p.label}でログイン
            </button>
          ))}
        </div>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-navy-100" />
          または
          <span className="h-px flex-1 bg-navy-100" />
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="メールアドレス">
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className={inputClass}
              required
            />
          </Field>
          <Field label="パスワード">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                className={`${inputClass} pr-10`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy"
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <button type="submit" disabled={!!busy} className={`${primaryButton} w-full`}>
            {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {mode === 'login' ? 'メールアドレスでログイン' : 'メールアドレスで登録'}
          </button>
        </form>

        {mode === 'login' && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => void sendMagicLink()}
              disabled={!!busy}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-navy-100 px-2 py-2 text-xs text-navy hover:bg-navy-50 disabled:opacity-50"
            >
              {busy === 'magic' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              パスワードなしで入る
            </button>
            <button
              onClick={() => void sendReset()}
              disabled={!!busy}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-navy-100 px-2 py-2 text-xs text-navy hover:bg-navy-50 disabled:opacity-50"
            >
              {busy === 'reset' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              パスワードを忘れた
            </button>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">
            {notice}
          </p>
        )}

        <button
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError('');
            setNotice('');
          }}
          className="mt-4 w-full text-center text-xs text-navy-400 hover:text-navy hover:underline"
        >
          {mode === 'login' ? 'はじめての方：メールアドレスで登録する' : '登録済みの方：ログインに戻る'}
        </button>
      </div>
    </div>
  );
}
