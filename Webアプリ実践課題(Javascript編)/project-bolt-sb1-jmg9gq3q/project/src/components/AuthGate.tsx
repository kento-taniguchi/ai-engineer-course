import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { KeyRound, Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { NewPasswordForm } from '@/components/NewPasswordForm';
import { supabase } from '@/lib/supabase';
import { LoginScreen } from '@/components/LoginScreen';
import { ghostButton } from '@/components/ui';
import { captureCalendarToken } from '@/lib/googleCalendar';

type Access = 'checking' | 'owner' | 'denied' | 'error';

/**
 * ログインしていなければログイン画面、使う権限が無ければお知らせ、
 * 持ち主（このアプリを使ってよい人）ならアプリ本体を出す。
 */
export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [access, setAccess] = useState<Access>('checking');
  const [accessError, setAccessError] = useState('');
  // 「パスワードを忘れた」のメールから戻ってきたとき
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      captureCalendarToken(data.session);
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      // Google カレンダーの許可から戻ってきたときは、届いた通行証を受け取っておく
      captureCalendarToken(s);
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // ログインした人が持ち主か確かめる（まだ持ち主がいなければ、最初にログインした人が持ち主になる）
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setAccess('checking');
    void supabase.rpc('app_access').then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAccessError(error.message);
        setAccess('error');
      } else setAccess(data === 'denied' ? 'denied' : 'owner');
    });
    return () => {
      active = false;
    };
  }, [userId]);

  if (!ready || (session && access === 'checking')) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-navy">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="読み込み中" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  if (recovery) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-navy-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-navy" aria-hidden />
            <h1 className="text-lg font-bold text-navy">新しいパスワードを決める</h1>
          </div>
          <NewPasswordForm email={session.user.email ?? ''} onDone={() => setRecovery(false)} />
        </div>
      </div>
    );
  }

  if (access !== 'owner') {
    const signOut = () => void supabase.auth.signOut();
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-navy-100 bg-white p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-accent" aria-hidden />
          <h1 className="mt-3 text-lg font-bold text-navy">
            {access === 'denied' ? 'このアカウントでは使えません' : '使えるか確かめられませんでした'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {access === 'denied'
              ? 'このアプリは持ち主だけが使えます。持ち主の方は、いつものログイン方法で入り直してください。'
              : `少し待ってから、入り直してください。（${accessError}）`}
          </p>
          <p className="mt-3 break-all rounded-lg bg-canvas px-3 py-2 text-left text-[11px] text-slate-500">
            ログイン中：{session.user.email || '（メールアドレスなし）'}
            <br />
            ユーザーID：{session.user.id}
          </p>
          <button onClick={signOut} className={`${ghostButton} mt-4`}>
            <LogOut className="h-4 w-4" />
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  return <>{children(session)}</>;
}
