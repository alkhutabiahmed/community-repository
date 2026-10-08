import { useCallback, useEffect, useState } from 'react';
import { Compass, Crown, Flame, Inbox, MessageCircle, Plus, ShieldCheck, Star, User, type LucideIcon } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { fetchExperiences, fetchOtherProfiles, fetchWallet, removeFromWallet, saveToWallet } from './lib/api';
import type { ComposerPreset, Experience, Membership, Profile } from './lib/types';
import { PLANS, fetchMembership } from './lib/membership';
import MembershipSheet from './components/MembershipSheet';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DiscoverPage from './pages/DiscoverPage';
import TonightPage from './pages/TonightPage';
import ProposalsPage from './pages/ProposalsPage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import VipPage from './pages/VipPage';
import { checkIsAdmin } from './lib/adminApi';
import ProfileForm from './components/ProfileForm';
import ProposalComposer from './components/ProposalComposer';
import PersonSheet from './components/PersonSheet';
import { ErrorBox, PageLoader } from './components/ui';

type Tab = 'discover' | 'tonight' | 'vip' | 'proposals' | 'messages' | 'profile' | 'admin';

const NAV: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'discover', label: 'Discover', icon: Compass },
  { key: 'tonight', label: 'Tonight', icon: Flame },
  { key: 'vip', label: 'VIP', icon: Star },
  { key: 'proposals', label: 'Proposals', icon: Inbox },
  { key: 'messages', label: 'Messages', icon: MessageCircle },
  { key: 'profile', label: 'Profile', icon: User },
];

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}

function Gate() {
  const { session, profile, loading, profileError, recovering, refreshProfile } = useAuth();
  if (loading) return <PageLoader />;
  if (recovering) return <ResetPasswordPage />;
  if (!session) return <AuthPage />;
  if (profileError) return <div className="mx-auto max-w-md p-8"><ErrorBox text="Could not load your profile." onRetry={refreshProfile} /></div>;
  if (!profile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="font-display text-3xl font-semibold">Set up your profile</h1>
        <p className="mb-8 mt-2 text-sm text-ink-500">Your interests decide which plans and people we suggest. You must be 18 or older.</p>
        <div className="card p-6">
          <ProfileForm initial={null} userId={session.user.id} submitLabel="Start making plans" onSaved={refreshProfile} />
        </div>
      </div>
    );
  }
  return <Shell me={profile} />;
}

