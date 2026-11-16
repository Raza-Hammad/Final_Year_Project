/**
 * Root application — auth, intro, desktop gate, and Living Lattice routes.
 *
 * Intro policy (localStorage `cx-intro-seen-v2`):
 *   - First visit in a browser  → full ~8 s intro (skippable), then marked seen.
 *   - Returning visitor         → ~1.2 s brand splash, then straight on.
 *   - `?intro=1`                → always the full intro.
 *   - "Watch the intro again"   → full intro as an overlay, so a half-typed
 *     login form underneath is never destroyed.
 */
import React, { useCallback, useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth, isStoredTokenValid } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/toast/ToastProvider';
import DesktopGate from './components/DesktopGate';
import BrandSplash from './components/BrandSplash';

const INTRO_SEEN_KEY = 'cx-intro-seen-v2';

const Login = lazy(() => import('./pages/Login'));
const DesignSystemDemo = lazy(() => import('./pages/DesignSystemDemo'));
const Intro = lazy(() => import('./pages/Intro'));
const DashboardLayout = lazy(() => import('./dashboard/DashboardLayout'));
const LiveDetectionPage = lazy(() => import('./pages/LiveDetectionPage'));
const SimulatorPage = lazy(() => import('./pages/SimulatorPage'));
const AttackLabPage = lazy(() => import('./pages/AttackLabPage'));
const AlertHistoryPage = lazy(() => import('./pages/AlertHistoryPage'));
const ModelInsightsPage = lazy(() => import('./pages/ModelInsightsPage'));
const AiAssistantPage = lazy(() => import('./pages/AiAssistantPage'));
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'));

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, authReady } = useAuth();
  const hasToken =
    isAuthenticated || isStoredTokenValid(localStorage.getItem('token'));

  if (!authReady && !hasToken) {
    return <RouteFallback />;
  }

  return hasToken ? <>{children}</> : <Navigate to="/login" replace />;
};

const RouteFallback: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-[var(--sr-bg-page)]" />
);

type IntroMode = 'full' | 'splash' | null;

function readIntroSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — intro simply replays next visit */
  }
}

function initialIntroMode(): IntroMode {
  const forced = new URLSearchParams(window.location.search).get('intro') === '1';
  if (forced) return 'full';
  return readIntroSeen() ? 'splash' : 'full';
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [introMode, setIntroMode] = useState<IntroMode>(initialIntroMode);
  /** True when the intro was replayed on top of an already-rendered route tree. */
  const [overlay, setOverlay] = useState(false);

  const loggedIn = isAuthenticated || isStoredTokenValid(localStorage.getItem('token'));

  useEffect(() => {
    const handleReplay = () => {
      setOverlay(true);
      setIntroMode('full');
    };
    window.addEventListener('replay-intro', handleReplay);
    return () => window.removeEventListener('replay-intro', handleReplay);
  }, []);

  const finishIntro = useCallback(() => {
    markIntroSeen();
    setIntroMode(null);
    setOverlay(false);
    if (searchParams.get('intro')) {
      const next = new URLSearchParams(searchParams);
      next.delete('intro');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const finishSplash = useCallback(() => setIntroMode(null), []);

  const ctaLabel = loggedIn ? 'Enter console' : overlay ? 'Back to sign in' : 'Get started';

  if (introMode === 'splash') {
    return <BrandSplash onDone={finishSplash} />;
  }

  // First-visit intro replaces the tree (nothing to preserve, nothing to load).
  // Replay keeps routes mounted underneath so form state survives.
  if (introMode === 'full' && !overlay) {
    return <Intro onComplete={finishIntro} ctaLabel={ctaLabel} />;
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/design-system" element={<DesignSystemDemo />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<LiveDetectionPage />} />
          <Route path="simulator" element={<SimulatorPage />} />
          <Route path="lab" element={<AttackLabPage />} />
          <Route path="history" element={<AlertHistoryPage />} />
          <Route path="insights" element={<ModelInsightsPage />} />
          <Route path="ai" element={<AiAssistantPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {introMode === 'full' && overlay && <Intro onComplete={finishIntro} ctaLabel={ctaLabel} />}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <DesktopGate>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Suspense fallback={<RouteFallback />}>
                <AppRoutes />
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </DesktopGate>
    </ErrorBoundary>
  );
}

export default App;
