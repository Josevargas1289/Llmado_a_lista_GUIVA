import { useEffect, useMemo, useState } from "react";
import emailjs from "@emailjs/browser";
import groupsData from "../data/groups.json";
import teachersData from "../data/teachers.json";
import GroupSelector from "./GroupSelector";
import { formatDateForCO, todayISO } from "../utils/dates";
import { shortName } from "../utils/names";

// Normalizador para evitar fallos por espacios o mayúsculas
const norm = (v) => String(v ?? "").trim().toLowerCase();

// Selector especial para secundaria:
// - muestra TODOS los grupos con level "secundaria"
// - marca los asignados con "(Asignado)"
function SecondaryGroupSelector({ groups, assignedIds, value, onChange }) {
  const assignedSet = useMemo(() => new Set((assignedIds || []).map(norm)), [assignedIds]);

  const parseId = (id) => {
    const s = String(id ?? "").trim();
    const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) return { grade: 999, section: 999, raw: s };
    return { grade: Number(m[1]), section: Number(m[2]), raw: s };
  };

  const options = useMemo(() => {
    const secondary = (groups || []).filter((g) => norm(g.level) === "secundaria");
    return [...secondary].sort((a, b) => {
      const A = parseId(a.id);
      const B = parseId(b.id);
      if (A.grade !== B.grade) return A.grade - B.grade;
      if (A.section !== B.section) return A.section - B.section;
      return String(a.name).localeCompare(String(b.name), "es");
    });
  }, [groups]);

  return (
    <div style={{ width: "100%" }}>
      <label style={{ width: "100%" }}>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          📚 <b>Grupo</b>
        </span>
        <select className="select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>
            — Elegir grupo —
          </option>
          {options.map((g) => {
            const isAssigned = assignedSet.has(norm(g.id));
            return (
              <option key={g.id} value={g.id}>
                {g.name}
                {isAssigned ? " (Asignado)" : ""}
              </option>
            );
          })}
        </select>
      </label>

      <p style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        Los cursos con <b>(Asignado)</b> pertenecen a tu asignación.
      </p>
    </div>
  );
}

