import { useState } from 'react';
import { Info, Lock } from 'lucide-react';
import { VIP_KINDS, VIP_TIERS, euros, submitVipProposal, tierPrice, type VipKind, type VipTier } from '../../lib/vip';
import { useToast } from '../../context/ToastContext';
import { Modal, Spinner } from '../ui';
import type { DirectoryVip } from './VipCard';

const ERRORS: Record<string, string> = {
  WEEK_FULL: 'This week is full. New spots open on Monday.',
  NOT_AVAILABLE: 'This option is no longer available.',
  BAD_DATE: 'Pick a date in the future.',
};

export default function VipProposalSheet({ vip, credit, onClose, onSent }: {
  vip: DirectoryVip;
  credit: number;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<VipKind>(vip.accepted_kinds[0]);
  const [tier, setTier] = useState<VipTier>('standard');
  const [date, setDate] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const price = tierPrice(vip, tier) ?? vip.price_standard;
  const coveredByCredit = credit >= price;
  const tiers = (Object.keys(VIP_TIERS) as VipTier[]).filter((t) => tierPrice(vip, t) !== null);
  const today = new Date().toISOString().slice(0, 10);

  async function send() {
    if (message.trim().length < 10) return setError('Tell them a little more about your idea (at least 10 characters).');
    setBusy(true);
    setError('');
    try {
      const paid = await submitVipProposal({ vip: vip.user_id, kind, tier, message: message.trim(), date: date || null });
      if (paid) {
        toast(`Your exclusive proposal was sent to ${vip.profile.display_name}`);
        onSent();
      }
    } catch (cause) {
      console.error('vip proposal failed', cause);
      const msg = String((cause as { message?: string })?.message ?? '');
      setError(Object.entries(ERRORS).find(([code]) => msg.includes(code))?.[1] ?? 'Could not send your proposal. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Exclusive proposal to ${vip.profile.display_name}`} wide>
      <div className="space-y-6">
        <section>
          <h3 className="label">What would you like to propose?</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {vip.accepted_kinds.map((k) => {
              const Icon = VIP_KINDS[k].icon;
              const on = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm font-semibold transition ${on ? 'border-amber-400 bg-amber-50 text-ink-900 ring-2 ring-amber-300' : 'border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50'}`}
                >
                  <Icon className={`h-5 w-5 ${on ? 'text-amber-600' : 'text-ink-400'}`} />
                  {VIP_KINDS[k].label}
                </button>
              );
            })}
          </div>
        </section>

        {tiers.length > 1 && (
          <section>
            <h3 className="label">How do you want to submit it?</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {tiers.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`rounded-2xl border p-4 text-left transition ${tier === t ? 'border-ink-900 bg-ink-950 text-white' : 'border-ink-200 hover:border-ink-300'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{VIP_TIERS[t].label}</span>
                    <span className={`font-display text-lg font-semibold ${tier === t ? 'text-amber-300' : 'text-ink-900'}`}>{euros(tierPrice(vip, t)!)}</span>
                  </div>
                  <p className={`mt-1 text-xs ${tier === t ? 'text-ink-300' : 'text-ink-500'}`}>{VIP_TIERS[t].text}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <div>
            <label className="label" htmlFor="vip-date">Preferred date (optional)</label>
            <input id="vip-date" type="date" min={today} className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="vip-msg">Your proposal</label>
            <textarea id="vip-msg" rows={3} maxLength={500} className="input resize-none" value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={`Describe your ${VIP_KINDS[kind].label.toLowerCase()} idea and why it would be special...`} />
          </div>
        </div>

        <div className="flex gap-3 rounded-2xl bg-ink-50 p-4 text-sm text-ink-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
          <p>
            You are paying to submit a proposal, not for a reply or a date. {vip.profile.display_name} is free to accept or decline.
            If it is declined or not answered within 7 days, the full amount comes back to you as PROPOSAL credit.
          </p>
        </div>

        {error && <p className="text-sm text-error-600">{error}</p>}
        <button onClick={send} disabled={busy} className="btn w-full bg-ink-950 py-3.5 text-base text-white hover:bg-ink-800">
          {busy ? <Spinner className="h-5 w-5 text-white" /> : coveredByCredit
            ? `Send using ${euros(price)} of your credit`
            : <><Lock className="h-4 w-4 text-amber-300" />Pay {euros(price)} and send</>}
        </button>
        {credit > 0 && !coveredByCredit && <p className="-mt-3 text-center text-xs text-ink-500">You have {euros(credit)} credit - not enough for this option.</p>}
      </div>
    </Modal>
  );
}
