import { useState } from 'react';

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export function ApiKeyInput({ value, onChange }: Props) {
  const [localValue, setLocalValue] = useState(value);
  const [saved, setSaved] = useState(false);

  const handleBlur = () => {
    onChange(localValue);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="setting-group">
      <label>DeepSeek API Key</label>
      <input
        type="password"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="sk-..."
      />
      <div className="save-status">{saved ? '已保存' : ''}</div>
    </div>
  );
}
