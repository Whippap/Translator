import type { ChatMessage, SessionId } from './types';
import { SYSTEM_PROMPT, MAX_SESSION_ROUNDS } from './types';

export async function createSession(tabId: number, url: string): Promise<SessionId> {
  return createSessionWithKey(tabId, url);
}

export async function createSessionWithKey(tabId: number, url: string): Promise<SessionId> {
  const safeUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const parsed = new URL(safeUrl);
  const normalizedUrl = parsed.hostname + parsed.pathname;
  const sessionId: SessionId = `session_${tabId}_${normalizedUrl}`;
  const initialMessages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  await chrome.storage.session.set({ [sessionId]: initialMessages });
  return sessionId;
}

export async function appendMessage(
  sessionId: SessionId,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const messages = await getMessages(sessionId);
  messages.push({ role, content });
  await chrome.storage.session.set({ [sessionId]: messages });
}

export async function getMessages(sessionId: SessionId): Promise<ChatMessage[]> {
  const result = await chrome.storage.session.get(sessionId) as Record<string, ChatMessage[] | undefined>;
  return result[sessionId] ?? [];
}

export async function isSessionFull(sessionId: SessionId): Promise<boolean> {
  const messages = await getMessages(sessionId);
  const rounds = Math.floor((messages.length - 1) / 2);
  return rounds >= MAX_SESSION_ROUNDS;
}

export async function endSession(sessionId: SessionId): Promise<void> {
  await chrome.storage.session.remove(sessionId);
}
