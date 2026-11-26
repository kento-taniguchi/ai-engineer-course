import { useEffect, useState } from 'react';

/** 画面の幅などの条件に合っているか（例：'(max-width: 1023px)' = スマホ・タブレットの幅） */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** 一覧とカレンダーを並べられない幅（下のボタンで切り替える） */
export const NARROW = '(max-width: 1023px)';
/** スマホの幅 */
export const PHONE = '(max-width: 639px)';
