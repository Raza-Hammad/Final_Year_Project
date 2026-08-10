/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: App.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This is the Root Application Component that manages Client-Side Routing, Protected Routes,
 * Authentication Provider wrapping, and Code-Splitting Lazy Loading.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. `AuthProvider`: Wraps the application to share login state globally.
 * 2. `ProtectedRoute`: Guarantees unauthenticated users are redirected to `/login`.
 * 3. `React.lazy()` & `Suspense`: Code-splits large pages (`Dashboard`, `Login`, `Intro`) for fast initial load.
 * 4. `Intro Splash Screen`: Shows an interactive splash screen on first session visit.
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - `react-router-dom`: Manages browser URL routing (`Routes`, `Route`, `Navigate`).
 * - `react`: Context consumption, lazy loading (`React.lazy`), and lifecycle hooks (`useState`, `useEffect`).
 * ===============================================================================
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DesignSystemDemo = lazy(() => import('./pages/DesignSystemDemo'));
const Intro = lazy(() => import('./pages/Intro'));

// ProtectedRoute component redirects users to /login if not authenticated
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  // Check if token exists in state or storage
  const hasToken = isAuthenticated || !!localStorage.getItem('token');

  return hasToken ? <>{children}</> : <Navigate to="/login" replace />;
};

const RouteFallback: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-[var(--sr-bg-page)]" />
);

function App() {
  const [showIntro, setShowIntro] = useState(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return false;
    return !sessionStorage.getItem('hasSeenIntro');
  });

  useEffect(() => {
    const handleReplay = () => {
      setShowIntro(true);
    };
    window.addEventListener('replay-intro', handleReplay);
    return () => window.removeEventListener('replay-intro', handleReplay);
  }, []);

  const handleIntroComplete = () => {
    sessionStorage.setItem('hasSeenIntro', 'true');
    setShowIntro(false);
  };

  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route
                path="/login"
                element={
                  showIntro ? <Intro onComplete={handleIntroComplete} /> : <Login />
                }
              />
              <Route path="/design-system" element={<DesignSystemDemo />} />
              <Route
                path="/"
                element={
                  showIntro ? (
                    <Intro onComplete={handleIntroComplete} />
                  ) : (
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  )
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
