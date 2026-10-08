import { MapPin, Send, Sparkles } from 'lucide-react';
import { generalScore, suggestFor } from '../lib/matching';
import type { ComposerPreset, Experience, Profile } from '../lib/types';
import ReliabilityCard from './ReliabilityCard';
import { MemberBadge, Modal, ScoreRing, Verified } from './ui';

export default function PersonSheet({ person, me, experiences, onClose, onPropose }: {
  person: Profile;
  me: Profile;
  experiences: Experience[];
  onClose: () => void;
  onPropose: (p: ComposerPreset) => void;
}) {
  const suggestion = suggestFor(me, [person], experiences, 1)[0];
  const shared = new Set(me.interests);

  return (
    <Modal open onClose={onClose} title={person.display_name}>
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-3xl bg-ink-100">
          {person.photo_url ? (
            <img src={person.photo_url} alt={person.display_name} className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-rose-300 to-amber-300 font-display text-6xl text-white">
              {person.display_name[0]}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/80 to-transparent p-5 text-white">
            <div className="flex items-center gap-2 font-display text-2xl font-semibold">
              {person.display_name}, {person.age} {person.verified && <Verified className="h-5 w-5 text-teal-300" />}
            </div>
            {person.city && <div className="mt-1 flex items-center gap-1 text-sm text-ink-100"><MapPin className="h-3.5 w-3.5" />{person.city}</div>}
            <div className="mt-2"><MemberBadge profile={person} /></div>
          </div>
          <div className="absolute right-4 top-4 rounded-full bg-white p-1 shadow-lg"><ScoreRing value={generalScore(me, person)} size={58} label="overall" /></div>
        </div>

        {person.bio && <p className="text-ink-700">{person.bio}</p>}

        <div className="flex flex-wrap gap-2">
          {person.interests.map((i) => (
            <span key={i} className={`chip ${shared.has(i) ? 'bg-rose-600 text-white' : 'bg-ink-100 text-ink-700'}`}>{i}</span>
          ))}
        </div>

        <ReliabilityCard userId={person.id} />

        {suggestion && (
          <button
            onClick={() => onPropose({ recipient: person, experience: suggestion.experience })}
            className="group flex w-full items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-left transition hover:border-rose-300"
          >
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wider text-rose-700">Proposal Assistant</span>
              <span className="mt-1 block text-sm text-ink-800">{suggestion.text}</span>
              <span className="mt-2 inline-block text-sm font-semibold text-rose-700 group-hover:underline">Use this idea ({suggestion.score}% for this plan)</span>
            </span>
          </button>
        )}

        <button onClick={() => onPropose({ recipient: person })} className="btn-primary w-full py-3.5">
          <Send className="h-4 w-4" /> Make a Proposal
        </button>
      </div>
    </Modal>
  );
}
