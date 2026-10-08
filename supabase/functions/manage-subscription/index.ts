import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { appInfo: { name: 'Bolt Integration', version: '1.0.0' } });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const PLANS: Record<string, { name: string; amount: number }> = {
  plan_plus: { name: 'PROPOSAL+', amount: 1499 },
  plan_tonight: { name: 'PROPOSAL TONIGHT', amount: 4999 },
  plan_black: { name: 'PROPOSAL BLACK', amount: 7999 },
};

async function planPrice(key: string) {
  const found = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  try {
    const created = await stripe.prices.create({
      currency: 'eur', unit_amount: PLANS[key].amount, lookup_key: key, recurring: { interval: 'month' },
      product_data: { name: PLANS[key].name, metadata: { key } },
    });
    return created.id;
  } catch (error) {
    const retry = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    if (retry.data[0]) return retry.data[0].id;
    throw error;
  }
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: 'Failed to authenticate user' }, 401);

    const { action, product } = await req.json();
    if (!['change', 'cancel', 'resume'].includes(action)) return json({ error: 'Unknown action' }, 400);
    if (action === 'change' && !(typeof product === 'string' && product in PLANS)) return json({ error: 'Unknown plan' }, 400);

    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers').select('customer_id').eq('user_id', user.id).is('deleted_at', null).maybeSingle();
    if (customerError) throw customerError;
    if (!customer) return json({ error: 'No subscription found' }, 404);

    const subs = await stripe.subscriptions.list({ customer: customer.customer_id, status: 'all', limit: 5 });
    const sub = subs.data.find((s) => ['active', 'trialing', 'past_due'].includes(s.status));
    if (!sub) return json({ error: 'No subscription found' }, 404);

    if (action === 'cancel') {
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    } else if (action === 'resume') {
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
    } else {
      const priceId = await planPrice(product);
      const item = sub.items.data[0];
      if (item.price.id === priceId) return json({ ok: true });
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: 'always_invoice',
        cancel_at_period_end: false,
      });
    }
    return json({ ok: true });
  } catch (error) {
    console.error('manage-subscription failed', error);
    return json({ error: 'Could not update your plan' }, 500);
  }
});
