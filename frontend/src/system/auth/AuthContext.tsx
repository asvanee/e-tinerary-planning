import { createContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

interface User {
  user_id: string;
  username: string;
  email: string;
  age: number;
  gender: string;
  role: string;
  last_login: string;
}

interface AuthContextType {
  user: User | null;
  session: any;
  login: (user: User, session: any) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    const savedSession = localStorage.getItem("session");
    if (savedUser && savedSession) {
      setUser(JSON.parse(savedUser));
      setSession(JSON.parse(savedSession));
    }
    setIsLoading(false);
  }, []);

  const login = (userData: User, sessionData: any) => {
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
    <AuthContext.Provider value={{ user, session, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };