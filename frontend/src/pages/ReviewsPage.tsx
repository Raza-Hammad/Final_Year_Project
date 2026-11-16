/**
 * ReviewsPage — "Wall of Signals".
 *
 * Average rating as a 5-bar signal meter, a rating-distribution waveform,
 * recommend ring, top tags, and review cards written like transmissions.
 * One review per user (editable), helpful votes, admin hide/delete/CSV export.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, PenLine, Radio, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { useDashboard } from '../dashboard/DashboardContext';
import GlowPanel from '../components/ui/GlowPanel';
import GlowButton from '../components/ui/GlowButton';
import { useToast } from '../components/toast/ToastProvider';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import SignalMeter from '../components/reviews/SignalMeter';
import ReviewCard from '../components/reviews/ReviewCard';
import ComposeDrawer from '../components/reviews/ComposeDrawer';
import {
  EMPTY_DRAFT,
  type ReviewDraft,
  type ReviewItem,
  type ReviewSort,
  type ReviewSummary,
} from '../components/reviews/types';

const SORTS: { id: ReviewSort; label: string }[] = [
  { id: 'recent', label: 'Most recent' },
  { id: 'top', label: 'Top rated' },
  { id: 'helpful', label: 'Most helpful' },
];

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return 'Please check the form — one of the fields is not valid.';
  return fallback;
}

/** Rating distribution drawn as a small waveform (one bar per bar-of-signal). */
const DistributionWave: React.FC<{ distribution: Record<string, number>; count: number }> = ({ distribution, count }) => {
  const max = Math.max(1, ...Object.values(distribution));
  return (
    <div className="flex h-14 items-end gap-2" role="img" aria-label="Rating distribution">
      {[1, 2, 3, 4, 5].map((n) => {
        const v = distribution[String(n)] ?? 0;
        return (
          <div key={n} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-[3px] transition-all duration-500"
              style={{
                height: `${Math.max(6, (v / max) * 100)}%`,
                background: count ? 'var(--sr-nav-reviews)' : 'var(--sr-bg-surface-raised)',
                opacity: count ? 0.35 + 0.65 * (v / max) : 1,
              }}
              title={`${v} review${v === 1 ? '' : 's'}`}
            />
            <span className="text-[9px] text-[var(--sr-text-muted)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {n}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const RecommendRing: React.FC<{ pct: number; empty: boolean }> = ({ pct, empty }) => {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16" role="img" aria-label={`${pct}% recommend`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--sr-bg-surface-raised)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="var(--sr-nav-reviews)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={empty ? c : c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-[var(--sr-text-primary)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {empty ? '—' : `${pct}%`}
      </span>
    </div>
  );
};

export const ReviewsPage: React.FC = () => {
  const { user } = useDashboard();
  const { pushToast } = useToast();
  const reduced = usePrefersReducedMotion();
  const isAdmin = (user?.role ?? '').toLowerCase() === 'admin';

  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [mine, setMine] = useState<ReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sort, setSort] = useState<ReviewSort>('recent');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [moderation, setModeration] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<ReviewDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);

  const load = useCallback(async () => {
    try {
      const listUrl = moderation && isAdmin ? '/api/admin/reviews' : '/api/reviews';
      const [s, list, m] = await Promise.all([
        api.get<ReviewSummary>('/api/reviews/summary'),
        api.get<{ items: ReviewItem[] }>(listUrl, {
          params: moderation && isAdmin ? undefined : { sort, tag: tagFilter ?? undefined, limit: 60 },
        }),
        api.get<{ review: ReviewItem | null }>('/api/reviews/mine'),
      ]);
      setSummary(s.data);
      setItems(list.data.items);
      setMine(m.data.review);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err, 'Could not load reviews.'));
    } finally {
      setLoading(false);
    }
  }, [sort, tagFilter, moderation, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(() => {
    if (!(moderation && isAdmin)) return items;
    return items.filter((r) => (tagFilter ? r.tags.includes(tagFilter) : true));
  }, [items, moderation, isAdmin, tagFilter]);

  const openCompose = () => {
    setFormError(null);
    setDraft(
      mine
        ? {
            rating: mine.rating,
            title: mine.title,
            body: mine.body,
            would_recommend: mine.would_recommend,
            suggestion: mine.suggestion,
            tags: mine.tags,
          }
        : EMPTY_DRAFT,
    );
    setDrawerOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    setFormError(null);
    try {
      if (mine) await api.put('/api/reviews/mine', draft);
      else await api.post('/api/reviews', draft);
      setDrawerOpen(false);
      setPulse((p) => p + 1);
      pushToast(mine ? 'Review updated.' : 'Signal received — thank you.', 'success');
      await load();
    } catch (err) {
      setFormError(errorText(err, 'Could not send your review.'));
    } finally {
      setBusy(false);
    }
  };

  const removeMine = async () => {
    if (!window.confirm('Delete your review? This cannot be undone.')) return;
    setBusy(true);
    try {
      await api.delete('/api/reviews/mine');
      setDrawerOpen(false);
      pushToast('Your review was deleted.', 'info');
      await load();
    } catch (err) {
      setFormError(errorText(err, 'Could not delete your review.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleHelpful = async (id: number) => {
    try {
      const { data } = await api.post<{ helpful_count: number; i_marked_helpful: boolean }>(`/api/reviews/${id}/helpful`);
      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...r, helpful_count: data.helpful_count, i_marked_helpful: data.i_marked_helpful } : r)),
      );
    } catch (err) {
      pushToast(errorText(err, 'Could not update that vote.'), 'error');
    }
  };

  const setHidden = async (id: number, hidden: boolean) => {
    try {
      await api.patch(`/api/admin/reviews/${id}`, { status: hidden ? 'hidden' : 'published' });
      pushToast(hidden ? 'Review hidden.' : 'Review restored.', 'info');
      await load();
    } catch (err) {
      pushToast(errorText(err, 'Moderation failed.'), 'error');
    }
  };

  const adminDelete = async (id: number) => {
    if (!window.confirm('Permanently delete this review?')) return;
    try {
      await api.delete(`/api/admin/reviews/${id}`);
      pushToast('Review deleted.', 'info');
      await load();
    } catch (err) {
      pushToast(errorText(err, 'Delete failed.'), 'error');
    }
  };

  const exportCsv = async () => {
    try {
      const res = await api.get<Blob>('/api/admin/reviews/export', { params: { format: 'csv' }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cascadyx_reviews.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast(errorText(err, 'Export failed.'), 'error');
    }
  };

  const empty = !summary || summary.count === 0;
  const authorName = (user?.username ?? 'You').split('@')[0].replace(/[_.]/g, ' ');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Wall of Signals hero */}
      <GlowPanel className="relative overflow-hidden p-6">
        <AnimatePresence>
          {!reduced && pulse > 0 && (
            <motion.span
              key={pulse}
              className="pointer-events-none absolute left-10 top-10 h-24 w-24 rounded-full border-2"
              style={{ borderColor: 'var(--sr-nav-reviews)' }}
              initial={{ scale: 0.4, opacity: 0.9 }}
              animate={{ scale: 5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>

        <div className="relative grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--sr-nav-reviews)]">
              <Radio className="h-3 w-3" /> Wall of Signals
            </p>
            <div className="mt-2 flex items-end gap-3">
              <span
                className="text-5xl font-semibold leading-none text-[var(--sr-text-primary)]"
                style={{ fontFamily: 'var(--sr-font-display)', fontVariantNumeric: 'tabular-nums' }}
              >
                {empty ? '—' : summary.average.toFixed(1)}
              </span>
              <SignalMeter value={empty ? 0 : summary.average} size={34} />
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--sr-text-muted)]">
              {empty ? 'No transmissions yet — be the first.' : `${summary.count} transmission${summary.count === 1 ? '' : 's'}`}
            </p>
          </div>

          <div className="min-w-0">
            <DistributionWave distribution={summary?.distribution ?? {}} count={summary?.count ?? 0} />
          </div>

          <div className="flex items-center gap-4">
            <RecommendRing pct={summary?.recommend_pct ?? 0} empty={empty} />
            <div className="text-[11px] text-[var(--sr-text-secondary)]">
              <p className="font-semibold text-[var(--sr-text-primary)]">would recommend</p>
              <div className="mt-1.5 flex max-w-[180px] flex-wrap gap-1">
                {(summary?.top_tags ?? []).slice(0, 3).map((t) => (
                  <span key={t.tag} className="rounded-full bg-[var(--sr-nav-reviews-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--sr-nav-reviews)]">
                    {t.tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--sr-border-hairline)] pt-4">
          <GlowButton type="button" onClick={openCompose}>
            <PenLine className="h-3.5 w-3.5" />
            {mine ? 'Edit your review' : 'Write a review'}
          </GlowButton>
          <p className="text-[11px] text-[var(--sr-text-muted)]">One review per account — you can edit it any time.</p>
          {isAdmin && (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModeration((m) => !m)}
                aria-pressed={moderation}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-[var(--sr-radius-sm)] border px-2.5 py-1.5 text-[11px] font-medium ${
                  moderation
                    ? 'border-[var(--sr-nav-reviews)] bg-[var(--sr-nav-reviews-soft)] text-[var(--sr-nav-reviews)]'
                    : 'border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)]'
                }`}
              >
                <ShieldCheck className="h-3 w-3" /> Moderation view
              </button>
              <button
                type="button"
                onClick={() => void exportCsv()}
                className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--sr-text-secondary)] hover:border-[var(--sr-border-hover)]"
              >
                <Download className="h-3 w-3" /> Export CSV
              </button>
            </div>
          )}
        </div>
      </GlowPanel>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {!(moderation && isAdmin) && (
          <div role="tablist" aria-label="Sort reviews" className="inline-flex rounded-[var(--sr-radius-sm)] border border-[var(--sr-border-hairline)] p-0.5 text-[11px] font-medium">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={sort === s.id}
                onClick={() => setSort(s.id)}
                className={`cursor-pointer rounded-[6px] px-2.5 py-1 transition-colors ${
                  sort === s.id ? 'bg-[var(--sr-nav-reviews-soft)] text-[var(--sr-nav-reviews)]' : 'text-[var(--sr-text-secondary)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {(summary?.tag_vocabulary ?? []).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tagFilter === t}
              onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                tagFilter === t
                  ? 'border-[var(--sr-nav-reviews)] bg-[var(--sr-nav-reviews-soft)] text-[var(--sr-nav-reviews)]'
                  : 'border-[var(--sr-border-hairline)] text-[var(--sr-text-secondary)] hover:border-[var(--sr-border-hover)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Wall */}
      {loading ? (
        <p className="py-10 text-center text-xs text-[var(--sr-text-muted)]">Tuning in…</p>
      ) : loadError ? (
        <p role="alert" className="py-10 text-center text-xs text-[var(--sr-sev-critical)]">
          {loadError}
        </p>
      ) : visibleItems.length === 0 ? (
        <GlowPanel className="py-12 text-center">
          <p className="text-sm font-semibold text-[var(--sr-text-primary)]">The wall is quiet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--sr-text-secondary)]">
            {tagFilter ? 'Nothing matches that tag yet.' : 'Share what worked and what didn’t — it shapes what we build next.'}
          </p>
        </GlowPanel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleItems.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              isAdmin={isAdmin}
              onHelpful={(id) => void toggleHelpful(id)}
              onEdit={openCompose}
              onToggleHidden={(id, hidden) => void setHidden(id, hidden)}
              onDelete={(id) => void adminDelete(id)}
            />
          ))}
        </div>
      )}

      <ComposeDrawer
        open={drawerOpen}
        draft={draft}
        onChange={setDraft}
        tagVocabulary={summary?.tag_vocabulary ?? []}
        editing={!!mine}
        busy={busy}
        error={formError}
        authorName={authorName}
        onSubmit={() => void submit()}
        onClose={() => setDrawerOpen(false)}
        onDelete={() => void removeMine()}
      />
    </div>
  );
};

export default ReviewsPage;
