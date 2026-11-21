/**
 * Cascadyx tour player — custom "observatory" chrome around a direct video file, or a
 * branded frame around a YouTube / Drive / Vimeo embed (whose controls can't be skinned).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import TourLattice from './TourLattice';
import Logomark from '../ui/Logomark';
import type { TourSource, TourSourceState } from '../../lib/tourSource';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

export const TOUR_TITLE = 'Cascadyx Project Tour';
export const TOUR_SUBTITLE = 'Intro, live product walkthrough, and the team behind it.';

const SPEEDS = [1, 1.25, 1.5, 2, 0.75] as const;

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** Shared poster artwork: lattice, scrim, title block. */
const PosterArt: React.FC<{ animate: boolean; children?: React.ReactNode }> = ({ animate, children }) => (
  <div className="absolute inset-0 overflow-hidden bg-[#04141A]">
    <TourLattice className="absolute inset-0 h-full w-full" animate={animate} />
    <div
      className="absolute inset-0"
      style={{ background: 'radial-gradient(ellipse at 50% 120%, rgba(4,20,26,0.95) 10%, rgba(4,20,26,0.35) 60%, transparent)' }}
    />
    {children}
  </div>
);

const TitleBlock: React.FC = () => (
  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-7">
    <div className="max-w-md">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#2DD4BF]">
        <Logomark className="h-4 w-4" />
        Signal Observatory
      </div>
      <h3
        className="text-3xl font-bold leading-none tracking-tight text-white"
        style={{ fontFamily: 'var(--sr-font-brand)' }}
      >
        {TOUR_TITLE}
      </h3>
      <p className="mt-2 text-sm leading-snug text-slate-300">{TOUR_SUBTITLE}</p>
    </div>
    <span className="shrink-0 rounded-full border border-[#2DD4BF]/30 bg-[#2DD4BF]/10 px-3 py-1 text-[11px] font-medium text-[#7CE9D9]">
      Includes team &amp; supervisor credits
    </span>
  </div>
);

const BigPlay: React.FC<{ onClick: () => void; reduced: boolean }> = ({ onClick, reduced }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`Play ${TOUR_TITLE}`}
    data-tour-autofocus
    autoFocus
    className="group absolute left-1/2 top-[44%] flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4BF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#04141A]"
  >
    {!reduced && (
      <>
        <span className="absolute inset-0 rounded-full border border-[#2DD4BF]/50" style={{ animation: 'tour-ring 2.8s ease-out infinite' }} />
        <span className="absolute inset-0 rounded-full border border-[#2DD4BF]/40" style={{ animation: 'tour-ring 2.8s ease-out 1.4s infinite' }} />
      </>
    )}
    <span className="absolute inset-2 rounded-full bg-[#2DD4BF]/15 backdrop-blur-md transition-transform duration-200 group-hover:scale-110" />
    <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#2DD4BF] to-[#0F9F8E] text-[#04141A] shadow-[0_0_44px_rgba(45,212,191,0.55)] transition-transform duration-200 group-hover:scale-105">
      <Play className="ml-1 h-7 w-7 fill-current" />
    </span>
  </button>
);

