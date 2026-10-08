import { useEffect, useState, type ReactNode } from 'react';
import { Check, Crown, Flame, Gem, Rocket, Sparkles, Star, Zap } from 'lucide-react';
import {
  AlreadySubscribedError, BOOSTS, PLANS, TIERS, activateIncludedBoost, fetchSubscriptionDetails, manageSubscription, startCheckout,
  type BoostProduct, type PaidPlan, type Product,
} from '../lib/membership';
import { formatWhen } from '../lib/time';
import type { Membership, ProposalTier } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { ErrorBox, Modal, Spinner } from './ui';

type Details = Awaited<ReturnType<typeof fetchSubscriptionDetails>>;

const PLAN_STYLE: Record<PaidPlan, { icon: typeof Crown; card: string; button: string; accent: string }> = {
  plus: { icon: Star, card: 'border-ink-200 bg-white', button: 'btn-dark', accent: 'text-rose-600' },
  tonight: { icon: Flame, card: 'border-rose-300 bg-gradient-to-b from-rose-50 to-white ring-2 ring-rose-500/20', button: 'btn-primary', accent: 'text-rose-600' },
  black: { icon: Crown, card: 'border-ink-900 bg-ink-950 text-white', button: 'rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-amber-300 disabled:opacity-60 inline-flex items-center justify-center gap-2', accent: 'text-amber-300' },
};

