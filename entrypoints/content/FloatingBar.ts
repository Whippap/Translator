type BarState = 'idle' | 'translating' | 'done' | 'error';

interface FloatingBarCallbacks {
  onTranslate: () => void;
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

    el.querySelector('.__translator_btn_translate')!.addEventListener(
      'click',
      () => this.calls.onTranslate(),
    );
    el.querySelector('.__translator_btn_mode')!.addEventListener(
      'click',
      () => this.calls.onToggleMode(),
    );
    el.querySelector('.__translator_btn_export')!.addEventListener(
      'click',
      () => this.calls.onExport(),
    );
    el.querySelector('.__translator_btn_clear')!.addEventListener(
      'click',
      () => this.calls.onClear(),
    );

    return el;
  }

  mount(): void {
    document.body.appendChild(this.el);
  }

  unmount(): void {
    this.el.remove();
  }

  setProgress(current: number, total: number): void {
    if (this.state !== 'translating') {
      this.state = 'translating';
      const btn = this.el.querySelector('.__translator_btn_translate')!;
      btn.textContent = '翻译中...';
      btn.setAttribute('disabled', 'true');
    }
    const status = this.el.querySelector('.__translator_status')!;
    status.textContent = `正在翻译 ${current}/${total}`;
    status.className = '__translator_status';
  }

  setDone(): void {
    this.state = 'done';
    const btn = this.el.querySelector(
      '.__translator_btn_translate',
    )! as HTMLButtonElement;
    btn.textContent = '翻译本页';
    btn.removeAttribute('disabled');
    const status = this.el.querySelector('.__translator_status')!;
    status.textContent = '翻译完成';
    status.className = '__translator_status';
  }

  setError(message: string): void {
    this.state = 'error';
    const btn = this.el.querySelector(
      '.__translator_btn_translate',
    )! as HTMLButtonElement;
    btn.textContent = '重试';
    btn.removeAttribute('disabled');
    const status = this.el.querySelector('.__translator_status')!;
    status.textContent = message;
    status.className = '__translator_status __translator_error';
  }

  setMode(mode: 'bilingual' | 'translation-only'): void {
    const btn = this.el.querySelector('.__translator_btn_mode')!;
    btn.textContent = mode === 'bilingual' ? '英汉对照' : '仅译文';
  }

  setIdle(): void {
    this.state = 'idle';
    const btn = this.el.querySelector(
      '.__translator_btn_translate',
    )! as HTMLButtonElement;
    btn.textContent = '翻译本页';
    btn.removeAttribute('disabled');
    const status = this.el.querySelector('.__translator_status')!;
    status.textContent = '';
    status.className = '__translator_status';
  }
}
