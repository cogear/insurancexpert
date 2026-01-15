/**
 * Stripe Integration
 *
 * Handles subscription management, billing, and webhooks.
 */

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

// Lazy initialization to avoid build-time errors
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return _stripe;
}

// For backwards compatibility - use getStripe() instead
export const stripe = {
  get customers() { return getStripe().customers; },
  get subscriptions() { return getStripe().subscriptions; },
  get checkout() { return getStripe().checkout; },
  get billingPortal() { return getStripe().billingPortal; },
  get webhooks() { return getStripe().webhooks; },
};

/**
 * Create a Stripe customer for an organization
 */
export async function createStripeCustomer(
  organizationId: string,
  email: string,
  name: string
): Promise<string> {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      organizationId,
    },
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession(
  organizationId: string,
  planId: string,
  billingCycle: "monthly" | "annual",
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { users: { where: { role: "owner" }, take: 1 } },
  });

  if (!organization) {
    throw new Error("Organization not found");
  }

  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    throw new Error("Plan not found");
  }

  // Get or create Stripe customer
  let customerId = organization.stripeCustomerId;
  if (!customerId) {
    const owner = organization.users[0];
    customerId = await createStripeCustomer(
      organizationId,
      owner?.email || "",
      organization.name
    );
  }

  // Get the appropriate price ID
  const priceId =
    billingCycle === "annual" ? plan.stripePriceIdAnnual : plan.stripePriceIdMonthly;

  if (!priceId) {
    throw new Error("No Stripe price configured for this plan");
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      organizationId,
      planId,
      billingCycle,
    },
    subscription_data: {
      metadata: {
        organizationId,
        planId,
      },
    },
  });

  return session.url!;
}

/**
 * Create a billing portal session
 */
export async function createBillingPortalSession(
  organizationId: string,
  returnUrl: string
): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization?.stripeCustomerId) {
    throw new Error("No Stripe customer found");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: organization.stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(
  organizationId: string,
  immediately: boolean = false
): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
  });

  if (!subscription?.stripeSubId) {
    throw new Error("No subscription found");
  }

  if (immediately) {
    await stripe.subscriptions.cancel(subscription.stripeSubId);
  } else {
    await stripe.subscriptions.update(subscription.stripeSubId, {
      cancel_at_period_end: true,
    });
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case "invoice.payment_succeeded":
      await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;

    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

/**
 * Handle checkout completion
 */
async function handleCheckoutComplete(
  session: Stripe.Checkout.Session
): Promise<void> {
  const organizationId = session.metadata?.organizationId;
  const planId = session.metadata?.planId;
  const billingCycle = session.metadata?.billingCycle as "monthly" | "annual";

  if (!organizationId || !planId) {
    console.error("Missing metadata in checkout session");
    return;
  }

  // Subscription will be created/updated via subscription.created webhook
  console.log(`Checkout completed for org ${organizationId}`);
}

/**
 * Handle subscription creation/update
 */
async function handleSubscriptionUpdate(
  subscription: Stripe.Subscription
): Promise<void> {
  const organizationId = subscription.metadata?.organizationId;
  const planId = subscription.metadata?.planId;

  if (!organizationId) {
    console.error("Missing organizationId in subscription metadata");
    return;
  }

  const status = mapStripeStatus(subscription.status);

  await prisma.subscription.upsert({
    where: { organizationId },
    create: {
      organizationId,
      planId: planId || "starter",
      status,
      stripeSubId: subscription.id,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      billingCycle:
        subscription.items.data[0]?.price?.recurring?.interval === "year"
          ? "annual"
          : "monthly",
    },
    update: {
      status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });

  // Update organization tier
  if (planId) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (plan) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { subscriptionTier: plan.name },
      });
    }
  }
}

/**
 * Handle subscription deletion
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const organizationId = subscription.metadata?.organizationId;

  if (!organizationId) {
    return;
  }

  await prisma.subscription.update({
    where: { organizationId },
    data: { status: "canceled" },
  });

  // Downgrade to starter tier
  await prisma.organization.update({
    where: { id: organizationId },
    data: { subscriptionTier: "starter" },
  });
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  // Reset monthly job counter on successful payment
  const subscription = await stripe.subscriptions.retrieve(
    invoice.subscription as string
  );

  const organizationId = subscription.metadata?.organizationId;
  if (organizationId) {
    await prisma.subscription.update({
      where: { organizationId },
      data: {
        status: "active",
        jobsUsedThisMonth: 0,
      },
    });
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(
    invoice.subscription as string
  );

  const organizationId = subscription.metadata?.organizationId;
  if (organizationId) {
    await prisma.subscription.update({
      where: { organizationId },
      data: { status: "past_due" },
    });
  }
}

/**
 * Map Stripe subscription status to our status
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "trialing":
      return "trialing";
    case "unpaid":
      return "past_due";
    default:
      return "active";
  }
}

/**
 * Check if organization can create more jobs this month
 */
export async function canCreateJob(organizationId: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    include: { plan: true },
  });

  if (!subscription) {
    // Default to starter limits
    return { allowed: true, remaining: 10, limit: 10 };
  }

  const limit = subscription.plan.jobsPerMonth;

  // Unlimited
  if (limit === -1) {
    return { allowed: true, remaining: -1, limit: -1 };
  }

  const remaining = limit - subscription.jobsUsedThisMonth;

  return {
    allowed: remaining > 0,
    remaining,
    limit,
  };
}

/**
 * Increment job usage count
 */
export async function incrementJobUsage(organizationId: string): Promise<void> {
  await prisma.subscription.update({
    where: { organizationId },
    data: {
      jobsUsedThisMonth: { increment: 1 },
    },
  });
}
