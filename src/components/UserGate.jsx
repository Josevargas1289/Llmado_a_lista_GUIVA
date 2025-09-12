import { useMemo, useState, useEffect, useCallback } from "react";

/**
 * UserGate por email:
 * - Input de correo
 * - Valida contra teachers.json (prop "teachers")
 * - Si existe, onConfirm(emailNormalizado)
 */
export default function UserGate({ teachers, onConfirm }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const byEmail = useMemo(() => {
    const map = new Map();
    for (const t of teachers) {
      if (!t?.email) continue;
      map.set(String(t.email).trim().toLowerCase(), t);
    }
    return map;
  }, [teachers]);

  useEffect(() => {
    setError(""); // limpiar error al cambiar lista o montar
  }, [byEmail]);

  const handleSubmit = useCallback(
    (e) => {
      e?.preventDefault?.();
      const normalized = String(email).trim().toLowerCase();
      if (!normalized) {
        setError("Por favor, escribe tu correo.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        setError("Formato de correo inválido.");
        return;
      }
      const teacher = byEmail.get(normalized);
      if (!teacher) {
        setError("Correo no encontrado. Verifica que esté en el listado de docentes.");
        return;
      }
      onConfirm(normalized);
    },
    [email, byEmail, onConfirm]
  );

  return (
    <div className="container">
      <header className="card">
        <h1 className="text-center">Llamado a Lista</h1>
        <p className="text-center">Ingresa tu correo institucional para continuar.</p>
      </header>

      <section className="card">
        <form onSubmit={handleSubmit}>
          <label className="label" htmlFor="email">Correo institucional</label>
          <input
            id="email"
            type="email"
            className="input"
            placeholder="tudocente@colegio.edu.co"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
            autoComplete="email"
            autoFocus
          />
          {error && <p className="error" role="alert">{error}</p>}

          <div className="" style={{ marginTop: 12, textAlign: "center" }}>
            <button type="submit" className="btn primary">
              Continuar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
