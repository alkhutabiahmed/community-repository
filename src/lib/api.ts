import { supabase } from './supabase';
import type { Application, BoostPerk, Category, Experience, Level, Message, Profile, ProposalTier, ProposalWithPeople, Reliability, Story } from './types';

const PROPOSAL_SELECT =
  '*, sender:profiles!proposals_sender_id_fkey(*), recipient:profiles!proposals_recipient_id_fkey(*), experience:experiences(*)';

function check<T>(data: T | null, error: unknown): T {
  if (error) throw error;
  if (data === null) throw new Error('Empty response');
  return data;
}

export async function fetchOtherProfiles(myId: string) {
  const { data, error } = await supabase.from('profiles').select('*').neq('id', myId).order('created_at', { ascending: false });
  return check(data, error) as Profile[];
}

export async function fetchExperiences() {
  const { data, error } = await supabase.from('experiences').select('*').order('created_at');
  return check(data, error) as Experience[];
}

export async function fetchMyProposals(myId: string) {
  const { data, error } = await supabase
    .from('proposals')
    .select(PROPOSAL_SELECT)
    .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
    .order('created_at', { ascending: false });
  return check(data, error) as ProposalWithPeople[];
}

export async function fetchOpenProposals(myId: string) {
  const { data, error } = await supabase
    .from('proposals')
    .select(PROPOSAL_SELECT)
    .eq('status', 'open')
    .is('recipient_id', null)
    .neq('sender_id', myId)
    .gt('expires_at', new Date().toISOString())
    .order('proposed_for');
  return check(data, error) as ProposalWithPeople[];
}

export interface NewProposal {
  recipient_id: string | null;
  experience_id: string | null;
  title: string;
  category: Category;
  level: Level;
  proposed_for: string;
  location: string;
  message: string;
  boost_amount: number;
  boost_perk: BoostPerk | null;
  expires_at: string;
  tier: ProposalTier;
}

export async function createProposal(p: NewProposal) {
  const { error } = await supabase.from('proposals').insert(p);
  if (error) throw error;
}

export async function respondProposal(id: string, action: 'accept' | 'decline') {
  const { error } = await supabase.rpc('respond_proposal', { p_id: id, p_action: action });
  if (error) throw error;
}

export async function counterProposal(id: string, title: string, proposedFor: string, location: string, message: string) {
  const { error } = await supabase.rpc('counter_proposal', {
    p_id: id, p_title: title, p_proposed_for: proposedFor, p_location: location, p_message: message,
  });
  if (error) throw error;
}

export async function cancelProposal(id: string) {
  const { error } = await supabase.rpc('cancel_proposal', { p_id: id });
  if (error) throw error;
}

export async function markBooked(id: string) {
  const { error } = await supabase.rpc('mark_booked', { p_id: id });
  if (error) throw error;
}

export type ApplicationWithApplicant = Application & { applicant: Profile };

export async function fetchApplications(proposalId: string) {
  const { data, error } = await supabase
    .from('proposal_applications')
    .select('*, applicant:profiles(*)')
    .eq('proposal_id', proposalId)
    .order('created_at');
  return check(data, error) as ApplicationWithApplicant[];
}

export async function fetchMyApplications(myId: string) {
  const { data, error } = await supabase.from('proposal_applications').select('*').eq('applicant_id', myId);
  return check(data, error) as Application[];
}

export async function applyToProposal(proposalId: string, message: string) {
  const { error } = await supabase.from('proposal_applications').insert({ proposal_id: proposalId, message });
  if (error) throw error;
}

export async function chooseApplicant(applicationId: string) {
  const { error } = await supabase.rpc('choose_applicant', { p_application_id: applicationId });
  if (error) throw error;
}

export async function fetchMessages(proposalId: string) {
  const { data, error } = await supabase.from('messages').select('*').eq('proposal_id', proposalId).order('created_at');
  return check(data, error) as Message[];
}

export async function fetchLatestMessages(proposalIds: string[]) {
  if (!proposalIds.length) return [] as Message[];
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .in('proposal_id', proposalIds)
    .order('created_at', { ascending: false })
    .limit(200);
  return check(data, error) as Message[];
}

export async function sendMessage(proposalId: string, body: string) {
  const { error } = await supabase.from('messages').insert({ proposal_id: proposalId, body });
  if (error) throw error;
}

export async function fetchStories() {
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  return check(data, error) as Story[];
}

export async function postStory(body: string, category: Category) {
  const { error } = await supabase.from('stories').insert({ body, category });
  if (error) throw error;
}

export async function updateStory(id: string, body: string, category: Category) {
  const { error } = await supabase.from('stories').update({ body, category }).eq('id', id);
  if (error) throw error;
}

export async function deleteStory(id: string) {
  const { error } = await supabase.from('stories').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchWallet() {
  const { data, error } = await supabase.from('wallet_items').select('id, experience_id').order('created_at', { ascending: false });
  return check(data, error) as { id: string; experience_id: string }[];
}

export async function saveToWallet(experienceId: string) {
  const { error } = await supabase.from('wallet_items').insert({ experience_id: experienceId });
  if (error) throw error;
}

export async function removeFromWallet(experienceId: string) {
  const { error } = await supabase.from('wallet_items').delete().eq('experience_id', experienceId);
  if (error) throw error;
}

export async function fetchMyFeedbackIds() {
  const { data, error } = await supabase.from('feedback').select('proposal_id');
  return new Set((check(data, error) as { proposal_id: string }[]).map((f) => f.proposal_id));
}

export async function submitFeedback(f: { proposal_id: string; subject_id: string; met: boolean; see_again: boolean | null; matched_profile: boolean | null }) {
  const { error } = await supabase.from('feedback').insert(f);
  if (error) throw error;
}

export async function fetchReliability(userId: string) {
  const { data, error } = await supabase.rpc('get_reliability', { p_user: userId });
  const rows = check(data, error) as Reliability[];
  if (!rows.length) throw new Error('No reliability data');
  return rows[0];
}

export async function setTonight(freeUntil: string | null, category: Category | null) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('profiles')
    .update({ free_tonight_until: freeUntil, tonight_category: category })
    .eq('id', u.user.id);
  if (error) throw error;
}
