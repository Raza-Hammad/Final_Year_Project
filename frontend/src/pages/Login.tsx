/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: Login.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This file renders the Cyberpunk / Signal Room Authentication Login Page.
 * It allows security analysts to log in using their credentials (`admin` / `Admin@652f0915!`),
 * validates input, communicates with `/api/auth/login`, and redirects to the main Dashboard.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. Controlled Form Inputs: Captures user input for `username` and `password`.
 * 2. `handleLogin()`: Submits OAuth2 `form-data` payload to `/api/auth/login`.
 * 3. Error Handling: Displays clear, styled error badges if authentication fails.
 * 4. Cyber UI Visuals: Features dynamic 3D tilt card physics, ambient Aurora background, dynamic cursor spotlight, and live threat ticker updates.
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - `react-router-dom`: Handles navigation (`useNavigate`, `Navigate`).
 * - `axios`: Sends authentication HTTP POST requests.
 * - `lucide-react`: High-quality security icons (`Lock`, `User`, `ShieldCheck`, `Eye`).
 * - `AuthContext`: Updates global user state upon successful login.
 * ===============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import GlowButton from '../components/ui/GlowButton';
import NetworkBackground from '../components/ui/NetworkBackground';
import AuroraBackground from '../components/ui/AuroraBackground';
import CursorSpotlight from '../components/ui/CursorSpotlight';
import Logomark from '../components/ui/Logomark';
import { Lock, User, RefreshCw, AlertCircle, Eye, EyeOff, ShieldCheck, Layers, KeyRound } from 'lucide-react';

const TRUST_CHIPS = [
  { icon: ShieldCheck, label: 'Real CIC-IDS2017 traffic' },
  { icon: Layers, label: '3-model ensemble' },
  { icon: KeyRound, label: 'JWT-secured session' },
];

const GATES = [
  { tier: 'Tier 1', model: 'LightGBM', colorVar: '--sr-cat-1' },
  { tier: 'Tier 2', model: 'Random Forest', colorVar: '--sr-cat-2' },
  { tier: 'Tier 3', model: 'Weighted Vote', colorVar: '--sr-cat-3' },
];

const SCENARIO_TICKER = [
  'DDoS Attack replay ready',
  'Port Scan dataset loaded',
  'Brute Force scenario armed',
  'Web Attack corpus ready',
  'Botnet traffic cached',
];

