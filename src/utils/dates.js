export function formatDateForCO(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-CO", { timeZone: "America/Bogota" });
}

export function todayISO() {
  const t = new Date();
  return t.toISOString().split("T")[0]; // yyyy-mm-dd
}