"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import { Modal } from "./ui";

export function PlayerForm({
  title,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  initial?: Player;
  onClose: () => void;
  onSave: (p: Player) => void;
}) {
  const [p, setP] = useState<Player>(
    initial ?? { id: "", name: "", kana: "", grade: "", position: "", affiliation: "", contactMemo: "", notes: "" },
  );
  const set = (k: keyof Player) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value });
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            disabled={!p.name.trim()}
            onClick={() => {
              onSave({ ...p, name: p.name.trim() });
              onClose();
            }}
          >
            保存する
          </button>
        </>
      }
    >
      <p className="xs muted" style={{ marginBottom: 16 }}>
        ※ 試作版には実在の選手の個人情報・怪我の情報を入力しないでください。
      </p>
      <div className="stack-2">
        <label className="field">
          名前（必須）
          <input type="text" value={p.name} onChange={set("name")} />
        </label>
        <label className="field">
          ふりがな
          <input type="text" value={p.kana} onChange={set("kana")} />
        </label>
        <div className="grid-2" style={{ gap: 16 }}>
          <label className="field">
            学年
            <input type="text" value={p.grade} onChange={set("grade")} placeholder="例：中学2年" />
          </label>
          <label className="field">
            ポジション
            <input type="text" value={p.position} onChange={set("position")} />
          </label>
        </div>
        <label className="field">
          所属
          <input type="text" value={p.affiliation} onChange={set("affiliation")} />
        </label>
        <label className="field">
          連絡方法メモ
          <input type="text" value={p.contactMemo} onChange={set("contactMemo")} />
        </label>
        <label className="field">
          メモ
          <textarea value={p.notes} onChange={set("notes")} />
        </label>
      </div>
    </Modal>
  );
}