export default function AttendanceApp({ teacherEmail, onChangeUser }) {
  // ===== Docente =====
  const teacher = useMemo(() => {
    const emailN = norm(teacherEmail);
    return teachersData.find((t) => norm(t.email) === emailN) || null;
  }, [teacherEmail]);

  useEffect(() => {
    if (!teacher) onChangeUser?.();
  }, [teacher, onChangeUser]);

  const [dateStr, setDateStr] = useState(() => todayISO());
  const [groupId, setGroupId] = useState("");

  const assignedIds = useMemo(() => teacher?.assignedGrades ?? [], [teacher]);

  // Mapa de grupos
  const groupsById = useMemo(() => {
    const m = new Map();
    for (const g of groupsData) m.set(norm(g.id), g);
    return m;
  }, []);

  // ✅ Asignación inicial según rol
  useEffect(() => {
    if (!teacher) return;

    const firstAssigned = teacher.assignedGrades?.[0]
      ? String(teacher.assignedGrades[0]).trim()
      : "";

    setGroupId(firstAssigned);
  }, [teacher]);

  // Debug si el grupo asignado no existe
  useEffect(() => {
    if (!teacher) return;
    if (!groupId) return;

    const exists = groupsById.has(norm(groupId));
    if (!exists) {
      console.warn(
        "[AttendanceApp] El grupo asignado no existe en groups.json:",
        groupId,
        "assignedGrades:",
        teacher.assignedGrades
      );
    }
  }, [teacher, groupId, groupsById]);

  const currentGroup = groupId ? groupsById.get(norm(groupId)) : null;
  const students = currentGroup?.students ?? [];

  // ===== Asistencia =====
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

  // ===== Modales =====
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  // Info para el modal (confirm + success)
  const [confirmData, setConfirmData] = useState(null);
  const [sentSummary, setSentSummary] = useState(null); // ✅ total/ausentes post-envío

  function sendEmail() {
    if (!teacher || !currentGroup) return;

    const fecha = formatDateForCO(dateStr);
    const absentCount = absentees.length;

    setConfirmData({
      fecha,
      grupo: currentGroup.name,
      absentCount,
      total: students.length,
    });

    setShowConfirm(true);
  }

  async function handleConfirmSend() {
    setShowConfirm(false);
    const { fecha, grupo } = confirmData;

    const absentCount = absentees.length;

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
        teacher.emailjs.serviceId,
        teacher.emailjs.templateId,
        { subject, body },
        teacher.emailjs.publicKey
      );

      // ✅ Resumen vuelve a modal de éxito
      setSentSummary({
        grupo,
        fecha,
        total: students.length,
        ausentes: absentCount,
      });

      setShowSuccess(true);
    } catch (e) {
      console.error(e);
      setShowError(true);
    }
  }

  function handleChangeUser() {
    localStorage.removeItem("attendance:selectedTeacherEmail");
    onChangeUser?.();
  }

  const groupLabel = currentGroup?.name ? String(currentGroup.name) : "";

  return (
    <div className="container">
      {/* ===================== HEADER / CONTROLS ===================== */}
      <header className="card" style={{ textAlign: "center" }}>
        {/* Título */}
        <h1 className="text-center" style={{ marginBottom: 10 }}>
          📋 Llamado a Lista{" "}
          {groupLabel ? <span style={{ opacity: 0.9 }}>{groupLabel}</span> : null}
        </h1>

        {/* Docente + cambiar usuario */}
        {teacher && (
          <div
            className="row"
            style={{
              justifyContent: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div className="pill" style={{ justifyContent: "center" }}>
              👤 <span>Docente:</span> <strong>{teacher.name}</strong>
            </div>

            <button
              className="btn secondary"
              onClick={handleChangeUser}
              style={{
                borderRadius: 999,
                padding: "10px 14px",
                fontWeight: 900,
              }}
            >
              🔁 Cambiar usuario
            </button>
          </div>
        )}

        {/* Controles */}
        <div
          className="controls"
          style={{
            maxWidth: 720,
            margin: "0 auto",
            width: "100%",
          }}
        >
          {/* Fecha */}
          {/* Fecha (en una sola línea) */}
{/* Fecha (en una sola línea) */}
<div
  className="inline-label date-row"
  style={{
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  }}
>
  <span style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900 }}>
    📅 <span>Fecha:</span>
  </span>

  <input
    type="date"
    value={dateStr}
    onChange={(e) => setDateStr(e.target.value)}
    className="date-input"
  />
</div>



          {/* Selector grupo según rol */}
          {teacher?.role === "primaria" ? (
            // ✅ si tiene más de 1 grupo asignado, muestra selector; si no, NO mostramos nada
            assignedIds.length > 1 ? (
              <div style={{ width: "100%" }}>
                <label style={{ width: "100%", textAlign: "left" }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    📚 <b>Grupo</b>
                  </span>
                </label>

                <GroupSelector
                  groups={groupsData}
                  allowedIds={assignedIds}
                  value={groupId}
                  onChange={setGroupId}
                />
              </div>
            ) : null
          ) : (
            <SecondaryGroupSelector
              groups={groupsData}
              assignedIds={assignedIds}
              value={groupId}
              onChange={setGroupId}
            />
          )}

          {/* Botones full width */}
          <button
            className={`btn secundary ${allPresent ? "state-absent" : "state-present"}`}
            onClick={toggleAll}
            disabled={!currentGroup}
            style={{ width: "100%" }}
          >
            {allPresent ? "🚫 Marcar todos: Faltaron" : "✅ Marcar todos: Asistieron"}
          </button>

          <button
            className="btn primary"
            onClick={sendEmail}
            disabled={!currentGroup}
            style={{ width: "100%" }}
          >
            📩 Enviar reporte
          </button>
        </div>
      </header>

      {/* ===================== LISTADO ===================== */}
      <section className="card">
        <h2 className="text-center">
          {currentGroup ? `Estudiantes · ${currentGroup.name}` : "Sin grupo asignado"}
        </h2>

        {currentGroup && (
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
        )}
      </section>

      {/* ===================== MODALES ===================== */}
      {showConfirm && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h2>Confirmar envío</h2>
            <p style={{ marginTop: 10 }}>
              ¿Enviar el reporte de inasistencia del <b>{confirmData.fecha}</b>?
              <br />
              Grupo: <b>{confirmData.grupo}</b>
              <br />
              Total: <b>{confirmData.total}</b>
              <br />
              Ausentes: <b>{confirmData.absentCount}</b>
            </p>

            <div className="modal-actions">
              <button className="modal-btn primary" onClick={handleConfirmSend}>
                Enviar
              </button>
              <button
                className="modal-btn secondary"
                onClick={() => setShowConfirm(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="modal-overlay">
          <div className="modal-card success">
            <h2>✅ Reporte enviado</h2>

            {/* ✅ Resumen vuelve aquí */}
            {sentSummary && (
              <div style={{ marginTop: 10 }}>
                <p style={{ margin: 0 }}>
                  Grupo: <b>{sentSummary.grupo}</b>
                  <br />
                  Fecha: <b>{sentSummary.fecha}</b>
                  <br />
                  Total: <b>{sentSummary.total}</b>
                  <br />
                  Ausentes: <b>{sentSummary.ausentes}</b>
                </p>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button
                className="modal-btn primary"
                onClick={() => {
                  setShowSuccess(false);
                  setSentSummary(null);
                }}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {showError && (
        <div className="modal-overlay">
          <div className="modal-card error">
            <h2>❌ No se pudo enviar</h2>
            <p>Verifica credenciales y plantilla en EmailJS.</p>
            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button className="modal-btn primary" onClick={() => setShowError(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
