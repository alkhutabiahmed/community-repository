import { Bookmark, BookmarkCheck, Clock, MapPin } from 'lucide-react';
import { CATEGORIES } from '../lib/catalog';
import type { Experience } from '../lib/types';
import { LevelBadge } from './ui';

export default function ExperienceCard({ exp, saved, onToggleSave, onPropose }: {
  exp: Experience;
  saved: boolean;
  onToggleSave: () => void;
  onPropose: () => void;
}) {
  const Icon = CATEGORIES[exp.category].icon;
  return (
    <article className="card group flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-ink-900/5">
      <div className="relative aspect-[16/10] overflow-hidden">
        <img src={exp.image_url} alt={exp.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
        <div className="absolute left-3 top-3"><LevelBadge level={exp.level} /></div>
        <button
          onClick={onToggleSave}
          aria-label={saved ? 'Remove from Date Wallet' : 'Save to Date Wallet'}
          className={`absolute right-3 top-3 rounded-full p-2 backdrop-blur transition ${saved ? 'bg-rose-600 text-white' : 'bg-white/90 text-ink-700 hover:bg-white'}`}
        >
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-500"><Icon className="h-3.5 w-3.5" />{CATEGORIES[exp.category].label}</div>
        <h3 className="mt-1 font-display text-lg font-semibold">{exp.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-ink-600">{exp.description}</p>
        <div className="mt-4 space-y-1 text-xs text-ink-600">
          <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{exp.default_time} · {exp.price_hint}</div>
          <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{exp.venue}, {exp.city}</div>
        </div>
        <button onClick={onPropose} className="btn-dark mt-5 w-full">Propose this</button>
      </div>
    </article>
  );
}
