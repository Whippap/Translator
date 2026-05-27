/**
 * Shared mock utilities for chrome.storage in tests.
 * Usage: call setupChromeMock() in beforeEach to get a clean mock storage.
 */

export interface MockStorage {
  _data: Record<string, unknown>;
  setupLocal(): void;
  setupSession(): void;
}

export function createMockStorage(): MockStorage {
  const store: MockStorage = {
    _data: {},

    setupLocal() {
      // @ts-expect-error mocking chrome API with simplified types
      chrome.storage.local = {
        get: (keys: string | string[] | null) => {
          if (keys === null) return Promise.resolve({ ...store._data });
          const keyArr = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const key of keyArr) {
            if (key in store._data) result[key] = store._data[key];
          }
          return Promise.resolve(result);
        },
        set: (items: Record<string, unknown>) => {
          Object.assign(store._data, items);
          return Promise.resolve();
        },
        remove: (keys: string | string[]) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const key of arr) delete store._data[key];
          return Promise.resolve();
        },
      } as unknown as typeof chrome.storage.local;
    },

    setupSession() {
      // @ts-expect-error mocking chrome API with simplified types
      chrome.storage.session = {
        get: (keys: string | string[] | null) => {
          if (keys === null) return Promise.resolve({ ...store._data });
          const keyArr = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const key of keyArr) {
            if (key in store._data) result[key] = store._data[key];
          }
          return Promise.resolve(result);
        },
        set: (items: Record<string, unknown>) => {
          Object.assign(store._data, items);
          return Promise.resolve();
        },
        remove: (keys: string | string[]) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const key of arr) delete store._data[key];
          return Promise.resolve();
        },
      } as unknown as typeof chrome.storage.session;
    },
  };
  return store;
}
