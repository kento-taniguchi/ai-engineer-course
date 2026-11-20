// データの形（画面・保存先の共通ルール）

/** 日付は "YYYY-MM-DD"、年月は "YYYY-MM" の文字列で扱います */
export type DateKey = string;
export type MonthKey = string;

/** 通常利用する曜日の設定。from の日から有効（次の設定が始まるまで） */
export type ScheduleEntry = {
  from: DateKey;
  /** 0=日, 1=月, ... 6=土 */
  weekdays: number[];
};

export type Member = {
  /** 内部用の会員ID（同姓同名でも区別するため。例：M0001） */
  id: string;
  name: string;
  /** 並び順に使うふりがな（任意） */
  kana: string;
  /** 利用曜日の履歴（古い順） */
  schedules: ScheduleEntry[];
  /** 退会日。この日以降は利用予定者に表示しない。null なら利用中 */
  withdrawnOn: DateKey | null;
  createdAt: string;
  updatedAt: string;
};

/** 出欠の状態。未選択は "unconfirmed"（欠席とは別） */
export type AttendanceStatus = "present" | "absent" | "unconfirmed";

export type DayEntry = {
  memberId: string;
  status: AttendanceStatus;
  /** 通常の曜日以外で、その日だけ追加した（振替など） */
  added: boolean;
};

/** 1日分の出欠記録（保存した時点の内容。曜日を変えても書き換えない） */
export type DayRecord = {
  date: DateKey;
  entries: DayEntry[];
  savedAt: string;
};
