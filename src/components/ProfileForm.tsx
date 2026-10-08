import { useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CATEGORIES, CATEGORY_KEYS } from '../lib/catalog';
import type { Profile } from '../lib/types';
import { Spinner } from './ui';

export default function ProfileForm({ initial, userId, onSaved, submitLabel }: {
  initial: Profile | null;
  userId: string;
  onSaved: () => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.display_name ?? '');
  const [age, setAge] = useState(initial?.age ? String(initial.age) : '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [photo, setPhoto] = useState(initial?.photo_url ?? '');
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggle(i: string) {
    setInterests((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const ageNum = Number(age);
    if (!name.trim()) return setError('Please add your first name.');
    if (!Number.isInteger(ageNum) || ageNum < 18 || ageNum > 99) return setError('You must be 18 or older to use PROPOSAL.');
    if (interests.length < 3) return setError('Pick at least 3 interests so we can find good matches.');
    if (photo && !/^https:\/\//i.test(photo)) return setError('Photo link must start with https://');

    setBusy(true);
    const values = { display_name: name.trim(), age: ageNum, city: city.trim(), bio: bio.trim(), photo_url: photo.trim(), interests };
    const { error: err } = initial
      ? await supabase.from('profiles').update(values).eq('id', userId)
      : await supabase.from('profiles').insert(values);
    setBusy(false);
    if (err) {
      console.error('profile save failed', err);
      setError('Could not save your profile. Please try again.');
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <div>
          <label className="label" htmlFor="pf-name">First name</label>
          <input id="pf-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pf-age">Age</label>
          <input id="pf-age" type="number" min={18} max={99} className="input" value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="pf-city">City</label>
        <input id="pf-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Brussels" />
      </div>
      <div>
        <label className="label" htmlFor="pf-photo">Photo link (optional)</label>
        <input id="pf-photo" className="input" value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://..." />
      </div>
      <div>
        <label className="label" htmlFor="pf-bio">About you</label>
        <textarea id="pf-bio" rows={3} maxLength={400} className="input resize-none" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What does a great evening look like for you?" />
      </div>
      <div>
        <span className="label">Interests ({interests.length})</span>
        <p className="-mt-1 mb-4 text-xs text-ink-500">These power your Proposal Score and smart suggestions.</p>
        <div className="space-y-4">
          {CATEGORY_KEYS.map((c) => {
            const Icon = CATEGORIES[c].icon;
            return (
              <div key={c}>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-600">
                  <Icon className="h-3.5 w-3.5" /> {CATEGORIES[c].label}
                </div>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES[c].interests.map((i) => {
                    const on = interests.includes(i);
                    return (
                      <button
                        type="button"
                        key={i}
                        onClick={() => toggle(i)}
                        className={`chip border py-1.5 transition ${on ? 'border-rose-600 bg-rose-600 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'}`}
                      >
                        {on && <Check className="h-3 w-3" />}
                        {i}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {error && <p className="text-sm text-error-600">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full py-3">
        {busy ? <Spinner className="h-4 w-4 text-white" /> : submitLabel}
      </button>
    </form>
  );
}
