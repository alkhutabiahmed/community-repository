import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Pause, Pencil, Play, Send, Trash2, UserRound, X } from 'lucide-react';
import { CATEGORIES } from '../lib/catalog';
import { timeAgo } from '../lib/time';
import type { Profile, Story } from '../lib/types';
import { Avatar } from './ui';

const DURATION = 6000;
const TICK = 50;

const BACKDROPS: Record<Story['category'], string> = {
  food: 'from-rose-600 via-rose-500 to-amber-400',
  coffee: 'from-amber-800 via-amber-600 to-amber-300',
  active: 'from-teal-700 via-teal-500 to-teal-300',
  culture: 'from-ink-900 via-rose-800 to-amber-500',
  cinema: 'from-ink-950 via-ink-800 to-rose-700',
  nightlife: 'from-ink-950 via-rose-900 to-rose-600',
  music: 'from-rose-800 via-rose-600 to-amber-500',
  travel: 'from-teal-800 via-teal-600 to-amber-300',
};

export default function StoryViewer({ stories, startIndex, me, byId, onClose, onReply, onOpenPerson, onEdit, onDelete }: {
  stories: Story[];
  startIndex: number;
  me: Profile;
  byId: Map<string, Profile>;
  onClose: () => void;
  onReply: (story: Story, author: Profile) => void;
  onOpenPerson: (p: Profile) => void;
  onEdit: (story: Story) => void;
  onDelete: (story: Story) => Promise<void>;
}) {
  const [index, setIndex] = useState(startIndex);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pressStart = useRef(0);

  const story = stories[index];
  const author = story ? byId.get(story.user_id) : undefined;
  const mine = author?.id === me.id;
  const stopped = paused || held || confirmDelete;

  const go = useCallback((delta: number) => {
    const next = index + delta;
    if (next >= stories.length) {
      onClose();
      return;
    }
    setConfirmDelete(false);
    setElapsed(0);
    setIndex(Math.max(0, next));
  }, [index, stories.length, onClose]);

  useEffect(() => {
    if (stopped) return;
    const t = setInterval(() => setElapsed((e) => e + TICK), TICK);
    return () => clearInterval(t);
  }, [stopped, index]);

  useEffect(() => {
    if (elapsed >= DURATION) go(1);
  }, [elapsed, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [go, onClose]);

  if (!story || !author) return null;
  const Icon = CATEGORIES[story.category].icon;

  function release(delta: number) {
    setHeld(false);
    if (Date.now() - pressStart.current < 250) go(delta);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/95 backdrop-blur-sm sm:p-6">
      <button onClick={() => go(-1)} disabled={index === 0} aria-label="Previous story"
        className="absolute left-6 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-0 sm:flex">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button onClick={() => go(1)} aria-label="Next story"
        className="absolute right-6 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:flex">
        <ChevronRight className="h-5 w-5" />
      </button>

      <div key={story.id} className={`relative flex h-full w-full animate-scale-in flex-col overflow-hidden bg-gradient-to-br text-white shadow-2xl sm:h-[min(820px,92vh)] sm:max-w-[440px] sm:rounded-3xl ${BACKDROPS[story.category]}`}>
        <div className="relative z-20 px-4 pt-4">
          <div className="flex gap-1">
            {stories.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <div className="h-full rounded-full bg-white"
                  style={{ width: `${i < index ? 100 : i > index ? 0 : Math.min(100, (elapsed / DURATION) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => { onClose(); onOpenPerson(author); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Avatar profile={author} size={40} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{mine ? 'Your story' : author.display_name}</div>
                <div className="text-xs text-white/75">{timeAgo(story.created_at)}</div>
              </div>
            </button>
            <button onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'} className="rounded-full p-2 transition hover:bg-white/15">
              {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
            <button onClick={onClose} aria-label="Close" className="rounded-full p-2 transition hover:bg-white/15">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="absolute inset-0 z-10 flex">
          <button aria-label="Previous" className="h-full w-1/3 cursor-w-resize"
            onPointerDown={() => { pressStart.current = Date.now(); setHeld(true); }}
            onPointerUp={() => release(-1)} onPointerLeave={() => setHeld(false)} />
          <button aria-label="Next" className="h-full w-2/3 cursor-e-resize"
            onPointerDown={() => { pressStart.current = Date.now(); setHeld(true); }}
            onPointerUp={() => release(1)} onPointerLeave={() => setHeld(false)} />
        </div>

        <div className="pointer-events-none relative z-0 flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur">
            <Icon className="h-3.5 w-3.5" />{CATEGORIES[story.category].label}
          </span>
          <p className="mt-6 font-display text-3xl font-semibold leading-tight drop-shadow-sm sm:text-4xl">{story.body}</p>
        </div>

        <div className="relative z-20 space-y-2 bg-gradient-to-t from-ink-950/60 to-transparent p-4 pt-10">
          {mine ? (
            confirmDelete ? (
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-full bg-white/15 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/25">Keep it</button>
                <button
                  disabled={deleting}
                  onClick={async () => { setDeleting(true); try { await onDelete(story); } finally { setDeleting(false); } }}
                  className="flex-1 rounded-full bg-error-600 py-3 text-sm font-semibold transition hover:bg-error-700 disabled:opacity-60"
                >
                  {deleting ? 'Removing...' : 'Yes, remove'}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => onEdit(story)} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-semibold text-ink-900 transition hover:bg-ink-100">
                  <Pencil className="h-4 w-4" />Edit story
                </button>
                <button onClick={() => setConfirmDelete(true)} aria-label="Remove story" className="flex items-center justify-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/25">
                  <Trash2 className="h-4 w-4" />Remove
                </button>
              </div>
            )
          ) : (
            <div className="flex gap-2">
              <button onClick={() => onReply(story, author)} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-semibold text-ink-900 transition hover:bg-ink-100">
                <Send className="h-4 w-4" />Reply with a proposal
              </button>
              <button onClick={() => { onClose(); onOpenPerson(author); }} aria-label="View profile" className="flex items-center justify-center rounded-full bg-white/15 px-4 py-3 backdrop-blur transition hover:bg-white/25">
                <UserRound className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
