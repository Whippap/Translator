import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../../entrypoints/popup/App';

const mockLocal: Record<string, any> = {};

beforeEach(() => {
  Object.keys(mockLocal).forEach(k => delete mockLocal[k]);
  (chrome.storage.local.get as any) = (
    keys: string[] | null,
    cb?: (result: any) => void,
  ) => {
    const result = mockLocal;
    if (cb) return cb(result);
    return Promise.resolve(result);
  };
  (chrome.storage.local.set as any) = (items: Record<string, any>) => {
    Object.assign(mockLocal, items);
    return Promise.resolve();
  };
});

describe('App', () => {
  it('renders the title', () => {
    render(<App />);
    expect(screen.getByText('Translator')).toBeTruthy();
  });

  it('renders API Key input', () => {
    render(<App />);
    expect(screen.getByPlaceholderText('sk-...')).toBeTruthy();
  });

  it('renders engine select with default value', () => {
    render(<App />);
    expect(
      screen.getByText('DeepSeek V4 Flash（更快、低成本）'),
    ).toBeTruthy();
  });

  it('renders display mode toggle', () => {
    render(<App />);
    expect(screen.getByText('英汉对照')).toBeTruthy();
  });

  it('toggles display mode on click', () => {
    render(<App />);
    fireEvent.click(screen.getByText('英汉对照').parentElement!);
    expect(screen.getByText('仅译文')).toBeTruthy();
  });

  it('saves api key on blur', () => {
    render(<App />);
    const input = screen.getByPlaceholderText('sk-...');
    fireEvent.change(input, { target: { value: 'sk-test' } });
    fireEvent.blur(input);
    expect(mockLocal.apiKey).toBe('sk-test');
  });
});
