import { createClient } from '@supabase/supabase-js';

// Read before the client strips the recovery tokens from the URL.
export const openedFromRecoveryLink =
  typeof window !== 'undefined' && window.location.hash.includes('type=recovery');

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
