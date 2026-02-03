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
  const norm = (v) => String(v ?? "").trim().toLowerCase();

  const assignedSet = useMemo(() => new Set((assignedIds || []).map(norm)), [assignedIds]);

  // Extrae grado y sección desde "8-1"
  const parseId = (id) => {
    const s = String(id ?? "").trim();
    const m = s.match(/^(\d+)\s*-\s*(\d+)$/); // "11-1"
    if (!m) return { grade: 999, section: 999, raw: s };
    return { grade: Number(m[1]), section: Number(m[2]), raw: s };
  };

  const options = useMemo(() => {
    const secondary = (groups || []).filter((g) => norm(g.level) === "secundaria");

    // ✅ Orden ascendente por grado y sección
    return [...secondary].sort((a, b) => {
      const A = parseId(a.id);
      const B = parseId(b.id);

      if (A.grade !== B.grade) return A.grade - B.grade;       // 6..11
      if (A.section !== B.section) return A.section - B.section; // 1..n

      // fallback por nombre si algo raro
      return String(a.name).localeCompare(String(b.name), "es");
    });
  }, [groups]);

  return (
    <div className="card">
      <h3>Selecciona el grupo para pasar lista hoy</h3>
      <select
        className="select"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>— Elegir grupo —</option>
        {options.map((g) => {
          const isAssigned = assignedSet.has(norm(g.id));
          return (
            <option key={g.id} value={g.id}>
              {g.name}{isAssigned ? " (Asignado)" : ""}
            </option>
          );
        })}
      </select>
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

    if (teacher.role === "primaria") {
      // primaria: autoasigna el grupo del docente
      setGroupId(firstAssigned);
    } else {
      // secundaria: arranca con el asignado, y luego el profe puede cambiarlo
      setGroupId(firstAssigned);
    }
  }, [teacher]);

  // ✅ Debug útil: si el grupo asignado NO existe en groups.json, te lo avisa
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
  const [confirmData, setConfirmData] = useState(null);

  function sendEmail() {
    if (!teacher || !currentGroup) return;

    const fecha = formatDateForCO(dateStr);
    const absentCount = absentees.length;

    setConfirmData({ fecha, grupo: currentGroup.name, absentCount });
    setShowConfirm(true);
  }

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
        teacher.emailjs.serviceId,
        teacher.emailjs.templateId,
        { subject, body },
        teacher.emailjs.publicKey
      );
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

  return (
    <div className="container">
      <header className="card">
        <h1 className="text-center">
          Llamado a Lista {currentGroup && <span>{currentGroup.name}</span>}
        </h1>

        {teacher && (
          <div className="row">
            <div className="pill">
              Docente: <strong>{teacher.name}</strong>
            </div>
            <button className="btn linklike" onClick={handleChangeUser}>
              Cambiar usuario
            </button>
          </div>
        )}

        <div className="controls inline-label">
          <div className="row" style={{ gap: 12, alignItems: "center" }}>
            <label className="inline-label">
              Fecha:
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
              />
            </label>
          </div>

          {/* ===== Selector según rol ===== */}
          {teacher?.role === "primaria" ? (
            assignedIds.length > 1 ? (
              <GroupSelector
                groups={groupsData}
                allowedIds={assignedIds}
                value={groupId}
                onChange={setGroupId}
              />
            ) : (
              <div className="pill">Grupo asignado automáticamente</div>
            )
          ) : (
            <SecondaryGroupSelector
              groups={groupsData}
              assignedIds={assignedIds}
              value={groupId}
              onChange={setGroupId}
            />
          )}

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

      {/* MODALES */}
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
