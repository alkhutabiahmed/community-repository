import { useCallback, useEffect, useState } from 'react';
import { Check, Star, X } from 'lucide-react';
import { adminFetchVipApplications, adminSetVipStatus, compactFollowers, euros, type AdminVipApplication, type VipStatus } from '../../lib/vip';
import { useToast } from '../../context/ToastContext';
import { EmptyState, ErrorBox, PageLoader } from '../ui';
import { timeAgo } from '../../lib/time';

const STATUS_STYLE: Record<VipStatus, string> = {
  pending: 'bg-warning-50 text-warning-700',
  approved: 'bg-success-50 text-success-700',
  rejected: 'bg-error-50 text-error-700',
};

export default function AdminVip() {
  const toast = useToast();
  const [rows, setRows] = useState<AdminVipApplication[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [verified, setVerified] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setRows(await adminFetchVipApplications());
      setError(false);
    } catch (cause) {
      console.error('admin vip load failed', cause);
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(row: AdminVipApplication, status: VipStatus) {
    const raw = verified[row.user_id]?.trim();
    const followers = raw ? Math.round(Number(raw)) : null;
    if (followers !== null && !(followers >= 0)) return toast('Enter a valid follower count.', 'error');
    setBusy(row.user_id);
    try {
      await adminSetVipStatus(row.user_id, status, followers);
      toast(status === 'approved' ? `${row.display_name} is now a verified VIP` : `${row.display_name}'s application was ${status === 'rejected' ? 'rejected' : 'updated'}`);
      load();
    } catch (cause) {
      console.error('admin vip update failed', cause);
      toast('Could not update this application.', 'error');
    } finally {
      setBusy(null);
    }
  }

  if (error) return <ErrorBox text="Could not load VIP applications." onRetry={load} />;
  if (!rows) return <PageLoader />;
  if (!rows.length) return <EmptyState icon={<Star className="h-6 w-6" />} title="No VIP applications yet" text="When public figures apply to join VIP, you will verify them here." />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Check the social account belongs to the applicant before approving. You can correct the follower count with the verified number.</p>
      {rows.map((r) => (
        <div key={r.user_id} className="card flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink-900">{r.display_name}</p>
              <span className={`chip ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              <span className="text-xs text-ink-400">{timeAgo(r.created_at)}</span>
            </div>
            <p className="mt-1 text-sm text-ink-600">
              {r.role} - {compactFollowers(r.followers)} followers - {r.social_handle}{r.city ? ` - ${r.city}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">{r.email ?? 'No email'} - {r.weekly_limit} per week from {euros(r.price_standard)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Verified followers" type="number" min={0} className="input w-36" placeholder="Verified followers"
              value={verified[r.user_id] ?? ''} onChange={(e) => setVerified((v) => ({ ...v, [r.user_id]: e.target.value }))} />
            {r.status !== 'approved' && (
              <button onClick={() => decide(r, 'approved')} disabled={busy === r.user_id} className="btn-dark"><Check className="h-4 w-4" />Approve</button>
            )}
            {r.status !== 'rejected' && (
              <button onClick={() => decide(r, 'rejected')} disabled={busy === r.user_id} className="btn-ghost text-error-600"><X className="h-4 w-4" />{r.status === 'approved' ? 'Remove VIP' : 'Reject'}</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
