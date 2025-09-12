import { useEffect, useState } from "react";
import AttendanceApp from "./components/AttendanceApp.jsx";
import UserGate from "./components/UserGate.jsx";
import teachers from "./data/teachers.json";
import "./styles.css";

const LS_KEY = "attendance:selectedTeacherEmail";

export default function App() {
  const [teacherEmail, setTeacherEmail] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setTeacherEmail(saved);
  }, []);

  function handleConfirmUser(email) {
    localStorage.setItem(LS_KEY, email);
    setTeacherEmail(email);
  }

  function handleChangeUser() {
    localStorage.removeItem(LS_KEY);
    setTeacherEmail("");
  }

  if (!teacherEmail) {
    return <UserGate teachers={teachers} onConfirm={handleConfirmUser} />;
  }

  return (
    <AttendanceApp
      teacherEmail={teacherEmail}
      onChangeUser={handleChangeUser}
    />
  );
}
