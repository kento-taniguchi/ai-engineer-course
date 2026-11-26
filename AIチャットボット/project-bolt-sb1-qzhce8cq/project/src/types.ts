export interface Conversation {
  id: string;
  dify_conversation_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface DifyStreamEvent {
  event: "message" | "message_replace" | "message_end" | "error";
  answer?: string;
  conversation_id?: string;
  message_id?: string;
  id?: string;
  task_id?: string;
  /** error イベントのときの説明文 */
  message?: string;
  /** error イベントのときのエラー種別 */
  code?: string;
}
