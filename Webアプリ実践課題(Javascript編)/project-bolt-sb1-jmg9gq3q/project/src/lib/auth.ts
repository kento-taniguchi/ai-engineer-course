import type { Provider } from '@supabase/supabase-js';

/** 画面に出すログイン方法。LINE は Supabase の「独自のログイン方法（custom:）」で設定する */
export const OAUTH_PROVIDERS = [
  { id: 'google', label: 'Google', color: '#FFFFFF', text: '#1F2937', border: '#D1D5DB' },
  { id: 'custom:line', label: 'LINE', color: '#06C755', text: '#FFFFFF', border: '#06C755' },
  { id: 'github', label: 'GitHub', color: '#24292F', text: '#FFFFFF', border: '#24292F' },
] as const;

export type OAuthId = (typeof OAUTH_PROVIDERS)[number]['id'];

/** 古い型の定義には custom: が無いので、文字列のまま渡す */
export const asProvider = (id: OAuthId) => id as unknown as Provider;

/** ログイン後に戻ってくる場所（いま開いているアドレス） */
export const redirectUrl = () => `${window.location.origin}${window.location.pathname}`;

/** Supabase のエラー文を、わかりやすい日本語にする */
export function authErrorText(message: string | undefined) {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'メールアドレスかパスワードが違います。';
  if (m.includes('email not confirmed')) return 'まだメールアドレスの確認が済んでいません。届いたメールのリンクを押してください。';
  if (m.includes('user already registered')) return 'このメールアドレスはすでに登録されています。「ログイン」から入ってください。';
  if (m.includes('password should be at least') || m.includes('weak password')) return 'パスワードは8文字以上で、英字と数字をまぜてください。';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'このログイン方法は、まだ Supabase で設定されていません。';
  if (m.includes('manual linking')) return 'ログイン方法の追加が、Supabase でまだ許可されていません。';
  if (m.includes('identity is already linked') || m.includes('already linked')) return 'このアカウントは、すでに別のユーザーに使われています。';
  if (m.includes('rate limit') || m.includes('too many')) return '短い時間に何度も試したため、少し待ってからもう一度お試しください。';
  if (m.includes('fetch')) return 'インターネットにつながっていないようです。';
  return `うまくいきませんでした（${message ?? '原因不明'}）`;
}
