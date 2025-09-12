import { useEffect, useMemo } from "react";

export default function TeacherSelector({ teachers, selectedEmail, onSelect }) {
  const sorted = useMemo(
    () => [...teachers].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [teachers]
  );

  useEffect(() => {
    const saved = localStorage.getItem("attendance:selectedTeacherEmail");
    if (!selectedEmail && saved) onSelect(saved);
  }, [selectedEmail, onSelect]);

  return (
    <div className="card">
      <h2>Selecciona tu usuario</h2>
      <select
        className="select"
        value={selectedEmail || ""}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>— Elegir docente —</option>
        {sorted.map(t => (
          <option key={t.email} value={t.email}>
            {t.name} · {t.role === "primaria" ? "Primaria" : "Secundaria"}
          </option>
        ))}
      </select>
    </div>
  );
}