/**
 * Cascadyx Project Tour — video source resolution.
 *
 * The tour video is ~440 MB, far too large to bake into the Render Docker image or
 * commit to GitHub (100 MB limit), so it is hosted externally. The source is resolved
 * in this order:
 *   1. `VITE_TOUR_VIDEO_URL` (build-time env var — set in Render before a deploy)
 *   2. `/tour-config.json` (runtime file served from `frontend/public/`; edit + push)
 *   3. `/media/cascadyx-tour.mp4` if someone drops a small file in `public/media/`
 *
 * Supported URLs: YouTube (watch / youtu.be / embed), Google Drive share links,
 * Vimeo, or a direct `.mp4` / `.webm` URL (gets the full custom player chrome).
 */
import { useEffect, useState } from 'react';

export type TourSourceKind = 'file' | 'embed';

export interface TourChapter {
  /** Chapter title shown on the seek-bar marker. */
  label: string;
  /** Start time in seconds. */
  at: number;
}

export interface TourSource {
  kind: TourSourceKind;
  /** Direct media URL (kind=file) or iframe URL (kind=embed). */
  url: string;
  /** Original provider, used only for the small "hosted on" label. */
  provider: 'direct' | 'youtube' | 'drive' | 'vimeo';
  posterUrl?: string;
  chapters: TourChapter[];
}

interface TourConfigFile {
  videoUrl?: string;
  posterUrl?: string;
  chapters?: TourChapter[];
}

const LOCAL_FALLBACK = '/media/cascadyx-tour.mp4';

/** Turn any supported share URL into a playable {@link TourSource}. */
export function parseTourUrl(
  raw: string,
  extras: { posterUrl?: string; chapters?: TourChapter[] } = {},
): TourSource | null {
  const input = raw.trim();
  if (!input) return null;
  const base = { posterUrl: extras.posterUrl, chapters: extras.chapters ?? [] };

  let url: URL;
  try {
    url = new URL(input, window.location.origin);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    let id: string;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] ?? '';
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] ?? '';
    else id = url.searchParams.get('v') ?? '';
    if (!/^[\w-]{6,}$/.test(id)) return null;
    return {
      ...base,
      kind: 'embed',
      provider: 'youtube',
      url: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`,
    };
  }

  if (host === 'drive.google.com') {
    const match = url.pathname.match(/\/file\/d\/([\w-]+)/);
    const id = match?.[1] ?? url.searchParams.get('id') ?? '';
    if (!id) return null;
    return {
      ...base,
      kind: 'embed',
      provider: 'drive',
      url: `https://drive.google.com/file/d/${id}/preview`,
    };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean).find((p) => /^\d+$/.test(p));
    if (!id) return null;
    return {
      ...base,
      kind: 'embed',
      provider: 'vimeo',
      url: `https://player.vimeo.com/video/${id}?dnt=1`,
    };
  }

  return { ...base, kind: 'file', provider: 'direct', url: url.toString() };
}

async function probeLocalFile(): Promise<boolean> {
  try {
    // GET + 1-byte Range (the SPA router only answers GET); a missing file falls
    // through to index.html, which fails the content-type check below.
    const res = await fetch(LOCAL_FALLBACK, { headers: { Range: 'bytes=0-0' } });
    const type = res.headers.get('content-type') ?? '';
    void res.body?.cancel();
    return res.ok && type.startsWith('video/');
  } catch {
    return false;
  }
}

async function resolveTourSource(): Promise<TourSource | null> {
  const envUrl = (import.meta.env.VITE_TOUR_VIDEO_URL as string | undefined) ?? '';
  let cfg: TourConfigFile = {};
  try {
    const res = await fetch('/tour-config.json', { cache: 'no-cache' });
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && type.includes('json')) cfg = (await res.json()) as TourConfigFile;
  } catch {
    /* config is optional */
  }
  const extras = { posterUrl: cfg.posterUrl || undefined, chapters: cfg.chapters ?? [] };

  const fromEnv = envUrl ? parseTourUrl(envUrl, extras) : null;
  if (fromEnv) return fromEnv;
  const fromCfg = cfg.videoUrl ? parseTourUrl(cfg.videoUrl, extras) : null;
  if (fromCfg) return fromCfg;
  if (await probeLocalFile()) return parseTourUrl(LOCAL_FALLBACK, extras);
  return null;
}

export type TourSourceState =
  | { status: 'loading' }
  | { status: 'ready'; source: TourSource }
  | { status: 'missing' };

let cached: Promise<TourSource | null> | null = null;

/** Resolve (once per page load) where the tour video lives. */
export function useTourSource(enabled = true): TourSourceState {
  const [state, setState] = useState<TourSourceState>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    cached ??= resolveTourSource();
    void cached.then((source) => {
      if (!alive) return;
      setState(source ? { status: 'ready', source } : { status: 'missing' });
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return state;
}
