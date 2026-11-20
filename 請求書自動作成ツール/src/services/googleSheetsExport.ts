// 出欠表を、新しい Google スプレッドシートとして書き出す
// （ログインと通信は googleAuth.ts。中身の組み立ては src/lib/googleSheets.ts）
import { googleFetch, GoogleError, hasValidToken, signIn } from "./googleAuth";

export { isGoogleConfigured, loadGoogleIdentity } from "./googleAuth";

/**
 * スプレッドシートを新しく作る（ログインした Google アカウントの「マイドライブ」にできます）。
 * 戻り値はスプレッドシートの URL。
 * ※ ボタンを押したときの処理から、待たずにすぐ呼んでください（未ログインならログイン画面を出すため）
 */
export async function createSpreadsheet(request: object): Promise<string> {
  if (!hasValidToken()) await signIn();
  const data = await googleFetch<{ spreadsheetUrl?: string }>("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: request,
  });
  if (!data.spreadsheetUrl) throw new GoogleError("スプレッドシートはできましたが、URLを受け取れませんでした。Google ドライブを確認してください。");
  return data.spreadsheetUrl;
}
