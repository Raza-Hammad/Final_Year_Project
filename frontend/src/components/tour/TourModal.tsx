/**
 * Full-bleed dark-glass modal hosting the Cascadyx Project Tour.
 * Esc closes, Tab is trapped inside the dialog, focus returns to the opener on close.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { X, ExternalLink } from 'lucide-react';
import Logomark from '../ui/Logomark';
import TourPlayer, { TOUR_TITLE } from './TourPlayer';
import { useTourSource } from '../../lib/tourSource';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, iframe, [tabindex]:not([tabindex="-1"])';

interface TourModalProps {
  open: boolean;
  onClose: () => void;
}

export const TourModal: React.FC<TourModalProps> = ({ open, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const state = useTourSource(open);

  // Remember the opener, lock page scroll, and restore both on close.
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const root = dialogRef.current;
      const target = root?.querySelector<HTMLElement>('[data-tour-autofocus]') ?? root?.querySelector<HTMLElement>('button');
      target?.focus();
    }, 60);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (n) => n.offsetParent !== null,
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 xl:p-8"
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute inset-0 bg-[#020b0f]/85 backdrop-blur-xl"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-modal-title"
        className="relative w-full max-w-[min(72rem,calc((100vh-9rem)*16/9))] rounded-2xl border border-[#2DD4BF]/25 bg-[#071a21]/90 shadow-[0_40px_120px_-20px_rgba(45,212,191,0.28),0_0_0_1px_rgba(255,255,255,0.03)_inset]"
        style={{ animation: 'tour-rise 0.35s cubic-bezier(0.22,1,0.36,1) both' }}
      >
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2DD4BF]/10">
            <Logomark className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="tour-modal-title"
              className="truncate text-sm font-bold tracking-tight text-white"
              style={{ fontFamily: 'var(--sr-font-brand)' }}
            >
              {TOUR_TITLE}
            </h2>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#2DD4BF]/80">Signal Observatory</p>
          </div>
          <a
            href="/tour"
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-slate-400 outline-none transition-colors hover:text-[#7CE9D9] focus-visible:ring-2 focus-visible:ring-[#2DD4BF] sm:inline-flex"
          >
            Open as page <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tour"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-300 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[#2DD4BF]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-3 overflow-hidden rounded-xl ring-1 ring-white/10">
          <TourPlayer state={state} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[11px] text-slate-500">
          <span>Intro · live demo · team &amp; supervisor credits</span>
          <span className="hidden gap-3 md:flex">
            <span><kbd className="tour-kbd">Space</kbd> play</span>
            <span><kbd className="tour-kbd">←</kbd><kbd className="tour-kbd">→</kbd> seek 5s</span>
            <span><kbd className="tour-kbd">F</kbd> full screen</span>
            <span><kbd className="tour-kbd">Esc</kbd> close</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default TourModal;
