import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, Crown, Flame, Loader2, X } from 'lucide-react';
import { LEVELS } from '../lib/catalog';
import { activePlan, isAvailableTonightPremium } from '../lib/membership';
import type { Level, Profile } from '../lib/types';

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative max-h-[92vh] w-full animate-scale-in overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-white/95 px-6 py-4 backdrop-blur">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-ink-500 transition hover:bg-ink-100 hover:text-ink-900" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Avatar({ profile, size = 48, ring }: { profile: Pick<Profile, 'display_name' | 'photo_url'>; size?: number; ring?: boolean }) {
  const style = { width: size, height: size };
  const ringCls = ring ? 'ring-2 ring-rose-500 ring-offset-2' : '';
  if (profile.photo_url) {
    return <img src={profile.photo_url} alt={profile.display_name} style={style} className={`shrink-0 rounded-full object-cover ${ringCls}`} />;
  }
  return (
    <div style={{ ...style, fontSize: size / 2.6 }} className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-amber-400 font-semibold text-white ${ringCls}`}>
      {profile.display_name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Verified({ className = 'h-4 w-4' }: { className?: string }) {
  return <BadgeCheck className={`${className} shrink-0 text-teal-600`} aria-label="Verified" />;
}

export function MemberBadge({ profile, showTonight = true }: { profile: Profile; showTonight?: boolean }) {
  const plan = activePlan(profile);
  const tonight = showTonight && isAvailableTonightPremium(profile);
  if (!tonight && plan === 'free') return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {tonight && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          <Flame className="h-3 w-3" />Available Tonight
        </span>
      )}
      {plan === 'black' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-ink-950 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
          <Crown className="h-3 w-3" />Black
        </span>
      )}
      {plan === 'plus' && (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">Proposal+</span>
      )}
    </span>
  );
}

export function LevelBadge({ level }: { level: Level }) {
  const l = LEVELS[level];
  return (
    <span className={`chip border ${l.classes}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />
      {l.label}
    </span>
  );
}

export function ScoreRing({ value, size = 56, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 85 ? '#e11d48' : value >= 65 ? '#f99307' : '#8f877c';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#eceae7" strokeWidth="5" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} style={{ transition: 'stroke-dashoffset .8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-sm font-semibold text-ink-900">{value}%</span>
        {label && <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-500">{label}</span>}
      </div>
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin text-rose-600`} />;
}

export function PageLoader() {
  return (
    <div className="flex justify-center py-24">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">{icon}</div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-error-100 bg-error-50 px-4 py-3 text-sm text-error-700">
      <span>{text}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}
