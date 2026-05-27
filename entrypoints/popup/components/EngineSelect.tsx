interface Props {
  value: string;
  onChange: (val: 'deepseek-v4-pro' | 'deepseek-v4-flash') => void;
}

export function EngineSelect({ value, onChange }: Props) {
  return (
    <div className="setting-group">
      <label>翻译引擎</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as 'deepseek-v4-pro' | 'deepseek-v4-flash')}
      >
        <option value="deepseek-v4-flash">
          DeepSeek V4 Flash（更快、低成本）
        </option>
        <option value="deepseek-v4-pro">
          DeepSeek V4 Pro（更高质量）
        </option>
      </select>
    </div>
  );
}
