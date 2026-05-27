import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Translator',
    description: 'AI 翻译插件 — 英文技术文档原生级翻译体验',
    permissions: ['storage', 'downloads'],
    host_permissions: ['<all_urls>'],
  },
});