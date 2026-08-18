export type OrderType = 'pickup' | 'delivery';

export interface OrderItemDraft {
  name: string;
  quantity: number;
  notes?: string;
}

export interface CallSession {
  callSid: string;
  items: OrderItemDraft[];
  type?: OrderType;
  address?: string;
  customerName?: string;
  finalized: boolean;
}

const sessions = new Map<string, CallSession>();

export function createSession(callSid: string): CallSession {
  const session: CallSession = { callSid, items: [], finalized: false };
  sessions.set(callSid, session);
  return session;
}

export function getSession(callSid: string): CallSession | undefined {
  return sessions.get(callSid);
}

/**
 * Returns the existing session for an id, creating an empty one if none exists.
 * Used by the ElevenLabs tool webhooks: the first tool call of a conversation
 * lazily creates the session (keyed by ElevenLabs' conversation_id), and every
 * later tool call in the same conversation reuses it.
 */
export function getOrCreateSession(id: string): CallSession {
  return sessions.get(id) ?? createSession(id);
}

export function deleteSession(callSid: string): void {
  sessions.delete(callSid);
}
