import { useState, useCallback } from "react";
import { api, setToken, clearToken } from "./api.js";

export function useAuth() {
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean>(!!localStorage.getItem("dipbuy_token"));

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await api.login(email, password);
      setToken(res.token);
      setLoggedIn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await api.register(email, password);
      setToken(res.token);
      setLoggedIn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setLoggedIn(false);
  }, []);

  return { loggedIn, login, register, logout, error };
}
