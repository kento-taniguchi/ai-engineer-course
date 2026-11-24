import { useEffect, useState } from 'react';

/** 現在時刻（一定間隔で更新）。期限切れの判定や「今」の線に使う */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
