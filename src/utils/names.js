export function shortName(full) {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  // Ejemplo rápido: Apellido1 + Nombre1
  const nombre = parts[2] ?? parts[0];
  const apellido = parts[0];
  return `${nombre} ${apellido}`.trim();
}