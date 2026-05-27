// ── 翻译块 ──

export interface TextBlock {
  /** 唯一标识，如 "b1", "b2" */
  id: string;
  /** 拼接后的完整原文 */
  text: string;
  /** 块级父元素的 CSS 选择器路径，用于回插定位 */
  parentSelector: string;
}

export interface TranslatedBlock {
  id: string;
  text: string;
  fromCache: boolean;
}

// ── 设置 ──

export interface Settings {
  apiKey: string;
  engine: 'deepseek-v4-pro' | 'deepseek-v4-flash';
  displayMode: 'bilingual' | 'translation-only';
  enabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  engine: 'deepseek-v4-flash',
  displayMode: 'bilingual',
  enabled: true,
};

// ── 会话消息 ──

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type SessionId = string;

// ── 缓存 ──

export interface CacheEntry {
  source: string;
  translated: string;
  model: string;
  timestamp: number;
}

// ── 消息协议 ──

export const MESSAGE_TYPES = {
  TRANSLATE_BATCH: 'translate:batch',
  CLEAR_SESSION: 'translate:clear-session',
  GET_SETTINGS: 'get-settings',
  EXPORT_HTML: 'translate:export-html',
} as const;

export interface TranslateBatchRequest {
  type: typeof MESSAGE_TYPES.TRANSLATE_BATCH;
  items: TextBlock[];
  sessionId: SessionId;
}

export interface TranslateBatchResponse {
  results: TranslatedBlock[];
  allCached: boolean;
}

export interface ClearSessionRequest {
  type: typeof MESSAGE_TYPES.CLEAR_SESSION;
  sessionId: SessionId;
}

export interface ExportHtmlRequest {
  type: typeof MESSAGE_TYPES.EXPORT_HTML;
  html: string;
  filename: string;
}

// ── 系统提示词 ──

export const SYSTEM_PROMPT = `你是一个专业的技术文档翻译引擎。你的任务是精确翻译给定的JSON对象，并保持原文风格。必须严格遵守以下规则：
1. 输入是一个JSON数组，每个元素包含一个\`id\`和一个待翻译的\`text\`。
2. 必须原样返回一个JSON数组，包含每个翻译项，使用相同的\`id\`和翻译后的\`text\`。
3. 对 \`<code>\`、\`<pre>\` 等标签内的内容不作翻译。
4. 本次翻译的多个文本节点来自同一篇技术文档，请注意保持上下文连贯，确保术语、句式风格前后一致。
5. 只返回JSON数组，不要包含任何其他解释。`;

// ── 常量 ──

export const MAX_SESSION_ROUNDS = 10;
export const BATCH_SIZE = 10;
export const MAX_TEXT_BLOCKS = 500;
export const MAX_RETRIES = 2;
export const API_BASE_URL = 'https://api.deepseek.com/v1/chat/completions';
