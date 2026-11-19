// アプリ全体で使うデータの型定義。
// 将来データベースや外部サービスに接続しても、この形を基準に変換すれば画面側は変更不要になります。

/** ISO 8601 形式の日時文字列（例: 2026-11-18T17:00:00+09:00） */
export type ISODateTime = string;
/** 日本時間の日付キー（例: 2026-11-18） */
export type DateKey = string;

export type TargetType = "player" | "team";

export interface TargetRef {
  type: TargetType;
  id: string;
}

// ---------- 選手・チーム ----------

export interface Player {
  id: string;
  name: string;
  kana: string;
  grade: string;
  position: string;
  affiliation: string;
  contactMemo: string;
  notes: string;
}

export interface TeamContract {
  visitsPerMonth: number;
  monthlyFee: number;
  startDate: DateKey;
  notes: string;
}

export interface Team {
  id: string;
  name: string;
  category: string;
  contactPerson: string;
  contract: TeamContract;
  notes: string;
}

// ---------- 予約（指導予定） ----------

export type BookingKind = "personal" | "online" | "team" | "trial";
export type BookingStatus = "scheduled" | "cancelled" | "deleted";

export interface BookingChange {
  at: ISODateTime;
  type: "created" | "rescheduled" | "cancelled" | "deleted" | "restored" | "target-set";
  detail: string;
}

export interface Booking {
  id: string;
  /** 将来: Googleカレンダーの予定ID。繰り返し予定は「各回」を区別するため instance ID を保存する */
  calendarEventId?: string;
  calendarRecurringId?: string;
  title: string;
  kind: BookingKind;
  /** 対象者。予定名から特定できない場合は null（＝確認が必要） */
  target: TargetRef | null;
  start: ISODateTime;
  end: ISODateTime;
  location: string;
  status: BookingStatus;
  /** 指導案（主にチーム向け） */
  plan?: string;
  history: BookingChange[];
  /** 予約の出どころ（未設定はデモ・アプリ内） */
  source?: "demo" | "app" | "google";
  /** Googleカレンダーの予定と紐づけた場合のカレンダーID */
  calendarId?: string;
  /** Googleカレンダー側で日時変更・削除などがあったときのお知らせ（本人が確認するまで表示） */
  changeNotice?: string;
}

// ---------- ToDo ----------

export type TodoStatus = "todo" | "scheduled" | "doing" | "done" | "na";

export type TodoKind =
  | "review_prev"
  | "remind"
  | "create_feedback"
  | "send_feedback"
  | "thanks"
  | "lesson_plan"
  | "sns_task"
  | "seminar_task"
  | "seminar_make"
  | "seminar_reserve"
  | "manual";

export interface TodoStatusChange {
  at: ISODateTime;
  from: TodoStatus;
  to: TodoStatus;
  reason: string;
}

export interface TimeBlock {
  start: ISODateTime;
  durationMin: number;
}

export interface Todo {
  /** 予約由来は `${bookingId}:${kind}` で固定 → 同じ予約から重複して作られない */
  id: string;
  kind: TodoKind;
  bookingId?: string;
  seminarId?: string;
  title?: string; // manual / seminar 用
  status: TodoStatus;
  statusReason: string;
  statusChangedAt?: ISODateTime;
  history: TodoStatusChange[];
  /** スケジュールに配置した作業時間（アプリ内のみ。Googleカレンダー未連携） */
  block?: TimeBlock;
  /** 予約の変更・削除などで、ユーザーの確認が必要な場合のメッセージ */
  needsReview?: string;
  /** 連絡文の下書き（編集内容を保持） */
  draft?: string;
  createdAt: ISODateTime;
  // ---- 第4版：SNS・プチセミナー・手動の仕事 ----
  /** SNSの作業: 企画ID と 作業の種類 */
  reelId?: string;
  snsKey?: SnsTaskKey;
  /** プチセミナーの作業の種類 */
  seminarTaskKey?: string;
  /** 手動で追加した仕事のID と 回（繰り返しの各回を区別する日付） */
  taskId?: string;
  occurrence?: DateKey;
  /** 手動の仕事の分類（作成時の値を保存） */
  category?: TaskCategory;
  /** 対応日（手動の仕事は作成時に保存。各回ごとに変更できる） */
  workDate?: DateKey;
  /** 期限（任意。未設定なら「期限超過」にならない） */
  dueDate?: DateKey;
  durationMin?: number;
  memo?: string;
  /** 「後日に変更」した日（この日まで表示しない。完了履歴などはそのまま） */
  postponedTo?: DateKey;
  /** Googleカレンダーに登録した作業予定との紐づけ */
  gcal?: TodoGcalLink;
}

