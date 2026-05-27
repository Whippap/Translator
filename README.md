# Translator

Chrome 翻译插件，基于 AI 对英文技术文档网页实现沉浸式文字翻译。仅处理纯文本节点，图片原样保留。

## 安装

```bash
npm install
npm run build          # 输出到 .output/chrome-mv3/
npm run build:firefox  # Firefox 版本
```

在 Chrome 中加载：
1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3/`

## 开发

```bash
npm run dev        # 开发模式（热更新）
npm run dev:firefox
npm run typecheck  # TypeScript 类型检查
npm run test       # 运行所有单元测试
npm run test:watch # 监听模式
```

## 使用

1. 点击工具栏图标打开 Popup，填入 DeepSeek API Key
2. 选择翻译引擎（`deepseek-v4-flash` / `deepseek-v4-pro`）
3. 选择默认显示模式（英汉对照 / 仅译文）
4. 打开任意英文网页，右下角浮动控制条 → 「翻译本页」

### 浮动控制条

| 按钮 | 功能 |
|---|---|
| 翻译本页 | 手动触发翻译 |
| 重新翻译 | 跳过缓存，重新调用 API 并覆盖缓存（仅缓存命中时显示） |
| 英汉对照 / 仅译文 | 切换显示模式，不重新调用 API |
| 导出 HTML | 下载当前页面的完整 HTML（保留样式和图片） |
| 清除 | 恢复原文，清除翻译结果 |

### 设置项

| 设置 | 默认值 | 说明 |
|---|---|---|
| API Key | — | DeepSeek API 密钥 |
| 翻译引擎 | deepseek-v4-flash | Flash（更快、低成本）/ Pro（更高质量） |
| 默认显示模式 | 英汉对照 | 英汉对照或仅译文 |
| 本地缓存 | 开启 | 相同页面复用缓存翻译；关闭则每次调用 API |
| 插件状态 | 启用 | 关闭后不注入控制条 |

## 技术栈

- **框架**: WXT — Chrome 插件开发框架
- **前端**: React + TypeScript (Popup)
- **运行时**: Chrome Manifest V3 — Content Script + Background Service Worker
- **翻译 API**: DeepSeek API (`api.deepseek.com`)
- **测试**: Vitest + Testing Library

## 项目结构

```
entrypoints/
├── content/                  # 内容脚本
│   ├── index.ts              # 入口：初始化、翻译流程、SPA 路由监听
│   ├── TextExtractor.ts      # 文本提取（TreeWalker，块级分组）
│   ├── DomPatcher.ts         # 译文回插（英汉对照 / 仅译文）
│   └── FloatingBar.ts        # 浮动控制条 UI
├── background/index.ts       # Service Worker（API 调用、会话、缓存）
└── popup/                    # Popup 设置页（React）
    └── components/           # ApiKeyInput, EngineSelect, DisplayModeToggle 等
core/                         # 纯逻辑层（可独立测试）
├── types.ts                  # 共享类型、消息协议、系统提示词
├── storage.ts                # chrome.storage 读写封装
├── session.ts                # 会话管理器
├── translator.ts             # DeepSeek API 调用 + 重试机制
└── cache.ts                  # 翻译结果缓存
tests/                        # 单元测试（46 用例）
```

## 核心设计

### 消息驱动的批量翻译

```
Content Script                Background                   DeepSeek API
    │ 提取文本块, 分配 id         │                             │
    │ 用户点击「翻译本页」        │                             │
    │── translate:batch ──────→ │ 查缓存 → 组装会话消息        │
    │                           │── API 调用 ──────────────→  │
    │                           │←── 返回翻译 ─────────────   │
    │←── 译文 (逐批) ────────── │ 写缓存, 更新会话            │
    │ DOM 回插 (渐进渲染)        │                             │
```

### 会话管理

每个标签页（tabId + URL）创建独立会话，消息历史存储在 `chrome.storage.session`。System Prompt 仅在创建时注入一次，后续请求只追加 user/assistant 消息。利用 DeepSeek 上下文硬盘缓存——messages 前缀不变，从第 2 次请求起历史部分命中缓存，仅新内容计费。会话上限 10 轮，超出后自动新建。

### 翻译缓存

每个文本块以 `cache:<URL 哈希>:<文本哈希>` 为键缓存到 `chrome.storage.local`。再次访问同一页面时优先查缓存，命中则跳过 API 调用，控制条显示「已从缓存加载」。点击「重新翻译」跳过缓存重新获取并覆盖。

## 命令速查

| 命令 | 用途 |
|---|---|
| `npm install` | 安装依赖 |
| `npm run dev` | 开发模式 |
| `npm run build` | 生产构建 |
| `npm run typecheck` | 类型检查 |
| `npm run test` | 运行测试 |
| `npm run test -- --testPathPattern=storage` | 运行单个测试文件 |
