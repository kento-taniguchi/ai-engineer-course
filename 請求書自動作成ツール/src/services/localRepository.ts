// 試作版の保存先：このブラウザの中（localStorage）
// ※ 別の端末・別のブラウザとは共有されません。ブラウザのデータを消すと記録も消えます。
import { createDemoData } from "@/lib/demoData";
import { monthOf } from "@/lib/dates";
import { normalizeMember } from "@/lib/members";
import type { DayRecord, Member } from "@/lib/types";
import type { BackupData, Repository } from "./repository";

const KEY = "attendance-invoice:v1";

type Stored = { version: 1; members: Member[]; days: Record<string, DayRecord> };

function read(): Stored {
  const raw = window.localStorage.getItem(KEY);
  if (raw) {
    const data = JSON.parse(raw) as Stored;
    // 負担割合が入っていない古いデータは、読み込み時に「1割」をおぎなう
    if (data?.version === 1 && Array.isArray(data.members) && data.days) return { ...data, members: data.members.map(normalizeMember) };
  }
  // 初回は架空データを入れる
  const demo = createDemoData();
  const fresh: Stored = { version: 1, members: demo.members, days: Object.fromEntries(demo.days.map((d) => [d.date, d])) };
  write(fresh);
  return fresh;
}

function write(data: Stored) {
  window.localStorage.setItem(KEY, JSON.stringify(data));
}

export function validateBackup(data: unknown): data is BackupData {
  const d = data as BackupData;
  return (
    !!d &&
    d.app === "attendance-invoice" &&
    d.version === 1 &&
    Array.isArray(d.members) &&
    Array.isArray(d.days) &&
    d.members.every((m) => typeof m.id === "string" && typeof m.name === "string" && Array.isArray(m.schedules)) &&
    d.days.every((x) => typeof x.date === "string" && Array.isArray(x.entries))
  );
}

export const localRepository: Repository = {
  label: "このブラウザ",
  kind: "local",
  async listMembers() {
    return read().members;
  },
  async saveMember(member) {
    const data = read();
    const i = data.members.findIndex((m) => m.id === member.id);
    if (i >= 0) data.members[i] = member;
    else data.members.push(member);
    write(data);
  },
  async getDay(date) {
    return read().days[date] ?? null;
  },
  async saveDay(record) {
    const data = read();
    data.days[record.date] = record;
    write(data);
  },
  async listDaysInMonth(ym) {
    return Object.values(read().days)
      .filter((d) => monthOf(d.date) === ym)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  async exportAll() {
    const data = read();
    return {
      app: "attendance-invoice",
      version: 1,
      exportedAt: new Date().toISOString(),
      members: data.members,
      days: Object.values(data.days).sort((a, b) => a.date.localeCompare(b.date)),
    };
  },
  async importAll(backup) {
    if (!validateBackup(backup)) throw new Error("このアプリのバックアップファイルではありません");
    write({ version: 1, members: backup.members.map(normalizeMember), days: Object.fromEntries(backup.days.map((d) => [d.date, d])) });
  },
  async resetToDemo() {
    window.localStorage.removeItem(KEY);
    read();
  },
};