export interface TodoGcalLink {
  calendarId: string;
  /** アプリが決めた予定ID（再試行しても同じIDなので二重登録にならない） */
  eventId: string;
  /** 登録した開始日時と所要時間（スケジュールの配置と比べて、変更があったか判定） */
  start: ISODateTime;
  durationMin: number;
  title: string;
  status: "synced" | "error" | "removed";
  at: ISODateTime;
  error?: string;
}

// ---------- Googleカレンダー連携 ----------

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  primary?: boolean;
  /** owner / writer / reader / freeBusyReader */
  accessRole: string;
}

/** 読み込んだGoogleカレンダーの予定（この端末に控えとして保存） */
export interface GCalEvent {
  calendarId: string;
  eventId: string;
  recurringEventId?: string;
  title: string;
  /** 時刻のある予定の開始・終了（日本時間） */
  start: ISODateTime;
  end: ISODateTime;
  allDay: boolean;
  /** 終日予定の開始日と終了日（終了日は含まない） */
  startDate?: DateKey;
  endDate?: DateKey;
  status: "confirmed" | "tentative" | "cancelled";
  updated?: string;
  location?: string;
  /** このアプリから登録した作業予定の場合、そのToDoのID */
  appTodoId?: string;
}

/** 繰り返し予定の「ほかの回も同じ対象者にする」設定 */
export interface SeriesLink {
  calendarId: string;
  recurringEventId: string;
  target: TargetRef;
  kind: BookingKind;
}

export interface GoogleSyncLog {
  at: ISODateTime;
  ok: boolean;
  message: string;
}

export interface GoogleState {
  /** 設定画面で入力したOAuthクライアントID（公開される識別子。秘密情報ではない） */
  clientId?: string;
  /** 一度でも連携に成功したか */
  connectedOnce?: boolean;
  calendars: GoogleCalendarInfo[];
  /** 読み込むカレンダー */
  readCalendarIds: string[];
  /** アプリの作業予定を登録するカレンダー */
  writeCalendarId?: string;
  events: GCalEvent[];
  /** 最後に読み込んだ期間 */
  range?: { from: DateKey; to: DateKey };
  lastSync?: GoogleSyncLog;
  logs: GoogleSyncLog[];
  seriesLinks: SeriesLink[];
  /** 「BASE-PLUSの予定ではない」にした予定（calendarId|eventId） */
  ignored: string[];
}

/** 今日やることの分類 */
export type TodayCategory = "people" | "sns" | "seminar" | "other";
/** 手動で追加する仕事の分類 */
export type TaskCategory = "sns" | "seminar" | "other";

export type SnsTaskKey = "theme" | "reference" | "script" | "shoot" | "edit" | "caption" | "post";

export interface ScheduleDates {
  /** 対応日（この日から表示） */
  workDate?: DateKey;
  /** 期限 */
  dueDate?: DateKey;
}

export type Repeat = { type: "none" } | { type: "weekly"; weekdays: number[] } | { type: "monthly"; day: number };

/** 手動で追加した仕事（臨時・繰り返し） */
export interface ManualTask {
  id: string;
  title: string;
  category: TaskCategory;
  /** 対応日（繰り返しの場合は開始日） */
  date: DateKey;
  /** 期限（繰り返さない場合） */
  dueDate?: DateKey;
  /** 期限（繰り返す場合）：各回の対応日の何日後か（0=当日） */
  dueOffsetDays?: number;
  durationMin?: number;
  memo?: string;
  repeat: Repeat;
  /** 繰り返しの終了（この日以降は作らない）。「今後の予定も含めて削除」で設定 */
  until?: DateKey;
  /** 「今回のみ削除」した回 */
  skipDates?: DateKey[];
  createdAt: ISODateTime;
}

/** プチセミナーの準備作業のルール（配信曜日ごと） */
export interface SeminarRule {
  id: string;
  /** 配信曜日（0=日〜6=土） */
  deliveryWeekday: number;
  tasks: SeminarRuleTask[];
}

