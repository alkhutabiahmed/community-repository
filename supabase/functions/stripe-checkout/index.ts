import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'Bolt Integration',
    version: '1.0.0',
  },
});

type CatalogItem = { name: string; description: string; amount: number; mode: 'payment' | 'subscription' };

// Prices live only on the server; the browser sends a product key, never an amount.
const CATALOG: Record<string, CatalogItem> = {
  plan_plus: { name: 'PROPOSAL+', description: 'More proposals and better dating tools', amount: 1499, mode: 'subscription' },
  plan_tonight: { name: 'PROPOSAL TONIGHT', description: 'Evening priority, 15 Priority Proposals and 4 boosts every month', amount: 4999, mode: 'subscription' },
  plan_black: { name: 'PROPOSAL BLACK', description: 'Maximum visibility, VIP Proposals and premium placement', amount: 7999, mode: 'subscription' },
  boost_2h: { name: '2-hour Boost', description: 'Top local visibility for 2 hours', amount: 399, mode: 'payment' },
  tonight_boost: { name: 'Tonight Boost', description: 'Top visibility tonight until 03:00', amount: 799, mode: 'payment' },
  weekend_boost: { name: 'Weekend Boost', description: 'Top visibility for 48 hours', amount: 1299, mode: 'payment' },
  city_boost: { name: 'City Takeover', description: 'Be the most visible profile in your city for 6 hours', amount: 1499, mode: 'payment' },
  priority_proposal: { name: 'Priority Proposal', description: 'Your proposal appears above normal proposals', amount: 299, mode: 'payment' },
  super_proposal: { name: 'Super Proposal', description: 'A highlighted proposal that stands out', amount: 799, mode: 'payment' },
  vip_proposal: { name: 'VIP Proposal', description: 'The premium invitation format, first in their inbox', amount: 1499, mode: 'payment' },
};

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];

function corsResponse(body: string | object | null, status = 200) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  };

  if (status === 204) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

async function priceFor(key: string) {
  const item = CATALOG[key];
  const existing = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  try {
    const price = await stripe.prices.create({
      currency: 'eur',
      unit_amount: item.amount,
      lookup_key: key,
      ...(item.mode === 'subscription' ? { recurring: { interval: 'month' as const } } : {}),
      product_data: { name: item.name, metadata: { key } },
    });
    return price.id;
  } catch (error) {
    const retry = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
    if (retry.data[0]) return retry.data[0].id;
    throw error;
  }
}

function sameOrigin(url: unknown, origin: string | null) {
  if (typeof url !== 'string' || !origin) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return corsResponse({}, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    const { product, success_url, cancel_url, vip_proposal_id } = await req.json();
    const isVip = product === 'vip_submission';
    const item = isVip
      ? { name: 'Exclusive Proposal', description: '', amount: 0, mode: 'payment' as const }
      : typeof product === 'string' ? CATALOG[product] : undefined;
    if (!item || (isVip && typeof vip_proposal_id !== 'string')) {
      return corsResponse({ error: 'Unknown product' }, 400);
    }
    const origin = req.headers.get('Origin');
    if (!sameOrigin(success_url, origin) || !sameOrigin(cancel_url, origin)) {
      return corsResponse({ error: 'Invalid return address' }, 400);
    }
    const mode = item.mode;

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: getUserError,
    } = await supabase.auth.getUser(token);

    if (getUserError || !user) {
      return corsResponse({ error: 'Failed to authenticate user' }, 401);
    }

    let vipLine: Stripe.Checkout.SessionCreateParams.LineItem | null = null;
    if (isVip) {
      const { data: vp, error: vpError } = await supabase
        .from('vip_proposals')
        .select('id, sender_id, status, amount_cents, vip:profiles!vip_proposals_vip_id_fkey(display_name)')
        .eq('id', vip_proposal_id)
        .maybeSingle();
      if (vpError) {
        console.error('Failed to load exclusive proposal', vpError);
        return corsResponse({ error: 'Checkout could not be started' }, 500);
      }
      if (!vp || vp.sender_id !== user.id || vp.status !== 'awaiting_payment') {
        return corsResponse({ error: 'Proposal not available' }, 400);
      }
      const vipName = (vp.vip as { display_name?: string } | null)?.display_name ?? 'a VIP';
      vipLine = {
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: vp.amount_cents,
          product_data: {
            name: `Exclusive Proposal to ${vipName}`,
            description: 'Pays to submit your proposal. A reply is not guaranteed; if it is declined or unanswered within 7 days, you get it back as PROPOSAL credit.',
          },
        },
      };
    }

    const { data: customer, error: getCustomerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (getCustomerError) {
      console.error('Failed to fetch customer information from the database', getCustomerError);
      return corsResponse({ error: 'Failed to fetch customer information' }, 500);
    }

    let customerId;

    if (!customer || !customer.customer_id) {
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user.id,
        },
      });

      console.log(`Created new Stripe customer ${newCustomer.id} for user ${user.id}`);

      const { error: createCustomerError } = await supabase.from('stripe_customers').insert({
        user_id: user.id,
        customer_id: newCustomer.id,
      });

      if (createCustomerError) {
        console.error('Failed to save customer information in the database', createCustomerError);

        try {
          await stripe.customers.del(newCustomer.id);
          await supabase.from('stripe_subscriptions').delete().eq('customer_id', newCustomer.id);
        } catch (deleteError) {
          console.error('Failed to clean up after customer mapping error:', deleteError);
        }

        return corsResponse({ error: 'Failed to create customer mapping' }, 500);
      }

      if (mode === 'subscription') {
        const { error: createSubscriptionError } = await supabase.from('stripe_subscriptions').insert({
          customer_id: newCustomer.id,
          status: 'not_started',
        });

        if (createSubscriptionError) {
          console.error('Failed to save subscription in the database', createSubscriptionError);

          try {
            await stripe.customers.del(newCustomer.id);
          } catch (deleteError) {
            console.error('Failed to delete Stripe customer after subscription creation error:', deleteError);
          }

          return corsResponse({ error: 'Unable to save the subscription in the database' }, 500);
        }
      }

      customerId = newCustomer.id;

      console.log(`Successfully set up new customer ${customerId} with subscription record`);
    } else {
      customerId = customer.customer_id;

      if (mode === 'subscription') {
        const { data: subscription, error: getSubscriptionError } = await supabase
          .from('stripe_subscriptions')
          .select('status')
          .eq('customer_id', customerId)
          .maybeSingle();

        if (getSubscriptionError) {
          console.error('Failed to fetch subscription information from the database', getSubscriptionError);
          return corsResponse({ error: 'Failed to fetch subscription information' }, 500);
        }

        if (subscription && ACTIVE_STATUSES.includes(subscription.status)) {
          return corsResponse({ error: 'already_subscribed' }, 409);
        }

        if (!subscription) {
          const { error: createSubscriptionError } = await supabase.from('stripe_subscriptions').insert({
            customer_id: customerId,
            status: 'not_started',
          });

          if (createSubscriptionError) {
            console.error('Failed to create subscription record for existing customer', createSubscriptionError);
            return corsResponse({ error: 'Failed to create subscription record for existing customer' }, 500);
          }
        }
      }
    }

    const lineItem = vipLine ?? { price: await priceFor(product), quantity: 1 };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [lineItem],
      mode,
      metadata: isVip ? { product, vip_proposal_id } : { product },
      success_url,
      cancel_url,
    });

    console.log(`Created checkout session ${session.id} for customer ${customerId}`);

    return corsResponse({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error(`Checkout error: ${error.message}`);
    return corsResponse({ error: 'Checkout could not be started' }, 500);
  }
});
