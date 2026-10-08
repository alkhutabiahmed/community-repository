import { supabase } from './supabase';
import type { BoostKind, Membership, Plan, Profile, ProposalTier } from './types';

export type PaidPlan = Exclude<Plan, 'free'>;
export type BoostProduct = 'boost_2h' | 'tonight_boost' | 'weekend_boost' | 'city_boost';
export type TierProduct = 'priority_proposal' | 'super_proposal' | 'vip_proposal';
export type Product = `plan_${PaidPlan}` | BoostProduct | TierProduct;

export const PLANS: Record<PaidPlan, { name: string; price: string; tagline: string; perks: string[] }> = {
  plus: {
    name: 'PROPOSAL+',
    price: '14.99',
    tagline: 'For people who want better dating tools.',
    perks: ['Send up to 20 proposals a day', 'Read and answer every proposal you receive', 'Apply to open plans', 'PROPOSAL+ badge on your profile', 'Shown above free members in Discover'],
  },
  tonight: {
    name: 'TONIGHT',
    price: '49.99',
    tagline: 'For people who actually want to meet.',
    perks: ['Unlimited proposals', '"Available Tonight" badge every evening', 'Priority placement on the Tonight page', '15 Priority Proposals every month', '4 Tonight Boosts every month'],
  },
  black: {
    name: 'BLACK',
    price: '79.99',
    tagline: 'Maximum visibility and priority.',
    perks: ['Everything in TONIGHT', 'Premium placement above every other plan', '4 VIP Proposals every month', 'BLACK badge on your profile'],
  },
};

export const BOOSTS: Record<BoostProduct, { name: string; price: string; text: string }> = {
  boost_2h: { name: '2-hour Boost', price: '3.99', text: 'Top local visibility for 2 hours' },
  tonight_boost: { name: 'Tonight Boost', price: '7.99', text: 'Top visibility until 03:00 tonight' },
  weekend_boost: { name: 'Weekend Boost', price: '12.99', text: 'Top visibility for 48 hours' },
  city_boost: { name: 'City Takeover', price: '14.99', text: 'The most visible profile in your city for 6 hours' },
};

export const TIERS: Record<ProposalTier, { name: string; price: string | null; text: string; product: TierProduct | null }> = {
  normal: { name: 'Normal', price: null, text: 'Standard proposal', product: null },
  priority: { name: 'Priority', price: '2.99', text: 'Shown above normal proposals', product: 'priority_proposal' },
  super: { name: 'Super', price: '7.99', text: 'Highlighted so it stands out', product: 'super_proposal' },
  vip: { name: 'VIP', price: '14.99', text: 'Premium invitation, first in their inbox', product: 'vip_proposal' },
};

export const TIER_ORDER: Record<ProposalTier, number> = { vip: 0, super: 1, priority: 2, normal: 3 };

export function tierCredits(m: Membership, tier: ProposalTier) {
  if (tier === 'priority') return m.priority;
  if (tier === 'super') return m.super;
  if (tier === 'vip') return m.vip;
  return Infinity;
}

export function activePlan(p: Pick<Profile, 'plan' | 'plan_until'>): Plan {
  return p.plan !== 'free' && p.plan_until && new Date(p.plan_until) > new Date() ? p.plan : 'free';
}

export function activeBoost(p: Pick<Profile, 'boost_until' | 'boost_kind'>): BoostKind | null {
  return p.boost_until && new Date(p.boost_until) > new Date() ? p.boost_kind : null;
}

export function isAvailableTonightPremium(p: Profile) {
  const plan = activePlan(p);
  return plan === 'tonight' || plan === 'black' || !!activeBoost(p);
}

const PLAN_WEIGHT: Record<Plan, number> = { black: 3, tonight: 2, plus: 1, free: 0 };
const BOOST_WEIGHT: Record<BoostKind, number> = { city: 6, tonight: 5, weekend: 5, local: 4 };

export function visibilityRank(p: Profile, evening = false) {
  const boost = activeBoost(p);
  const plan = activePlan(p);
  const planWeight = evening && plan === 'tonight' ? PLAN_WEIGHT.black : PLAN_WEIGHT[plan];
  return boost ? BOOST_WEIGHT[boost] : planWeight;
}

export async function fetchMembership() {
  const [{ data, error }, free] = await Promise.all([supabase.rpc('get_my_membership'), supabase.rpc('has_free_proposal')]);
  if (error) throw error;
  if (free.error) throw free.error;
  const rows = data as Omit<Membership, 'free_proposal'>[] | null;
  if (!rows?.length) throw new Error('No membership data');
  return { ...rows[0], free_proposal: free.data === true };
}

export async function fetchSubscriptionDetails() {
  const { data, error } = await supabase
    .from('stripe_user_subscriptions')
    .select('subscription_status, cancel_at_period_end, current_period_end, payment_method_brand, payment_method_last4')
    .maybeSingle();
  if (error) throw error;
  return data as {
    subscription_status: string | null;
    cancel_at_period_end: boolean | null;
    current_period_end: number | null;
    payment_method_brand: string | null;
    payment_method_last4: string | null;
  } | null;
}

export async function fetchLockedProposals() {
  const { data, error } = await supabase.rpc('get_locked_proposals');
  if (error) throw error;
  const row = (data as { total: number; special: number }[] | null)?.[0];
  return { total: row?.total ?? 0, special: row?.special ?? 0 };
}

export async function activateIncludedBoost() {
  const { error } = await supabase.rpc('activate_boost');
  if (error) throw error;
}

async function callFunction(name: string, body: object) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json: json as { url?: string; error?: string } };
}

export class AlreadySubscribedError extends Error {}

export async function startCheckout(product: Product | 'vip_submission', extra: Record<string, string> = {}) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const { ok, status, json } = await callFunction('stripe-checkout', {
    ...extra,
    product,
    success_url: `${base}?checkout=success&product=${product}`,
    cancel_url: `${base}?checkout=cancelled`,
  });
  if (status === 409) throw new AlreadySubscribedError();
  if (!ok || typeof json.url !== 'string') throw new Error(json.error ?? 'Checkout failed');
  window.location.assign(json.url);
}

export async function manageSubscription(action: 'change' | 'cancel' | 'resume', plan?: PaidPlan) {
  const { ok, json } = await callFunction('manage-subscription', { action, product: plan ? `plan_${plan}` : undefined });
  if (!ok) throw new Error(json.error ?? 'Could not update your plan');
}
