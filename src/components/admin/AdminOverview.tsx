import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CalendarHeart, Flame, Inbox, MessageCircle, TrendingUp, UserX, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchAdminOverview, type AdminOverview as Overview } from '../../lib/adminApi';
import { ErrorBox, PageLoader } from '../ui';

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await fetchAdminOverview());
    } catch (cause) {
      console.error('admin overview failed', cause);
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox text="Could not load the overview." onRetry={load} />;
  if (!data) return <PageLoader />;

  const acceptRate = data.accepted + data.declined > 0 ? Math.round((data.accepted / (data.accepted + data.declined)) * 100) : 0;

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ink-500">Members</h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat icon={Users} label="Total members" value={data.members} tone="ink" />
          <Stat icon={BadgeCheck} label="Verified" value={data.verified} hint={`${pct(data.verified, data.members)}% of members`} tone="teal" />
          <Stat icon={TrendingUp} label="Joined this week" value={data.new_this_week} tone="amber" />
          <Stat icon={Flame} label="Free tonight" value={data.free_tonight} tone="rose" />
        </div>
      </section>
      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ink-500">Proposals</h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat icon={Inbox} label="All proposals" value={data.proposals} hint={`${data.pending} waiting · ${data.open} open plans`} tone="ink" />
          <Stat icon={CalendarHeart} label="Accepted" value={data.accepted} hint={`${acceptRate}% acceptance rate`} tone="rose" />
          <Stat icon={MessageCircle} label="Messages sent" value={data.messages} tone="teal" />
          <Stat icon={UserX} label="Reported no-shows" value={data.no_shows} hint={`${data.cancelled} cancelled proposals`} tone="error" />
        </div>
      </section>
    </div>
  );
}

function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

const TONES = {
  ink: 'bg-ink-100 text-ink-700',
  teal: 'bg-teal-50 text-teal-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-600',
  error: 'bg-error-50 text-error-600',
};

function Stat({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: number; hint?: string; tone: keyof typeof TONES }) {
  return (
    <div className="card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-display text-3xl font-semibold text-ink-900">{value.toLocaleString()}</p>
      <p className="mt-1 text-sm font-medium text-ink-600">{label}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