export interface SeminarRuleTask {
  key: string;
  label: string;
  /** 配信日の何日前に行うか */
  daysBefore: number;
}

// ---------- レポート・測定・添付 ----------

export interface Report {
  id: string;
  bookingId?: string;
  target: TargetRef;
  date: DateKey;
  purpose: string;
  content: string;
  measurements: string;
  homework: string;
  nextPoints: string;
  notes: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** 今回の指導内容のメモ（指導前に書く予定。予約と対象者に紐づく） */
export interface LessonPlan {
  id: string;
  bookingId: string;
  target: TargetRef;
  purpose: string;
  content: string;
  checks: string;
  tools: string;
  memo: string;
  /** 保存したときの予約開始日時（予約が変更されたか確認するため） */
  bookingStartAtSave: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Measurement {
  id: string;
  target: TargetRef;
  item: string;
  date: DateKey;
  value: number;
  unit: string;
}

export type AttachmentKind = "photo" | "video" | "whiteboard";

export interface Attachment {
  id: string;
  target: TargetRef;
  reportId?: string;
  kind: AttachmentKind;
  label: string;
  /** 試作版はダミー表示のみ。実ファイルは保存せずファイル名だけ記録 */
  fileName?: string;
  fileSize?: number;
  dummy: boolean;
  createdAt: ISODateTime;
}

// ---------- 売上 ----------

export type SalesService = "personal" | "online" | "team" | "seminar" | "other";
/** planned=予定 / done=実施確認 / paid=入金確認 / cancelled=キャンセル / moved=振替 */
export type SalesStatus = "planned" | "done" | "paid" | "cancelled" | "moved";

export interface SalesItem {
  id: string;
  month: string; // YYYY-MM（計上月）
  service: SalesService;
  description: string;
  amount: number;
  status: SalesStatus;
  /** 発生元。月額契約は contract 単位で1か月1件（訪問回数ごとに計上しない） */
  source: { type: "booking"; bookingId: string } | { type: "contract"; teamId: string } | { type: "manual" };
  /** 振替の場合の振替先 */
  movedTo?: string;
}

// ---------- プチセミナー ----------

export type SeminarStatus = "no_theme" | "making" | "ready" | "waiting_reserve" | "delivered";

/**
 * 画像・動画の登録情報。ファイル本体は localStorage ではなく、ブラウザ内の IndexedDB に別保存する。
 * stored=false の場合は「ファイル名のみ記録（本体は未保存）」。
 */
export interface MediaRef {
  id: string;
  fileName: string;
  mime: string;
  /** 元ファイルのサイズ */
  bytes: number;
  /** 実際にブラウザ内へ保存されたサイズ（サムネイルは縮小後） */
  storedBytes?: number;
  stored: boolean;
  /** 保存後に読み戻して確認できた日時 */
  verifiedAt?: ISODateTime;
  width?: number;
  height?: number;
  savedAt: ISODateTime;
  /** サムネイルの作り方: 画像を選択 / 動画から切り出し */
  source?: "upload" | "video-frame";
  /** 動画から切り出した場合の時刻（秒） */
  frameSec?: number;
}

/** 公式LINE配信の下書き（未連携。予約は完了していない） */
export interface LineDraft {
  text: string;
  date: DateKey;
  time: string;
  attachThumbnail: boolean;
  attachVideo: boolean;
  savedAt: ISODateTime;
}

export interface SeminarEpisode {
  id: string;
  deliveryDate: DateKey; // 月曜 or 金曜
  theme: string;
  status: SeminarStatus;
  memo: string;
  thumbnail?: MediaRef;
  video?: MediaRef;
  lineDraft?: LineDraft;
  /** YouTubeに限定公開でアップロードした動画のURL（共有用の短い形 https://youtu.be/ID に整えて保存） */
  youtubeUrl?: string;
  youtubeVideoId?: string;
  youtubeSavedAt?: ISODateTime;
}

// ---------- 発信・SNS ----------

export interface ReelStep {
  done: boolean;
  memo: string;
}

export type SnsAudience = "player" | "parent" | "coach";

export interface ReelProject {
  id: string;
  title: string;
  /** 8段階（テーマ／伝えたいこと／台本／撮影カット／撮影／編集／投稿文／投稿） */
  steps: ReelStep[];
  createdAt: ISODateTime;
  audience?: SnsAudience;
  /** 決定したテーマ */
  theme?: string;
  /** 谷口さん本人が入力する動画の内容 */
  videoContent?: string;
  /** Instagramリール用の投稿文 */
  caption?: string;
  /** 投稿文がデモ（AI未接続）のテンプレートから作られたか */
  captionFromDemo?: boolean;
  // ---- 参考リールから台本・撮影カットを作る（第3版） ----
  referenceUrl?: string;
  /** 参考動画について本人が入力した内容・文字起こし・構成のメモ */
  referenceNotes?: string;
  /** 伝えたい内容 */
  message?: string;
  /** 動画の長さの目安（秒） */
  lengthSec?: number;
  extraNotes?: string;
  hook?: string;
  script?: string;
  shots?: ShotCut[];
  /** 台本・撮影カットがデモ（AI未接続）で作られたか */
  draftFromDemo?: boolean;
  /** 医学・トレーニング内容を本人が確認したか */
  contentChecked?: boolean;
  /** 第4版：作業ごとの対応日・期限（未設定の作業は今日やることに出さない） */
  taskSchedule?: Partial<Record<SnsTaskKey, ScheduleDates>>;
  /** 本人が「投稿済み」にした日時（ToDoの完了とは別） */
  postedAt?: ISODateTime;
}

/** 撮影カット案の1行 */
export interface ShotCut {
  id: string;
  /** 何を映すか */
  visual: string;
  /** 話す内容・表示する言葉 */
  words: string;
  /** 目安の秒数 */
  seconds?: number;
}

/** 保存したテーマ候補 */
export interface SnsTheme {
  id: string;
  text: string;
  audience: SnsAudience;
  source: "demo" | "manual";
  createdAt: ISODateTime;
}

// ---------- 予約枠 ----------

export interface WeeklySlot {
  id: string;
  weekday: number; // 0=日 ... 6=土
  start: string; // HH:MM
  end: string;
  label: string;
}

/** 通常の予約枠（時間帯）。曜日ごとの営業有無は weekdayOpen で別に管理 */
export interface StandardSlot {
  id: string;
  start: string; // HH:MM
  end: string;
}

export interface SlotException {
  id: string;
  date: DateKey;
  /** closed=終日休み / slot_closed=特定の枠だけ休み / extra=臨時枠 */
  type: "closed" | "extra" | "slot_closed";
  slotId?: string;
  start?: string;
  end?: string;
  memo: string;
}

// ---------- 設定 ----------

export interface Settings {
  /** デモ用: 現在時刻を進める（分） */
  clockOffsetMin: number;
  /** デモ用: カレンダー同期失敗をシミュレート */
  simulateSyncFailure: boolean;
  seminarIdea: string;
  futureMemo: string;
  /** 台本の下書きに使う、谷口さんの話し方・決まり文句のメモ */
  snsStyleNote?: string;
}

export interface SyncLog {
  at: ISODateTime;
  ok: boolean;
  message: string;
}

export interface AppData {
  version: number;
  seededAt: ISODateTime;
  players: Player[];
  teams: Team[];
  bookings: Booking[];
  todos: Todo[];
  reports: Report[];
  measurements: Measurement[];
  attachments: Attachment[];
  sales: SalesItem[];
  seminars: SeminarEpisode[];
  reels: ReelProject[];
  snsThemes: SnsTheme[];
  weeklySlots: WeeklySlot[];
  slotExceptions: SlotException[];
  /** 通常の予約枠（第3版） */
  standardSlots: StandardSlot[];
  /** 曜日ごとの営業有無（0=日〜6=土）。null は未設定（勝手に決めない） */
  weekdayOpen: (boolean | null)[];
  /** 今回の指導内容のメモ（第3版） */
  lessonPlans: LessonPlan[];
  /** 手動で追加した仕事（第4版） */
  tasks: ManualTask[];
  /** プチセミナーの準備作業のルール（第4版） */
  seminarRules: SeminarRule[];
  /** Googleカレンダー連携（第5版） */
  google: GoogleState;
  settings: Settings;
  syncLogs: SyncLog[];
}