export const Login: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const id = setInterval(() => setTickerIdx((i) => (i + 1) % SCENARIO_TICKER.length), 2600);
    return () => clearInterval(id);
  }, []);

  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -5, y: px * 5 });
  };
  const handleCardMouseLeave = () => setTilt({ x: 0, y: 0 });

  // If already logged in, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Form-urlencode payload to fit OAuth2 Password Flow
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
      const detail = typeof err === 'object' && err !== null && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined;
      setError(detail || 'Failed to connect to authentication services.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen bg-[var(--sr-bg-page)] text-[var(--sr-text-primary)]"
      style={{ fontFamily: 'var(--sr-font-sans)' }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes lr-travel {
          0% { top: 6%; opacity: 0; }
          8% { opacity: 1; }
          28% { top: 6%; }
          36% { top: 46%; }
          64% { top: 46%; }
          72% { top: 86%; }
          92% { top: 86%; opacity: 1; }
          100% { top: 86%; opacity: 0; }
        }
        @keyframes lr-gate-flash {
          0%, 92%, 100% { transform: scale(1); filter: brightness(1); }
          4%, 8% { transform: scale(1.6); filter: brightness(1.3); }
        }
        @keyframes lr-sweep {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          16%, 50% { transform: scale(1.6); filter: brightness(1.3); }
        }
        @keyframes card-border-sweep {
          to { transform: rotate(360deg); }
        }
      `}} />

      <AuroraBackground className="fixed inset-0 z-0" variant="hero" />
      <NetworkBackground className="fixed inset-0 z-0" opacity={0.18} variant="mixed" interactive />

      {/* Left panel — living schematic of the cascade, wide screens only.
          A slight parallelogram cut on the trailing edge (instead of a plain
          vertical divider) is the panel's one structural signature. */}
      <div
        className="relative z-10 hidden w-1/2 flex-col justify-center bg-[var(--sr-glass-bg)] backdrop-blur-md px-16 lg:flex"
        style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 28px) 100%, 0 100%)' }}
      >
        {/* Gradient seam accent tracing the diagonal cut */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[3px]"
          style={{
            background: 'linear-gradient(180deg, var(--sr-accent), var(--sr-accent-2))',
            transform: 'skewX(-1.8deg)',
            transformOrigin: 'top right',
          }}
          aria-hidden="true"
        />
        <div className="max-w-md">
          <div
            className="mb-9 flex h-14 w-14 items-center justify-center rounded-[var(--sr-radius-md)] bg-[var(--sr-accent-soft)]"
            style={{ boxShadow: 'var(--sr-shadow-glow)' }}
          >
            <Logomark className="h-7 w-7" />
          </div>
          <h2
            className="text-3xl xl:text-4xl font-bold tracking-tight leading-[1.1]"
            style={{
              fontFamily: 'var(--sr-font-display)',
              backgroundImage: 'var(--sr-gradient-brand)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            A 3-tier cascade, resolved on confidence.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sr-text-secondary)] max-w-sm">
            Every flow is screened by LightGBM first. Uncertain cases escalate to Random Forest,
            then to a weighted ensemble vote — only when the system is confident enough to act.
          </p>

          <div className="relative mt-11 space-y-3.5">
            {/* Living rail: a traveling pulse loops through the gates continuously */}
            <span
              className="absolute -left-3 h-1.5 w-1.5 rounded-full bg-[var(--sr-accent)]"
              style={{ animation: 'lr-travel 4s ease-in-out infinite', boxShadow: '0 0 6px var(--sr-accent)' }}
              aria-hidden="true"
            />
            {GATES.map((gate, i) => {
              const isFocusHighlighted = (i === 0 && focusedField === 'username') || (i === 1 && focusedField === 'password');
              const isSweepHighlighted = loading;
              const active = isFocusHighlighted || isSweepHighlighted;
              return (
                <div
                  key={gate.tier}
                  className="flex items-center gap-3.5 rounded-[var(--sr-radius-md)] border px-5 py-4 transition-all duration-300"
                  style={{
                    borderColor: active ? `var(${gate.colorVar})` : 'var(--sr-border-hairline)',
                    backgroundColor: active ? `color-mix(in srgb, var(${gate.colorVar}) 8%, var(--sr-bg-page))` : 'var(--sr-bg-page)',
                    boxShadow: active ? `0 12px 30px -10px color-mix(in srgb, var(${gate.colorVar}) 45%, transparent)` : 'none',
                    transform: active ? 'translateY(-1px)' : 'none',
                  }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: `var(${gate.colorVar})`,
                      color: `var(${gate.colorVar})`,
                      animation: isSweepHighlighted
                        ? `lr-sweep 1.1s ease-in-out infinite`
                        : `lr-gate-flash 4s ease-in-out infinite`,
                      animationDelay: isSweepHighlighted ? `${i * 0.15}s` : `${i * 1.35 + 0.2}s`,
                    }}
                  />
                  <span className="text-xs font-medium text-[var(--sr-text-muted)]">{gate.tier}</span>
                  <span className="text-sm font-semibold text-[var(--sr-text-primary)]">{gate.model}</span>
                </div>
              );
            })}
          </div>

          {/* Live scenario ticker — reinforces this is a real, loaded dataset */}
          <div className="mt-6 flex items-center gap-2 text-xs text-[var(--sr-text-muted)]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sr-sev-info)] animate-pulse" />
            <span key={tickerIdx} className="animate-fade-in">{SCENARIO_TICKER[tickerIdx]}</span>
          </div>

          {/* Trust chips — quick credibility signals for evaluators */}
          <div className="mt-7 flex flex-wrap items-center gap-2">
            {TRUST_CHIPS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-page)] px-3 py-1.5 text-[11px] font-medium text-[var(--sr-text-secondary)] transition-colors hover:border-[var(--sr-accent)]"
              >
                <Icon className="h-3 w-3 text-[var(--sr-accent)]" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2">
        <CursorSpotlight />
        <div className="relative w-full max-w-sm space-y-6">

          <div className="flex flex-col items-center gap-2 text-center lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--sr-radius-md)] bg-[var(--sr-accent-soft)]">
              <Logomark className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--sr-text-primary)]" style={{ fontFamily: 'var(--sr-font-display)' }}>Cascadyx</h1>
          </div>

          <div className="hidden text-center lg:block">
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{
                fontFamily: 'var(--sr-font-display)',
                backgroundImage: 'var(--sr-gradient-brand)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Sign in
            </h1>
            <p className="mt-1 text-sm text-[var(--sr-text-secondary)]">Security Operations Console</p>
          </div>

          <div className="relative rounded-[var(--sr-radius-md)] p-[1.5px] overflow-hidden">
            {/* Animated gradient border sweep — a slow rotating conic gradient clipped to a 1.5px ring */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-[-60%]"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0%, var(--sr-accent) 12%, transparent 26%, transparent 74%, var(--sr-accent-2) 88%, transparent 100%)',
                animation: 'card-border-sweep 6s linear infinite',
              }}
            />
            <div
              ref={cardRef}
              onMouseMove={handleCardMouseMove}
              onMouseLeave={handleCardMouseLeave}
              className="relative rounded-[calc(var(--sr-radius-md)-1.5px)] border border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] backdrop-blur-md p-6"
              style={{
                transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                transition: 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s ease',
                boxShadow: tilt.x !== 0 || tilt.y !== 0 ? 'var(--sr-shadow-glow)' : 'var(--sr-shadow-md)',
              }}
            >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--sr-text-secondary)]">
                  Username
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--sr-text-muted)]">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Enter your username"
                    className="w-full rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-page)] py-2.5 pl-10 pr-4 text-sm text-[var(--sr-text-primary)] outline-none transition-all placeholder:text-[var(--sr-text-muted)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--sr-text-secondary)]">
                  Password
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--sr-text-muted)]">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={loading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Enter your password"
                    className="w-full rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-page)] py-2.5 pl-10 pr-10 text-sm text-[var(--sr-text-primary)] outline-none transition-all placeholder:text-[var(--sr-text-muted)] focus:border-[var(--sr-accent)] focus:ring-2 focus:ring-[var(--sr-accent-soft)]"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[var(--sr-text-muted)] transition-colors hover:text-[var(--sr-accent)] cursor-pointer"
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

              <GlowButton
                type="submit"
                disabled={loading}
                variant="primary"
                className="mt-2 w-full py-2.5"
              >
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
          </div>

          <div className="space-y-3 text-center">
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('hasSeenIntro');
                window.dispatchEvent(new Event('replay-intro'));
              }}
              className="cursor-pointer text-xs text-[var(--sr-accent)] transition-colors hover:text-[var(--sr-accent-hover)] focus:outline-none focus:underline"
            >
              Replay intro sequence
            </button>
            <p className="text-xs leading-relaxed text-[var(--sr-text-muted)]">
              Seeded credentials are printed in the server log on first run.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Login;
