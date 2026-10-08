import { CATEGORIES, categoryOfInterest } from './catalog';
import type { Category, Experience, Profile } from './types';

function shared(a: Profile, b: Profile) {
  const set = new Set(a.interests);
  return b.interests.filter((i) => set.has(i));
}

export function generalScore(a: Profile, b: Profile) {
  const common = shared(a, b);
  const sharedCats = new Set(common.map(categoryOfInterest).filter(Boolean));
  const base = Math.min(a.interests.length, b.interests.length) || 1;
  const raw = 48 + (common.length / base) * 34 + sharedCats.size * 4;
  return Math.max(35, Math.min(97, Math.round(raw)));
}

export interface ProposalScore {
  score: number;
  general: number;
  reasons: string[];
}

export function proposalScore(a: Profile, b: Profile, category: Category, tags: string[] = []): ProposalScore {
  const general = generalScore(a, b);
  const catInterests = new Set([...CATEGORIES[category].interests, ...tags]);
  const aLikes = a.interests.filter((i) => catInterests.has(i));
  const bLikes = b.interests.filter((i) => catInterests.has(i));
  const both = aLikes.filter((i) => bLikes.includes(i));
  const tagBoth = tags.filter((t) => a.interests.includes(t) && b.interests.includes(t)).length;

  let specific = 0.45 * general + 12;
  specific += Math.min(both.length, 2) * 14;
  specific += tagBoth * 6;
  if (!both.length && aLikes.length && bLikes.length) specific += 8;
  if (!bLikes.length) specific -= 10;

  const reasons: string[] = [];
  if (both.length) reasons.push(`You both like ${both.slice(0, 2).join(' and ')}`);
  else if (bLikes.length) reasons.push(`${b.display_name} is into ${bLikes[0]}`);
  else reasons.push(`${CATEGORIES[category].label} isn't on ${b.display_name}'s list yet`);
  const otherShared = shared(a, b).filter((i) => !both.includes(i));
  if (otherShared.length) reasons.push(`Also shared: ${otherShared.slice(0, 2).join(', ')}`);

  return { score: Math.max(30, Math.min(99, Math.round(specific))), general, reasons };
}

export interface Suggestion {
  person: Profile;
  experience: Experience;
  text: string;
  score: number;
}

export function suggestFor(me: Profile, people: Profile[], experiences: Experience[], limit = 3): Suggestion[] {
  const out: Suggestion[] = [];
  for (const person of people) {
    const common = shared(me, person);
    let best: { exp: Experience; overlap: string[] } | null = null;
    for (const exp of experiences) {
      const overlap = exp.tags.filter((t) => common.includes(t));
      if (overlap.length && (!best || overlap.length > best.overlap.length)) best = { exp, overlap };
    }
    if (!best) continue;
    const s = proposalScore(me, person, best.exp.category, best.exp.tags);
    out.push({
      person,
      experience: best.exp,
      score: s.score,
      text: `You both like ${best.overlap[0].toLowerCase()}. Invite ${person.display_name} to ${best.exp.venue}, ${best.exp.default_time.toLowerCase()}?`,
    });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}
