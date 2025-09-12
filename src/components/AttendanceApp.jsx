import { useEffect, useMemo, useState } from "react";
import emailjs from "@emailjs/browser";
import groupsData from "../data/groups.json";
import teachersData from "../data/teachers.json";
// import GroupSelector from "./GroupSelector";  // 🔒 Comentado para uso futuro
import { formatDateForCO, todayISO } from "../utils/dates";
import { shortName } from "../utils/names";

const EMAILJS_SERVICE_ID = "service_2kchrz6";
const EMAILJS_TEMPLATE_ID = "template_z5m0rsd";
const EMAILJS_PUBLIC_KEY  = "Jq93V4hq-fbPChlCw";

export default function AttendanceApp({ teacherEmail, onChangeUser }) {
  // Encontrar docente
  const teacher = useMemo(
    () => teachersData.find((t) => t.email === teacherEmail) || null,
    [teacherEmail]
  );

  // Seguridad: si no existe el docente en el JSON
  useEffect(() => {
    if (!teacher) {
      onChangeUser?.(); 
    }
  }, [teacher, onChangeUser]);

  const [dateStr, setDateStr] = useState(() => todayISO());
  const [groupId, setGroupId] = useState("");

  // Autoasignar siempre el grupo asignado al docente
  useEffect(() => {
    if (!teacher) return;
    const only = teacher.assignedGrades?.[0] || ""; // primer grupo asignado
    setGroupId(only);
  }, [teacher]);

  const groupsById = useMemo(() => {
    const m = new Map();
    for (const g of groupsData) m.set(g.id, g);
    return m;
  }, []);

  const currentGroup = groupId ? groupsById.get(groupId) : null;
  const students = currentGroup?.students ?? [];

  // Asistencia
  const [attendance, setAttendance] = useState({});
  useEffect(() => {
    if (!currentGroup) return;
    const key = `attendance:${currentGroup.id}:${dateStr}`;
    const saved = localStorage.getItem(key);
    if (saved) setAttendance(JSON.parse(saved));
    else {
      const init = {};
      for (const s of students) init[s.id] = true;
      setAttendance(init);
    }
  }, [currentGroup, dateStr, students]);

  useEffect(() => {
    if (!currentGroup) return;
    const key = `attendance:${currentGroup.id}:${dateStr}`;
    localStorage.setItem(key, JSON.stringify(attendance));
  }, [attendance, currentGroup, dateStr]);

  const absentees = useMemo(
    () => students.filter((s) => attendance[s.id] === false),
    [students, attendance]
  );

  const allPresent = useMemo(
    () => students.length > 0 && students.every((s) => attendance[s.id] === true),
    [students, attendance]
  );

  function toggleOne(id) {
    setAttendance((p) => ({ ...p, [id]: !p[id] }));
  }
  function setAll(value) {
    const next = {};
    for (const s of students) next[s.id] = value;
    setAttendance(next);
  }
  function toggleAll() {
    setAll(!allPresent);
  }

  // ==== Estados para modales ====
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  // Paso 1: abrir modal de confirmación
  function sendEmail() {
    if (!teacher || !currentGroup) return;

    const fecha = formatDateForCO(dateStr);
    const absentCount = absentees.length;

    setConfirmData({ fecha, grupo: currentGroup.name, absentCount });
    setShowConfirm(true); 
  }

  // Paso 2: si el usuario acepta en el modal, enviamos
  async function handleConfirmSend() {
    setShowConfirm(false);
    const { fecha, grupo, absentCount } = confirmData;

    const subject = `Inasistencia ${grupo} · Fecha: ${fecha.replace(/\//g, "-")}`;
    const header =
      `Reporte de inasistencia\n` +
      `Docente: ${teacher.name}\n` +
      `Rol: ${teacher.role}\n` +
      `Grupo: ${grupo}\n` +
      `Fecha: ${fecha}\n\n`;

    const body =
      absentCount === 0
        ? `${header}Asistieron todos los estudiantes.`
        : header + absentees.map((s) => `${s.id}. ${s.name}`).join("\n");

    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        { subject, body },
        EMAILJS_PUBLIC_KEY
      );
      setShowSuccess(true); // ✅ modal de éxito
    } catch (e) {
      console.error(e);
      setShowError(true);   // ❌ modal de error
    }
  }

  function handleChangeUser() {
    localStorage.removeItem("attendance:selectedTeacherEmail");
    onChangeUser?.();
  }

  return (
    <div className="container">
      <header className="card">
        <h1 className="text-center">
          Llamado a Lista {teacher?.role === "primaria" && currentGroup && (
            <span>{currentGroup.name}</span>
          )}
        </h1>

        {teacher && (
          <div className="row">
            <div className="pill">Docente: <strong>{teacher.name}</strong></div>
            <button className="btn linklike" onClick={handleChangeUser}>
              Cambiar usuario
            </button>
          </div>
        )}

        <div className="controls inline-label">
          <div className="row">
            <label className="inline-label">
              Fecha:
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
              />
            </label>
          </div>

          <div className="row">
            <button className="btn secundary" onClick={toggleAll} disabled={!currentGroup}>
              {allPresent ? "Marcar todos: Faltaron" : "Marcar todos: Asistieron"}
            </button>
            <button className="btn primary" onClick={sendEmail} disabled={!currentGroup}>
              Enviar reporte
            </button>
          </div>
        </div>
      </header>

      <section className="card">
        <h2 className="text-center">
          {currentGroup ? `Estudiantes · ${currentGroup.name}` : "Sin grupo asignado"}
        </h2>

        {currentGroup && (
          <>
            <div className="stats-section">
              <div className="pill">Total: {students.length}</div>
              <div className="pill">Ausentes: {absentees.length}</div>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Asistencia</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{shortName(s.name)}</td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={attendance[s.id] ?? false}
                          onChange={() => toggleOne(s.id)}
                        />
                        <span className="slider"></span>
                      </label>
                      <span className={`badge ${attendance[s.id] ? "yes" : "no"}`}>
                        {attendance[s.id] ? "Asistió" : "Faltó"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {/* ==== MODALES ==== */}
      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Confirmar envío</h2>
            <p>
              ¿Enviar el reporte de inasistencia del <b>{confirmData.fecha}</b>?<br />
              Grupo: <b>{confirmData.grupo}</b><br />
              Ausentes: <b>{confirmData.absentCount}</b>
            </p>
            <div className="modal-actions">
              <button className="modal-btn primary" onClick={handleConfirmSend}>Aceptar</button>
              <button className="modal-btn secondary" onClick={() => setShowConfirm(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="modal-overlay">
          <div className="modal-card success">
            <h2>✅ Reporte enviado</h2>
            <button className="modal-btn primary" onClick={() => setShowSuccess(false)}>Aceptar</button>
          </div>
        </div>
      )}

      {showError && (
        <div className="modal-overlay">
          <div className="modal-card error">
            <h2>❌ No se pudo enviar</h2>
            <p>Verifica credenciales y plantilla en EmailJS.</p>
            <button className="modal-btn primary" onClick={() => setShowError(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
