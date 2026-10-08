import { useMemo, useState } from 'react';
import { Check, ChevronDown, Crown, Gem, Gift, Globe2, Send, Sparkles, Timer, Wand2, Zap } from 'lucide-react';
import { BOOST_AMOUNTS, BOOST_PERKS, CATEGORIES, CATEGORY_KEYS, LEVELS } from '../lib/catalog';
import { proposalScore } from '../lib/matching';
import { suggestedDate, toLocalInput, tonightAt } from '../lib/time';
import { createProposal } from '../lib/api';
import { TIERS, startCheckout, tierCredits } from '../lib/membership';
import type { BoostPerk, Category, ComposerPreset, Experience, Level, Membership, Profile, ProposalTier } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Avatar, Modal, ScoreRing, Spinner, Verified } from './ui';

interface Props {
  preset: ComposerPreset;
  me: Profile;
  people: Profile[];
  experiences: Experience[];
  membership: Membership | null;
  onUpgrade: () => void;
  onClose: () => void;
  onSent: () => void;
}

function draftMessage(me: Profile, them: Profile | null, title: string, category: Category) {
  if (!them) return `Looking for good company: ${title.toLowerCase()}. Tell me why you'd be fun to go with!`;
  const common = me.interests.filter((i) => them.interests.includes(i));
  const catHit = common.find((i) => CATEGORIES[category].interests.includes(i));
  if (catHit) return `Hi ${them.display_name}! I saw we both love ${catHit.toLowerCase()} - ${title.toLowerCase()} felt like the perfect plan. Are you in?`;
  if (common.length) return `Hi ${them.display_name}! We share a soft spot for ${common[0].toLowerCase()}, so I thought: why not ${title.toLowerCase()}?`;
  return `Hi ${them.display_name}! Your profile made me smile. Fancy ${title.toLowerCase()}?`;
}

const TIER_ICON = { normal: Send, priority: Zap, super: Sparkles, vip: Gem } as const;

