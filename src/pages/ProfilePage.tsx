import { useState } from 'react';
import { Bookmark, LogOut, MapPin, Pencil, Send, X } from 'lucide-react';
import type { ComposerPreset, Experience, Profile } from '../lib/types';
import ProfileForm from '../components/ProfileForm';
import ReliabilityCard from '../components/ReliabilityCard';
import { Avatar, LevelBadge, Modal, Verified } from '../components/ui';

export default function ProfilePage({ me, experiences, walletIds, onToggleWallet, onPropose, onSaved, onSignOut }: {
  me: Profile;
  experiences: Experience[];
  walletIds: Set<string>;
  onToggleWallet: (id: string) => void;
  onPropose: (p: ComposerPreset) => void;
  onSaved: () => Promise<void>;
  onSignOut: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const saved = experiences.filter((e) => walletIds.has(e.id));

  return (
    <div className="space-y-8">
      <section className="card flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:text-left">
        <Avatar profile={me} size={112} />
        <div className="flex-1">
          <h1 className="flex items-center justify-center gap-2 font-display text-3xl font-semibold sm:justify-start">
            {me.display_name}, {me.age} {me.verified && <Verified className="h-6 w-6" />}
          </h1>
          {me.city && <p className="mt-1 flex items-center justify-center gap-1 text-sm text-ink-500 sm:justify-start"><MapPin className="h-3.5 w-3.5" />{me.city}</p>}
          {me.bio && <p className="mt-3 max-w-xl text-ink-700">{me.bio}</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            {me.interests.map((i) => <span key={i} className="chip bg-ink-100 text-ink-700">{i}</span>)}
          </div>
        </div>
        <div className="flex gap-2 sm:flex-col">
          <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil className="h-4 w-4" />Edit</button>
          <button onClick={onSignOut} className="btn-ghost text-ink-500"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </section>

      <ReliabilityCard userId={me.id} />
      {!me.verified && (
        <p className="-mt-4 px-2 text-xs text-ink-500">ID verification adds 10 points and a verified badge. Verification is done by the PROPOSAL team.</p>
      )}

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Bookmark className="h-5 w-5 text-rose-600" />
          <h2 className="font-display text-2xl font-semibold">Date Wallet</h2>
        </div>
        {saved.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((e) => (
              <div key={e.id} className="card flex items-center gap-3 p-3">
                <img src={e.image_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{e.title}</div>
                  <div className="truncate text-xs text-ink-500">{e.venue}</div>
                  <div className="mt-1"><LevelBadge level={e.level} /></div>
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => onPropose({ experience: e })} className="rounded-full p-2 text-rose-600 transition hover:bg-rose-50" aria-label="Propose this">
                    <Send className="h-4 w-4" />
                  </button>
                  <button onClick={() => onToggleWallet(e.id)} className="rounded-full p-2 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700" aria-label="Remove">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center text-sm text-ink-500">Save restaurants, events and date ideas from Discover with the bookmark icon.</div>
        )}
      </section>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit profile">
        <ProfileForm initial={me} userId={me.id} submitLabel="Save changes" onSaved={async () => { await onSaved(); setEditing(false); }} />
      </Modal>
    </div>
  );
}
