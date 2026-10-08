import { useState } from 'react';
import { ArrowLeft, Inbox, LayoutDashboard, ShieldCheck, Star, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import AdminOverview from '../components/admin/AdminOverview';
import AdminMembers from '../components/admin/AdminMembers';
import AdminProposals from '../components/admin/AdminProposals';
import AdminTeam from '../components/admin/AdminTeam';
import AdminVip from '../components/admin/AdminVip';

type Section = 'overview' | 'members' | 'proposals' | 'vip' | 'team';

const SECTIONS: { key: Section; label: string; icon: LucideIcon; text: string }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, text: 'How PROPOSAL is doing right now.' },
  { key: 'members', label: 'Members', icon: Users, text: 'Find members and give or remove their verified badge.' },
  { key: 'proposals', label: 'Proposals', icon: Inbox, text: 'Review every proposal and cancel ones that break the rules.' },
  { key: 'vip', label: 'VIP', icon: Star, text: 'Verify public figures who applied to join PROPOSAL VIP.' },
  { key: 'team', label: 'Admins', icon: ShieldCheck, text: 'Choose who can access this admin area.' },
];

export default function AdminPage({ myId, onExit }: { myId: string; onExit: () => void }) {
  const [section, setSection] = useState<Section>('overview');
  const current = SECTIONS.find((s) => s.key === section)!;

  return (
    <div>
      <button onClick={onExit} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Back to the app
      </button>
      <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="chip mb-3 bg-ink-900 text-white"><ShieldCheck className="h-3.5 w-3.5" />Admin</span>
          <h1 className="font-display text-4xl font-semibold">{current.label}</h1>
          <p className="mt-2 text-ink-500">{current.text}</p>
        </div>
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:rounded-full lg:bg-white lg:p-1 lg:ring-1 lg:ring-ink-100">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${section === key ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div key={section} className="animate-fade-up">
        {section === 'overview' && <AdminOverview />}
        {section === 'members' && <AdminMembers />}
        {section === 'proposals' && <AdminProposals />}
        {section === 'vip' && <AdminVip />}
        {section === 'team' && <AdminTeam myId={myId} />}
      </div>
    </div>
  );
}
