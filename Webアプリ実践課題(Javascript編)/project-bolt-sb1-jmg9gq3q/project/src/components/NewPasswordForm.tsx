import { useState } from 'react';
import { Eye, EyeOff, Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { authErrorText } from '@/lib/auth';
import { Field, inputClass, primaryButton } from '@/components/ui';

/**
 * 新しいパスワードを決める欄。
 * ブラウザのパスワード保存機能が「このアカウントのパスワード」と分かるように、
 * メールアドレスを見えない欄（username）として一緒に置く。
 */
export function NewPasswordForm({ email, onDone }: { email: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (password.length < 8) return setError('パスワードは8文字以上にしてください。');
    setBusy(true);
    setError('');
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e) setError(authErrorText(e.message));
    else onDone();
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
      <Field label="新しいパスワード">
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            name="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            className={`${inputClass} pr-10`}
            required
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy"
            aria-label={show ? 'パスワードを隠す' : 'パスワードを表示'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <p className="text-[11px] text-slate-500">
        Chrome などでは、この欄を押すと「強力なパスワードを使用」と出ます。それを選ぶと、パスワードが自動で作られて保存されます。
      </p>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        このパスワードにする
      </button>
    </form>
  );
}
