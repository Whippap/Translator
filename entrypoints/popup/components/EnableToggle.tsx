interface Props {
  value: boolean;
  onChange: (val: boolean) => void;
}

export function EnableToggle({ value, onChange }: Props) {
  return (
    <div className="setting-group">
      <label>插件状态</label>
      <div className="toggle" onClick={() => onChange(!value)}>
        <div className={`toggle-switch ${value ? 'active' : ''}`} />
        <span>{value ? '已启用' : '已停用'}</span>
      </div>
    </div>
  );
}
