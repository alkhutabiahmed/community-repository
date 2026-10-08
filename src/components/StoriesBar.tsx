import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { CATEGORIES, CATEGORY_KEYS } from '../lib/catalog';
import { deleteStory, postStory, updateStory } from '../lib/api';
import type { Category, ComposerPreset, Profile, Story } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Avatar, Modal, Spinner } from './ui';
import StoryViewer from './StoryViewer';

const PROMPTS = ['Free tonight', 'Looking for a brunch partner Sunday', 'Want to visit Antwerp this weekend', 'Up for cocktails after work'];

export default function StoriesBar({ stories, me, people, onChanged, onPropose, onOpenPerson }: {
  stories: Story[];
  me: Profile;
  people: Profile[];
  onChanged: () => void;
  onPropose: (p: ComposerPreset) => void;
  onOpenPerson: (p: Profile) => void;
}) {
  const toast = useToast();
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Story | null>(null);
  const [viewingFrom, setViewingFrom] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Category>('food');
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map([...people, me].map((p) => [p.id, p])), [people, me]);

  const ordered = useMemo(() => {
    const live = stories.filter((s) => byId.has(s.user_id));
    const oldestFirst = (a: Story, b: Story) => a.created_at.localeCompare(b.created_at);
    const mine = live.filter((s) => s.user_id === me.id).sort(oldestFirst);
    const authorOrder: string[] = [];
    for (const s of live) if (s.user_id !== me.id && !authorOrder.includes(s.user_id)) authorOrder.push(s.user_id);
    const others = authorOrder.flatMap((id) => live.filter((s) => s.user_id === id).sort(oldestFirst));
    return [...mine, ...others];
  }, [stories, byId, me.id]);

  const firstIndexOf = (userId: string) => ordered.findIndex((s) => s.user_id === userId);
  const myCount = ordered.filter((s) => s.user_id === me.id).length;
  const otherAuthors = [...new Set(ordered.filter((s) => s.user_id !== me.id).map((s) => s.user_id))];

  function openComposer(story: Story | null) {
    setEditing(story);
    setBody(story?.body ?? '');
    setCategory(story?.category ?? 'food');
    setComposing(true);
  }

  async function save() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      if (editing) {
        await updateStory(editing.id, body.trim(), category);
        toast('Story updated');
      } else {
        await postStory(body.trim(), category);
        toast('Story posted for 24 hours');
      }
      setComposing(false);
      setEditing(null);
      setBody('');
      onChanged();
    } catch (cause) {
      console.error('story save failed', cause);
      toast(editing ? 'Could not update your story' : 'Could not post your story', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(story: Story) {
    try {
      await deleteStory(story.id);
      toast('Story removed');
      setViewingFrom(null);
      onChanged();
    } catch (cause) {
      console.error('story delete failed', cause);
      toast('Could not remove the story', 'error');
    }
  }

  return (
    <>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="relative flex w-[76px] shrink-0 flex-col items-center gap-2">
          {myCount > 0 ? (
            <button onClick={() => setViewingFrom(firstIndexOf(me.id))} className="group" aria-label="View your story">
              <div className="rounded-full bg-gradient-to-tr from-rose-500 to-amber-400 p-[2.5px] transition group-hover:scale-105">
                <div className="rounded-full bg-ink-50 p-[2px]"><Avatar profile={me} size={58} /></div>
              </div>
            </button>
          ) : (
            <button onClick={() => openComposer(null)} aria-label="Post a story"
              className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-ink-300 bg-white text-ink-500 transition hover:border-rose-400 hover:text-rose-600">
              <Plus className="h-6 w-6" />
            </button>
          )}
          {myCount > 0 && (
            <button onClick={() => openComposer(null)} aria-label="Add another story"
              className="absolute left-[46px] top-[42px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink-50 bg-rose-600 text-white transition hover:bg-rose-700">
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="text-xs font-medium text-ink-600">Your story</span>
        </div>
        {otherAuthors.map((id) => {
          const p = byId.get(id)!;
          const latest = ordered.filter((s) => s.user_id === id).at(-1)!;
          return (
            <button key={id} onClick={() => setViewingFrom(firstIndexOf(id))} className="group flex w-[76px] shrink-0 flex-col items-center gap-2">
              <div className="rounded-full bg-gradient-to-tr from-rose-500 to-amber-400 p-[2.5px] transition group-hover:scale-105">
                <div className="rounded-full bg-ink-50 p-[2px]"><Avatar profile={p} size={58} /></div>
              </div>
              <span className="line-clamp-2 text-center text-[11px] leading-tight text-ink-700">{latest.body}</span>
            </button>
          );
        })}
      </div>

      {viewingFrom !== null && ordered.length > 0 && (
        <StoryViewer
          stories={ordered}
          startIndex={Math.min(viewingFrom, ordered.length - 1)}
          me={me}
          byId={byId}
          onClose={() => setViewingFrom(null)}
          onReply={(story, author) => { setViewingFrom(null); onPropose({ recipient: author, category: story.category }); }}
          onOpenPerson={onOpenPerson}
          onEdit={(story) => { setViewingFrom(null); openComposer(story); }}
          onDelete={remove}
        />
      )}

      <Modal open={composing} onClose={() => setComposing(false)} title={editing ? 'Edit your story' : 'Post a story'}>
        <p className="mb-4 text-sm text-ink-500">
          {editing ? 'Change what you are up for. Your story keeps its original 24-hour timer.' : "Tell people what you're up for. Stories disappear after 24 hours, and people reply with a proposal."}
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <button key={p} onClick={() => setBody(p)} className="chip border border-ink-200 text-ink-700 hover:border-ink-400">{p}</button>
          ))}
        </div>
        <input className="input" maxLength={120} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Free tonight for drinks..." />
        <div className="mt-1 text-right text-xs text-ink-400">{body.length}/120</div>
        <div className="mt-3 flex flex-wrap gap-2">
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
        <button onClick={save} disabled={busy || !body.trim()} className="btn-primary mt-6 w-full">
          {busy ? <Spinner className="h-4 w-4 text-white" /> : editing ? 'Save changes' : 'Post story'}
        </button>
      </Modal>
    </>
  );
}
