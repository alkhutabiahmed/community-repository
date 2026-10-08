import { useState } from 'react';
import { CalendarDays, CheckCircle2, Lock, MapPin, Timer, Users } from 'lucide-react';
import { applyToProposal } from '../lib/api';
import { proposalScore } from '../lib/matching';
import { formatWhen, timeLeft } from '../lib/time';
import type { Profile, ProposalWithPeople } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, LevelBadge, Modal, ScoreRing, Spinner, Verified } from './ui';

export default function OpenPlans({ plans, appliedIds, me, paid, onUpgrade, onApplied, onCreate }: {
  plans: ProposalWithPeople[];
  appliedIds: Set<string>;
  me: Profile;
  paid: boolean;
  onUpgrade: () => void;
  onApplied: () => void;
  onCreate: () => void;
}) {
  const toast = useToast();
  const [target, setTarget] = useState<ProposalWithPeople | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!target) return;
    setBusy(true);
    try {
      await applyToProposal(target.id, note.trim());
      toast(`You applied to join ${target.sender.display_name}`);
      setTarget(null);
      setNote('');
      onApplied();
    } catch (cause) {
      console.error('apply failed', cause);
      toast('Could not apply. The plan may have closed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!plans.length) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="No open plans right now"
        text="Publish your own, like 'I want to have dinner Friday evening', and let compatible people apply."
        action={<button onClick={onCreate} className="btn-primary">Publish an open proposal</button>}
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => {
          const s = proposalScore(me, p.sender, p.category, p.experience?.tags);
          const applied = appliedIds.has(p.id);
          return (
            <article key={p.id} className="card p-5 transition hover:shadow-lg hover:shadow-ink-900/5">
              <div className="flex items-start gap-3">
                <Avatar profile={p.sender} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-sm font-semibold">{p.sender.display_name}, {p.sender.age}{p.sender.verified && <Verified className="h-3.5 w-3.5" />}</div>
                  <h3 className="mt-0.5 font-display text-lg font-semibold leading-snug">{p.title}</h3>
                </div>
                <ScoreRing value={s.score} size={48} />
              </div>
              {p.message && <p className="mt-3 text-sm text-ink-600">"{p.message}"</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-600">
                <LevelBadge level={p.level} />
                <span className="chip bg-ink-100"><CalendarDays className="h-3.5 w-3.5" />{formatWhen(p.proposed_for)}</span>
                {p.location && <span className="chip bg-ink-100"><MapPin className="h-3.5 w-3.5" />{p.location}</span>}
                <span className="chip bg-warning-50 text-warning-700"><Timer className="h-3.5 w-3.5" />{timeLeft(p.expires_at)}</span>
              </div>
              {applied ? (
                <div className="mt-5 flex items-center justify-center gap-2 rounded-full bg-success-50 py-2.5 text-sm font-semibold text-success-700">
                  <CheckCircle2 className="h-4 w-4" /> Applied - waiting for {p.sender.display_name}
                </div>
              ) : paid ? (
                <button onClick={() => setTarget(p)} className="btn-dark mt-5 w-full">Apply to join</button>
              ) : (
                <button onClick={onUpgrade} className="btn-ghost mt-5 w-full"><Lock className="h-4 w-4" />Members can apply</button>
              )}
            </article>
          );
        })}
      </div>

      <Modal open={!!target} onClose={() => setTarget(null)} title="Apply to join">
        {target && (
          <>
            <p className="text-sm text-ink-600">
              <span className="font-semibold text-ink-900">{target.sender.display_name}</span> will see your profile and this note, then choose who joins "{target.title}".
            </p>
            <textarea rows={3} maxLength={300} className="input mt-4 resize-none" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why would this be a great plan for you two?" />
            <button onClick={apply} disabled={busy} className="btn-primary mt-4 w-full">
              {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Send application'}
            </button>
          </>
        )}
      </Modal>
    </>
  );
}
