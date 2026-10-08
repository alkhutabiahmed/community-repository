import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gem, Inbox, Lock, Send } from 'lucide-react';
import { cancelProposal, fetchMyFeedbackIds, fetchMyProposals, markBooked, respondProposal } from '../lib/api';
import { isExpired } from '../lib/time';
import { TIER_ORDER, fetchLockedProposals } from '../lib/membership';
import type { ComposerPreset, Profile, ProposalWithPeople } from '../lib/types';
import { useToast } from '../context/ToastContext';
import ProposalCard, { type CardAction } from '../components/ProposalCard';
import { ApplicantsDialog, CounterDialog, FeedbackDialog } from '../components/ProposalDialogs';
import { EmptyState, ErrorBox, Modal, PageLoader } from '../components/ui';

type Tab = 'received' | 'sent' | 'upcoming';
type Dialog = { kind: 'counter' | 'applicants' | 'feedback' | 'cancel'; p: ProposalWithPeople } | null;

const ORDER: Record<string, number> = { pending: 0, open: 0, accepted: 1, countered: 2, declined: 3, cancelled: 3, closed: 3 };

export default function ProposalsPage({ me, paid, membershipReady, onUpgrade, onPropose, onOpenChat, refreshKey }: {
  me: Profile;
  paid: boolean;
  membershipReady: boolean;
  onUpgrade: () => void;
  onPropose: (p: ComposerPreset) => void;
  onOpenChat: (proposalId: string) => void;
  refreshKey: number;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('received');
  const [items, setItems] = useState<ProposalWithPeople[] | null>(null);
  const [feedbackIds, setFeedbackIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [locked, setLocked] = useState({ total: 0, special: 0 });

  const load = useCallback(async () => {
    try {
      const [p, f, l] = await Promise.all([
        fetchMyProposals(me.id),
        fetchMyFeedbackIds(),
        membershipReady && !paid ? fetchLockedProposals() : Promise.resolve({ total: 0, special: 0 }),
      ]);
      setItems(p);
      setFeedbackIds(f);
      setLocked(l);
      setError(false);
    } catch (cause) {
      console.error('proposals load failed', cause);
      setError(true);
    }
  }, [me.id, membershipReady, paid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const lists = useMemo(() => {
    const all = items ?? [];
    const rank = (p: ProposalWithPeople) => ((p.status === 'pending' || p.status === 'open') && isExpired(p.expires_at) ? 3 : ORDER[p.status] ?? 3);
    const sort = (arr: ProposalWithPeople[]) => [...arr].sort((a, b) => rank(a) - rank(b) || TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    return {
      received: sort(all.filter((p) => p.recipient_id === me.id && p.status !== 'accepted')),
      sent: sort(all.filter((p) => p.sender_id === me.id && p.status !== 'accepted')),
      upcoming: all.filter((p) => p.status === 'accepted').sort((a, b) => +new Date(b.proposed_for) - +new Date(a.proposed_for)),
    };
  }, [items, me.id]);

  const pendingCount = lists.received.filter((p) => p.status === 'pending' && !isExpired(p.expires_at)).length + locked.total;

  async function run(fn: () => Promise<void>, ok: string) {
    try {
      await fn();
      toast(ok);
      load();
      return true;
    } catch (cause) {
      console.error('proposal action failed', cause);
      const planRequired = String((cause as { message?: string })?.message ?? '').includes('PLAN_REQUIRED');
      toast(planRequired ? 'Answering proposals is for members. Pick a plan to continue.' : 'That proposal is no longer available', 'error');
      if (planRequired) onUpgrade();
      load();
      return false;
    }
  }

  function onAction(p: ProposalWithPeople, a: CardAction) {
    if (a === 'accept') run(() => respondProposal(p.id, 'accept'), `You're going! Say hi to ${p.sender.display_name}`).then((ok) => ok && setTab('upcoming'));
    else if (a === 'decline') run(() => respondProposal(p.id, 'decline'), 'Proposal declined');
    else if (a === 'booked') run(() => markBooked(p.id), 'Marked as booked');
    else if (a === 'chat') onOpenChat(p.id);
    else if (a === 'cancel') setDialog({ kind: 'cancel', p });
    else setDialog({ kind: a, p });
  }

  const done = () => { setDialog(null); load(); };
  const current = lists[tab];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Proposals</h1>
          <p className="mt-1 text-sm text-ink-500">Every proposal expires, so nothing stays in limbo.</p>
        </div>
        <button onClick={() => onPropose({})} className="btn-primary"><Send className="h-4 w-4" />New proposal</button>
      </div>

      <div className="flex gap-1 rounded-full bg-ink-100 p-1 sm:inline-flex">
        {([['received', 'Received'], ['sent', 'Sent'], ['upcoming', 'Plans']] as [Tab, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition sm:flex-none ${tab === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}
          >
            {label}
            {k === 'received' && pendingCount > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[11px] text-white">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {error && <ErrorBox text="Could not load your proposals." onRetry={load} />}
      {!items && !error && <PageLoader />}

      {items && tab === 'received' && locked.total > 0 && (
        <section className="relative overflow-hidden rounded-3xl bg-ink-950 p-6 text-white sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-rose-600/30 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10"><Lock className="h-5 w-5 text-amber-300" /></div>
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  {locked.total} {locked.total === 1 ? 'person has' : 'people have'} invited you out
                </h2>
                <p className="mt-1 max-w-md text-sm text-ink-300">
                  Become a member to see who they are, read their invitation and say yes before it expires.
                </p>
                {locked.special > 0 && (
                  <span className="chip mt-3 bg-amber-400/15 text-amber-300"><Gem className="h-3.5 w-3.5" />{locked.special} Super or VIP {locked.special === 1 ? 'proposal' : 'proposals'} waiting</span>
                )}
              </div>
            </div>
            <button onClick={onUpgrade} className="btn bg-amber-400 text-ink-950 hover:bg-amber-300">Unlock my proposals</button>
          </div>
        </section>
      )}

      {items && current.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {current.map((p) => (
            <ProposalCard key={p.id} p={p} me={me} hasFeedback={feedbackIds.has(p.id)} onAction={(a) => onAction(p, a)} />
          ))}
        </div>
      )}
      {items && !current.length && !(tab === 'received' && locked.total > 0) && (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title={tab === 'received' ? 'No proposals yet' : tab === 'sent' ? 'You haven\'t proposed anything' : 'No plans yet'}
          text={tab === 'upcoming' ? 'Accepted proposals show up here, ready to book and meet.' : 'Pick a date idea on Discover and invite someone - or try Tonight.'}
          action={<button onClick={() => onPropose({})} className="btn-primary">Make a Proposal</button>}
        />
      )}

      {dialog?.kind === 'counter' && <CounterDialog proposal={dialog.p} onClose={() => setDialog(null)} onDone={() => { done(); setTab('sent'); }} />}
      {dialog?.kind === 'applicants' && <ApplicantsDialog proposal={dialog.p} me={me} onClose={() => setDialog(null)} onDone={() => { done(); setTab('upcoming'); }} />}
      {dialog?.kind === 'feedback' && (
        <FeedbackDialog
          proposal={dialog.p}
          other={(dialog.p.sender_id === me.id ? dialog.p.recipient : dialog.p.sender)!}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      <Modal open={dialog?.kind === 'cancel'} onClose={() => setDialog(null)} title="Are you sure?">
        {dialog?.kind === 'cancel' && (
          <>
            <p className="text-sm text-ink-600">
              {dialog.p.status === 'accepted'
                ? 'Cancelling an accepted plan lowers your Reliability Score. Let them know in Messages first if you can.'
                : 'This proposal will be withdrawn and can no longer be accepted.'}
            </p>
            <div className="mt-6 flex gap-2">
              <button onClick={() => setDialog(null)} className="btn-ghost flex-1">Keep it</button>
              <button
                onClick={() => { const p = dialog.p; setDialog(null); run(() => cancelProposal(p.id), 'Proposal cancelled'); }}
                className="btn flex-1 bg-error-600 text-white hover:bg-error-700"
              >
                Yes, cancel
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
