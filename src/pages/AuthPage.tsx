import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, CalendarHeart, MailCheck, Sparkles, Timer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string; subtitle: string; cta: string }> = {
  signup: { title: 'Create your account', subtitle: 'Less small talk, more real plans.', cta: 'Create account' },
  signin: { title: 'Welcome back', subtitle: 'Sign in to see your proposals.', cta: 'Sign in' },
  forgot: { title: 'Reset your password', subtitle: "Enter your email and we'll send you a link to choose a new password.", cta: 'Send reset link' },
};

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setResetSent(false);
    setPassword('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'forgot') {
      setBusy(true);
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setBusy(false);
      if (err) {
        console.error('reset request failed', err);
        setError(err.status === 429 ? 'Too many requests. Please wait a minute and try again.' : 'Could not send the reset link. Please try again.');
        return;
      }
      setResetSent(true);
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } =
        mode === 'signup'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
    } catch (cause) {
      console.error('auth failed', cause);
      setError(
        mode === 'signup'
          ? 'Could not create an account with these details. Try signing in instead.'
          : 'Email or password is incorrect.',
      );
    } finally {
      setBusy(false);
    }
  }

  const copy = COPY[mode];

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <img
          src="https://images.pexels.com/photos/2433978/pexels-photo-2433978.jpeg?auto=compress&cs=tinysrgb&h=650&w=940"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[.2em] text-rose-300">A new kind of dating</p>
          <h2 className="font-display text-5xl font-semibold leading-tight">
            Discover. Propose.<br />Accept. Meet.
          </h2>
          <div className="mt-10 grid max-w-md gap-4 text-sm text-ink-100">
            <Feature icon={<CalendarHeart className="h-4 w-4" />} text="Invite people to real plans instead of swiping" />
            <Feature icon={<Sparkles className="h-4 w-4" />} text="See how compatible you are for each specific date" />
            <Feature icon={<Timer className="h-4 w-4" />} text="Proposals expire, so nothing stays in limbo" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-16">
        <div key={mode} className="w-full max-w-sm animate-fade-up">
          <div className="mb-10 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 font-display text-lg font-semibold text-white">P</div>
            <span className="font-display text-xl font-semibold tracking-tight">PROPOSAL</span>
          </div>

          {mode === 'forgot' && (
            <button onClick={() => switchMode('signin')} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </button>
          )}

          {resetSent ? (
            <div className="animate-fade-up">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                <MailCheck className="h-6 w-6" />
              </div>
              <h1 className="mt-6 font-display text-3xl font-semibold">Check your inbox</h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                If an account exists for <span className="font-semibold text-ink-800">{email}</span>, we've sent a link to reset your password. It may take a minute to arrive, so check your spam folder too.
              </p>
              <button onClick={() => setResetSent(false)} className="btn-ghost mt-8 w-full py-3">
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h1 className="font-display text-3xl font-semibold">{copy.title}</h1>
              <p className="mt-2 text-sm text-ink-500">{copy.subtitle}</p>

              <form onSubmit={submit} className="mt-8 space-y-4">
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>
                {mode !== 'forgot' && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="label" htmlFor="password">Password</label>
                      {mode === 'signin' && (
                        <button type="button" onClick={() => switchMode('forgot')} className="mb-2 text-xs font-semibold text-rose-600 transition hover:text-rose-700">
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <input
                      id="password"
                      type="password"
                      required
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                    />
                  </div>
                )}
                {error && <p className="text-sm text-error-600">{error}</p>}
                <button type="submit" disabled={busy} className="btn-primary w-full py-3">
                  {busy ? <Spinner className="h-4 w-4 text-white" /> : <>{copy.cta} <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>
            </>
          )}

          {mode !== 'forgot' && (
            <p className="mt-6 text-center text-sm text-ink-500">
              {mode === 'signup' ? 'Already have an account?' : 'New to PROPOSAL?'}{' '}
              <button
                onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
                className="font-semibold text-rose-600 hover:text-rose-700"
              >
                {mode === 'signup' ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-rose-200">{icon}</div>
      {text}
    </div>
  );
}
