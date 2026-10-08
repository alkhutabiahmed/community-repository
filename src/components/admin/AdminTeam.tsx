import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { fetchAdmins, setAdminAccess, type AdminUser } from '../../lib/adminApi';
import { timeAgo } from '../../lib/time';
import { useToast } from '../../context/ToastContext';
import { ErrorBox, Modal, PageLoader, Spinner } from '../ui';

function friendlyError(cause: unknown) {
  const msg = cause instanceof Error ? cause.message : String((cause as { message?: string })?.message ?? '');
  if (msg.includes('No account with that email')) return 'No account uses that email. Ask them to sign up first.';
  if (msg.includes('cannot remove yourself')) return "You can't remove your own admin access.";
  return 'Something went wrong. Please try again.';
}

export default function AdminTeam({ myId }: { myId: string }) {
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState(false);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState('');
  const [removing, setRemoving] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setAdmins(await fetchAdmins());
    } catch (cause) {
      console.error('admin list failed', cause);
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    setAdding(true);
    try {
      await setAdminAccess(email, true);
      toast(`${email} is now an admin`);
      setEmail('');
      load();
    } catch (cause) {
      console.error('add admin failed', cause);
      setFormError(friendlyError(cause));
    } finally {
      setAdding(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await setAdminAccess(removing.email, false);
      toast(`${removing.email} is no longer an admin`);
      setRemoving(null);
      load();
    } catch (cause) {
      console.error('remove admin failed', cause);
      toast(friendlyError(cause), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        {error ? (
          <ErrorBox text="Could not load admins." onRetry={load} />
        ) : !admins ? (
          <PageLoader />
        ) : (
          <div className="card divide-y divide-ink-100 overflow-hidden">
            {admins.map((a) => (
              <div key={a.user_id} className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-900 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">
                    {a.display_name ?? 'No profile yet'}
                    {a.user_id === myId && <span className="ml-2 text-xs font-medium text-ink-400">(you)</span>}
                  </p>
                  <p className="truncate text-sm text-ink-500">{a.email} · admin since {timeAgo(a.created_at)}</p>
                </div>
                {a.user_id !== myId && (
                  <button onClick={() => setRemoving(a)} className="btn-ghost py-2 text-error-600 hover:border-error-100 hover:bg-error-50">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={add} className="card h-fit p-6">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          <UserPlus className="h-5 w-5" />
        </div>
        <h3 className="font-display text-lg font-semibold">Add an admin</h3>
        <p className="mt-1 text-sm text-ink-500">They need an existing PROPOSAL account. Admins can see member emails and verify members.</p>
        <label className="label mt-5" htmlFor="admin-email">Email</label>
        <input id="admin-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" />
        {formError && <p className="mt-3 text-sm text-error-600">{formError}</p>}
        <button type="submit" disabled={adding} className="btn-dark mt-5 w-full py-3">
          {adding ? <Spinner className="h-4 w-4 text-white" /> : 'Give admin access'}
        </button>
      </form>

      <Modal open={!!removing} onClose={() => !busy && setRemoving(null)} title="Remove admin access?">
        <p className="text-sm leading-relaxed text-ink-600">
          {removing?.email} will lose access to the admin area. Their member account stays as it is.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setRemoving(null)} disabled={busy} className="btn-ghost">Keep</button>
          <button onClick={remove} disabled={busy} className="btn bg-error-600 text-white hover:bg-error-700">
            {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Remove access'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
