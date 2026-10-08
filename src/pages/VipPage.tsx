import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, Send, Sparkles, Star } from 'lucide-react';
import {
  euros, fetchMyVipProfile, fetchVipCredit, fetchVipDirectory, fetchVipProposals, refundExpiredVipProposals,
  type VipProfile, type VipProposal,
} from '../lib/vip';
import type { Profile } from '../lib/types';
import { useToast } from '../context/ToastContext';
import VipCard, { type DirectoryVip } from '../components/vip/VipCard';
import VipProposalSheet from '../components/vip/VipProposalSheet';
import VipProposalList from '../components/vip/VipProposalList';
import VipApplyForm from '../components/vip/VipApplyForm';
import { EmptyState, ErrorBox, PageLoader } from '../components/ui';

type Tab = 'discover' | 'sent' | 'inbox' | 'me';

export default function VipPage({ me, refreshKey, onOpenChat }: { me: Profile; refreshKey: number; onOpenChat: (proposalId: string) => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('discover');
  const [vips, setVips] = useState<DirectoryVip[] | null>(null);
  const [mine, setMine] = useState<VipProfile | null>(null);
  const [sent, setSent] = useState<VipProposal[]>([]);
  const [inbox, setInbox] = useState<VipProposal[]>([]);
  const [credit, setCredit] = useState(0);
  const [error, setError] = useState(false);
  const [target, setTarget] = useState<DirectoryVip | null>(null);

  const load = useCallback(async () => {
    try {
      const refunded = await refundExpiredVipProposals();
      if (refunded > 0) toast(`${euros(refunded)} came back to you as credit for proposals that weren't answered`);
      const [v, m, s, c] = await Promise.all([fetchVipDirectory(me.id), fetchMyVipProfile(me.id), fetchVipProposals(me.id, 'sent'), fetchVipCredit()]);
      setVips(v);
      setMine(m);
      setSent(s);
      setCredit(c);
      setInbox(m?.status === 'approved' ? await fetchVipProposals(me.id, 'received') : []);
      setError(false);
    } catch (cause) {
      console.error('vip load failed', cause);
      setError(true);
    }
  }, [me.id, toast]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const isVip = mine?.status === 'approved';
  const waiting = inbox.filter((p) => p.status === 'pending').length;
  const tabs = useMemo(() => {
    const list: [Tab, string][] = [['discover', 'Discover VIP'], ['sent', 'My exclusive proposals']];
    if (isVip) list.push(['inbox', 'VIP inbox']);
    list.push(['me', mine ? 'My VIP profile' : 'Become a VIP - free']);
    return list;
  }, [isVip, mine]);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-ink-950 px-6 py-10 text-white sm:px-10">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-rose-600/20 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="chip bg-amber-400/15 font-semibold uppercase tracking-[0.2em] text-amber-300"><Star className="h-3.5 w-3.5 fill-amber-300" />PROPOSAL VIP</span>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">Verified public figures, by proposal only.</h1>
          <p className="mt-3 text-ink-300">
            Creators, athletes, musicians and local personalities who chose to be here. Messaging is locked: make an exclusive proposal
            for something meaningful, and they decide.
          </p>
          {credit > 0 && <p className="mt-4 inline-flex rounded-full bg-white/10 px-4 py-1.5 text-sm text-amber-200">You have {euros(credit)} PROPOSAL credit</p>}
        </div>
      </section>

      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:inline-flex sm:rounded-full sm:bg-ink-100 sm:p-1">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}>
            {label}
            {k === 'inbox' && waiting > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] text-ink-950">{waiting}</span>}
          </button>
        ))}
      </div>

      {error && <ErrorBox text="Could not load VIP." onRetry={load} />}
      {!vips && !error && <PageLoader />}

      {vips && (
        <div key={tab} className="animate-fade-up">
          {tab === 'discover' && (vips.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {vips.map((v) => <VipCard key={v.user_id} vip={v} onPropose={() => setTarget(v)} />)}
            </div>
          ) : (
            <EmptyState icon={<Sparkles className="h-6 w-6" />} title="The first VIPs are being verified"
              text="Verified creators and personalities will appear here soon. Are you one? Joining is free, and every proposal you accept earns you at least €1,000."
              action={<button onClick={() => setTab('me')} className="btn-dark">Become a VIP</button>} />
          ))}

          {tab === 'sent' && (sent.length ? (
            <VipProposalList items={sent} side="sent" onChanged={load} onOpenChat={onOpenChat} />
          ) : (
            <EmptyState icon={<Send className="h-6 w-6" />} title="No exclusive proposals yet"
              text="Pick a VIP and propose a dinner, a concert or your own idea."
              action={<button onClick={() => setTab('discover')} className="btn-dark">Discover VIP</button>} />
          ))}

          {tab === 'inbox' && isVip && (inbox.length ? (
            <VipProposalList items={inbox} side="received" onChanged={load} onOpenChat={onOpenChat} />
          ) : (
            <EmptyState icon={<Inbox className="h-6 w-6" />} title="Your VIP inbox is empty" text="Paid exclusive proposals will arrive here. Priority and premium ones are shown first." />
          ))}

          {tab === 'me' && <VipApplyForm key={mine ? `${mine.status}-${mine.paused}` : 'new'} myId={me.id} existing={mine} onSaved={load} />}
        </div>
      )}

      {target && (
        <VipProposalSheet vip={target} credit={credit} onClose={() => setTarget(null)} onSent={() => { setTarget(null); setTab('sent'); load(); }} />
      )}
    </div>
  );
}
