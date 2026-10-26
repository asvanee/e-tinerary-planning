import { createContext, useState } from "react";
import type { ReactNode } from "react";

export interface User {
  user_id: string;
  username: string;
  email: string;
  role: string;
  last_login: string;
}

// session ของ Supabase Auth (frontend ใช้แค่ access_token ส่งเป็น Bearer token)
export interface AuthSession {
  access_token: string;
}

interface AuthContextType {
  user: User | null;
  session: AuthSession | null;
  login: (user: User, session: AuthSession) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function readSaved<T>(key: "user" | "session"): T | null {
  const savedUser = localStorage.getItem("user");
  const savedSession = localStorage.getItem("session");
  if (!savedUser || !savedSession) return null;
  return JSON.parse(key === "user" ? savedUser : savedSession) as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // อ่าน localStorage ครั้งเดียวตอนสร้าง state (ต้องมีทั้งคู่ถึงถือว่าล็อกอินอยู่)
  const [user, setUser] = useState<User | null>(() => readSaved<User>("user"));
  const [session, setSession] = useState<AuthSession | null>(() => readSaved<AuthSession>("session"));

  const login = (userData: User, sessionData: AuthSession) => {
    setUser(userData);
    setSession(sessionData);
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("session", JSON.stringify(sessionData));
  };

  const logout = () => {
    setUser(null);
    setSession(null);
    localStorage.removeItem("user");
    localStorage.removeItem("session");
  };

  return (
    <AuthContext.Provider value={{ user, session, login, logout, isLoading: false }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };