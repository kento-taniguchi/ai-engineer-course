import { useState } from 'react';
import { CalendarClock, CornerDownRight, Star } from 'lucide-react';
import type { TaskTemplate } from '@/lib/supabase';
import { formatDateTime, toInputValue } from '@/lib/date';
import { buildFromTemplate, priorityMeta, timingLabel } from '@/lib/tasks';
import { Field, Modal, ghostButton, inputClass, primaryButton } from '@/components/ui';

interface Props {
  template: TaskTemplate;
  now: Date;
  onApply: (base: Date) => void;
  onClose: () => void;
}

/** 初期値：次のちょうどの時刻（例：今が 14:20 なら 15:00） */
function nextHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toInputValue(d.toISOString());
}

/** セットを登録する前に、コアタスクの「実施日時」を選ぶ画面 */
export function ApplyTemplateDialog({ template, now, onApply, onClose }: Props) {
  const [value, setValue] = useState(nextHour);
  const base = value ? new Date(value) : null;
  const valid = !!base && !Number.isNaN(base.getTime());
  const { core, subs } = buildFromTemplate(template, valid ? base : null);
  const rows = [core, ...subs];

  return (
    <Modal
      title={`「${template.name}」を登録`}
      onClose={onClose}
      footer={
        <>
          <div className="flex-1" />
          <button onClick={onClose} className={ghostButton}>
            キャンセル
          </button>
          <button onClick={() => valid && base && onApply(base)} disabled={!valid} className={primaryButton}>
            {rows.length}件を登録
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={`実施日時（${template.items[0].title}）`}>
          <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} autoFocus />
        </Field>

        <ul className="space-y-1.5">
          {rows.map((r, idx) => {
            const item = template.items[idx];
            const at = r.scheduled_at ?? null;
            const past = !!at && new Date(at).getTime() < now.getTime();
            return (
              <li
                key={idx}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  idx === 0 ? 'border-navy-200 bg-navy-50' : 'ml-5 border-navy-100'
                }`}
              >
                {idx === 0 ? <Star className="h-3.5 w-3.5 shrink-0 text-navy" /> : <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-navy-300" />}
                <span className={`h-2 w-2 shrink-0 rounded-full ${priorityMeta(item.priority).stripe}`} />
                <span className={`min-w-0 flex-1 truncate ${idx === 0 ? 'font-bold text-navy' : 'text-slate-700'}`}>
                  {item.title}
                  {idx > 0 && <span className="ml-1 text-[11px] font-normal text-slate-400">{timingLabel(item.timing)}</span>}
                </span>
                {at ? (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                      past ? 'bg-red-600 font-bold text-white' : 'bg-navy text-white'
                    }`}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {formatDateTime(at)}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-slate-400">カレンダーなし</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
