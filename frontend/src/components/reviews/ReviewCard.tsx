/** ReviewCard — one "transmission" on the Wall of Signals. All text renders as escaped React text. */
import React from 'react';
import { ThumbsUp, EyeOff, Eye, Trash2, Pencil } from 'lucide-react';
import SignalMeter from './SignalMeter';
import AuthorGlyph from './AuthorGlyph';
import type { ReviewItem } from './types';

interface ReviewCardProps {
  review: ReviewItem;
  isAdmin?: boolean;
  /** Preview mode inside the compose drawer: no actions. */
  preview?: boolean;
  onHelpful?: (id: number) => void;
  onEdit?: () => void;
  onToggleHidden?: (id: number, hidden: boolean) => void;
  onDelete?: (id: number) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const ReviewCard: React.FC<ReviewCardProps> = ({
  review,
  isAdmin = false,
  preview = false,
  onHelpful,
  onEdit,
  onToggleHidden,
  onDelete,
}) => {
  const hidden = review.status === 'hidden';
  return (
    <article
      className={`group relative rounded-[var(--sr-radius-md)] border border-[var(--sr-border-hairline)] bg-[var(--sr-glass-bg)] p-4 shadow-[var(--sr-shadow-sm)] transition-all duration-200 ${
        preview ? '' : 'hover:-translate-y-0.5 hover:border-[var(--sr-border-hover)] hover:shadow-[var(--sr-shadow-md)]'
      } ${hidden ? 'opacity-60' : ''}`}
      style={{ borderLeft: '3px solid var(--sr-nav-reviews)' }}
    >
      <header className="flex items-center gap-2.5">
        <AuthorGlyph name={review.author} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-[var(--sr-text-primary)]">
            {review.author}
            {review.mine && !preview && (
              <span className="ml-1.5 rounded-full bg-[var(--sr-nav-reviews-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--sr-nav-reviews)]">
                You
              </span>
            )}
            {hidden && (
              <span className="ml-1.5 rounded-full bg-[var(--sr-bg-surface-raised)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--sr-text-muted)]">
                Hidden
              </span>
            )}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--sr-text-muted)]" style={{ fontFamily: 'var(--sr-font-display)' }}>
            Transmission #{preview ? '—' : review.id} · {formatDate(review.created_at)}
            {review.edited ? ' · edited' : ''}
          </p>
        </div>
        <SignalMeter value={review.rating} size={20} />
      </header>

      {review.title && <h3 className="mt-3 text-sm font-semibold text-[var(--sr-text-primary)]">{review.title}</h3>}
      {review.body && (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--sr-text-secondary)]">{review.body}</p>
      )}
      {review.suggestion && (
        <p className="mt-2 rounded-[var(--sr-radius-sm)] bg-[var(--sr-bg-surface-raised)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--sr-text-secondary)]">
          <span className="font-semibold text-[var(--sr-text-primary)]">Could improve: </span>
          {review.suggestion}
        </p>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {review.tags.map((t) => (
          <span
            key={t}
            className="rounded-full border border-[var(--sr-border-hairline)] px-2 py-0.5 text-[10px] font-medium text-[var(--sr-text-secondary)]"
          >
            {t}
          </span>
        ))}
        <span className="text-[10px] text-[var(--sr-text-muted)]">
          {review.would_recommend ? 'Recommends Cascadyx' : 'Would not recommend yet'}
        </span>

        {!preview && (
          <div className="ml-auto flex items-center gap-1.5">
            {review.mine ? (
              <>
                <span className="text-[11px] text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {review.helpful_count} found helpful
                </span>
                {onEdit && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] px-2 py-1 text-[11px] font-medium text-[var(--sr-text-secondary)] hover:border-[var(--sr-border-hover)]"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => onHelpful?.(review.id)}
                aria-pressed={review.i_marked_helpful}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-[var(--sr-radius-sm)] border px-2 py-1 text-[11px] font-medium transition-colors ${
                  review.i_marked_helpful
                    ? 'border-[var(--sr-nav-reviews)] bg-[var(--sr-nav-reviews-soft)] text-[var(--sr-nav-reviews)]'
                    : 'border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)] hover:border-[var(--sr-border-hover)]'
                }`}
              >
                <ThumbsUp className="h-3 w-3" />
                Helpful · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{review.helpful_count}</span>
              </button>
            )}
            {isAdmin && (
              <>
                <button
                  type="button"
                  title={hidden ? 'Unhide' : 'Hide'}
                  onClick={() => onToggleHidden?.(review.id, !hidden)}
                  className="cursor-pointer rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] p-1.5 text-[var(--sr-text-secondary)] hover:border-[var(--sr-border-hover)]"
                >
                  {hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => onDelete?.(review.id)}
                  className="cursor-pointer rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] p-1.5 text-[var(--sr-sev-critical)] hover:border-[var(--sr-sev-critical)]"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        )}
      </footer>
    </article>
  );
};

export default ReviewCard;
