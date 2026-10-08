import { CalendarCheck, CalendarDays, Gem, Gift, MapPin, MessageCircle, Repeat2, Sparkles, Timer, Zap } from 'lucide-react';
import { BOOST_PERKS } from '../lib/catalog';
import { formatWhen, isExpired, timeLeft } from '../lib/time';
import type { Profile, ProposalWithPeople } from '../lib/types';
import { Avatar, LevelBadge, Verified } from './ui';

export type CardAction = 'accept' | 'decline' | 'counter' | 'cancel' | 'applicants' | 'booked' | 'chat' | 'feedback';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: 'Waiting', cls: 'bg-warning-50 text-warning-700' },
  open: { text: 'Open to applicants', cls: 'bg-teal-50 text-teal-800' },
  accepted: { text: 'Accepted', cls: 'bg-success-50 text-success-700' },
  declined: { text: 'Declined', cls: 'bg-ink-100 text-ink-600' },
  countered: { text: 'Countered', cls: 'bg-amber-50 text-amber-800' },
  cancelled: { text: 'Cancelled', cls: 'bg-ink-100 text-ink-600' },
  expired: { text: 'Expired', cls: 'bg-ink-100 text-ink-600' },
};

const TIER_CARD: Record<string, string> = {
  normal: '',
  priority: 'ring-1 ring-amber-300',
  super: 'ring-2 ring-rose-400 shadow-lg shadow-rose-600/10',
  vip: 'ring-2 ring-amber-400 shadow-xl shadow-amber-500/10',
};

export default function ProposalCard({ p, me, hasFeedback, onAction }: {
  p: ProposalWithPeople;
  me: Profile;
  hasFeedback: boolean;
  onAction: (a: CardAction) => void;
}) {
  const iSent = p.sender_id === me.id;
  const other = iSent ? p.recipient : p.sender;
  const expired = (p.status === 'pending' || p.status === 'open') && isExpired(p.expires_at);
  const statusKey = expired ? 'expired' : p.status;
  const status = STATUS_LABEL[statusKey] ?? STATUS_LABEL.pending;
  const past = new Date(p.proposed_for).getTime() < Date.now();
  const inactive = ['declined', 'cancelled', 'countered', 'expired'].includes(statusKey);
  const tier = p.tier ?? 'normal';

  return (
    <article className={`card overflow-hidden transition ${TIER_CARD[tier]} ${inactive ? 'opacity-60' : 'hover:shadow-lg hover:shadow-ink-900/5'}`}>
      {tier === 'vip' && (
        <div className="bg-ink-950 px-5 py-4 text-white">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300"><Gem className="h-3.5 w-3.5" />VIP Proposal</div>
          <div className="mt-1 font-display text-lg font-semibold">
            {iSent ? 'You invited' : `${p.sender.display_name} invited you`}{iSent && other ? ` ${other.display_name}` : ''}: {p.title.toLowerCase()}
          </div>
          <div className="mt-1 text-sm text-ink-300">{formatWhen(p.proposed_for)}{p.location ? ` \u00b7 ${p.location}` : ''}{p.reservation_status === 'booked' ? ' \u00b7 Reservation ready' : ''}</div>
        </div>
      )}
      {tier === 'super' && (
        <div className="flex items-center gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white"><Sparkles className="h-3.5 w-3.5" />Super Proposal</div>
      )}
      <div className="p-5">
      <div className="flex items-start gap-3">
        {other ? <Avatar profile={other} size={48} /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800">Open</div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
            <span>{iSent ? (other ? `To ${other.display_name}` : 'Open proposal') : `From ${p.sender.display_name}`}</span>
            {other?.verified && <Verified className="h-3.5 w-3.5" />}
            {p.parent_id && <span className="chip bg-amber-50 px-2 py-0.5 text-amber-800"><Repeat2 className="h-3 w-3" />Counter-proposal</span>}
            {tier === 'priority' && <span className="chip bg-amber-100 px-2 py-0.5 text-amber-900"><Zap className="h-3 w-3" />Priority</span>}
          </div>
          <h3 className="mt-0.5 font-display text-lg font-semibold leading-snug">{p.title}</h3>
        </div>
        <span className={`chip shrink-0 ${status.cls}`}>{status.text}</span>
      </div>

      {p.message && <p className="mt-3 text-sm text-ink-600">"{p.message}"</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-600">
        <LevelBadge level={p.level} />
        <span className="chip bg-ink-100"><CalendarDays className="h-3.5 w-3.5" />{formatWhen(p.proposed_for)}</span>
        {p.location && <span className="chip bg-ink-100"><MapPin className="h-3.5 w-3.5" />{p.location}</span>}
        {(p.status === 'pending' || p.status === 'open') && !expired && (
          <span className="chip bg-warning-50 text-warning-700"><Timer className="h-3.5 w-3.5" />{timeLeft(p.expires_at)}</span>
        )}
        {p.reservation_status === 'booked' && <span className="chip bg-success-50 text-success-700"><CalendarCheck className="h-3.5 w-3.5" />Booked</span>}
      </div>

      {p.boost_amount > 0 && p.boost_perk && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <Gift className="h-4 w-4 shrink-0" />
          {iSent ? 'You' : p.sender.display_name} added a EUR {p.boost_amount} experience upgrade: {BOOST_PERKS[p.boost_perk].toLowerCase()}
        </div>
      )}

      <Actions p={p} iSent={iSent} expired={expired} past={past} hasFeedback={hasFeedback} onAction={onAction} />
      </div>
    </article>
  );
}

function Actions({ p, iSent, expired, past, hasFeedback, onAction }: {
  p: ProposalWithPeople; iSent: boolean; expired: boolean; past: boolean; hasFeedback: boolean; onAction: (a: CardAction) => void;
}) {
  if (expired) return null;
  const row = 'mt-5 flex flex-wrap gap-2';

  if (p.status === 'pending' && !iSent) {
    return (
      <div className={row}>
        <button onClick={() => onAction('accept')} className="btn-primary flex-1">Accept</button>
        <button onClick={() => onAction('counter')} className="btn-ghost flex-1"><Repeat2 className="h-4 w-4" />Suggest another time</button>
        <button onClick={() => onAction('decline')} className="btn-ghost text-ink-500">Decline</button>
      </div>
    );
  }
  if (p.status === 'pending' && iSent) {
    return <div className={row}><button onClick={() => onAction('cancel')} className="btn-ghost text-ink-600">Withdraw proposal</button></div>;
  }
  if (p.status === 'open') {
    return (
      <div className={row}>
        <button onClick={() => onAction('applicants')} className="btn-dark flex-1">Review applicants</button>
        <button onClick={() => onAction('cancel')} className="btn-ghost text-ink-600">Close</button>
      </div>
    );
  }
  if (p.status === 'accepted' && !past) {
    return (
      <div className={row}>
        <button onClick={() => onAction('chat')} className="btn-dark flex-1"><MessageCircle className="h-4 w-4" />Message</button>
        {p.reservation_status !== 'booked' && <button onClick={() => onAction('booked')} className="btn-ghost flex-1"><CalendarCheck className="h-4 w-4" />Mark as booked</button>}
        <button onClick={() => onAction('cancel')} className="btn-ghost text-ink-500">Cancel</button>
      </div>
    );
  }
  if (p.status === 'accepted' && past) {
    return (
      <div className={row}>
        <button onClick={() => onAction('chat')} className="btn-ghost flex-1"><MessageCircle className="h-4 w-4" />Message</button>
        {!hasFeedback && <button onClick={() => onAction('feedback')} className="btn-primary flex-1">How did it go?</button>}
      </div>
    );
  }
  return null;
}
