import { useContext } from "react";
import { AuthContext } from "./AuthContext";

// ดึงข้อมูลผู้ใช้และฟังก์ชัน login/logout (ใช้ได้เฉพาะในหน้าที่อยู่ใต้ AuthProvider)
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}