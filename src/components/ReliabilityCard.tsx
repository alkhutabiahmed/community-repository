import { useEffect, useState, type ReactNode } from 'react';
import { CalendarCheck, CalendarX, ShieldCheck, UserX } from 'lucide-react';
import { fetchReliability } from '../lib/api';
import type { Reliability } from '../lib/types';
import { Spinner } from './ui';

export default function ReliabilityCard({ userId, compact }: { userId: string; compact?: boolean }) {
  const [data, setData] = useState<Reliability | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchReliability(userId)
      .then((r) => alive && setData(r))
      .catch((cause) => {
        console.error('reliability load failed', cause);
        if (alive) setFailed(true);
      });
    return () => { alive = false; };
  }, [userId]);

  if (failed) return <p className="text-sm text-ink-500">Reliability score is unavailable right now.</p>;
  if (!data) return <div className="flex justify-center py-4"><Spinner /></div>;

  const tone = data.score >= 80 ? 'text-success-600' : data.score >= 60 ? 'text-warning-600' : 'text-error-600';

  if (compact) {
    return (
      <span className="chip bg-ink-100 text-ink-700">
        <ShieldCheck className={`h-3.5 w-3.5 ${tone}`} /> Reliability {data.score}
      </span>
    );
  }

  return (
    <div className="rounded-3xl border border-ink-100 bg-ink-50 p-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="label mb-1">Reliability Score</div>
          <p className="text-xs text-ink-500">Based on showing up, not looks.</p>
        </div>
        <div className={`font-display text-4xl font-semibold ${tone}`}>{data.score}</div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-200">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-success-500 transition-all duration-700" style={{ width: `${data.score}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat icon={<CalendarCheck className="h-4 w-4 text-success-600" />} value={data.attended} label="Dates attended" />
        <Stat icon={<UserX className="h-4 w-4 text-error-600" />} value={data.no_shows} label="No-shows" />
        <Stat icon={<CalendarX className="h-4 w-4 text-warning-600" />} value={data.late_cancellations} label="Cancellations" />
        <Stat icon={<ShieldCheck className="h-4 w-4 text-teal-600" />} value={data.verified ? 'Yes' : 'No'} label="ID verified" />
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number | string; label: string }) {
  return (
    <div className="rounded-2xl bg-white p-3">
      {icon}
      <div className="mt-2 font-semibold text-ink-900">{value}</div>
      <div className="text-xs text-ink-500">{label}</div>
    </div>
  );
}