export default function MembershipSheet({ membership, error, onRetry, onClose, onChanged }: {
  membership: Membership | null;
  error: boolean;
  onRetry: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [details, setDetails] = useState<Details>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscriptionDetails().then(setDetails).catch((cause) => console.error('subscription details failed', cause));
  }, [membership?.plan]);

  const current = membership?.plan ?? 'free';
  const adminAccess = !!membership?.admin_access;
  const cancelling = !adminAccess && !!details?.cancel_at_period_end && current !== 'free';

  async function buy(product: Product) {
    setBusy(product);
    try {
      await startCheckout(product);
    } catch (cause) {
      if (cause instanceof AlreadySubscribedError) {
        toast('You already have a plan. Use "Switch" to change it.', 'error');
      } else {
        console.error('checkout failed', cause);
        toast('Could not open checkout. Please try again.', 'error');
      }
      setBusy(null);
    }
  }

  async function manage(action: 'change' | 'cancel' | 'resume', plan?: PaidPlan) {
    setBusy(`${action}-${plan ?? ''}`);
    try {
      await manageSubscription(action, plan);
      toast(action === 'change' ? `Switching you to ${PLANS[plan!].name}` : action === 'cancel' ? 'Your plan will end at the end of this period' : 'Your plan will keep renewing');
      onChanged();
      setDetails(await fetchSubscriptionDetails());
    } catch (cause) {
      console.error('manage subscription failed', cause);
      toast('Could not update your plan. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function useBoost() {
    setBusy('use-boost');
    try {
      await activateIncludedBoost();
      toast("You're boosted until 03:00 tonight");
      onChanged();
    } catch (cause) {
      console.error('boost activation failed', cause);
      toast('No included boosts left', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title="Choose how you want to stand out" wide>
      <div className="space-y-8">
        {error && <ErrorBox text="Could not load your membership." onRetry={onRetry} />}

        {membership && (
          <section className="rounded-3xl bg-ink-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Your plan</div>
                <div className="font-display text-xl font-semibold">{current === 'free' ? 'FREE' : PLANS[current].name}</div>
                <div className="text-sm text-ink-600">
                  {adminAccess
                    ? 'Admin access - everything is unlocked, no payment needed'
                    : current === 'free'
                    ? membership.free_proposal
                      ? 'You have 1 free proposal to send. Upgrade to read, answer and send more'
                      : 'Free proposal used. Upgrade to send, read and answer proposals'
                    : details?.current_period_end
                      ? `${cancelling ? 'Ends' : 'Renews'} ${formatWhen(new Date(details.current_period_end * 1000).toISOString())}`
                      : membership.daily_limit ? `${membership.daily_limit} proposals a day` : 'Unlimited proposals'}
                </div>
              </div>
              {membership.boost_until && (
                <span className="chip bg-rose-600 text-white"><Rocket className="h-3.5 w-3.5" />Boosted until {formatWhen(membership.boost_until)}</span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Credit icon={<Zap className="h-4 w-4" />} label="Priority" value={membership.priority} />
              <Credit icon={<Sparkles className="h-4 w-4" />} label="Super" value={membership.super} />
              <Credit icon={<Gem className="h-4 w-4" />} label="VIP" value={membership.vip} />
              <Credit icon={<Rocket className="h-4 w-4" />} label="Boosts" value={membership.boosts} />
            </div>
            {membership.boosts > 0 && (
              <button onClick={useBoost} disabled={!!busy} className="btn-dark mt-4 w-full">
                {busy === 'use-boost' ? <Spinner className="h-4 w-4 text-white" /> : <><Flame className="h-4 w-4" />Use an included Tonight Boost</>}
              </button>
            )}
          </section>
        )}

        <section className="grid gap-3 md:grid-cols-3">
          {(Object.keys(PLANS) as PaidPlan[]).map((key) => {
            const plan = PLANS[key];
            const style = PLAN_STYLE[key];
            const Icon = style.icon;
            const mine = current === key;
            const dark = key === 'black';
            return (
              <div key={key} className={`relative flex flex-col rounded-3xl border p-5 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-ink-900/10 ${style.card}`}>
                {key === 'tonight' && <span className="absolute -top-3 left-5 rounded-full bg-rose-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">Most popular</span>}
                <Icon className={`h-6 w-6 ${style.accent}`} />
                <div className="mt-3 font-display text-lg font-semibold">{plan.name}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-semibold">€{plan.price}</span>
                  <span className={`text-sm ${dark ? 'text-ink-300' : 'text-ink-500'}`}>/month</span>
                </div>
                <p className={`mt-2 text-sm ${dark ? 'text-ink-200' : 'text-ink-600'}`}>{plan.tagline}</p>
                <ul className="mt-4 flex-1 space-y-2">
                  {plan.perks.map((perk) => (
                    <li key={perk} className={`flex gap-2 text-sm ${dark ? 'text-ink-100' : 'text-ink-700'}`}>
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${style.accent}`} />{perk}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {adminAccess ? (
                    <div className={`flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold ${dark ? 'bg-white/10 text-white' : 'bg-ink-100 text-ink-800'}`}>
                      {mine ? <><Check className="h-4 w-4" />Included with admin access</> : 'Included with admin access'}
                    </div>
                  ) : mine ? (
                    cancelling ? (
                      <button onClick={() => manage('resume')} disabled={!!busy} className={`${style.button} w-full`}>
                        {busy === 'resume-' ? <Spinner className="h-4 w-4" /> : 'Keep my plan'}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className={`flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold ${dark ? 'bg-white/10 text-white' : 'bg-ink-100 text-ink-800'}`}><Check className="h-4 w-4" />Your plan</div>
                        <button onClick={() => manage('cancel')} disabled={!!busy} className={`w-full text-xs font-semibold underline-offset-2 hover:underline ${dark ? 'text-ink-300' : 'text-ink-500'}`}>
                          {busy === 'cancel-' ? 'Cancelling...' : 'Cancel plan'}
                        </button>
                      </div>
                    )
                  ) : (
                    <button
                      onClick={() => (current === 'free' ? buy(`plan_${key}`) : manage('change', key))}
                      disabled={!!busy}
                      className={`${style.button} w-full`}
                    >
                      {busy === `plan_${key}` || busy === `change-${key}` ? <Spinner className="h-4 w-4" /> : current === 'free' ? `Get ${plan.name}` : `Switch to ${plan.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section>
          <h3 className="font-display text-lg font-semibold">Or boost yourself without subscribing</h3>
          <p className="mt-1 text-sm text-ink-500">Boosted profiles appear first on Discover and Tonight and wear an "Available Tonight" badge.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(Object.keys(BOOSTS) as BoostProduct[]).map((key) => (
              <OneOff key={key} icon={<Rocket className="h-4 w-4" />} name={BOOSTS[key].name} text={BOOSTS[key].text} price={BOOSTS[key].price}
                busy={busy === key} disabled={!!busy} onBuy={() => buy(key)} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-display text-lg font-semibold">Make your proposals stand out</h3>
          <p className="mt-1 text-sm text-ink-500">Each purchase adds one credit. Choose the upgrade when you send a proposal.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(['priority', 'super', 'vip'] as ProposalTier[]).map((t) => (
              <OneOff key={t} icon={t === 'vip' ? <Gem className="h-4 w-4" /> : t === 'super' ? <Sparkles className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                name={`${TIERS[t].name} Proposal`} text={TIERS[t].text} price={TIERS[t].price!}
                busy={busy === TIERS[t].product} disabled={!!busy} onBuy={() => buy(TIERS[t].product!)} />
            ))}
          </div>
        </section>

        <p className="text-center text-xs text-ink-500">Secure payment by Stripe. Plans renew monthly and can be cancelled anytime.</p>
      </div>
    </Modal>
  );
}

function Credit({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5">
      <span className="text-rose-600">{icon}</span>
      <span className="text-sm text-ink-600">{label}</span>
      <span className="ml-auto font-semibold text-ink-900">{value}</span>
    </div>
  );
}

function OneOff({ icon, name, text, price, busy, disabled, onBuy }: {
  icon: ReactNode; name: string; text: string; price: string; busy: boolean; disabled: boolean; onBuy: () => void;
}) {
  return (
    <button onClick={onBuy} disabled={disabled}
      className="group flex items-center gap-3 rounded-2xl border border-ink-200 p-4 text-left transition hover:border-rose-400 hover:bg-rose-50/50 disabled:opacity-60">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition group-hover:bg-rose-600 group-hover:text-white">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-900">{name}</span>
        <span className="block text-xs text-ink-500">{text}</span>
      </span>
      <span className="text-sm font-semibold text-ink-900">{busy ? <Spinner className="h-4 w-4" /> : `€${price}`}</span>
    </button>
  );
}
