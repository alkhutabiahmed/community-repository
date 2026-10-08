import { useCallback, useEffect, useState } from 'react';
import { Search, ShieldCheck, Users } from 'lucide-react';
import { fetchAdminMembers, setMemberVerified, type AdminMember } from '../../lib/adminApi';
import { timeAgo } from '../../lib/time';
import { useToast } from '../../context/ToastContext';
import { Avatar, EmptyState, ErrorBox, PageLoader, Spinner, Verified } from '../ui';

export default function AdminMembers() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setError(false);
    try {
      setMembers(await fetchAdminMembers(query));
    } catch (cause) {
      console.error('admin members failed', cause);
      setError(true);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  async function toggleVerified(m: AdminMember) {
    setBusyId(m.id);
    try {
      await setMemberVerified(m.id, !m.verified);
      setMembers((cur) => cur?.map((x) => (x.id === m.id ? { ...x, verified: !m.verified } : x)) ?? cur);
      toast(m.verified ? `${m.display_name} is no longer verified` : `${m.display_name} is now verified`);
    } catch (cause) {
      console.error('verify toggle failed', cause);
      toast('Could not update verification', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input className="input pl-11" placeholder="Search by name, email or city" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error ? (
        <ErrorBox text="Could not load members." onRetry={load} />
      ) : !members ? (
        <PageLoader />
      ) : !members.length ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No members found" text="Try a different name, email or city." />
      ) : (
        <div className="card divide-y divide-ink-100 overflow-hidden">
          {members.map((m) => (
            <div key={m.id} className="flex flex-col gap-4 p-4 transition hover:bg-ink-50/60 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar profile={m} size={44} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-semibold text-ink-900">{m.display_name}, {m.age}</p>
                    {m.verified && <Verified />}
                    {m.is_admin && (
                      <span className="chip bg-ink-900 py-0.5 text-[10px] text-white"><ShieldCheck className="h-3 w-3" />Admin</span>
                    )}
                  </div>
                  <p className="truncate text-sm text-ink-500">{m.email}</p>
                  <p className="text-xs text-ink-400">{m.city || 'No city'} · joined {timeAgo(m.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-center text-xs text-ink-500">
                <Count label="Sent" value={m.sent} />
                <Count label="Received" value={m.received} />
                <Count label="Accepted" value={m.accepted} />
                <Count label="No-shows" value={m.no_shows} warn={m.no_shows > 0} />
              </div>
              <button
                onClick={() => toggleVerified(m)}
                disabled={busyId === m.id}
                className={`${m.verified ? 'btn-ghost' : 'btn-dark'} min-w-[120px] py-2`}
              >
                {busyId === m.id ? <Spinner className="h-4 w-4" /> : m.verified ? 'Remove badge' : 'Verify'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Count({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="w-14">
      <p className={`text-base font-semibold ${warn ? 'text-error-600' : 'text-ink-900'}`}>{value}</p>
      <p>{label}</p>
    </div>
  );
}
