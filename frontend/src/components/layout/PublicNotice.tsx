/**
 * Honest capacity notice for the public Cascadyx deployment.
 * Hidden on localhost / 127.0.0.1 so the local demo stays uncluttered.
 * Dismissal is remembered for the browser session only.
 */
import React, { useState } from 'react';
import { Info, X } from 'lucide-react';

const STORAGE_KEY = 'cascadyx.publicNotice.dismissed';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '']);

function shouldShow(): boolean {
  if (typeof window === 'undefined') return false;
  if (LOCAL_HOSTS.has(window.location.hostname)) return false;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

export const PublicNotice: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(shouldShow);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* storage unavailable — dismiss for this render only */
    }
    setVisible(false);
  };

  return (
    <div
      role="status"
      className="flex shrink-0 items-start gap-2 border-b border-[var(--sr-border-hairline)] bg-[var(--sr-accent-soft)] px-4 py-2 text-[11px] leading-snug text-[var(--sr-text-secondary)] sm:px-8"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--sr-accent)]" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold text-[var(--sr-text-primary)]">Public student demo.</span>{' '}
        Cascadyx is a single-server final-year project (~44 flows/s cascade inference, SQLite) — not a
        production SOC platform. The simulator is shared: please run{' '}
        <span className="font-semibold">one simulation at a time</span>. Traffic is replayed from recorded
        datasets; nothing here attacks real systems.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded p-0.5 text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)] cursor-pointer"
        aria-label="Dismiss notice"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default PublicNotice;
