import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  appendMessage,
  getMessages,
  isSessionFull,
  endSession,
} from '../../core/session';
import { SYSTEM_PROMPT, MAX_SESSION_ROUNDS } from '../../core/types';

const mockSessionData: Record<string, any> = {};

beforeEach(() => {
  Object.keys(mockSessionData).forEach(k => delete mockSessionData[k]);
  // @ts-expect-error mock for tests
  chrome.storage.session = {
    get: async (keys: string | string[] | null) => {
      if (keys === null) return { ...mockSessionData };
      const keyArr = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, any> = {};
      for (const key of keyArr) {
        if (key in mockSessionData) result[key] = mockSessionData[key];
      }
      return result;
    },
    set: async (items: Record<string, any>) => {
      Object.assign(mockSessionData, items);
    },
    remove: async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const key of arr) delete mockSessionData[key];
    },
  };
});

describe('createSession', () => {
  it('creates a session with system prompt as first message', async () => {
    const sid = await createSession(1, 'https://example.com');
    expect(sid).toContain('session_1_');
    const msgs = await getMessages(sid);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe(SYSTEM_PROMPT);
  });
});

describe('appendMessage', () => {
  it('appends a user message to existing session', async () => {
    const sid = await createSession(1, 'https://example.com');
    await appendMessage(sid, 'user', 'Hello');
    const msgs = await getMessages(sid);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('appends an assistant message after user message', async () => {
    const sid = await createSession(1, 'https://example.com');
    await appendMessage(sid, 'user', 'Q');
    await appendMessage(sid, 'assistant', 'A');
    const msgs = await getMessages(sid);
    expect(msgs).toHaveLength(3);
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'A' });
  });
});

describe('isSessionFull', () => {
  it('returns false for a new session', async () => {
    const sid = await createSession(1, 'https://example.com');
    expect(await isSessionFull(sid)).toBe(false);
  });

  it('returns true after 10 rounds of user-assistant interaction', async () => {
    const sid = await createSession(1, 'https://example.com');
    for (let i = 0; i < MAX_SESSION_ROUNDS; i++) {
      await appendMessage(sid, 'user', `batch ${i}`);
      await appendMessage(sid, 'assistant', `result ${i}`);
    }
    expect(await isSessionFull(sid)).toBe(true);
  });
});

describe('endSession', () => {
  it('removes session data from storage', async () => {
    const sid = await createSession(1, 'https://example.com');
    await endSession(sid);
    const msgs = await getMessages(sid);
    expect(msgs).toEqual([]);
  });
});

describe('createSession uniqueness', () => {
  it('creates different sessions for different tabIds', async () => {
    const sid1 = await createSession(1, 'https://example.com');
    const sid2 = await createSession(2, 'https://example.com');
    expect(sid1).not.toBe(sid2);
  });
});
