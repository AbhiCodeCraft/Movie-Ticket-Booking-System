import { createContext, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "../api/client";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    const expired = () => {
      setUser(null);
      setNotice("Your session expired. Sign in again to continue.");
    };
    window.addEventListener("frame:expired", expired);
    (async () => {
      try {
        if (tokenStore.get()) {
          const r = await api("/auth/me");
          if (alive) setUser(r.data);
        }
      } catch (e) {
        if (alive) setNotice(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      window.removeEventListener("frame:expired", expired);
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let exp;
    try {
      exp = JSON.parse(atob(tokenStore.get().split(".")[1])).exp;
    } catch {
      return;
    }
    const timer = setTimeout(
      () => {
        tokenStore.set(null);
        window.dispatchEvent(new Event("frame:expired"));
      },
      Math.max(0, exp * 1000 - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [user]);
  async function login(email, password) {
    const r = await api("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    tokenStore.set(r.data.access_token);
    const me = await api("/auth/me");
    setUser(me.data);
    setNotice("");
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setNotice("You have signed out.");
    } catch (e) {
      setNotice(e.message);
    } finally {
      tokenStore.set(null);
      setUser(null);
    }
  }
  return (
    <AuthContext.Provider
      value={{ user, loading, notice, setNotice, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
