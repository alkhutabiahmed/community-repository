import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarDays, MessageCircle, Send } from 'lucide-react';
import { fetchLatestMessages, fetchMessages, fetchMyProposals, sendMessage } from '../lib/api';
import { formatWhen, timeAgo } from '../lib/time';
import type { Message, Profile, ProposalWithPeople } from '../lib/types';
import { Avatar, EmptyState, ErrorBox, LevelBadge, PageLoader, Spinner } from '../components/ui';

export default function MessagesPage({ me, activeId, onSelect }: { me: Profile; activeId: string | null; onSelect: (id: string | null) => void }) {
  const [threads, setThreads] = useState<ProposalWithPeople[] | null>(null);
  const [latest, setLatest] = useState<Map<string, Message>>(new Map());
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await fetchMyProposals(me.id);
      const accepted = all.filter((p) => p.status === 'accepted' || (p.status === 'cancelled' && p.recipient_id));
      const msgs = await fetchLatestMessages(accepted.map((p) => p.id));
      const map = new Map<string, Message>();
      for (const m of msgs) if (!map.has(m.proposal_id)) map.set(m.proposal_id, m);
      accepted.sort((a, b) => +new Date(map.get(b.id)?.created_at ?? b.responded_at ?? b.created_at) - +new Date(map.get(a.id)?.created_at ?? a.responded_at ?? a.created_at));
      setThreads(accepted);
      setLatest(map);
      setError(false);
    } catch (cause) {
      console.error('threads load failed', cause);
      setError(true);
    }
  }, [me.id]);

  useEffect(() => { load(); }, [load]);

  const active = threads?.find((t) => t.id === activeId) ?? null;

  if (error) return <ErrorBox text="Could not load your messages." onRetry={load} />;
  if (!threads) return <PageLoader />;
  if (!threads.length) {
    return (
      <EmptyState
        icon={<MessageCircle className="h-6 w-6" />}
        title="No conversations yet"
        text="Chats open once a proposal is accepted - so every conversation already has a plan."
      />
    );
  }

  return (
    <div className="card grid h-[calc(100vh-11rem)] min-h-[480px] overflow-hidden md:grid-cols-[320px_1fr] lg:h-[calc(100vh-9rem)]">
      <aside className={`overflow-y-auto border-r border-ink-100 ${active ? 'hidden md:block' : ''}`}>
        <h1 className="px-5 pb-3 pt-5 font-display text-2xl font-semibold">Messages</h1>
        {threads.map((t) => {
          const other = t.sender_id === me.id ? t.recipient! : t.sender;
          const last = latest.get(t.id);
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`flex w-full items-center gap-3 px-5 py-3 text-left transition ${t.id === activeId ? 'bg-rose-50' : 'hover:bg-ink-50'}`}
            >
              <Avatar profile={other} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{other.display_name}</span>
                  {last && <span className="shrink-0 text-[11px] text-ink-400">{timeAgo(last.created_at)}</span>}
                </div>
                <div className="truncate text-xs text-ink-500">{last ? last.body : t.title}</div>
              </div>
            </button>
          );
        })}
      </aside>
      <section className={`flex min-h-0 flex-col ${active ? '' : 'hidden md:flex'}`}>
        {active ? (
          <Chat key={active.id} thread={active} me={me} onBack={() => onSelect(null)} onSent={load} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-400">Choose a conversation</div>
        )}
      </section>
    </div>
  );
}

function Chat({ thread, me, onBack, onSent }: { thread: ProposalWithPeople; me: Profile; onBack: () => void; onSent: () => void }) {
  const other = thread.sender_id === me.id ? thread.recipient! : thread.sender;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const canSend = thread.status === 'accepted';

  const load = useCallback(async () => {
    try {
      setMessages(await fetchMessages(thread.id));
    } catch (cause) {
      console.error('messages load failed', cause);
      setError('Could not load messages.');
    }
  }, [thread.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages?.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await sendMessage(thread.id, text.trim());
      setText('');
      await load();
      onSent();
    } catch (cause) {
      console.error('send failed', cause);
      setError('Message not sent. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
        <button onClick={onBack} className="rounded-full p-2 hover:bg-ink-100 md:hidden" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        <Avatar profile={other} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{other.display_name}</div>
          <div className="flex items-center gap-1 truncate text-xs text-ink-500"><CalendarDays className="h-3 w-3" />{thread.title} · {formatWhen(thread.proposed_for)}</div>
        </div>
        <LevelBadge level={thread.level} />
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto bg-ink-50/50 p-4">
        <div className="mx-auto mb-4 max-w-xs rounded-2xl bg-white px-4 py-3 text-center text-xs text-ink-500 shadow-sm">
          {thread.status === 'cancelled' ? 'This plan was cancelled.' : `You have a plan: ${thread.title}${thread.location ? ` at ${thread.location}` : ''}.`}
        </div>
        {!messages && <div className="flex justify-center"><Spinner /></div>}
        {messages?.map((m) => {
          const mine = m.sender_id === me.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] animate-fade-up rounded-3xl px-4 py-2.5 text-sm ${mine ? 'rounded-br-lg bg-rose-600 text-white' : 'rounded-bl-lg bg-white text-ink-900 shadow-sm'}`}>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {error && <p className="px-4 pt-2 text-xs text-error-600">{error}</p>}
      {canSend && (
        <form onSubmit={submit} className="flex gap-2 border-t border-ink-100 p-3">
          <input className="input rounded-full" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${other.display_name}`} />
          <button type="submit" disabled={busy || !text.trim()} className="btn-primary px-4" aria-label="Send">
            {busy ? <Spinner className="h-4 w-4 text-white" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      )}
    </>
  );
}
