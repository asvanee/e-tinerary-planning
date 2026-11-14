import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

// ครอบหน้าที่ต้อง login — ยังไม่ login ให้ไปหน้า /login
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}