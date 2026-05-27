interface Props {
  value: string;
  onChange: (val: 'bilingual' | 'translation-only') => void;
}

export function DisplayModeToggle({ value, onChange }: Props) {
  const isBilingual = value === 'bilingual';

  return (
    <div className="setting-group">
      <label>默认显示模式</label>
      <div
        className="toggle"
        onClick={() =>
          onChange(isBilingual ? 'translation-only' : 'bilingual')
        }
      >
        <div className={`toggle-switch ${isBilingual ? 'active' : ''}`} />
        <span>{isBilingual ? '英汉对照' : '仅译文'}</span>
      </div>
    </div>
  );
}
