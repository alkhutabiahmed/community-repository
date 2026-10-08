import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Compass, Send, Sparkles } from 'lucide-react';
import { CATEGORIES, CATEGORY_KEYS } from '../lib/catalog';
import { fetchMyApplications, fetchOpenProposals, fetchStories } from '../lib/api';
import { generalScore, suggestFor } from '../lib/matching';
import type { Category, ComposerPreset, Experience, Profile, ProposalWithPeople, Story } from '../lib/types';
import ExperienceCard from '../components/ExperienceCard';
import OpenPlans from '../components/OpenPlans';
import StoriesBar from '../components/StoriesBar';
import { Avatar, ErrorBox, MemberBadge, PageLoader, ScoreRing, Verified } from '../components/ui';
import { visibilityRank } from '../lib/membership';

type Tab = 'experiences' | 'open' | 'people';

export default function DiscoverPage({ me, people, experiences, walletIds, onToggleWallet, onPropose, onOpenPerson, refreshKey, paid, onUpgrade }: {
  me: Profile;
  people: Profile[];
  experiences: Experience[];
  walletIds: Set<string>;
  onToggleWallet: (id: string) => void;
  onPropose: (p: ComposerPreset) => void;
  onOpenPerson: (p: Profile) => void;
  refreshKey: number;
  paid: boolean;
  onUpgrade: () => void;
}) {
  const [tab, setTab] = useState<Tab>('experiences');
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [stories, setStories] = useState<Story[]>([]);
  const [plans, setPlans] = useState<ProposalWithPeople[]>([]);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o, a] = await Promise.all([fetchStories(), fetchOpenProposals(me.id), fetchMyApplications(me.id)]);
      setStories(s);
      setPlans(o);
      setAppliedIds(new Set(a.map((x) => x.proposal_id)));
      setError(false);
    } catch (cause) {
      console.error('discover load failed', cause);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [me.id]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const suggestions = useMemo(() => suggestFor(me, people, experiences, 3), [me, people, experiences]);
  const shownExperiences = filter === 'all' ? experiences : experiences.filter((e) => e.category === filter);
  const rankedPeople = useMemo(() => [...people].sort((a, b) => visibilityRank(b) - visibilityRank(a) || generalScore(me, b) - generalScore(me, a)), [people, me]);

  return (
    <div className="space-y-10">
      <section className="animate-fade-up">
        <p className="text-sm font-medium text-ink-500">Hi {me.display_name}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <h1 className="max-w-xl font-display text-3xl font-semibold sm:text-4xl">What do you feel like doing?</h1>
          <button onClick={() => onPropose({})} className="btn-primary hidden sm:inline-flex"><Send className="h-4 w-4" /> Make a Proposal</button>
        </div>
      </section>

      <section>
        <StoriesBar stories={stories} me={me} people={people} onChanged={load} onPropose={onPropose} onOpenPerson={onOpenPerson} />
      </section>

      {suggestions.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-rose-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-600">Proposal Assistant</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {suggestions.map((s) => (
              <button
                key={s.person.id}
                onClick={() => onPropose({ recipient: s.person, experience: s.experience })}
                className="card group flex items-start gap-4 p-5 text-left transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-lg hover:shadow-rose-900/5"
              >
                <Avatar profile={s.person} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-800">{s.text}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-rose-600">
                    Invite · {s.score}% <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-6 flex gap-1 rounded-full bg-ink-100 p-1 sm:inline-flex">
          {([['experiences', 'Date ideas'], ['open', `Open plans${plans.length ? ` (${plans.length})` : ''}`], ['people', 'People']] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition sm:flex-none ${tab === k ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="mb-6"><ErrorBox text="Some things couldn't load." onRetry={load} /></div>}

        {tab === 'experiences' && (
          <>
            <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              <FilterChip on={filter === 'all'} onClick={() => setFilter('all')} label="All" />
              {CATEGORY_KEYS.filter((c) => experiences.some((e) => e.category === c)).map((c) => (
                <FilterChip key={c} on={filter === c} onClick={() => setFilter(c)} label={CATEGORIES[c].label} />
              ))}
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {shownExperiences.map((exp) => (
                <ExperienceCard
                  key={exp.id}
                  exp={exp}
                  saved={walletIds.has(exp.id)}
                  onToggleSave={() => onToggleWallet(exp.id)}
                  onPropose={() => onPropose({ experience: exp })}
                />
              ))}
            </div>
          </>
        )}

        {tab === 'open' && (loading ? <PageLoader /> : (
          <OpenPlans plans={plans} appliedIds={appliedIds} me={me} paid={paid} onUpgrade={onUpgrade} onApplied={load} onCreate={() => onPropose({ open: true })} />
        ))}

        {tab === 'people' && (
          rankedPeople.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {rankedPeople.map((p) => (
                <button key={p.id} onClick={() => onOpenPerson(p)} className="card group overflow-hidden text-left transition hover:-translate-y-1 hover:shadow-xl hover:shadow-ink-900/5">
                  <div className="relative aspect-[3/4] overflow-hidden bg-ink-100">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.display_name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-rose-300 to-amber-300 font-display text-5xl text-white">{p.display_name[0]}</div>
                    )}
                    <div className="absolute right-2 top-2 rounded-full bg-white p-0.5 shadow"><ScoreRing value={generalScore(me, p)} size={44} /></div>
                    <div className="absolute left-2 right-14 top-2"><MemberBadge profile={p} /></div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/80 to-transparent p-4 text-white">
                      <div className="flex items-center gap-1 font-semibold">{p.display_name}, {p.age}{p.verified && <Verified className="h-4 w-4 text-teal-300" />}</div>
                      <div className="truncate text-xs text-ink-100">{p.interests.slice(0, 3).join(' · ')}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="card flex flex-col items-center p-12 text-center text-ink-500"><Compass className="mb-3 h-6 w-6" />No other members yet.</div>
          )
        )}
      </section>
    </div>
  );
}

function FilterChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${on ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'}`}
    >
      {label}
    </button>
  );
}
