import { describe, it, expect, afterEach } from 'vitest';
import { createSession, getSession, deleteSession } from './callSession.js';

describe('callSession', () => {
  afterEach(() => {
    deleteSession('CA123');
  });

  it('creates a session with empty items and finalized=false', () => {
    const session = createSession('CA123');
    expect(session.callSid).toBe('CA123');
    expect(session.items).toEqual([]);
    expect(session.finalized).toBe(false);
  });

  it('retrieves a created session by callSid', () => {
    createSession('CA123');
    expect(getSession('CA123')?.callSid).toBe('CA123');
  });

  it('returns undefined for a session that does not exist', () => {
    expect(getSession('CA-nonexistent')).toBeUndefined();
  });

  it('removes a session on delete', () => {
    createSession('CA123');
    deleteSession('CA123');
    expect(getSession('CA123')).toBeUndefined();
  });
});
