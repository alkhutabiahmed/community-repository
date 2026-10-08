import { useEffect, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { chooseApplicant, counterProposal, fetchApplications, submitFeedback, type ApplicationWithApplicant } from '../lib/api';
import { proposalScore } from '../lib/matching';
import { suggestedDate, toLocalInput } from '../lib/time';
import type { Profile, ProposalWithPeople } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Avatar, Modal, ScoreRing, Spinner, Verified } from './ui';

export function CounterDialog({ proposal, onClose, onDone }: { proposal: ProposalWithPeople; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const next = new Date(proposal.proposed_for);
  next.setDate(next.getDate() + 1);
  const [title, setTitle] = useState(proposal.title);
  const [when, setWhen] = useState(toLocalInput(next.getTime() > Date.now() ? next : suggestedDate('Saturday 20:00')));
  const [location, setLocation] = useState(proposal.location);
  const [message, setMessage] = useState(`I can't make ${new Date(proposal.proposed_for).toLocaleDateString([], { weekday: 'long' })} - how about this instead?`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const d = new Date(when);
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now()) return setError('Pick a time in the future.');
    setBusy(true);
    try {
      await counterProposal(proposal.id, title.trim(), d.toISOString(), location.trim(), message.trim());
      toast(`Counter-proposal sent to ${proposal.sender.display_name}`);
      onDone();
    } catch (cause) {
      console.error('counter failed', cause);
      setError(String((cause as { message?: string })?.message ?? '').includes('PLAN_REQUIRED')
        ? 'Counter-proposals are for members. Pick a plan from the crown menu.'
        : 'Could not send your counter-proposal. It may have expired.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Suggest a change">
      <div className="space-y-4">
        <p className="text-sm text-ink-600">Change the plan, the day or the time. {proposal.sender.display_name} gets 24 hours to respond.</p>
        <div>
          <label className="label" htmlFor="cp-title">Activity</label>
          <input id="cp-title" className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cp-when">When</label>
            <input id="cp-when" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="cp-where">Where</label>
            <input id="cp-where" className="input" maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="cp-msg">Message</label>
          <textarea id="cp-msg" rows={2} maxLength={500} className="input resize-none" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {error && <p className="text-sm text-error-600">{error}</p>}
        <button onClick={submit} disabled={busy} className="btn-primary w-full">{busy ? <Spinner className="h-4 w-4 text-white" /> : 'Send counter-proposal'}</button>
      </div>
    </Modal>
  );
}

export function ApplicantsDialog({ proposal, me, onClose, onDone }: { proposal: ProposalWithPeople; me: Profile; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [apps, setApps] = useState<ApplicationWithApplicant[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchApplications(proposal.id).then(setApps).catch((cause) => {
      console.error('applications load failed', cause);
      setFailed(true);
    });
  }, [proposal.id]);

  async function choose(a: ApplicationWithApplicant) {
    setBusyId(a.id);
    try {
      await chooseApplicant(a.id);
      toast(`It's a plan with ${a.applicant.display_name}`);
      onDone();
    } catch (cause) {
      console.error('choose failed', cause);
      toast(String((cause as { message?: string })?.message ?? '').includes('PLAN_REQUIRED') ? 'Your plan has ended. Renew it to confirm applicants.' : 'Could not confirm this applicant', 'error');
      setBusyId(null);
    }
  }

  const ranked = (apps ?? [])
    .map((a) => ({ a, s: proposalScore(me, a.applicant, proposal.category, proposal.experience?.tags).score }))
    .sort((x, y) => y.s - x.s);

  return (
    <Modal open onClose={onClose} title="Applicants">
      <p className="mb-4 text-sm text-ink-600">Choose who joins "{proposal.title}". Everyone else is let down gently.</p>
      {failed && <p className="text-sm text-error-600">Could not load applicants.</p>}
      {!apps && !failed && <div className="flex justify-center py-8"><Spinner /></div>}
      {apps && !apps.length && <p className="rounded-2xl bg-ink-50 p-6 text-center text-sm text-ink-500">No applications yet. Check back soon.</p>}
      <div className="space-y-3">
        {ranked.map(({ a, s }) => (
          <div key={a.id} className="flex items-start gap-3 rounded-2xl border border-ink-100 p-4">
            <Avatar profile={a.applicant} size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-sm font-semibold">{a.applicant.display_name}, {a.applicant.age}{a.applicant.verified && <Verified className="h-3.5 w-3.5" />}</div>
              {a.message && <p className="mt-1 text-sm text-ink-600">"{a.message}"</p>}
              {a.status === 'pending' && (
                <button onClick={() => choose(a)} disabled={!!busyId} className="btn-primary mt-3 px-4 py-2">
                  {busyId === a.id ? <Spinner className="h-4 w-4 text-white" /> : 'Choose'}
                </button>
              )}
            </div>
            <ScoreRing value={s} size={44} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function FeedbackDialog({ proposal, other, onClose, onDone }: { proposal: ProposalWithPeople; other: Profile; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [met, setMet] = useState<boolean | null>(null);
  const [again, setAgain] = useState<boolean | null>(null);
  const [resembled, setResembled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (met === null) return;
    setBusy(true);
    try {
      await submitFeedback({ proposal_id: proposal.id, subject_id: other.id, met, see_again: met ? again : null, matched_profile: met ? resembled : null });
      toast('Thanks - your feedback stays private');
      onDone();
    } catch (cause) {
      console.error('feedback failed', cause);
      toast('Could not save feedback', 'error');
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="How did it go?">
      <p className="mb-6 text-sm text-ink-600">Only you can see your answers. They improve your matches and keep the community safe - nobody is rated publicly.</p>
      <div className="space-y-6">
        <YesNo label={`Did you meet ${other.display_name}?`} value={met} onChange={setMet} />
        {met && (
          <>
            <YesNo label="Would you see them again?" value={again} onChange={setAgain} />
            <YesNo label="Did they resemble their profile?" value={resembled} onChange={setResembled} />
          </>
        )}
      </div>
      <button onClick={submit} disabled={busy || met === null} className="btn-primary mt-8 w-full">
        {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Submit privately'}
      </button>
    </Modal>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-ink-900">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onChange(true)} className={`btn ${value === true ? 'bg-success-600 text-white' : 'border border-ink-200 bg-white text-ink-700 hover:border-ink-400'}`}>
          <ThumbsUp className="h-4 w-4" /> Yes
        </button>
        <button onClick={() => onChange(false)} className={`btn ${value === false ? 'bg-ink-900 text-white' : 'border border-ink-200 bg-white text-ink-700 hover:border-ink-400'}`}>
          <ThumbsDown className="h-4 w-4" /> No
        </button>
      </div>
    </div>
  );
}
