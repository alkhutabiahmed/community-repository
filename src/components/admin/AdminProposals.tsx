import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Inbox } from 'lucide-react';
import { adminCancelProposal, fetchAdminProposals, type AdminProposal } from '../../lib/adminApi';
import { formatWhen, isExpired, timeAgo } from '../../lib/time';
import type { ProposalStatus } from '../../lib/types';
import { useToast } from '../../context/ToastContext';
import { EmptyState, ErrorBox, LevelBadge, Modal, PageLoader, Spinner } from '../ui';

const FILTERS: { key: ProposalStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Waiting' },
  { key: 'open', label: 'Open plans' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_STYLE: Record<ProposalStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  open: 'bg-teal-50 text-teal-700',
  accepted: 'bg-success-50 text-success-700',
  declined: 'bg-ink-100 text-ink-600',
  countered: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-error-50 text-error-700',
  closed: 'bg-ink-100 text-ink-600',
};

const CANCELLABLE: ProposalStatus[] = ['pending', 'open', 'accepted', 'countered'];

export default function AdminProposals() {
  const toast = useToast();
  const [filter, setFilter] = useState<ProposalStatus | 'all'>('all');
  const [rows, setRows] = useState<AdminProposal[] | null>(null);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState<AdminProposal | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setRows(null);
    try {
      setRows(await fetchAdminProposals(filter));
    } catch (cause) {
      console.error('admin proposals failed', cause);
      setError(true);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function cancel() {
    if (!confirm) return;
    setBusy(true);
    try {
      await adminCancelProposal(confirm.id);
      toast('Proposal cancelled');
      setConfirm(null);
      load();
    } catch (cause) {
      console.error('admin cancel failed', cause);
      toast('Could not cancel this proposal', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${filter === f.key ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:ring-ink-300'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorBox text="Could not load proposals." onRetry={load} />
      ) : !rows ? (
        <PageLoader />
      ) : !rows.length ? (
        <EmptyState icon={<Inbox className="h-6 w-6" />} title="No proposals here" text="Nothing matches this filter yet." />
      ) : (
        <div className="card divide-y divide-ink-100 overflow-hidden">
          {rows.map((p) => {
            const live = CANCELLABLE.includes(p.status) && (p.status === 'accepted' || !isExpired(p.expires_at));
            return (
              <div key={p.id} className="flex flex-col gap-3 p-4 transition hover:bg-ink-50/60 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-900">{p.title}</p>
                    <LevelBadge level={p.level} />
                    <span className={`chip ${STATUS_STYLE[p.status]}`}>
                      {p.status === 'pending' && isExpired(p.expires_at) ? 'expired' : p.status}
                    </span>
                    {p.boost_amount > 0 && <span className="chip bg-rose-50 text-rose-600">€{p.boost_amount} upgrade</span>}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
                    {p.sender_name} <ArrowRight className="h-3.5 w-3.5 text-ink-400" /> {p.recipient_name ?? 'Open to anyone'}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {formatWhen(p.proposed_for)}{p.location ? ` · ${p.location}` : ''} · created {timeAgo(p.created_at)}
                  </p>
                </div>
                {live && (
                  <button onClick={() => setConfirm(p)} className="btn-ghost py-2 text-error-600 hover:border-error-100 hover:bg-error-50">
                    Cancel
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!confirm} onClose={() => !busy && setConfirm(null)} title="Cancel this proposal?">
        <p className="text-sm leading-relaxed text-ink-600">
          "{confirm?.title}" from {confirm?.sender_name} will be cancelled for everyone involved. This won't count against either member's reliability score.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setConfirm(null)} disabled={busy} className="btn-ghost">Keep it</button>
          <button onClick={cancel} disabled={busy} className="btn bg-error-600 text-white hover:bg-error-700">
            {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Cancel proposal'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
