import { MapPin, Star } from 'lucide-react';
import { VIP_KINDS, compactFollowers, euros, type VipProfile } from '../../lib/vip';
import { Avatar } from '../ui';

export type DirectoryVip = VipProfile & { left: number };

export function VipStar({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return <Star className={`${className} fill-amber-400 text-amber-400`} />;
}

export default function VipCard({ vip, onPropose }: { vip: DirectoryVip; onPropose: () => void }) {
  const full = vip.left === 0;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl bg-ink-950 text-white shadow-lg shadow-ink-900/10 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-amber-500/10">
      <div className="relative aspect-[4/3] overflow-hidden">
        {vip.profile.photo_url ? (
          <img src={vip.profile.photo_url} alt={vip.profile.display_name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-ink-800"><Avatar profile={vip.profile} size={96} /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink-950/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300 backdrop-blur">
          Verified <VipStar className="h-3 w-3" />
        </span>
        <div className="absolute inset-x-4 bottom-3">
          <h3 className="font-display text-2xl font-semibold leading-tight">{vip.profile.display_name}</h3>
          <p className="text-sm text-ink-200">{vip.role}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-300">
          <span><span className="font-semibold text-white">{compactFollowers(vip.followers)}</span> followers</span>
          {vip.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{vip.city}</span>}
        </div>
        {vip.availability_note && <p className="text-sm text-amber-200">"{vip.availability_note}"</p>}
        <div className="flex flex-wrap gap-1.5">
          {vip.accepted_kinds.map((k) => {
            const Icon = VIP_KINDS[k].icon;
            return <span key={k} className="chip bg-white/10 text-ink-100"><Icon className="h-3 w-3" />{VIP_KINDS[k].label}</span>;
          })}
        </div>
        <div className="mt-auto space-y-3">
          <div className={`rounded-2xl px-3 py-2 text-sm font-medium ${full ? 'bg-white/5 text-ink-400' : 'bg-amber-400/10 text-amber-200'}`}>
            {full ? 'Full this week - new spots open Monday' : `Accepting ${vip.left} ${vip.left === 1 ? 'proposal' : 'proposals'} this week`}
          </div>
          <button
            onClick={onPropose}
            disabled={full}
            className="btn w-full bg-amber-400 font-semibold uppercase tracking-wide text-ink-950 hover:bg-amber-300"
          >
            Make an exclusive proposal - {euros(vip.price_standard)}
          </button>
        </div>
      </div>
    </article>
  );
}
