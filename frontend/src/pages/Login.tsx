/**
 * Cascadyx authentication — Signal Observatory login.
 * Password (OAuth2 form) → JWT, or Google Identity Services → POST /api/auth/google → JWT.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import GlowButton from '../components/ui/GlowButton';
import AuroraBackground from '../components/ui/AuroraBackground';
import CursorSpotlight from '../components/ui/CursorSpotlight';
import Logomark from '../components/ui/Logomark';
import { Lock, User, RefreshCw, AlertCircle, Eye, EyeOff, Play } from 'lucide-react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: 'popup' | 'redirect';
            callback: (response: { code?: string; error?: string }) => void;
            error_callback?: (err: { type: string; message?: string }) => void;
          }) => { requestCode: () => void };
        };
      };
    };
  }
}

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')), {
        once: true,
      });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

const GATES = [
  { tier: '01', model: 'LightGBM', role: 'Fast screen', colorVar: '--sr-cat-1' },
  { tier: '02', model: 'Random Forest', role: 'Escalate', colorVar: '--sr-cat-2' },
  { tier: '03', model: 'Weighted Vote', role: 'Decide', colorVar: '--sr-cat-3' },
];

const SCENARIO_TICKER = [
  'DDoS lab scenario armed',
  'Port-scan lab ready',
  'Brute-force lab ready',
  'Web-attack lab ready',
  'Botnet lab ready',
];

/** Decorative lattice — brand motif for the login hero panel. */
const LoginLatticeMotif: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => (
  <svg
    className="pointer-events-none absolute inset-0 h-full w-full"
    viewBox="0 0 520 720"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="login-ll-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="var(--sr-accent)" stopOpacity="0.7" />
        <stop offset="100%" stopColor="var(--sr-accent-2)" stopOpacity="0.55" />
      </linearGradient>
      <radialGradient id="login-ll-glow" cx="68%" cy="32%" r="48%">
        <stop offset="0%" stopColor="var(--sr-accent)" stopOpacity="0.32" />
        <stop offset="45%" stopColor="var(--sr-accent-2)" stopOpacity="0.14" />
        <stop offset="100%" stopColor="var(--sr-accent)" stopOpacity="0" />
      </radialGradient>
      <filter id="login-node-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <rect width="520" height="720" fill="url(#login-ll-glow)" />
    {Array.from({ length: 9 }).map((_, i) => (
      <line
        key={`gv${i}`}
        x1={30 + i * 55}
        y1={20}
        x2={30 + i * 55}
        y2={700}
        stroke="var(--sr-accent)"
        strokeOpacity="0.09"
      />
    ))}
    {Array.from({ length: 11 }).map((_, i) => (
      <line
        key={`gh${i}`}
        x1={10}
        y1={40 + i * 62}
        x2={510}
        y2={40 + i * 62}
        stroke="var(--sr-accent)"
        strokeOpacity="0.07"
      />
    ))}
    {/* Hero lattice cluster — right side of panel so copy stays clear */}
    <g transform="translate(255 95)">
      <ellipse cx="110" cy="130" rx="145" ry="92" fill="none" stroke="url(#login-ll-grad)" strokeOpacity="0.55" strokeWidth="1.6" />
      <ellipse cx="110" cy="130" rx="95" ry="58" fill="none" stroke="var(--sr-accent-2)" strokeOpacity="0.45" strokeWidth="1.25" />
      <ellipse cx="110" cy="130" rx="48" ry="28" fill="none" stroke="var(--sr-accent)" strokeOpacity="0.4" strokeWidth="1.1" />
      {[
        [40, 80], [80, 110], [120, 70], [160, 105], [200, 85],
        [55, 150], [100, 165], [150, 155], [190, 140], [90, 125],
        [135, 120], [115, 100], [70, 95], [175, 125],
      ].map(([cx, cy], i) => (
        <circle
          key={`ln${i}`}
          cx={cx}
          cy={cy}
          r={i % 4 === 0 ? 5 : 3}
          fill={i % 3 === 0 ? 'var(--sr-accent-2)' : 'var(--sr-accent)'}
          fillOpacity={0.55 + (i % 4) * 0.08}
          filter={i % 5 === 0 ? 'url(#login-node-glow)' : undefined}
        />
      ))}
      {[
        [40, 80, 80, 110], [80, 110, 120, 70], [120, 70, 160, 105],
        [80, 110, 100, 165], [100, 165, 150, 155], [160, 105, 190, 140],
        [90, 125, 135, 120], [55, 150, 90, 125], [135, 120, 175, 125],
      ].map(([x1, y1, x2, y2], i) => (
        <line
          key={`le${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={i % 2 === 0 ? 'var(--sr-accent)' : 'var(--sr-accent-2)'}
          strokeOpacity="0.28"
          strokeWidth="1.1"
        />
      ))}
      <circle cx="110" cy="130" r="8" fill="var(--sr-accent)" fillOpacity="0.7" filter="url(#login-node-glow)" />
    </g>
    <path
      d="M55 455 C 140 390, 210 510, 310 430 S 420 360, 480 405"
      fill="none"
      stroke="var(--sr-sev-critical)"
      strokeWidth="1.6"
      strokeOpacity="0.42"
      strokeDasharray="5 8"
    >
      {!reducedMotion && (
        <animate attributeName="stroke-dashoffset" from="0" to="-52" dur="2.8s" repeatCount="indefinite" />
      )}
    </path>
    <circle cx="55" cy="455" r="8" fill="var(--sr-sev-critical)" fillOpacity="0.8" filter="url(#login-node-glow)" />
    <circle cx="310" cy="430" r="14" fill="none" stroke="var(--sr-accent)" strokeWidth="2" strokeOpacity="0.7" />
    <circle cx="310" cy="430" r="6" fill="var(--sr-accent)" fillOpacity="0.9" />
  </svg>
);

export const Login: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const reducedMotion = usePrefersReducedMotion();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [engineOnline, setEngineOnline] = useState<boolean | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [googleClientIdValid, setGoogleClientIdValid] = useState(true);
  const [googleTrouble, setGoogleTrouble] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (reducedMotion) return;
    const id = setInterval(() => setTickerIdx((i) => (i + 1) % SCENARIO_TICKER.length), 2800);
    return () => clearInterval(id);
  }, [reducedMotion]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get<{ status?: string }>('/api/health')
      .then((res) => {
        if (!cancelled) setEngineOnline(res.data?.status === 'ok');
      })
      .catch(() => {
        if (!cancelled) setEngineOnline(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const googleError = searchParams.get('google_error');
    if (googleError) {
      setError(`Google Sign-In failed (${googleError}). Try again or use username/password.`);
      const next = new URLSearchParams(searchParams);
      next.delete('google_error');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get<{ enabled?: boolean; client_id?: string | null; client_id_looks_valid?: boolean }>(
        '/api/auth/google/config',
      )
      .then((res) => {
        if (cancelled) return;
        setGoogleEnabled(Boolean(res.data?.enabled && res.data?.client_id));
        setGoogleClientId(res.data?.client_id ?? null);
        setGoogleClientIdValid(res.data?.client_id_looks_valid !== false);
      })
      .catch(() => {
        if (!cancelled) setGoogleEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reducedMotion) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    // Slightly stronger tilt than before — still restrained
    setTilt({ x: py, y: px });
    // Card-local spotlight (elevates CursorSpotlight on the form itself)
    if (spotRef.current) {
      const lx = ((e.clientX - rect.left) / rect.width) * 100;
      const ly = ((e.clientY - rect.top) / rect.height) * 100;
      spotRef.current.style.setProperty('--card-spot-x', `${lx}%`);
      spotRef.current.style.setProperty('--card-spot-y', `${ly}%`);
      spotRef.current.style.setProperty('--card-spot-opacity', '1');
    }
  };

  const handleCardMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    spotRef.current?.style.setProperty('--card-spot-opacity', '0');
  };

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);

      const response = await axios.post('/api/auth/login', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data && response.data.access_token) {
        login(response.data.access_token);
        navigate('/', { replace: true });
      } else {
        setError('Authentication returned an empty token.');
      }
    } catch (err) {
      console.error('Login error:', err);
      const detail =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(detail || 'Failed to connect to authentication services.');
    } finally {
      setLoading(false);
    }
  };

  const startGoogleRedirect = () => {
    const next = encodeURIComponent(`${window.location.origin}/`);
    window.location.href = `/api/auth/google/login?next=${next}`;
  };

  const handleGoogleContinue = async () => {
    setError(null);
    setGoogleTrouble(false);
    if (!googleEnabled || !googleClientId) {
      setError('Google Sign-In is not configured on the server.');
      return;
    }
    setGoogleLoading(true);
    try {
      await loadGoogleIdentityScript();
      if (!window.google?.accounts?.oauth2) {
        startGoogleRedirect();
        return;
      }
      const client = window.google.accounts.oauth2.initCodeClient({
        client_id: googleClientId,
        scope: 'openid email profile',
        ux_mode: 'popup',
        // Fires when the popup is closed/blocked — including after Google's own
        // Access blocked: no registered origin page, which JS cannot read directly.
        error_callback: (err) => {
          console.warn('Google Sign-In popup error:', err);
          setGoogleLoading(false);
          setGoogleTrouble(true);
        },
        callback: async (response) => {
          if (response.error || !response.code) {
            setGoogleTrouble(true);
            setError(response.error || 'Google Sign-In was cancelled.');
            setGoogleLoading(false);
            return;
          }
          setGoogleLoading(true);
          try {
            const res = await axios.post('/api/auth/google', { code: response.code });
            if (res.data?.access_token) {
              login(res.data.access_token);
              navigate('/', { replace: true });
            } else {
              setError('Google authentication returned an empty token.');
            }
          } catch (err) {
            console.error('Google login error:', err);
            const detail =
              typeof err === 'object' && err !== null && 'response' in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : undefined;
            setError(detail || 'Google Sign-In failed.');
          } finally {
            setGoogleLoading(false);
          }
        },
      });
      client.requestCode();
      // Popup is open; don't keep the button spinning until the user finishes or cancels.
      setGoogleLoading(false);
    } catch (err) {
      console.warn('GIS unavailable, falling back to redirect flow:', err);
      startGoogleRedirect();
    }
  };

  return (
    <div
      className="relative flex min-h-screen min-h-[100dvh] overflow-x-hidden bg-[var(--sr-bg-page)] text-[var(--sr-text-primary)]"
      style={{ fontFamily: 'var(--sr-font-sans)' }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes lr-travel {
          0% { top: 4%; opacity: 0; }
          8% { opacity: 1; }
          28% { top: 4%; }
          36% { top: 42%; }
          64% { top: 42%; }
          72% { top: 82%; }
          92% { top: 82%; opacity: 1; }
          100% { top: 82%; opacity: 0; }
        }
        @keyframes lr-gate-flash {
          0%, 92%, 100% { transform: scale(1); filter: brightness(1); }
          4%, 8% { transform: scale(1.5); filter: brightness(1.25); }
        }
        @keyframes lr-sweep {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          16%, 50% { transform: scale(1.5); filter: brightness(1.25); }
        }
        @keyframes card-border-sweep {
          to { transform: rotate(360deg); }
        }
        @keyframes login-grid-drift {
          from { background-position: 0 0; }
          to { background-position: 40px 40px; }
        }
        @keyframes login-logo-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.035); }
        }
      `,
        }}
      />

      <AuroraBackground className="fixed inset-0 z-0" variant="hero" />
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.28]"
        style={{
          backgroundImage:
            'linear-gradient(var(--sr-border-hairline) 1px, transparent 1px), linear-gradient(90deg, var(--sr-border-hairline) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(ellipse 65% 55% at 30% 45%, black 15%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Left — Cascadyx hero + cascade story + lattice motif */}
      <div className="relative z-10 hidden w-[48%] flex-col justify-between overflow-hidden px-10 py-8 xl:px-14 lg:flex lg:py-10 min-[900px]:py-12">
        <LoginLatticeMotif reducedMotion={reducedMotion} />

        {/* Soft depth veil — keep left copy crisp, reveal lattice on the right */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(105deg, color-mix(in srgb, var(--sr-bg-page) 82%, transparent) 0%, color-mix(in srgb, var(--sr-bg-page) 48%, transparent) 42%, color-mix(in srgb, var(--sr-bg-page) 12%, transparent) 72%, transparent 100%)',
          }}
          aria-hidden="true"
        />

        <div className="relative z-10">
          <div className="mb-8 flex items-center gap-3.5 min-[900px]:mb-12">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-[var(--sr-radius-md)] bg-[var(--sr-accent-soft)]"
              style={{
                boxShadow: 'var(--sr-shadow-glow)',
                animation: reducedMotion ? undefined : 'login-logo-breathe 5s ease-in-out infinite',
              }}
            >
              <Logomark className="h-7 w-7" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-[var(--sr-text-muted)]">
                Signal Observatory
              </span>
            </div>
          </div>

          <h1
            className="max-w-lg text-[clamp(2.75rem,5.5vw,4.25rem)] font-bold leading-[0.95] tracking-tight"
            style={{
              fontFamily: 'var(--sr-font-brand)',
              backgroundImage: 'var(--sr-gradient-brand)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              letterSpacing: '-0.035em',
            }}
          >
            Cascadyx
          </h1>
          <p
            className="mt-4 max-w-md text-lg font-medium leading-snug tracking-tight text-[var(--sr-text-primary)] xl:text-xl"
            style={{ fontFamily: 'var(--sr-font-display)' }}
          >
            A cascade that screens, escalates, and explains.
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--sr-text-secondary)]">
            Every flow hits LightGBM first. Ambiguous cases climb the tiers — until the system is
            confident enough to attribute the threat in plain English.
          </p>

          {/* Cascade spine — vertical story, not a card stack */}
          <div className="relative mt-9 max-w-sm pl-1 min-[900px]:mt-12">
            <div
              className="absolute left-[11px] top-3 bottom-3 w-px"
              style={{
                background:
                  'linear-gradient(180deg, var(--sr-cat-1), var(--sr-cat-2), var(--sr-cat-3))',
                opacity: 0.55,
              }}
              aria-hidden="true"
            />
            {!reducedMotion && (
              <span
                className="absolute left-[8px] h-2 w-2 rounded-full bg-[var(--sr-accent)]"
                style={{
                  animation: 'lr-travel 4.2s ease-in-out infinite',
                  boxShadow: '0 0 10px var(--sr-accent)',
                }}
                aria-hidden="true"
              />
            )}
            <div className="space-y-0">
              {GATES.map((gate, i) => {
                const isFocusHighlighted =
                  (i === 0 && focusedField === 'username') || (i === 1 && focusedField === 'password');
                const isSweepHighlighted = loading;
                const active = isFocusHighlighted || isSweepHighlighted;
                return (
                  <motion.div
                    key={gate.tier}
                    className="relative flex items-start gap-4 py-3.5"
                    animate={
                      reducedMotion
                        ? undefined
                        : {
                            x: active ? 4 : 0,
                          }
                    }
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span
                      className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-[var(--sr-bg-page)]"
                      style={{
                        backgroundColor: `var(${gate.colorVar})`,
                        boxShadow: active
                          ? `0 0 0 3px color-mix(in srgb, var(${gate.colorVar}) 28%, transparent)`
                          : undefined,
                        animation: reducedMotion
                          ? undefined
                          : isSweepHighlighted
                            ? `lr-sweep 1.1s ease-in-out infinite`
                            : `lr-gate-flash 4.2s ease-in-out infinite`,
                        animationDelay: reducedMotion
                          ? undefined
                          : isSweepHighlighted
                            ? `${i * 0.15}s`
                            : `${i * 1.35 + 0.2}s`,
                      }}
                    />
                    <div
                      className="min-w-0 flex-1 pb-3.5"
                      style={{
                        borderBottom:
                          i < GATES.length - 1 ? '1px solid var(--sr-border-hairline)' : undefined,
                      }}
                    >
                      <div className="flex items-baseline gap-2.5">
                        <span
                          className="text-[11px] font-semibold tabular-nums text-[var(--sr-text-muted)]"
                          style={{ fontFamily: 'var(--sr-font-display)' }}
                        >
                          {gate.tier}
                        </span>
                        <span
                          className="text-sm font-semibold text-[var(--sr-text-primary)]"
                          style={{
                            color: active ? `var(${gate.colorVar})` : undefined,
                          }}
                        >
                          {gate.model}
                        </span>
                      </div>
                      <span className="mt-0.5 block text-[12px] text-[var(--sr-text-muted)]">
                        {gate.role}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-4 pt-6">
          <div className="flex items-center gap-2.5 text-xs text-[var(--sr-text-muted)]">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                engineOnline === false
                  ? 'bg-[var(--sr-sev-critical)]'
                  : engineOnline
                    ? 'bg-[var(--sr-sev-info)] animate-pulse'
                    : 'bg-[var(--sr-text-muted)]'
              }`}
            />
            <span>
              {engineOnline === false
                ? 'Cascade engine unreachable'
                : engineOnline
                  ? 'Cascade engine online'
                  : 'Checking cascade engine…'}
            </span>
            <span className="text-[var(--sr-border-hover)]">·</span>
            <span key={tickerIdx} className="animate-fade-in">
              {SCENARIO_TICKER[tickerIdx]}
            </span>
          </div>
          <p
            className="text-[11px] uppercase tracking-[0.18em] text-[var(--sr-text-muted)]"
            style={{ fontFamily: 'var(--sr-font-display)' }}
          >
            3-tier cascade · Explainable AI · Analyst console
          </p>
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-px"
          style={{
            background: 'linear-gradient(180deg, transparent, var(--sr-accent), var(--sr-accent-2), transparent)',
            opacity: 0.5,
          }}
          aria-hidden="true"
        />
      </div>

      {/* Right — auth form */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center overflow-hidden px-5 py-8 sm:px-6 lg:w-[52%] lg:py-10 min-[900px]:py-12">
        {!reducedMotion && <CursorSpotlight size={560} />}
        <div className="relative w-full max-w-[22rem] space-y-5 sm:space-y-6">
          <div className="flex flex-col items-center gap-2 text-center lg:items-start lg:text-left">
            <div
              className="mb-1 flex h-11 w-11 items-center justify-center rounded-[var(--sr-radius-md)] bg-[var(--sr-accent-soft)] lg:hidden"
              style={{ boxShadow: 'var(--sr-shadow-glow)' }}
            >
              <Logomark className="h-5 w-5" />
            </div>
            <h2
              className="text-2xl font-bold tracking-tight lg:text-3xl"
              style={{
                fontFamily: 'var(--sr-font-brand)',
                backgroundImage: 'var(--sr-gradient-brand)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Sign in
            </h2>
            <p className="text-sm text-[var(--sr-text-secondary)]">Sign in to your observatory</p>
          </div>

          <motion.div
            className="relative overflow-hidden rounded-[var(--sr-radius-md)] p-[1.5px]"
            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
            style={{ perspective: 1000 }}
          >
            {!reducedMotion && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-[-60%]"
                style={{
                  background:
                    'conic-gradient(from 0deg, transparent 0%, var(--sr-accent) 12%, transparent 26%, transparent 74%, var(--sr-accent-2) 88%, transparent 100%)',
                  animation: 'card-border-sweep 7s linear infinite',
                }}
              />
            )}
            <div
              ref={cardRef}
              onMouseMove={handleCardMouseMove}
              onMouseLeave={handleCardMouseLeave}
              className="relative overflow-hidden rounded-[calc(var(--sr-radius-md)-1.5px)] border border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] p-5 backdrop-blur-md sm:p-6"
              style={{
                transition: 'box-shadow 0.4s ease',
                boxShadow: tilt.x !== 0 || tilt.y !== 0 ? 'var(--sr-shadow-glow)' : 'var(--sr-shadow-md)',
              }}
            >
              {/* Card-local spotlight wash */}
              {!reducedMotion && (
                <div
                  ref={spotRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 transition-opacity duration-400"
                  style={{
                    opacity: 'var(--card-spot-opacity, 0)',
                    background:
                      'radial-gradient(220px circle at var(--card-spot-x, 50%) var(--card-spot-y, 50%), color-mix(in srgb, var(--sr-accent) 14%, transparent), transparent 70%)',
                  }}
                />
              )}

            <div className="relative" data-oauth-slot="google">
              <button
                type="button"
                onClick={handleGoogleContinue}
                disabled={!googleEnabled || googleLoading || loading}
                className="flex w-full items-center justify-center gap-2.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-page)] py-2.5 text-sm text-[var(--sr-text-primary)] transition-opacity hover:bg-[var(--sr-bg-elevated)] disabled:cursor-not-allowed disabled:opacity-55"
                title={
                  googleEnabled
                    ? 'Continue with Google'
                    : 'Google Sign-In is not configured on the server'
                }
              >
                {googleLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
                  </svg>
                )}
                {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
              </button>
              {(googleTrouble || !googleClientIdValid) && (
                <p className="mt-2 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface-raised)] p-2.5 text-[11px] leading-snug text-[var(--sr-text-secondary)]" role="note">
                  {!googleClientIdValid
                    ? 'The server GOOGLE_CLIENT_ID does not look like a Google Web client id. '
                    : 'Google closed the sign-in window. '}
                  If Google showed <em>Access blocked / no registered origin</em>, add{' '}
                  <code className="rounded bg-[var(--sr-bg-page)] px-1 py-0.5 text-[var(--sr-text-primary)]">{window.location.origin}</code>{' '}
                  to <strong>Authorized JavaScript origins</strong> on the OAuth Web client in Google Cloud Console (steps in <code>docs/GOOGLE_OAUTH.md</code>), wait a few minutes, then retry.
                </p>
              )}
                <p className="mt-2 text-center text-[11px] leading-snug text-[var(--sr-text-muted)] lg:text-left">
                  New to Cascadyx? Google creates your analyst account instantly — no password to remember.
                </p>
              </div>

              <div className="relative my-4 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-[var(--sr-border-hairline)]" />
                <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--sr-text-muted)]">
                  existing account
                </span>
                <span className="h-px flex-1 bg-[var(--sr-border-hairline)]" />
              </div>

              <form onSubmit={handleSubmit} className="relative space-y-4">
                <div>
                  <label htmlFor="login-username" className="mb-1.5 block text-xs font-medium text-[var(--sr-text-secondary)]">
                    Username
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--sr-text-muted)]">
                      <User className="h-4 w-4" />
                    </div>
                    <input
                      id="login-username"
                      type="text"
                      required
                      disabled={loading}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onFocus={() => setFocusedField('username')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Enter your username"
                      autoComplete="username"
                      className="w-full rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-page)] py-2.5 pl-10 pr-4 text-sm text-[var(--sr-text-primary)] outline-none transition-all placeholder:text-[var(--sr-text-muted)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-[var(--sr-text-secondary)]">
                    Password
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--sr-text-muted)]">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="w-full rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-page)] py-2.5 pl-10 pr-10 text-sm text-[var(--sr-text-primary)] outline-none transition-all placeholder:text-[var(--sr-text-muted)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)]"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3.5 text-[var(--sr-text-muted)] transition-colors hover:text-[var(--sr-accent)]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[rgba(208,59,59,0.06)] p-3 text-xs text-[var(--sr-text-secondary)]">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--sr-sev-critical)]" />
                    <div>
                      <span className="font-medium text-[var(--sr-text-primary)]">Sign-in failed.</span> {error}
                    </div>
                  </div>
                )}

                <GlowButton type="submit" disabled={loading} variant="primary" className="mt-2 w-full py-2.5">
                  {loading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </GlowButton>
              </form>
            </div>
          </motion.div>

          <div className="space-y-3 text-center lg:text-left">
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new Event('replay-intro'));
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[var(--sr-accent)] transition-colors hover:text-[var(--sr-accent-hover)] focus-visible:underline focus-visible:outline-none"
            >
              <Play className="h-3 w-3 fill-current" />
              Watch the intro again
            </button>
            <p className="text-xs leading-relaxed text-[var(--sr-text-muted)]">
              {googleEnabled
                ? 'New here? Continue with Google — we create your analyst account instantly.'
                : 'Need access? Ask your instructor or administrator to create an account.'}
            </p>
            {import.meta.env.DEV && (
              <p className="text-[11px] leading-relaxed text-[var(--sr-text-muted)]">
                Dev build: seeded admin credentials are printed in the server log on first run.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Login;
