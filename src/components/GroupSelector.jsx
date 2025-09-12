export default function GroupSelector({ groups, allowedIds, value, onChange }) {
  const allowed = groups.filter(g => allowedIds.includes(g.id));

  return (
    <div className="card">
      <h3>Selecciona el grupo para pasar lista hoy</h3>
      <select
        className="select"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>— Elegir grupo —</option>
        {allowed.map(g => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
    </div>
  );
}