/** Full custom player for a direct media URL. */
const FilePlayer: React.FC<{ source: TourSource; reduced: boolean }> = ({ source, reduced }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef<number | undefined>(undefined);

  const poke = useCallback(() => {
    setChromeVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChromeVisible(false), 2600);
  }, []);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setStarted(true);
    if (v.paused || v.ended) void v.play().catch(() => setFailed(true));
    else v.pause();
  }, []);

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  };

  const toggleFs = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') return; // let sliders use native arrow handling
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') {
      if (target.tagName === 'BUTTON' && k === ' ') return; // button handles its own activation
      e.preventDefault();
      toggle();
    } else if (k === 'arrowright') { e.preventDefault(); seekBy(5); }
    else if (k === 'arrowleft') { e.preventDefault(); seekBy(-5); }
    else if (k === 'm') { setMuted((m) => !m); }
    else if (k === 'f') { e.preventDefault(); toggleFs(); }
    poke();
  };

  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const showControls = started && (chromeVisible || !playing);

  return (
    <div
      ref={stageRef}
      role="group"
      aria-label={`${TOUR_TITLE} video player`}
      onKeyDown={onKeyDown}
      onMouseMove={poke}
      className="group/stage relative aspect-video w-full overflow-hidden rounded-[inherit] bg-black"
      style={{ cursor: started && playing && !chromeVisible ? 'none' : undefined }}
    >
      <video
        ref={videoRef}
        src={`${source.url}${source.url.includes('#') ? '' : '#t=0.1'}`}
        poster={source.posterUrl}
        preload="metadata"
        playsInline
        muted={muted}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        onClick={started ? toggle : undefined}
        onPlay={() => { setPlaying(true); setEnded(false); setStarted(true); poke(); }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setEnded(true); setChromeVisible(true); }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onError={() => setFailed(true)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
        }}
        onVolumeChange={(e) => { setVolume(e.currentTarget.volume); }}
      />

      {!started && !failed && (
        <div className="absolute inset-0">
          {/* The first video frame glows through the lattice scrim. */}
          <div className="absolute inset-0 bg-[#04141A]/70" />
          <TourLattice className="absolute inset-0 h-full w-full opacity-80 mix-blend-screen" animate={!reduced} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(4,20,26,0.15) 30%, rgba(4,20,26,0.92))' }} />
          <TitleBlock />
          <BigPlay onClick={toggle} reduced={reduced} />
        </div>
      )}

      {failed && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#04141A] px-8 text-center">
          <p className="text-sm font-semibold text-white">The tour video couldn't be loaded.</p>
          <p className="max-w-sm text-xs text-slate-400">Check your connection and try again. If the problem persists, the video host may be temporarily unavailable.</p>
          <button
            type="button"
            onClick={() => { setFailed(false); videoRef.current?.load(); }}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#2DD4BF] px-4 py-2 text-xs font-semibold text-[#04141A] outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {started && waiting && playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status" aria-label="Buffering">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-[#2DD4BF]/30 border-t-[#2DD4BF]" />
        </div>
      )}

      {ended && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#04141A]/80 backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2DD4BF]">Thanks for watching</p>
          <button
            type="button"
            onClick={() => { const v = videoRef.current; if (v) { v.currentTime = 0; void v.play(); } }}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#2DD4BF]/40 bg-[#2DD4BF]/10 px-5 py-2.5 text-sm font-medium text-[#7CE9D9] outline-none transition-colors hover:bg-[#2DD4BF]/20 focus-visible:ring-2 focus-visible:ring-[#2DD4BF]"
          >
            <RotateCcw className="h-4 w-4" /> Watch again
          </button>
        </div>
      )}

      {/* Control bar */}
      <div
        className={`absolute inset-x-0 bottom-0 px-4 pb-3 pt-14 transition-opacity duration-300 ${showControls && !ended ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        style={{ background: 'linear-gradient(0deg, rgba(4,20,26,0.95), rgba(4,20,26,0))' }}
      >
        <div className="relative mb-2 h-5 rounded focus-within:ring-2 focus-within:ring-[#2DD4BF]">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15" aria-hidden="true">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#0F9F8E] to-[#2DD4BF]" style={{ width: `${pct}%` }} />
          </div>
          {source.chapters.map((c) =>
            duration > 0 ? (
              <button
                key={c.at}
                type="button"
                title={c.label}
                aria-label={`Jump to ${c.label} at ${fmt(c.at)}`}
                onClick={() => { const v = videoRef.current; if (v) v.currentTime = c.at; }}
                className="absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-sm bg-[#F5B25C] outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{ left: `${(c.at / duration) * 100}%` }}
              />
            ) : null,
          )}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={time}
            aria-label="Seek"
            aria-valuetext={`${fmt(time)} of ${fmt(duration)}`}
            onChange={(e) => { const v = videoRef.current; if (v) v.currentTime = Number(e.target.value); setTime(Number(e.target.value)); }}
            className="tour-range absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <div className="flex items-center gap-3 text-white">
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="tour-ctl">
            {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
          </button>
          <button
            type="button"
            onClick={() => { const v = videoRef.current; if (v) v.muted = !muted; setMuted((m) => !m); }}
            aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
            className="tour-ctl"
          >
            {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-label="Volume"
            onChange={(e) => {
              const v = videoRef.current;
              const val = Number(e.target.value);
              if (v) { v.volume = val; v.muted = val === 0; }
              setMuted(val === 0);
              setVolume(val);
            }}
            className="tour-range h-1 w-20 cursor-pointer accent-[#2DD4BF]"
          />
          <span className="ml-1 text-xs tabular-nums text-slate-300" aria-hidden="true">
            {fmt(time)} <span className="text-slate-500">/</span> {fmt(duration)}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              const next = (speedIdx + 1) % SPEEDS.length;
              setSpeedIdx(next);
              if (videoRef.current) videoRef.current.playbackRate = SPEEDS[next];
            }}
            aria-label={`Playback speed ${SPEEDS[speedIdx]}x, activate to change`}
            className="tour-ctl min-w-[3rem] text-xs font-semibold tabular-nums"
          >
            {SPEEDS[speedIdx]}×
          </button>
          <button type="button" onClick={toggleFs} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} className="tour-ctl">
            {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

const PROVIDER_LABEL: Record<TourSource['provider'], string> = {
  direct: '',
  youtube: 'YouTube',
  drive: 'Google Drive',
  vimeo: 'Vimeo',
};

/** Branded frame around an iframe embed; the iframe mounts only after the user hits play. */
const EmbedPlayer: React.FC<{ source: TourSource; reduced: boolean }> = ({ source, reduced }) => {
  const [started, setStarted] = useState(false);
  const autoplayUrl =
    source.provider === 'drive' ? source.url : `${source.url}${source.url.includes('?') ? '&' : '?'}autoplay=1`;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[inherit] bg-black">
      {started ? (
        <iframe
          src={autoplayUrl}
          title={TOUR_TITLE}
          className="absolute inset-0 h-full w-full border-0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <PosterArt animate={!reduced}>
          <TitleBlock />
          <BigPlay onClick={() => setStarted(true)} reduced={reduced} />
          {PROVIDER_LABEL[source.provider] && (
            <span className="absolute right-4 top-4 rounded-full bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-widest text-slate-400">
              Streams via {PROVIDER_LABEL[source.provider]}
            </span>
          )}
        </PosterArt>
      )}
    </div>
  );
};

/** Shown while the source resolves, or when no video has been configured yet. */
const Placeholder: React.FC<{ loading: boolean; reduced: boolean }> = ({ loading, reduced }) => (
  <div className="relative aspect-video w-full overflow-hidden rounded-[inherit] bg-black">
    <PosterArt animate={!reduced}>
      <TitleBlock />
      <div className="absolute left-1/2 top-[42%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 text-center" role="status">
        {loading ? (
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-[#2DD4BF]/30 border-t-[#2DD4BF]" />
        ) : (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[#2DD4BF]/30 bg-[#2DD4BF]/10 text-[#2DD4BF]">
              <Play className="ml-0.5 h-6 w-6 fill-current opacity-60" />
            </span>
            <p className="text-sm font-semibold text-white">The tour video is being uploaded</p>
            <p className="max-w-xs text-xs text-slate-400">It will appear here as soon as it&apos;s published. Please check back shortly.</p>
          </>
        )}
      </div>
    </PosterArt>
  </div>
);

interface TourPlayerProps {
  state: TourSourceState;
}

export const TourPlayer: React.FC<TourPlayerProps> = ({ state }) => {
  const reduced = usePrefersReducedMotion();
  if (state.status !== 'ready') return <Placeholder loading={state.status === 'loading'} reduced={reduced} />;
  return state.source.kind === 'file' ? (
    <FilePlayer source={state.source} reduced={reduced} />
  ) : (
    <EmbedPlayer source={state.source} reduced={reduced} />
  );
};

export default TourPlayer;
