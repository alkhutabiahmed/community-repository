import { useState, type ReactNode } from 'react';
import { Clock, Pause, Play, ShieldCheck } from 'lucide-react';
import { VIP_KINDS, applyAsVip, euros, updateMyVip, withdrawVipApplication, type VipKind, type VipProfile } from '../../lib/vip';
import { useToast } from '../../context/ToastContext';
import { Spinner } from '../ui';

const toCents = (v: string) => Math.round(Number(v.replace(',', '.')) * 100);
const toEuros = (c: number | null) => (c === null ? '' : String(c / 100));

export default function VipApplyForm({ myId, existing, onSaved }: { myId: string; existing: VipProfile | null; onSaved: () => void }) {
  const toast = useToast();
  const [role, setRole] = useState(existing?.role ?? '');
  const [followers, setFollowers] = useState(existing ? String(existing.followers) : '');
  const [handle, setHandle] = useState(existing?.social_handle ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [intro, setIntro] = useState(existing?.intro ?? '');
  const [kinds, setKinds] = useState<VipKind[]>(existing?.accepted_kinds ?? ['dinner', 'coffee']);
  const [limit, setLimit] = useState(String(existing?.weekly_limit ?? 10));
  const [standard, setStandard] = useState(toEuros(existing?.price_standard ?? 125000));
  const [priority, setPriority] = useState(toEuros(existing?.price_priority ?? null));
  const [premium, setPremium] = useState(toEuros(existing?.price_premium ?? null));
  const [note, setNote] = useState(existing?.availability_note ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  function validate() {
    const s = toCents(standard);
    const p = priority.trim() ? toCents(priority) : null;
    const x = premium.trim() ? toCents(premium) : null;
    const l = Number(limit);
    if (!existing && (role.trim().length < 2 || handle.trim().length < 2)) return 'Add what you do and your main social account.';
    if (!existing && !(Number(followers) >= 0)) return 'Enter your follower count.';
    if (!kinds.length) return 'Choose at least one kind of proposal you accept.';
    if (!Number.isInteger(l) || l < 1 || l > 200) return 'Weekly proposals must be between 1 and 200.';
    if (!(s >= 125000 && s <= 2500000)) return 'The standard price must be between €1,250 and €25,000, so you always earn at least €1,000.';
    if (p !== null && !(p > s && p <= 5000000)) return 'The priority price must be higher than the standard price (max €50,000).';
    if (x !== null && !(x > s && x <= 10000000)) return 'The premium experience price must be higher than the standard price (max €100,000).';
    return { s, p, x, l };
  }

  async function save() {
    const v = validate();
    if (typeof v === 'string') return setError(v);
    setError('');
    setBusy('save');
    const shared = { intro: intro.trim(), accepted_kinds: kinds, weekly_limit: v.l, price_standard: v.s, price_priority: v.p, price_premium: v.x, availability_note: note.trim() };
    try {
      if (existing) await updateMyVip(myId, shared);
      else await applyAsVip({ ...shared, role: role.trim(), followers: Math.round(Number(followers)), social_handle: handle.trim(), city: city.trim() });
      toast(existing ? 'Your VIP profile is updated' : 'Application sent. Our team will verify it shortly.');
      onSaved();
    } catch (cause) {
      console.error('vip save failed', cause);
      setError('Could not save. Please check your details and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function run(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast(ok);
      onSaved();
    } catch (cause) {
      console.error('vip action failed', cause);
      toast('Something went wrong. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {existing ? (
        <StatusBanner vip={existing} />
      ) : (
        <div className="rounded-3xl bg-ink-950 p-6 text-white">
          <span className="chip mb-3 bg-amber-400/15 font-semibold text-amber-300">Free to join</span>
          <h2 className="font-display text-2xl font-semibold">Join PROPOSAL VIP</h2>
          <p className="mt-2 text-sm text-ink-300">
            For creators, athletes, musicians, models, entrepreneurs and local personalities. Applying costs nothing. You decide what you accept, how many proposals
            you receive each week and the price. Every proposal you accept earns you at least €1,000, and you are never obliged to accept or reply.
          </p>
        </div>
      )}

      <div className="card space-y-5 p-6">
        {!existing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What you do" id="vip-role"><input id="vip-role" className="input" maxLength={40} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Content Creator" /></Field>
            <Field label="Followers" id="vip-followers"><input id="vip-followers" type="number" min={0} className="input" value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder="184000" /></Field>
            <Field label="Main social account" id="vip-handle"><input id="vip-handle" className="input" maxLength={60} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@sofia on Instagram" /></Field>
            <Field label="City" id="vip-city"><input id="vip-city" className="input" maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Brussels" /></Field>
          </div>
        )}

        <Field label="Short intro" id="vip-intro">
          <textarea id="vip-intro" rows={3} maxLength={400} className="input resize-none" value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="What kind of proposals excite you?" />
        </Field>

        <div>
          <span className="label">Proposals you accept</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(VIP_KINDS) as VipKind[]).map((k) => {
              const on = kinds.includes(k);
              const Icon = VIP_KINDS[k].icon;
              return (
                <button key={k} type="button" onClick={() => setKinds((cur) => (on ? cur.filter((x) => x !== k) : [...cur, k]))}
                  className={`chip border px-3 py-1.5 text-sm transition ${on ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300'}`}>
                  <Icon className="h-3.5 w-3.5" />{VIP_KINDS[k].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Per week" id="vip-limit"><input id="vip-limit" type="number" min={1} max={200} className="input" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
          <Field label="Standard €" id="vip-std"><input id="vip-std" inputMode="decimal" className="input" value={standard} onChange={(e) => setStandard(e.target.value)} /></Field>
          <Field label="Priority €" id="vip-pri"><input id="vip-pri" inputMode="decimal" className="input" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="Optional" /></Field>
          <Field label="Premium €" id="vip-pre"><input id="vip-pre" inputMode="decimal" className="input" value={premium} onChange={(e) => setPremium(e.target.value)} placeholder="Optional" /></Field>
        </div>
        {toCents(standard) >= 125000 && <p className="-mt-2 text-xs text-ink-500">You receive {euros(Math.max(100000, Math.floor(toCents(standard) * 0.8)))} for every standard proposal you accept (minimum €1,000).</p>}

        <Field label="Availability note (optional)" id="vip-note">
          <input id="vip-note" className="input" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Available for one dinner experience this month" />
        </Field>

        {error && <p className="text-sm text-error-600">{error}</p>}
        <button onClick={save} disabled={!!busy} className="btn-dark w-full">{busy === 'save' ? <Spinner className="h-4 w-4 text-white" /> : existing ? 'Save changes' : 'Apply for VIP - free'}</button>
      </div>

      {existing && (
        <div className="flex flex-wrap gap-2">
          {existing.status === 'approved' && (
            <button onClick={() => run('pause', () => updateMyVip(myId, { paused: !existing.paused }), existing.paused ? 'Your VIP profile is visible again' : 'Your VIP profile is hidden')} disabled={!!busy} className="btn-ghost">
              {existing.paused ? <><Play className="h-4 w-4" />Show my VIP profile</> : <><Pause className="h-4 w-4" />Pause new proposals</>}
            </button>
          )}
          {existing.status !== 'approved' && (
            <button onClick={() => run('withdraw', () => withdrawVipApplication(myId), 'Application withdrawn')} disabled={!!busy} className="btn-ghost text-error-600">Withdraw application</button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBanner({ vip }: { vip: VipProfile }) {
  if (vip.status === 'approved') {
    return (
      <div className="flex items-center gap-3 rounded-3xl bg-success-50 p-5 text-success-800">
        <ShieldCheck className="h-5 w-5" />
        <p className="text-sm font-medium">You are a verified VIP{vip.paused ? ' - your profile is paused and hidden from VIP' : ''}.</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-warning-50 p-5 text-warning-800">
      <Clock className="h-5 w-5" />
      <p className="text-sm font-medium">
        {vip.status === 'pending' ? 'Your application is being verified. We may contact you through your social account to confirm it is really you.' : 'Your application was not approved. You can withdraw it and apply again.'}
      </p>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div><label className="label" htmlFor={id}>{label}</label>{children}</div>;
}
