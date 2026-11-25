import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CheckCircle2, KeyRound, Link2, Loader2, LogOut } from 'lucide-react';
import { NewPasswordForm } from '@/components/NewPasswordForm';
import { supabase } from '@/lib/supabase';
import { OAUTH_PROVIDERS, asProvider, authErrorText, redirectUrl, type OAuthId } from '@/lib/auth';
import { Modal, ghostButton } from '@/components/ui';

/** アカウント：ログイン中の情報、ほかのログイン方法の追加、ログアウト */
export function AccountDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);
  const [saved, setSaved] = useState(false);
  const identities = session.user.identities ?? [];
  const linked = (id: string) => identities.some((i) => i.provider === id);

  const link = async (id: OAuthId) => {
    setError('');
    setBusy(id);
    const { error: e } = await supabase.auth.linkIdentity({ provider: asProvider(id), options: { redirectTo: redirectUrl() } });
    if (e) {
      setError(authErrorText(e.message));
      setBusy(null);
    }
  };

  return (
    <Modal
      title="アカウント"
      onClose={onClose}
      footer={
        <>
          <div className="flex-1" />
          <button onClick={() => void supabase.auth.signOut()} className={ghostButton}>
            <LogOut className="h-4 w-4" />
            ログアウト
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-lg bg-canvas px-3 py-2">
          <div className="text-xs text-slate-500">ログイン中</div>
          <div className="break-all font-bold text-navy">{session.user.email || '（メールアドレスなし）'}</div>
        </div>

        <section>
          <h3 className="mb-1 text-xs font-bold text-navy">ログイン方法</h3>
          <p className="mb-2 text-xs text-slate-500">
            追加すると、そのアカウントでも同じデータに入れます。押すとそのサービスの画面に移り、許可すると戻ってきます。
          </p>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2 rounded-lg border border-navy-100 px-3 py-2">
              <span className="flex-1">メールアドレス・パスワード</span>
              {linked('email') ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  使えます
                </span>
              ) : (
                <span className="text-xs text-slate-500">未登録</span>
              )}
            </li>
            {OAUTH_PROVIDERS.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-navy-100 px-3 py-2">
                <span className="flex-1">{p.label}</span>
                {linked(p.id) ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    使えます
                  </span>
                ) : (
                  <button onClick={() => void link(p.id)} disabled={!!busy} className={`${ghostButton} px-2.5 py-1 text-xs`}>
                    {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    追加する
                  </button>
                )}
              </li>
            ))}
          </ul>
          {error && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              {error}
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-xs font-bold text-navy">パスワード</h3>
          {changing ? (
            <NewPasswordForm
              email={session.user.email ?? ''}
              onDone={() => {
                setChanging(false);
                setSaved(true);
              }}
            />
          ) : (
            <>
              <button onClick={() => setChanging(true)} className={`${ghostButton} px-2.5 py-1 text-xs`}>
                <KeyRound className="h-3.5 w-3.5" />
                パスワードを変える
              </button>
              {saved && <p className="mt-2 text-xs font-bold text-emerald-700">パスワードを変えました。</p>}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
