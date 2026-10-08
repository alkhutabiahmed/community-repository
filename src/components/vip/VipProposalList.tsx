import { useState } from 'react';
import { CalendarDays, Check, Gem, MessageCircle, X, Zap } from 'lucide-react';
import { VIP_KINDS, VIP_TIERS, VIP_TIER_ORDER, euros, respondVipProposal, type VipProposal, type VipProposalStatus } from '../../lib/vip';
import { timeAgo, timeLeft } from '../../lib/time';
import { useToast } from '../../context/ToastContext';
import { Avatar, Spinner } from '../ui';

const STATUS: Record<VipProposalStatus, { label: string; classes: string }> = {
  awaiting_payment: { label: 'Not paid', classes: 'bg-ink-100 text-ink-600' },
  pending: { label: 'Waiting for a reply', classes: 'bg-warning-50 text-warning-700' },
  accepted: { label: 'Accepted', classes: 'bg-success-50 text-success-700' },
  declined: { label: 'Declined - credited back', classes: 'bg-ink-100 text-ink-600' },
  expired: { label: 'No reply - credited back', classes: 'bg-ink-100 text-ink-600' },
};

export default function VipProposalList({ items, side, onChanged, onOpenChat }: {
  items: VipProposal[];
  side: 'sent' | 'received';
  onChanged: () => void;
  onOpenChat: (proposalId: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const sorted = side === 'received'
    ? [...items].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || VIP_TIER_ORDER[a.tier] - VIP_TIER_ORDER[b.tier] || +new Date(a.paid_at ?? 0) - +new Date(b.paid_at ?? 0))
    : items;

  async function respond(p: VipProposal, action: 'accept' | 'decline') {
    setBusy(`${p.id}-${action}`);
    try {
      await respondVipProposal(p.id, action);
      toast(action === 'accept' ? `You accepted ${p.sender.display_name}'s proposal. You can now chat in Messages.` : 'Proposal declined. They get their credit back.');
      onChanged();
    } catch (cause) {
      console.error('vip respond failed', cause);
      toast('That proposal is no longer available', 'error');
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sorted.map((p) => {
        const other = side === 'sent' ? p.vip : p.sender;
        const Icon = VIP_KINDS[p.kind].icon;
        const open = p.status === 'pending' && !!p.expires_at && new Date(p.expires_at) > new Date();
        return (
          <article key={p.id} className={`card overflow-hidden ${p.tier !== 'standard' ? 'ring-2 ring-amber-300' : ''}`}>
            {p.tier !== 'standard' && (
              <div className="flex items-center gap-1.5 bg-ink-950 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                {p.tier === 'premium' ? <Gem className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}{VIP_TIERS[p.tier].label}
              </div>
            )}
            <div className="p-5">
              <div className="flex items-start gap-3">
                <Avatar profile={other} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{side === 'sent' ? `To ${other.display_name}` : `${other.display_name}, ${other.age}`}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-display text-lg font-semibold"><Icon className="h-4 w-4 text-amber-600" />{VIP_KINDS[p.kind].label}</div>
                </div>
                <span className={`chip shrink-0 ${STATUS[p.status].classes}`}>{STATUS[p.status].label}</span>
              </div>
              {p.message && <p className="mt-3 text-sm text-ink-700">"{p.message}"</p>}
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-600">
                {p.preferred_date && <span className="chip bg-ink-100"><CalendarDays className="h-3.5 w-3.5" />{new Date(`${p.preferred_date}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
                <span className="chip bg-ink-100">{side === 'received' ? `You earn ${euros(p.payout_cents)}` : `Paid ${euros(p.amount_cents)}${p.paid_with === 'credit' ? ' in credit' : ''}`}</span>
                {open && <span className="chip bg-warning-50 text-warning-700">{timeLeft(p.expires_at!)}</span>}
                {p.paid_at && <span className="chip bg-ink-100">{timeAgo(p.paid_at)}</span>}
              </div>

              {side === 'received' && open && (
                <div className="mt-5 flex gap-2">
                  <button onClick={() => respond(p, 'decline')} disabled={!!busy} className="btn-ghost flex-1">
                    {busy === `${p.id}-decline` ? <Spinner className="h-4 w-4" /> : <><X className="h-4 w-4" />Decline</>}
                  </button>
                  <button onClick={() => respond(p, 'accept')} disabled={!!busy} className="btn-dark flex-1">
                    {busy === `${p.id}-accept` ? <Spinner className="h-4 w-4 text-white" /> : <><Check className="h-4 w-4" />Accept</>}
                  </button>
                </div>
              )}
              {p.status === 'accepted' && p.proposal_id && (
                <button onClick={() => onOpenChat(p.proposal_id!)} className="btn-ghost mt-5 w-full"><MessageCircle className="h-4 w-4" />Open chat</button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
