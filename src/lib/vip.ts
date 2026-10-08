import { Coffee, Gift, Music, Plane, Sparkles, Ticket, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { supabase } from './supabase';
import { startCheckout } from './membership';
import type { Profile } from './types';

export type VipKind = 'dinner' | 'concert' | 'adventure' | 'coffee' | 'travel' | 'surprise' | 'custom';
export type VipTier = 'standard' | 'priority' | 'premium';
export type VipStatus = 'pending' | 'approved' | 'rejected';
export type VipProposalStatus = 'awaiting_payment' | 'pending' | 'accepted' | 'declined' | 'expired';

export const VIP_KINDS: Record<VipKind, { label: string; icon: LucideIcon }> = {
  dinner: { label: 'Dinner', icon: UtensilsCrossed },
  concert: { label: 'Concert', icon: Music },
  adventure: { label: 'Adventure', icon: Ticket },
  coffee: { label: 'Coffee', icon: Coffee },
  travel: { label: 'Travel experience', icon: Plane },
  surprise: { label: 'Surprise proposal', icon: Gift },
  custom: { label: 'Create my own', icon: Sparkles },
};

export const VIP_TIERS: Record<VipTier, { label: string; text: string }> = {
  standard: { label: 'Standard', text: 'Your proposal joins their inbox' },
  priority: { label: 'Priority', text: 'Shown at the top of their inbox' },
  premium: { label: 'Premium experience', text: 'Apply for the experience they offer' },
};

export const VIP_TIER_ORDER: Record<VipTier, number> = { premium: 0, priority: 1, standard: 2 };

export interface VipProfile {
  user_id: string;
  role: string;
  followers: number;
  social_handle: string;
  city: string;
  intro: string;
  accepted_kinds: VipKind[];
  weekly_limit: number;
  price_standard: number;
  price_priority: number | null;
  price_premium: number | null;
  availability_note: string;
  status: VipStatus;
  paused: boolean;
  profile: Profile;
}

export interface VipProposal {
  id: string;
  sender_id: string;
  vip_id: string;
  kind: VipKind;
  tier: VipTier;
  message: string;
  preferred_date: string | null;
  amount_cents: number;
  payout_cents: number;
  status: VipProposalStatus;
  paid_with: 'card' | 'credit' | null;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
  proposal_id: string | null;
  sender: Profile;
  vip: Profile;
}

export type VipDraft = Omit<VipProfile, 'user_id' | 'status' | 'paused' | 'profile'>;

export function euros(cents: number) {
  return `€${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function compactFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(n);
}

export function tierPrice(v: Pick<VipProfile, 'price_standard' | 'price_priority' | 'price_premium'>, tier: VipTier) {
  return tier === 'standard' ? v.price_standard : tier === 'priority' ? v.price_priority : v.price_premium;
}

const VIP_SELECT = '*, profile:profiles!vip_profiles_user_id_fkey(*)';
const PROPOSAL_SELECT = '*, sender:profiles!vip_proposals_sender_id_fkey(*), vip:profiles!vip_proposals_vip_id_fkey(*)';

export async function fetchVipDirectory(myId: string) {
  const [{ data, error }, slots] = await Promise.all([
    supabase.from('vip_profiles').select(VIP_SELECT).eq('status', 'approved').eq('paused', false).neq('user_id', myId).order('followers', { ascending: false }),
    supabase.rpc('get_vip_slots'),
  ]);
  if (error) throw error;
  if (slots.error) throw slots.error;
  const used = new Map((slots.data as { vip_id: string; used: number }[] ?? []).map((s) => [s.vip_id, s.used]));
  return ((data ?? []) as VipProfile[]).map((v) => ({ ...v, left: Math.max(0, v.weekly_limit - (used.get(v.user_id) ?? 0)) }));
}

export async function fetchMyVipProfile(myId: string) {
  const { data, error } = await supabase.from('vip_profiles').select(VIP_SELECT).eq('user_id', myId).maybeSingle();
  if (error) throw error;
  return data as VipProfile | null;
}

export async function applyAsVip(draft: VipDraft) {
  const { error } = await supabase.from('vip_profiles').insert(draft);
  if (error) throw error;
}

export async function updateMyVip(myId: string, changes: Partial<Pick<VipProfile, 'intro' | 'accepted_kinds' | 'weekly_limit' | 'price_standard' | 'price_priority' | 'price_premium' | 'availability_note' | 'paused'>>) {
  const { error } = await supabase.from('vip_profiles').update(changes).eq('user_id', myId);
  if (error) throw error;
}

export async function withdrawVipApplication(myId: string) {
  const { error } = await supabase.from('vip_profiles').delete().eq('user_id', myId);
  if (error) throw error;
}

export async function fetchVipProposals(myId: string, side: 'sent' | 'received') {
  let q = supabase.from('vip_proposals').select(PROPOSAL_SELECT).order('created_at', { ascending: false });
  q = side === 'sent' ? q.eq('sender_id', myId).neq('status', 'awaiting_payment') : q.eq('vip_id', myId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as VipProposal[];
}

export async function fetchVipCredit() {
  const { data, error } = await supabase.from('member_credits').select('vip_credit_cents').maybeSingle();
  if (error) throw error;
  return (data as { vip_credit_cents: number } | null)?.vip_credit_cents ?? 0;
}

export async function refundExpiredVipProposals() {
  const { data, error } = await supabase.rpc('refund_expired_vip_proposals');
  if (error) throw error;
  return (data as number | null) ?? 0;
}

export async function submitVipProposal(input: { vip: string; kind: VipKind; tier: VipTier; message: string; date: string | null }) {
  const { data, error } = await supabase.rpc('create_vip_proposal', {
    p_vip: input.vip, p_kind: input.kind, p_tier: input.tier, p_message: input.message, p_date: input.date,
  });
  if (error) throw error;
  const row = (data as { id: string; paid: boolean }[] | null)?.[0];
  if (!row) throw new Error('No proposal created');
  if (!row.paid) await startCheckout('vip_submission', { vip_proposal_id: row.id });
  return row.paid;
}

export async function respondVipProposal(id: string, action: 'accept' | 'decline') {
  const { error } = await supabase.rpc('respond_vip_proposal', { p_id: id, p_action: action });
  if (error) throw error;
}

export interface AdminVipApplication {
  user_id: string;
  display_name: string;
  email: string | null;
  role: string;
  followers: number;
  social_handle: string;
  city: string;
  status: VipStatus;
  weekly_limit: number;
  price_standard: number;
  created_at: string;
}

export async function adminFetchVipApplications() {
  const { data, error } = await supabase.rpc('admin_vip_applications');
  if (error) throw error;
  return (data ?? []) as AdminVipApplication[];
}

export async function adminSetVipStatus(userId: string, status: VipStatus, followers: number | null) {
  const { error } = await supabase.rpc('admin_set_vip_status', { p_user: userId, p_status: status, p_followers: followers });
  if (error) throw error;
}
