import { useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui';

export default function ResetPasswordPage() {
  const { session, finishRecovery, signOut } = useAuth();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      console.error('password update failed', err);
      setError(
        err.code === 'same_password'
          ? 'Please choose a password different from your old one.'
          : 'Could not update your password. The link may have expired, so try requesting a new one.',
      );
      return;
    }
    finishRecovery();
    toast('Your password has been updated');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6 py-16">
      <div className="card w-full max-w-sm animate-fade-up p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold">Choose a new password</h1>

        {session ? (
          <>
            <p className="mt-2 text-sm text-ink-500">
              For <span className="font-semibold text-ink-800">{session.user.email}</span>
            </p>
            <form onSubmit={submit} className="mt-8 space-y-4">
              <div>
                <label className="label" htmlFor="new-password">New password</label>
                <input id="new-password" type="password" required autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
              </div>
              <div>
                <label className="label" htmlFor="confirm-password">Confirm password</label>
                <input id="confirm-password" type="password" required autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" />
              </div>
              {error && <p className="text-sm text-error-600">{error}</p>}
              <button type="submit" disabled={busy} className="btn-primary w-full py-3">
                {busy ? <Spinner className="h-4 w-4 text-white" /> : <>Save new password <ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              This reset link is invalid or has expired. Go back to sign in and request a new one.
            </p>
            <button onClick={() => { finishRecovery(); void signOut(); }} className="btn-primary mt-8 w-full py-3">
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
