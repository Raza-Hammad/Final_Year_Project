/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: AuthContext.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This file implements the Global Authentication React Context Provider.
 * It manages user authentication state (logged in vs logged out), decodes JWT tokens,
 * persists session tokens in browser `localStorage`, and exposes the `useAuth()` hook.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. `decodeJWT()`: Client-side helper function parsing JWT base64 payloads to extract `username` and `role`.
 * 2. `AuthProvider`: React Context Wrapper managing `token` and `user` state across all components.
 * 3. `login()`: Persists JWT token to browser `localStorage` and configures default HTTP headers.
 * 4. `logout()`: Revokes JWT server-side, clears local storage, and resets auth state.
 * 5. `useAuth()`: Custom React hook allowing any component to inspect auth status or invoke login/logout.
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - `react`: Context API (`createContext`, `useContext`), state (`useState`), and lifecycle (`useEffect`).
 * - `axios`: Sends logout POST requests to `/api/auth/logout`.
 * ===============================================================================
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface UserProfile {
  username: string;
  role: string;
}

interface AuthContextType {
  token: string | null;
  user: UserProfile | null;
  login: (token: string) => void;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeJWT(token: string): UserProfile | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    return {
      username: payload.sub || '',
      role: payload.role || 'analyst',
    };
  } catch (error) {
    console.error('Failed to decode JWT token:', error);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);

  // Check localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      const decoded = decodeJWT(savedToken);
      if (decoded) {
        setToken(savedToken);
        setUser(decoded);
        // Pre-configure axios global header just in case
        axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
      } else {
        // Clear corrupt token
        localStorage.removeItem('token');
      }
    }
  }, []);

  const login = (jwtToken: string) => {
    const decoded = decodeJWT(jwtToken);
    if (decoded) {
      setToken(jwtToken);
      setUser(decoded);
      localStorage.setItem('token', jwtToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${jwtToken}`;
    }
  };

  const logout = async () => {
    // Best-effort server-side revocation -- still clear local session even if this
    // fails (e.g. backend unreachable), since the user's intent to log out locally
    // shouldn't be blocked by a network call.
    try {
      await axios.post('/api/auth/logout');
    } catch (error) {
      console.warn('Server-side logout revocation failed:', error);
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        login,
        logout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