export default function ProposalComposer({ preset, me, people, experiences, membership, onUpgrade, onClose, onSent }: Props) {
  const toast = useToast();
  const initialExp = preset.experience ?? null;
  const initialWhen = preset.tonight ? tonightAt() : initialExp ? suggestedDate(initialExp.default_time) : tonightAt();

  const [isOpenProposal, setIsOpenProposal] = useState(!!preset.open && !preset.recipient);
  const [recipient, setRecipient] = useState<Profile | null>(preset.recipient ?? null);
  const [experience, setExperience] = useState<Experience | null>(initialExp);
  const [title, setTitle] = useState(initialExp?.title ?? '');
  const [category, setCategory] = useState<Category>(initialExp?.category ?? preset.category ?? 'food');
  const [level, setLevel] = useState<Level>(initialExp?.level ?? 'date');
  const [when, setWhen] = useState(toLocalInput(initialWhen));
  const [location, setLocation] = useState(initialExp ? `${initialExp.venue}, ${initialExp.city}` : '');
  const [message, setMessage] = useState('');
  const [expires, setExpires] = useState<3 | 24 | 48>(preset.tonight ? 3 : 24);
  const [showBoost, setShowBoost] = useState(false);
  const [boostAmount, setBoostAmount] = useState(0);
  const [boostPerk, setBoostPerk] = useState<BoostPerk | null>(null);
  const [tier, setTier] = useState<ProposalTier>('normal');
  const [buying, setBuying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const rankedPeople = useMemo(
    () => [...people].map((p) => ({ p, s: proposalScore(me, p, category, experience?.tags).score })).sort((a, b) => b.s - a.s),
    [people, me, category, experience],
  );
  const score = recipient ? proposalScore(me, recipient, category, experience?.tags) : null;
  const freeTrial = !!membership && membership.plan === 'free' && membership.free_proposal;
  const limitReached = !freeTrial && !!membership && membership.daily_limit !== null && membership.sent_today >= membership.daily_limit;
  const tierMissingCredit = tier !== 'normal' && (!membership || tierCredits(membership, tier) < 1);

  async function buyTier() {
    const product = TIERS[tier].product;
    if (!product) return;
    setBuying(true);
    try {
      await startCheckout(product);
    } catch (cause) {
      console.error('tier checkout failed', cause);
      setError('Could not open checkout. Please try again.');
      setBuying(false);
    }
  }

  function pickExperience(exp: Experience | null) {
    setExperience(exp);
    if (exp) {
      setTitle(exp.title);
      setCategory(exp.category);
      setLevel(exp.level);
      setLocation(`${exp.venue}, ${exp.city}`);
      if (!preset.tonight) setWhen(toLocalInput(suggestedDate(exp.default_time)));
    }
  }

  async function send() {
    setError('');
    const date = new Date(when);
    if (!title.trim()) return setError('Give your plan a short title.');
    if (!isOpenProposal && !recipient) return setError('Choose who to invite, or publish it as an open proposal.');
    if (Number.isNaN(date.getTime()) || date.getTime() < Date.now()) return setError('Pick a date and time in the future.');
    if (boostAmount > 0 && !boostPerk) return setError('Choose what your upgrade includes.');
    if (limitReached) return setError('You have used all your proposals for today.');
    if (tierMissingCredit) return setError(`You have no ${TIERS[tier].name} Proposal credits left.`);

    setBusy(true);
    try {
      await createProposal({
        recipient_id: isOpenProposal ? null : recipient!.id,
        experience_id: experience?.id ?? null,
        title: title.trim(),
        category,
        level,
        proposed_for: date.toISOString(),
        location: location.trim(),
        message: message.trim(),
        boost_amount: boostAmount,
        boost_perk: boostAmount > 0 ? boostPerk : null,
        expires_at: new Date(Date.now() + expires * 3600000).toISOString(),
        tier,
      });
      toast(isOpenProposal ? 'Open proposal published' : `Proposal sent to ${recipient!.display_name}`);
      onSent();
    } catch (cause) {
      console.error('proposal send failed', cause);
      const msg = cause instanceof Object && 'message' in cause ? String(cause.message) : '';
      if (msg.includes('PLAN_REQUIRED')) setError(freeTrial ? 'Your free proposal can only go to one person. Pick a plan for open proposals.' : 'You have used your free proposal. Pick a plan to keep sending.');
      else if (msg.includes('DAILY_LIMIT')) setError('You have used all your proposals for today. Upgrade to send more.');
      else if (msg.includes('NO_CREDIT')) setError(`You have no ${TIERS[tier].name} Proposal credits left.`);
      else setError('Could not send your proposal. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={preset.tonight ? 'Propose for tonight' : 'Make a Proposal'} wide>
      <div className="space-y-8">
        {freeTrial && (
          <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4">
            <Gift className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
            <p className="text-sm text-teal-900">
              <span className="font-semibold">Your first proposal is on us.</span> Send it to anyone you like. After that, pick a plan to keep proposing.
            </p>
          </div>
        )}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <span className="label mb-0">Who</span>
            {!freeTrial && <button
              type="button"
              onClick={() => { setIsOpenProposal(!isOpenProposal); if (!isOpenProposal) setRecipient(null); }}
              className={`chip border transition ${isOpenProposal ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-700 hover:border-ink-400'}`}
            >
              <Globe2 className="h-3.5 w-3.5" /> Open proposal
            </button>}
          </div>
          {isOpenProposal ? (
            <div className="rounded-2xl border border-dashed border-ink-300 bg-ink-50 p-4 text-sm text-ink-600">
              Your plan will be visible on Discover. Compatible people can apply, and you choose who joins.
            </div>
          ) : (
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
              {rankedPeople.map(({ p, s }) => {
                const on = recipient?.id === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setRecipient(p)}
                    className={`flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-2xl p-2 transition ${on ? 'bg-rose-50' : 'hover:bg-ink-50'}`}
                  >
                    <div className="relative">
                      <Avatar profile={p} size={52} ring={on} />
                      {on && <span className="absolute -bottom-1 -right-1 rounded-full bg-rose-600 p-0.5 text-white"><Check className="h-3 w-3" /></span>}
                    </div>
                    <span className="flex items-center gap-0.5 truncate text-xs font-medium text-ink-800">
                      {p.display_name}{p.verified && <Verified className="h-3 w-3" />}
                    </span>
                    <span className="text-[11px] font-semibold text-rose-600">{s}%</span>
                  </button>
                );
              })}
              {!rankedPeople.length && <p className="text-sm text-ink-500">No members yet. Publish an open proposal instead.</p>}
            </div>
          )}
        </section>

        <section>
          <span className="label">What</span>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            <button
              type="button"
              onClick={() => { setExperience(null); setTitle(''); setLocation(''); }}
              className={`shrink-0 rounded-2xl border px-4 py-2 text-sm font-medium transition ${!experience ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-700 hover:border-ink-400'}`}
            >
              My own idea
            </button>
            {experiences.map((exp) => (
              <button
                type="button"
                key={exp.id}
                onClick={() => pickExperience(exp)}
                className={`flex shrink-0 items-center gap-2 rounded-2xl border py-1.5 pl-1.5 pr-4 text-sm font-medium transition ${experience?.id === exp.id ? 'border-rose-600 bg-rose-50 text-rose-800' : 'border-ink-200 text-ink-700 hover:border-ink-400'}`}
              >
                <img src={exp.image_url} alt="" className="h-7 w-7 rounded-xl object-cover" />
                {exp.title}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]">
            <input className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sushi dinner tonight" />
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
            </select>
          </div>
        </section>

        <section>
          <span className="label">Intention</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(LEVELS) as Level[]).map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => setLevel(l)}
                className={`rounded-2xl border p-3 text-left transition ${level === l ? LEVELS[l].classes + ' ring-2 ring-ink-900/10' : 'border-ink-200 hover:border-ink-400'}`}
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${LEVELS[l].dot}`} />{LEVELS[l].label}</div>
                <div className="mt-0.5 text-xs opacity-80">{LEVELS[l].hint}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pc-when">When</label>
            <input id="pc-when" type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pc-where">Where</label>
            <input id="pc-where" className="input" maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Venue or neighbourhood" />
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <label className="label mb-0" htmlFor="pc-msg">Message</label>
            <button
              type="button"
              onClick={() => setMessage(draftMessage(me, isOpenProposal ? null : recipient, title || 'a plan', category))}
              className="chip bg-rose-50 text-rose-700 transition hover:bg-rose-100"
            >
              <Wand2 className="h-3.5 w-3.5" /> Write it for me
            </button>
          </div>
          <textarea id="pc-msg" rows={3} maxLength={500} className="input resize-none" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Skip the 'hey'. Say why this plan made you think of them." />
        </section>

        <section>
          <span className="label flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" /> Expires in</span>
          <div className="flex gap-2">
            {([3, 24, 48] as const).map((h) => (
              <button
                type="button"
                key={h}
                onClick={() => setExpires(h)}
                className={`flex-1 rounded-2xl border py-2.5 text-sm font-semibold transition ${expires === h ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-700 hover:border-ink-400'}`}
              >
                {h} hours
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-amber-200 bg-amber-50/60">
          <button type="button" onClick={() => setShowBoost(!showBoost)} className="flex w-full items-center justify-between p-4 text-left">
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Gift className="h-4 w-4" /></span>
              <span>
                <span className="block text-sm font-semibold text-ink-900">Add an experience upgrade</span>
                <span className="block text-xs text-ink-600">{boostAmount ? `EUR ${boostAmount} - ${BOOST_PERKS[boostPerk!] ?? 'choose a perk'}` : 'Make the date itself more special'}</span>
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 text-ink-500 transition ${showBoost ? 'rotate-180' : ''}`} />
          </button>
          {showBoost && (
            <div className="space-y-4 px-4 pb-4 animate-fade-up">
              <div className="flex gap-2">
                {[0, ...BOOST_AMOUNTS].map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => { setBoostAmount(a); if (!a) setBoostPerk(null); }}
                    className={`flex-1 rounded-2xl border py-2 text-sm font-semibold transition ${boostAmount === a ? 'border-amber-600 bg-amber-500 text-white' : 'border-amber-200 bg-white text-ink-700 hover:border-amber-400'}`}
                  >
                    {a ? `EUR ${a}` : 'None'}
                  </button>
                ))}
              </div>
              {boostAmount > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(BOOST_PERKS) as BoostPerk[]).map((k) => (
                    <button
                      type="button"
                      key={k}
                      onClick={() => setBoostPerk(k)}
                      className={`chip border py-1.5 transition ${boostPerk === k ? 'border-amber-600 bg-amber-100 text-amber-900' : 'border-amber-200 bg-white text-ink-700 hover:border-amber-400'}`}
                    >
                      {BOOST_PERKS[k]}
                    </button>
                  ))}
                </div>
              )}
              {boostAmount > 0 && boostPerk && (
                <p className="rounded-2xl bg-white px-4 py-3 text-sm text-ink-700">
                  They'll see: <span className="font-semibold">"{me.display_name} added a EUR {boostAmount} experience upgrade: {BOOST_PERKS[boostPerk].toLowerCase()}."</span>
                  <span className="mt-1 block text-xs text-ink-500">You cover this on the date. In-app payment isn't available yet.</span>
                </p>
              )}
            </div>
          )}
        </section>

        <section>
          <span className="label">Make your proposal stand out</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(TIERS) as ProposalTier[]).map((t) => {
              const Icon = TIER_ICON[t];
              const on = tier === t;
              const credits = membership ? tierCredits(membership, t) : 0;
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTier(t)}
                  className={`rounded-2xl border p-3 text-left transition ${on ? (t === 'vip' ? 'border-ink-900 bg-ink-950 text-white' : 'border-rose-600 bg-rose-50 text-rose-900') : 'border-ink-200 text-ink-800 hover:border-ink-400'}`}
                >
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon className={`h-4 w-4 ${t === 'vip' && on ? 'text-amber-300' : 'text-rose-600'}`} />{TIERS[t].name}
                  </div>
                  <div className={`mt-0.5 text-xs ${on && t === 'vip' ? 'text-ink-200' : 'text-ink-500'}`}>
                    {t === 'normal' ? 'Free' : credits > 0 ? `${credits} credit${credits === 1 ? '' : 's'} left` : `€${TIERS[t].price}`}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-500">{TIERS[tier].text}.</p>
          {tierMissingCredit && (
            <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-rose-900">Buy a {TIERS[tier].name} Proposal for €{TIERS[tier].price}. You'll come back here to send it; your draft isn't saved.</p>
              <button type="button" onClick={buyTier} disabled={buying} className="btn-primary shrink-0">
                {buying ? <Spinner className="h-4 w-4 text-white" /> : `Buy for €${TIERS[tier].price}`}
              </button>
            </div>
          )}
        </section>

        {score && recipient && (
          <section className="flex items-center gap-4 rounded-3xl bg-ink-900 p-4 text-white">
            <div className="rounded-full bg-white p-1"><ScoreRing value={score.score} size={60} label="match" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-amber-300" /> Proposal Score for this plan</div>
              <p className="mt-0.5 text-sm text-ink-200">{score.reasons.join('. ')}. General compatibility: {score.general}%.</p>
            </div>
          </section>
        )}

        {limitReached && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-900">
              {membership?.daily_limit === 0
                ? 'You have used your free proposal. Pick a plan to keep inviting people out.'
                : `You've sent your ${membership?.daily_limit} proposals for today. Upgrade for more, or try again tomorrow.`}
            </p>
            <button type="button" onClick={onUpgrade} className="btn-dark shrink-0"><Crown className="h-4 w-4" />See plans</button>
          </div>
        )}
        {error && <p className="text-sm text-error-600">{error}</p>}
        <button onClick={send} disabled={busy || limitReached || tierMissingCredit} className="btn-primary w-full py-3.5 text-base">
          {busy ? <Spinner className="h-5 w-5 text-white" /> : <><Send className="h-4 w-4" /> {isOpenProposal ? 'Publish open proposal' : tier === 'normal' ? (freeTrial ? 'Send my free proposal' : 'Send proposal') : `Send ${TIERS[tier].name} Proposal`}</>}
        </button>
      </div>
    </Modal>
  );
}
