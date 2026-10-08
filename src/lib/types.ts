export type Level = 'casual' | 'date' | 'special';
export type Category = 'food' | 'coffee' | 'active' | 'culture' | 'cinema' | 'nightlife' | 'music' | 'travel';
export type BoostPerk = 'dinner_credit' | 'flowers' | 'vip_seats' | 'ride_credit' | 'dessert';
export type ProposalStatus = 'pending' | 'open' | 'accepted' | 'declined' | 'countered' | 'cancelled' | 'closed';
export type Plan = 'free' | 'plus' | 'tonight' | 'black';
export type BoostKind = 'local' | 'tonight' | 'weekend' | 'city';
export type ProposalTier = 'normal' | 'priority' | 'super' | 'vip';

export interface Profile {
  id: string;
  display_name: string;
  age: number;
  city: string;
  bio: string;
  photo_url: string;
  interests: string[];
  free_tonight_until: string | null;
  tonight_category: Category | null;
  verified: boolean;
  plan: Plan;
  plan_until: string | null;
  boost_until: string | null;
  boost_kind: BoostKind | null;
  created_at: string;
}

export interface Experience {
  id: string;
  title: string;
  category: Category;
  venue: string;
  city: string;
  description: string;
  image_url: string;
  default_time: string;
  price_hint: string;
  level: Level;
  tags: string[];
}

export interface Proposal {
  id: string;
  sender_id: string;
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
  tier: ProposalTier;
  status: ProposalStatus;
  parent_id: string | null;
  expires_at: string;
  reservation_status: 'none' | 'booked';
  cancelled_by: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface ProposalWithPeople extends Proposal {
  sender: Profile;
  recipient: Profile | null;
  experience: Experience | null;
}

export interface Application {
  id: string;
  proposal_id: string;
  applicant_id: string;
  message: string;
  status: 'pending' | 'chosen' | 'not_chosen';
  created_at: string;
}

export interface Message {
  id: string;
  proposal_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Story {
  id: string;
  user_id: string;
  body: string;
  category: Category;
  expires_at: string;
  created_at: string;
}

export interface Reliability {
  attended: number;
  no_shows: number;
  late_cancellations: number;
  verified: boolean;
  score: number;
}

export interface Membership {
  plan: Plan;
  plan_until: string | null;
  boost_until: string | null;
  boost_kind: BoostKind | null;
  priority: number;
  super: number;
  vip: number;
  boosts: number;
  sent_today: number;
  daily_limit: number | null;
  admin_access: boolean;
}

export interface ComposerPreset {
  recipient?: Profile | null;
  experience?: Experience | null;
  category?: Category;
  open?: boolean;
  tonight?: boolean;
}
