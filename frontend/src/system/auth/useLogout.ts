import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";

// ออกจากระบบแล้วไปหน้า redirectTo — เรียก server ไม่สำเร็จก็ยังล้าง session ในเครื่อง
export function useLogout(redirectTo: string) {
  const navigate = useNavigate();
  const { logout, session } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || "";

  return async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      logout();
      navigate(redirectTo);
    }
  };
}
