import { Coffee, Dumbbell, Film, Martini, Music, Palette, Plane, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { BoostPerk, Category, Level } from './types';

export const CATEGORIES: Record<Category, { label: string; icon: LucideIcon; interests: string[] }> = {
  food: { label: 'Food', icon: UtensilsCrossed, interests: ['Sushi', 'Italian food', 'Brunch', 'Fine dining', 'Street food'] },
  coffee: { label: 'Coffee & walks', icon: Coffee, interests: ['Coffee', 'Long walks', 'Books'] },
  active: { label: 'Active', icon: Dumbbell, interests: ['Bowling', 'Hiking', 'Tennis', 'Yoga'] },
  culture: { label: 'Culture', icon: Palette, interests: ['Art', 'Museums', 'Painting', 'Theatre'] },
  cinema: { label: 'Cinema', icon: Film, interests: ['Movies', 'Series'] },
  nightlife: { label: 'Drinks', icon: Martini, interests: ['Cocktails', 'Wine', 'Dancing'] },
  music: { label: 'Music', icon: Music, interests: ['Live music', 'Jazz', 'Techno', 'Indie'] },
  travel: { label: 'Travel', icon: Plane, interests: ['City trips', 'Beaches', 'Road trips'] },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export function categoryOfInterest(interest: string): Category | null {
  return CATEGORY_KEYS.find((c) => CATEGORIES[c].interests.includes(interest)) ?? null;
}

export const LEVELS: Record<Level, { label: string; hint: string; classes: string; dot: string }> = {
  casual: { label: 'Casual', hint: 'Low-key, no pressure', classes: 'bg-teal-50 text-teal-800 border-teal-200', dot: 'bg-teal-500' },
  date: { label: 'Date', hint: 'Romantic intention', classes: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-500' },
  special: { label: 'Special', hint: 'A memorable experience', classes: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
};

export const BOOST_AMOUNTS = [25, 50, 100] as const;

export const BOOST_PERKS: Record<BoostPerk, string> = {
  dinner_credit: 'Dinner credit',
  flowers: 'Flowers on arrival',
  vip_seats: 'VIP seats',
  ride_credit: 'Ride credit home',
  dessert: 'Dessert & bubbles',
};
