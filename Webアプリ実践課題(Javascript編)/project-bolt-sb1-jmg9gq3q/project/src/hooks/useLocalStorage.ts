import { useEffect, useState } from 'react';

/** ブラウザに覚えておく状態（折りたたみの開け閉めなど） */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 保存できない環境（プライベートモードなど）では覚えないだけにする
    }
  }, [key, value]);

  return [value, setValue] as const;
}
