type BarState = 'idle' | 'translating' | 'done' | 'done-cached' | 'error';

interface FloatingBarCallbacks {
  onTranslate: () => void;
  onReTranslate: () => void;
  onToggleMode: () => void;
  onExport: () => void;
  onClear: () => void;
}

export class FloatingBar {
  private el: HTMLElement;
  private state: BarState = 'idle';

  constructor(private calls: FloatingBarCallbacks) {
    this.el = this.createBar();
  }

  private createBar(): HTMLElement {
    const el = document.createElement('div');
    el.className = '__translator_bar';
    el.innerHTML = `
      <button class="__translator_primary __translator_btn_translate">翻译本页</button>
      <span class="__translator_divider"></span>
      <button class="__translator_btn_mode">英汉对照</button>
      <button class="__translator_btn_export">导出 HTML</button>
      <button class="__translator_btn_clear">清除</button>
      <span class="__translator_status"></span>
    `;

    // 先将 this.el 指向新元素，确保 translateBtn/statusEl 可正常工作
    this.el = el;

    this.translateBtn().addEventListener('click', () => {
      if (this.state === 'done-cached') {
        this.calls.onReTranslate();
      } else {
        this.calls.onTranslate();
      }
    });
    el.querySelector('.__translator_btn_mode')!.addEventListener(
      'click', () => this.calls.onToggleMode(),
    );
    el.querySelector('.__translator_btn_export')!.addEventListener(
      'click', () => this.calls.onExport(),
    );
    el.querySelector('.__translator_btn_clear')!.addEventListener(
      'click', () => this.calls.onClear(),
    );

    return el;
  }

  private translateBtn(): HTMLButtonElement {
    return this.el.querySelector('.__translator_btn_translate')! as HTMLButtonElement;
  }

  private statusEl(): HTMLElement {
    return this.el.querySelector('.__translator_status')!;
  }

  mount(): void { document.body.appendChild(this.el); }
  unmount(): void { this.el.remove(); }

  setProgress(current: number, total: number): void {
    this.state = 'translating';
    const btn = this.translateBtn();
    btn.textContent = '翻译中...';
    btn.setAttribute('disabled', 'true');
    this.statusEl().textContent = `正在翻译 ${current}/${total}`;
    this.statusEl().className = '__translator_status';
  }

  setDone(): void {
    this.state = 'done';
    const btn = this.translateBtn();
    btn.textContent = '翻译本页';
    btn.removeAttribute('disabled');
    this.statusEl().textContent = '翻译完成';
    this.statusEl().className = '__translator_status';
  }

  /** 全部从缓存加载时显示，提供重新翻译入口 */
  setDoneCached(): void {
    this.state = 'done-cached';
    const btn = this.translateBtn();
    btn.textContent = '重新翻译';
    btn.removeAttribute('disabled');
    this.statusEl().textContent = '已从缓存加载 · 点击重新翻译';
    this.statusEl().className = '__translator_status';
  }

  setError(message: string): void {
    this.state = 'error';
    const btn = this.translateBtn();
    btn.textContent = '重试';
    btn.removeAttribute('disabled');
    this.statusEl().textContent = message;
    this.statusEl().className = '__translator_status __translator_error';
  }

  setMode(mode: 'bilingual' | 'translation-only'): void {
    const btn = this.el.querySelector('.__translator_btn_mode')!;
    btn.textContent = mode === 'bilingual' ? '英汉对照' : '仅译文';
  }

  setIdle(): void {
    this.state = 'idle';
    const btn = this.translateBtn();
    btn.textContent = '翻译本页';
    btn.removeAttribute('disabled');
    this.statusEl().textContent = '';
    this.statusEl().className = '__translator_status';
  }
}
