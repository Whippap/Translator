import '@testing-library/jest-dom';
import { vi } from 'vitest';

(globalThis as any).chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
    session: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
  },
  tabs: {
    query: vi.fn(),
    onRemoved: {
      addListener: vi.fn(),
    },
  },
  downloads: {
    download: vi.fn(),
  },
};
