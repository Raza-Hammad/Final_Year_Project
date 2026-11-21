/**
 * Public `/tour` page — shareable, no sign-in required. Same player as the modal,
 * presented as a cinematic "observatory" screening room.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logomark from '../components/ui/Logomark';
import TourPlayer, { TOUR_SUBTITLE, TOUR_TITLE } from '../components/tour/TourPlayer';
import { useTourSource } from '../lib/tourSource';
import { isStoredTokenValid } from '../context/AuthContext';

const TourPage: React.FC = () => {
  const state = useTourSource();
  const signedIn = isStoredTokenValid(localStorage.getItem('token'));

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#04141A] px-6 py-10 text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(45,212,191,0.16), transparent 70%), radial-gradient(ellipse 50% 40% at 85% 100%, rgba(245,178,92,0.08), transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-[min(72rem,calc((100vh-12rem)*16/9))]">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2DD4BF]/10 ring-1 ring-[#2DD4BF]/25">
              <Logomark className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--sr-font-brand)' }}>
                {TOUR_TITLE}
              </h1>
              <p className="text-xs text-slate-400">{TOUR_SUBTITLE}</p>
            </div>
          </div>
          <Link
            to={signedIn ? '/' : '/login'}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 outline-none transition-colors hover:border-[#2DD4BF]/40 hover:text-[#7CE9D9] focus-visible:ring-2 focus-visible:ring-[#2DD4BF]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {signedIn ? 'Back to console' : 'Sign in'}
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#2DD4BF]/25 shadow-[0_40px_120px_-20px_rgba(45,212,191,0.28)]">
          <TourPlayer state={state} />
        </div>
        <p className="mt-4 text-center text-[11px] uppercase tracking-[0.2em] text-slate-500">
          3-tier cascade · Explainable AI · Includes team &amp; supervisor credits
        </p>
      </div>
    </main>
  );
};

export default TourPage;
