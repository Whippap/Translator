interface Props {
  value: boolean;
  onChange: (val: boolean) => void;
}

export function CacheToggle({ value, onChange }: Props) {
  return (
    <div className="setting-group">
      <label>本地缓存</label>
      <div className="toggle" onClick={() => onChange(!value)}>
        <div className={`toggle-switch ${value ? 'active' : ''}`} />
        <span>{value ? '已启用' : '已停用'}</span>
      </div>
      <div className="hint">
        {value
          ? '访问相同页面时自动使用缓存翻译，节省 API 费用'
          : '每次翻译都重新调用 API'}
      </div>
    </div>
  );
}
