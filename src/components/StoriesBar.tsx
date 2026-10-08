import { useState } from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import { CATEGORIES, CATEGORY_KEYS } from '../lib/catalog';
import { deleteStory, postStory } from '../lib/api';
import { timeAgo } from '../lib/time';
import type { Category, ComposerPreset, Profile, Story } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Avatar, Modal, Spinner } from './ui';

const PROMPTS = ['Free tonight', 'Looking for a brunch partner Sunday', 'Want to visit Antwerp this weekend', 'Up for cocktails after work'];

export default function StoriesBar({ stories, me, people, onChanged, onPropose }: {
  stories: Story[];
  me: Profile;
  people: Profile[];
  onChanged: () => void;
  onPropose: (p: ComposerPreset) => void;
}) {
  const toast = useToast();
  const [composing, setComposing] = useState(false);
  const [viewing, setViewing] = useState<Story | null>(null);
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Category>('food');
  const [busy, setBusy] = useState(false);

  const byId = new Map([...people, me].map((p) => [p.id, p]));
  const visible = stories.filter((s) => byId.has(s.user_id));
  const author = viewing ? byId.get(viewing.user_id) : null;

  async function publish() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await postStory(body.trim(), category);
      toast('Story posted for 24 hours');
      setComposing(false);
      setBody('');
      onChanged();
    } catch (cause) {
      console.error('story post failed', cause);
      toast('Could not post your story', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteStory(id);
      setViewing(null);
      onChanged();
    } catch (cause) {
      console.error('story delete failed', cause);
      toast('Could not remove the story', 'error');
    }
  }

  return (
    <>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <button onClick={() => setComposing(true)} className="flex w-[76px] shrink-0 flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-ink-300 bg-white text-ink-500 transition hover:border-rose-400 hover:text-rose-600">
            <Plus className="h-6 w-6" />
          </div>
          <span className="text-xs font-medium text-ink-600">Your story</span>
        </button>
        {visible.map((s) => {
          const p = byId.get(s.user_id)!;
          return (
            <button key={s.id} onClick={() => setViewing(s)} className="group flex w-[76px] shrink-0 flex-col items-center gap-2">
              <div className="rounded-full bg-gradient-to-tr from-rose-500 to-amber-400 p-[2.5px] transition group-hover:scale-105">
                <div className="rounded-full bg-ink-50 p-[2px]"><Avatar profile={p} size={58} /></div>
              </div>
              <span className="line-clamp-2 text-center text-[11px] leading-tight text-ink-700">{s.body}</span>
            </button>
          );
        })}
      </div>

      <Modal open={composing} onClose={() => setComposing(false)} title="Post a story">
        <p className="mb-4 text-sm text-ink-500">Tell people what you're up for. Stories disappear after 24 hours, and people reply with a proposal.</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <button key={p} onClick={() => setBody(p)} className="chip border border-ink-200 text-ink-700 hover:border-ink-400">{p}</button>
          ))}
        </div>
        <input className="input" maxLength={120} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Free tonight for drinks..." />
        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORY_KEYS.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`chip border transition ${category === c ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 text-ink-700'}`}
            >
              {CATEGORIES[c].label}
            </button>
          ))}
        </div>
        <button onClick={publish} disabled={busy || !body.trim()} className="btn-primary mt-6 w-full">
          {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Post story'}
        </button>
      </Modal>

      <Modal open={!!viewing && !!author} onClose={() => setViewing(null)} title={author?.display_name ?? ''}>
        {viewing && author && (
          <div className="text-center">
            <Avatar profile={author} size={96} />
            <p className="mx-auto mt-6 max-w-xs font-display text-2xl font-semibold leading-snug">"{viewing.body}"</p>
            <p className="mt-2 text-xs text-ink-500">{CATEGORIES[viewing.category].label} · {timeAgo(viewing.created_at)}</p>
            {author.id === me.id ? (
              <button onClick={() => remove(viewing.id)} className="btn-ghost mt-8 w-full text-error-600">
                <Trash2 className="h-4 w-4" /> Remove story
              </button>
            ) : (
              <button
                onClick={() => { setViewing(null); onPropose({ recipient: author, category: viewing.category }); }}
                className="btn-primary mt-8 w-full"
              >
                <Send className="h-4 w-4" /> Reply with a proposal
              </button>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
