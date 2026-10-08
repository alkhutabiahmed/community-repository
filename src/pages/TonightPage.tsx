import { useMemo, useState } from 'react';
import { Check, Crown, Flame, Moon, Rocket, Send } from 'lucide-react';
import { CATEGORIES, CATEGORY_KEYS } from '../lib/catalog';
import { setTonight } from '../lib/api';
import { proposalScore } from '../lib/matching';
import { activateIncludedBoost, activeBoost, startCheckout, visibilityRank } from '../lib/membership';
import { endOfToday, formatWhen } from '../lib/time';
import type { Category, ComposerPreset, Experience, Membership, Profile } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Avatar, MemberBadge, ScoreRing, Spinner, Verified } from '../components/ui';

const JOURNEY = ['Discover', 'Proposal', 'Accept', 'Reservation', 'Meet'];

export default function TonightPage({ me, people, experiences, membership, onPropose, onMeChanged, onUpgrade, onBoosted }: {
  me: Profile;
  people: Profile[];
  experiences: Experience[];
  membership: Membership | null;
  onPropose: (p: ComposerPreset) => void;
  onMeChanged: () => Promise<void>;
  onUpgrade: () => void;
  onBoosted: () => void;
}) {
  const toast = useToast();
  const imFree = !!me.free_tonight_until && new Date(me.free_tonight_until) > new Date();
  const [mood, setMood] = useState<Category | null>(me.tonight_category);
  const [busy, setBusy] = useState(false);
  const [boostBusy, setBoostBusy] = useState(false);
  const myBoostUntil = activeBoost(me) ? me.boost_until : null;

  const availablePeople = useMemo(() => {
    const now = new Date();
    return people.filter((p) => (p.free_tonight_until && new Date(p.free_tonight_until) > now) || activeBoost(p));
  }, [people]);

  const freePeople = useMemo(
    () => availablePeople
      .map((p) => ({ p, s: mood ? proposalScore(me, p, mood) : null }))
      .sort((a, b) => visibilityRank(b.p, true) - visibilityRank(a.p, true) || (b.s?.score ?? 0) - (a.s?.score ?? 0)),
    [availablePeople, me, mood],
  );

  async function boostTonight() {
    setBoostBusy(true);
    try {
      if (membership && membership.boosts > 0) {
        await activateIncludedBoost();
        toast("You're boosted until 03:00 tonight");
        onBoosted();
        setBoostBusy(false);
      } else {
        await startCheckout('tonight_boost');
      }
    } catch (cause) {
      console.error('tonight boost failed', cause);
      toast('Could not start your boost. Please try again.', 'error');
      setBoostBusy(false);
    }
  }

  const idea = mood ? experiences.find((e) => e.category === mood && e.default_time.toLowerCase().includes('tonight')) ?? experiences.find((e) => e.category === mood) ?? null : null;

  async function toggleFree() {
    setBusy(true);
    try {
      await setTonight(imFree ? null : endOfToday().toISOString(), imFree ? null : mood);
      await onMeChanged();
      toast(imFree ? "You're no longer shown as free tonight" : "You're visible as free tonight");
    } catch (cause) {
      console.error('tonight toggle failed', cause);
      toast('Could not update your availability', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-ink-950 p-6 text-white sm:p-10">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-rose-600/30 blur-3xl" />
        <div className="absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-rose-200">
            <Flame className="h-3.5 w-3.5" /> Tonight
          </div>
          <h1 className="mt-4 max-w-lg font-display text-3xl font-semibold sm:text-5xl">Skip the small talk. Meet tonight.</h1>
          <p className="mt-3 text-lg text-ink-200">
            <span className="font-semibold text-white">{availablePeople.length} {availablePeople.length === 1 ? 'person is' : 'people are'}</span> available tonight{me.city ? ` around ${me.city}` : ''}.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-2 text-xs font-medium text-ink-300">
            {JOURNEY.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded-full border border-white/15 px-3 py-1 text-white">{step}</span>
                {i < JOURNEY.length - 1 && <span className="h-px w-4 bg-white/30" />}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Want to be seen tonight?</h2>
            <p className="mt-1 text-sm text-ink-600">
              {myBoostUntil
                ? `You're boosted until ${formatWhen(myBoostUntil)}. People near you see you first and you wear the Available Tonight badge.`
                : 'Free members appear tonight naturally. A Tonight Boost puts you first until 03:00 and adds the Available Tonight badge.'}
            </p>
          </div>
          {myBoostUntil ? (
            <span className="chip shrink-0 bg-rose-600 py-2 text-white"><Rocket className="h-4 w-4" />Boost active</span>
          ) : (
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <button onClick={boostTonight} disabled={boostBusy} className="btn-primary">
                {boostBusy ? <Spinner className="h-4 w-4 text-white" /> : <><Flame className="h-4 w-4" />{membership && membership.boosts > 0 ? `Use included boost (${membership.boosts} left)` : 'Tonight Boost — €7.99'}</>}
              </button>
              <button onClick={onUpgrade} className="flex items-center gap-1 text-xs font-semibold text-ink-600 hover:text-ink-900"><Crown className="h-3.5 w-3.5" />Every evening with TONIGHT, €49.99/mo</button>
            </div>
          )}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-xl font-semibold">1. What do you feel like doing?</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORY_KEYS.map((c) => {
            const Icon = CATEGORIES[c].icon;
            const on = mood === c;
            return (
              <button
                key={c}
                onClick={() => setMood(c)}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left text-sm font-semibold transition ${on ? 'border-rose-600 bg-rose-600 text-white shadow-lg shadow-rose-600/20' : 'border-ink-200 text-ink-800 hover:border-ink-400'}`}
              >
                <Icon className="h-5 w-5" /> {CATEGORIES[c].label}
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-ink-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Moon className="h-5 w-5 text-ink-500" />
            <p className="text-sm text-ink-700">
              {imFree ? `You're shown as free tonight${me.tonight_category ? ` for ${CATEGORIES[me.tonight_category].label.toLowerCase()}` : ''}.` : 'Let others know you are free tonight too.'}
            </p>
          </div>
          <button onClick={toggleFree} disabled={busy || (!imFree && !mood)} className={imFree ? 'btn-ghost' : 'btn-dark'}>
            {busy ? <Spinner className="h-4 w-4" /> : imFree ? 'Not free anymore' : <><Check className="h-4 w-4" /> I'm free tonight</>}
          </button>
        </div>
      </section>

      {mood && (
        <section className="animate-fade-up">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="font-display text-xl font-semibold">2. Compatible people free tonight</h2>
            <span className="text-sm text-ink-500">{freePeople.length} available</span>
          </div>

          {freePeople.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {freePeople.map(({ p, s }) => (
                <div key={p.id} className="card flex items-center gap-4 p-4 transition hover:shadow-lg hover:shadow-ink-900/5">
                  <Avatar profile={p} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 font-semibold">{p.display_name}, {p.age}{p.verified && <Verified className="h-3.5 w-3.5" />}</div>
                    <MemberBadge profile={p} />
                    <div className="truncate text-xs text-ink-500">{s?.reasons[0]}</div>
                    {p.tonight_category && <div className="mt-1 text-xs font-medium text-rose-600">In the mood for {CATEGORIES[p.tonight_category].label.toLowerCase()}</div>}
                  </div>
                  {s && <ScoreRing value={s.score} size={50} />}
                  <button
                    onClick={() => onPropose({ recipient: p, experience: idea, category: mood, tonight: true })}
                    className="btn-primary px-4"
                    aria-label={`Propose to ${p.display_name}`}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="card p-8 text-center">
              <p className="text-ink-600">Nobody has said they're free tonight yet.</p>
              <button onClick={() => onPropose({ open: true, category: mood, experience: idea, tonight: true })} className="btn-primary mt-4">
                Publish an open plan for tonight
              </button>
            </div>
          )}

          {idea && (
            <div className="card mt-6 flex items-center gap-4 overflow-hidden p-3">
              <img src={idea.image_url} alt="" className="h-20 w-20 rounded-2xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Suggested plan</div>
                <div className="font-semibold">{idea.title}</div>
                <div className="truncate text-sm text-ink-500">{idea.venue} · {idea.price_hint}</div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