function Shell({ me }: { me: Profile }) {
  const { refreshProfile, signOut } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('discover');
  const [people, setPeople] = useState<Profile[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [walletIds, setWalletIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [composer, setComposer] = useState<{ preset: ComposerPreset; key: number } | null>(null);
  const [person, setPerson] = useState<Profile | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [membershipError, setMembershipError] = useState(false);
  const [showMembership, setShowMembership] = useState(false);

  const loadMembership = useCallback(async () => {
    try {
      setMembership(await fetchMembership());
      setMembershipError(false);
    } catch (cause) {
      console.error('membership load failed', cause);
      setMembershipError(true);
    }
  }, []);

  // Payments are confirmed in the background, so re-check a few times after a purchase or plan change.
  const refreshAfterPayment = useCallback(() => {
    [0, 2500, 6000, 12000].forEach((ms) => setTimeout(() => { loadMembership(); refreshProfile(); }, ms));
  }, [loadMembership, refreshProfile]);

  useEffect(() => { loadMembership(); }, [loadMembership]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('checkout');
    if (!result) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (result === 'success' && params.get('product') === 'vip_submission') {
      toast('Payment received. Your exclusive proposal is on its way.');
      setTab('vip');
      [2500, 6000].forEach((ms) => setTimeout(() => setRefreshKey((k) => k + 1), ms));
    } else if (result === 'success') {
      toast('Payment received. Your perks are being activated.');
      refreshAfterPayment();
    } else {
      toast('Checkout cancelled. You were not charged.');
    }
  }, [toast, refreshAfterPayment]);

  useEffect(() => {
    checkIsAdmin().then(setIsAdmin).catch((cause) => console.error('admin check failed', cause));
  }, [me.id]);
  const load = useCallback(async () => {
    try {
      const [p, e, w] = await Promise.all([fetchOtherProfiles(me.id), fetchExperiences(), fetchWallet()]);
      setPeople(p);
      setExperiences(e);
      setWalletIds(new Set(w.map((x) => x.experience_id)));
      setError(false);
    } catch (cause) {
      console.error('app data load failed', cause);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [me.id]);

  useEffect(() => { load(); }, [load]);

  function go(t: Tab) {
    setTab(t);
    if (t === 'tonight' || t === 'discover') load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const paid = !!membership && membership.plan !== 'free';

  function openPlans() {
    setPerson(null);
    setShowMembership(true);
  }

  function propose(preset: ComposerPreset) {
    if (membership && !paid) {
      toast('Sending proposals is for members. Pick a plan to start.');
      openPlans();
      return;
    }
    setPerson(null);
    setComposer({ preset, key: Date.now() });
  }

  async function toggleWallet(id: string) {
    const has = walletIds.has(id);
    setWalletIds((cur) => { const n = new Set(cur); if (has) n.delete(id); else n.add(id); return n; });
    try {
      if (has) await removeFromWallet(id);
      else await saveToWallet(id);
      toast(has ? 'Removed from your Date Wallet' : 'Saved to your Date Wallet');
    } catch (cause) {
      console.error('wallet toggle failed', cause);
      toast('Could not update your Date Wallet', 'error');
      load();
    }
  }

  return (
    <div className="min-h-screen pb-28 lg:pb-12">
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-ink-50/85 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <button onClick={() => go('discover')} className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-600 font-display text-base font-semibold text-white">P</div>
            <span className="font-display text-lg font-semibold tracking-tight">PROPOSAL</span>
          </button>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => go(key)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === key ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'}`}
              >
                <Icon className={`h-4 w-4 ${key === 'tonight' && tab !== key ? 'text-rose-600' : ''}`} /> {label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMembership(true)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${membership && membership.plan !== 'free' ? 'bg-ink-950 text-amber-300 hover:bg-ink-800' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'}`}
              aria-label="Membership"
            >
              <Crown className="h-4 w-4" />
              <span className="hidden sm:inline">{membership && membership.plan !== 'free' ? PLANS[membership.plan].name : 'Upgrade'}</span>
            </button>
            {isAdmin && (
              <button
                onClick={() => go('admin')}
                className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${tab === 'admin' ? 'bg-ink-900 text-white' : 'text-ink-700 ring-1 ring-ink-200 hover:bg-ink-100'}`}
              >
                <ShieldCheck className="h-4 w-4" /> Admin
              </button>
            )}
            <button onClick={() => propose({})} className="btn-primary hidden lg:inline-flex"><Plus className="h-4 w-4" />Make a Proposal</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && <div className="mb-6"><ErrorBox text="Some data couldn't load." onRetry={load} /></div>}
        {loading ? <PageLoader /> : (
          <div key={tab} className="animate-fade-up">
            {tab === 'discover' && (
              <DiscoverPage me={me} people={people} experiences={experiences} walletIds={walletIds} onToggleWallet={toggleWallet}
                onPropose={propose} onOpenPerson={setPerson} refreshKey={refreshKey} paid={paid} onUpgrade={openPlans} />
            )}
            {tab === 'tonight' && (
              <TonightPage me={me} people={people} experiences={experiences} membership={membership} onPropose={propose} onMeChanged={refreshProfile}
                onUpgrade={() => setShowMembership(true)} onBoosted={refreshAfterPayment} />
            )}
            {tab === 'proposals' && <ProposalsPage me={me} paid={paid} membershipReady={!!membership} onUpgrade={openPlans} onPropose={propose} onOpenChat={(id) => { setChatId(id); go('messages'); }} refreshKey={refreshKey} />}
            {tab === 'vip' && <VipPage me={me} refreshKey={refreshKey} onOpenChat={(id) => { setChatId(id); go('messages'); }} />}
            {tab === 'messages' && <MessagesPage me={me} activeId={chatId} onSelect={setChatId} />}
            {tab === 'profile' && (
              <ProfilePage me={me} experiences={experiences} walletIds={walletIds} onToggleWallet={toggleWallet}
                onPropose={propose} onSaved={refreshProfile} onSignOut={signOut} />
            )}
            {tab === 'admin' && isAdmin && <AdminPage myId={me.id} onExit={() => go('discover')} />}
          </div>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-7 items-end px-1">
          {NAV.slice(0, 3).map((n) => <MobileTab key={n.key} item={n} active={tab === n.key} onClick={() => go(n.key)} />)}
          <div className="flex justify-center">
            <button onClick={() => propose({})} className="-mt-6 flex h-14 w-14 animate-pulse2 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/30 transition active:scale-95" aria-label="Make a Proposal">
              <Plus className="h-6 w-6" />
            </button>
          </div>
          {NAV.slice(3).map((n) => <MobileTab key={n.key} item={n} active={tab === n.key} onClick={() => go(n.key)} />)}
        </div>
      </nav>

      {composer && (
        <ProposalComposer
          key={composer.key}
          preset={composer.preset}
          me={me}
          people={people}
          experiences={experiences}
          membership={membership}
          onUpgrade={() => setShowMembership(true)}
          onClose={() => setComposer(null)}
          onSent={() => { setComposer(null); setRefreshKey((k) => k + 1); loadMembership(); }}
        />
      )}
      {showMembership && (
        <MembershipSheet
          membership={membership}
          error={membershipError}
          onRetry={loadMembership}
          onClose={() => setShowMembership(false)}
          onChanged={refreshAfterPayment}
        />
      )}
      {person && <PersonSheet person={person} me={me} experiences={experiences} onClose={() => setPerson(null)} onPropose={propose} />}
    </div>
  );
}

function MobileTab({ item, active, onClick }: { item: (typeof NAV)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition ${active ? 'text-rose-600' : 'text-ink-500'}`}>
      <Icon className="h-5 w-5" />
      {item.label}
    </button>
  );
}
