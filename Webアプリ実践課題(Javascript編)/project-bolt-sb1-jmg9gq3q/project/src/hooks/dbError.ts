interface DbError {
  code?: string;
  message?: string;
}

/** データベースの列・表がまだ無い時のエラーコード */
const SCHEMA_MISSING = ['42703', '42P01', 'PGRST204', 'PGRST205'];

export function describeDbError(e: DbError | null, fallback: string) {
  if (e?.code && SCHEMA_MISSING.includes(e.code)) {
    return 'データベースの更新がまだです。SQLを実行してください。';
  }
  return `${fallback}もう一度お試しください。`;
}
