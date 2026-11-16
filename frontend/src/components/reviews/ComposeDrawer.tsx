/** ComposeDrawer — slide-over form with a live preview of the review card. */
import React, { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import GlowButton from '../ui/GlowButton';
import SignalMeter from './SignalMeter';
import ReviewCard from './ReviewCard';
import { LIMITS, type ReviewDraft, type ReviewItem } from './types';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

interface ComposeDrawerProps {
  open: boolean;
  draft: ReviewDraft;
  onChange: (next: ReviewDraft) => void;
  tagVocabulary: string[];
  editing: boolean;
  busy: boolean;
  error: string | null;
  authorName: string;
  onSubmit: () => void;
  onClose: () => void;
  onDelete?: () => void;
}

const fieldClass =
  'w-full rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] bg-[var(--sr-bg-page)] p-2.5 text-xs text-[var(--sr-text-primary)] outline-none transition-all focus:border-[var(--sr-nav-reviews)] focus:ring-2 focus:ring-[var(--sr-nav-reviews-soft)]';

export const ComposeDrawer: React.FC<ComposeDrawerProps> = ({
  open,
  draft,
  onChange,
  tagVocabulary,
  editing,
  busy,
  error,
  authorName,
  onSubmit,
  onClose,
  onDelete,
}) => {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const preview = useMemo<ReviewItem>(
    () => ({
      id: 0,
      author: authorName,
      rating: draft.rating,
      title: draft.title || 'Your headline',
      body: draft.body || 'What you write appears here, exactly as others will read it.',
      would_recommend: draft.would_recommend,
      suggestion: draft.suggestion,
      tags: draft.tags,
      helpful_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edited: false,
      mine: true,
      i_marked_helpful: false,
    }),
    [draft, authorName],
  );

  const toggleTag = (tag: string) =>
    onChange({
      ...draft,
      tags: draft.tags.includes(tag) ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag],
    });

  const canSubmit = draft.rating >= 1 && !busy;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/30"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Edit your review' : 'Write a review'}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--sr-border-hairline)] bg-[var(--sr-bg-surface)] shadow-[var(--sr-shadow-md)]"
            initial={reduced ? false : { x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { x: 48, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between border-b border-[var(--sr-border-hairline)] px-5 py-4">
              <h2 className="text-sm font-semibold text-[var(--sr-text-primary)]" style={{ fontFamily: 'var(--sr-font-display)' }}>
                {editing ? 'Edit your transmission' : 'Send a transmission'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="cursor-pointer rounded-md p-1 text-[var(--sr-text-muted)] hover:text-[var(--sr-text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 px-5 py-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-[var(--sr-text-secondary)]">Signal strength</label>
                <div className="flex items-center gap-3">
                  <SignalMeter value={draft.rating} size={30} onChange={(rating) => onChange({ ...draft, rating })} label="Your rating" />
                  <span className="text-[11px] text-[var(--sr-text-muted)]">
                    {draft.rating ? `${draft.rating} of 5` : 'Tap a bar'}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="rv-title" className="mb-1.5 block text-[11px] font-medium text-[var(--sr-text-secondary)]">
                  Headline
                </label>
                <input
                  id="rv-title"
                  className={fieldClass}
                  maxLength={LIMITS.title}
                  value={draft.title}
                  onChange={(e) => onChange({ ...draft, title: e.target.value })}
                  placeholder="One line that sums it up"
                />
                <span className="mt-0.5 block text-right text-[10px] text-[var(--sr-text-muted)]">
                  {draft.title.length}/{LIMITS.title}
                </span>
              </div>

              <div>
                <label htmlFor="rv-body" className="mb-1.5 block text-[11px] font-medium text-[var(--sr-text-secondary)]">
                  What did you like?
                </label>
                <textarea
                  id="rv-body"
                  rows={4}
                  className={`${fieldClass} resize-none`}
                  maxLength={LIMITS.body}
                  value={draft.body}
                  onChange={(e) => onChange({ ...draft, body: e.target.value })}
                />
                <span className="mt-0.5 block text-right text-[10px] text-[var(--sr-text-muted)]">
                  {draft.body.length}/{LIMITS.body}
                </span>
              </div>

              <div>
                <span className="mb-1.5 block text-[11px] font-medium text-[var(--sr-text-secondary)]">Which parts stood out?</span>
                <div className="flex flex-wrap gap-1.5">
                  {tagVocabulary.map((t) => {
                    const on = draft.tags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleTag(t)}
                        className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          on
                            ? 'border-[var(--sr-nav-reviews)] bg-[var(--sr-nav-reviews-soft)] text-[var(--sr-nav-reviews)]'
                            : 'border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)] hover:border-[var(--sr-border-hover)]'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-[11px] font-medium text-[var(--sr-text-secondary)]">Would you recommend Cascadyx?</span>
                <div className="inline-flex rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] p-0.5 text-[11px] font-medium">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      aria-pressed={draft.would_recommend === v}
                      onClick={() => onChange({ ...draft, would_recommend: v })}
                      className={`cursor-pointer rounded-[6px] px-3 py-1 transition-colors ${
                        draft.would_recommend === v
                          ? 'bg-[var(--sr-nav-reviews-soft)] text-[var(--sr-nav-reviews)]'
                          : 'text-[var(--sr-text-secondary)]'
                      }`}
                    >
                      {v ? 'Yes' : 'Not yet'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="rv-sug" className="mb-1.5 block text-[11px] font-medium text-[var(--sr-text-secondary)]">
                  What should we improve? <span className="text-[var(--sr-text-muted)]">(optional)</span>
                </label>
                <textarea
                  id="rv-sug"
                  rows={2}
                  className={`${fieldClass} resize-none`}
                  maxLength={LIMITS.suggestion}
                  value={draft.suggestion}
                  onChange={(e) => onChange({ ...draft, suggestion: e.target.value })}
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--sr-text-muted)]">Live preview</span>
                <ReviewCard review={preview} preview />
              </div>

              {error && (
                <p role="alert" className="text-xs text-[var(--sr-sev-critical)]">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--sr-border-hairline)] px-5 py-3">
              {editing && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={busy}
                  className="cursor-pointer text-[11px] font-medium text-[var(--sr-sev-critical)] hover:underline disabled:opacity-50"
                >
                  Delete review
                </button>
              )}
              <GlowButton variant="ghost" className="ml-auto" onClick={onClose} type="button">
                Cancel
              </GlowButton>
              <GlowButton type="button" onClick={canSubmit ? onSubmit : undefined} disabled={!canSubmit}>
                {busy ? 'Sending…' : editing ? 'Save changes' : 'Send signal'}
              </GlowButton>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default ComposeDrawer;
