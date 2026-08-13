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

export function deleteSession(callSid: string): void {
  sessions.delete(callSid);
}
