import { supabase } from './supabase';
import type { Level, ProposalStatus } from './types';

export interface AdminOverview {
  members: number;
  verified: number;
  new_this_week: number;
  free_tonight: number;
  proposals: number;
  pending: number;
  open: number;
  accepted: number;
  declined: number;
  cancelled: number;
  messages: number;
  no_shows: number;
}

export interface AdminMember {
  id: string;
  display_name: string;
  email: string;
  age: number;
  city: string;
  photo_url: string;
  verified: boolean;
  is_admin: boolean;
  created_at: string;
  sent: number;
  received: number;
  accepted: number;
  no_shows: number;
}

export interface AdminProposal {
  id: string;
  title: string;
  level: Level;
  status: ProposalStatus;
  proposed_for: string;
  expires_at: string;
  created_at: string;
  boost_amount: number;
  location: string;
  sender_name: string;
  recipient_name: string | null;
}

export interface AdminUser {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export async function checkIsAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

export async function fetchAdminOverview() {
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('Unexpected overview response');
  return data as AdminOverview;
}

export async function fetchAdminMembers(search: string) {
  const { data, error } = await supabase.rpc('admin_members', { p_search: search });
  if (error) throw error;
  return (data ?? []) as AdminMember[];
}

export async function setMemberVerified(userId: string, verified: boolean) {
  const { error } = await supabase.rpc('admin_set_verified', { p_user: userId, p_verified: verified });
  if (error) throw error;
}

export async function fetchAdminProposals(status: ProposalStatus | 'all') {
  const { data, error } = await supabase.rpc('admin_proposals', { p_status: status });
  if (error) throw error;
  return (data ?? []) as AdminProposal[];
}

export async function adminCancelProposal(id: string) {
  const { error } = await supabase.rpc('admin_cancel_proposal', { p_id: id });
  if (error) throw error;
}

export async function fetchAdmins() {
  const { data, error } = await supabase.rpc('admin_list_admins');
  if (error) throw error;
  return (data ?? []) as AdminUser[];
}

export async function setAdminAccess(email: string, grant: boolean) {
  const { error } = await supabase.rpc('admin_set_admin', { p_email: email, p_grant: grant });
  if (error) throw error;
}
