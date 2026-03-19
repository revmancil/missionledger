import { getUncachableStripeClient } from "../lib/stripeClient";

const PLANS = [
  {
    name: "Starter",
    description: "Perfect for small nonprofits and churches just getting started.",
    metadata: {
      features: "1 bank account|Up to 500 transactions/month|Standard financial reports|Email support|Plaid bank sync",
      order: "1",
    },
    monthlyAmount: 1900,
    yearlyAmount: 19000,
  },
  {
    name: "Professional",
    description: "Full-featured accounting for growing nonprofits.",
    metadata: {
      features: "5 bank accounts|Unlimited transactions|Advanced reports & analytics|Priority support|Plaid bank sync|Multi-user access|Period close wizard",
      order: "2",
      featured: "true",
    },
    monthlyAmount: 4900,
    yearlyAmount: 49000,
  },
  {
    name: "Enterprise",
    description: "Unlimited scale for large organizations and networks.",
    metadata: {
      features: "Unlimited bank accounts|Unlimited transactions|Custom reports|Dedicated support|Plaid bank sync|Unlimited users|Multi-org management|API access",
      order: "3",
    },
    monthlyAmount: 9900,
    yearlyAmount: 99000,
  },
];

async function seedStripeProducts() {
  console.log("Creating MissionLedger subscription plans in Stripe...");
  const stripe = await getUncachableStripeClient();

  for (const plan of PLANS) {
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });

    if (existing.data.length > 0) {
      console.log(`  ✓ ${plan.name} already exists (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: plan.metadata,
    });
    console.log(`  Created product: ${product.name} (${product.id})`);

    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthlyAmount,
      currency: "usd",
      recurring: { interval: "month" },
    });
    console.log(`    Monthly: $${plan.monthlyAmount / 100}/mo (${monthly.id})`);

    const yearly = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.yearlyAmount,
      currency: "usd",
      recurring: { interval: "year" },
    });
    console.log(`    Yearly:  $${plan.yearlyAmount / 100}/yr (${yearly.id})`);
  }

  console.log("Done! Webhooks will sync products to the database automatically.");
}

seedStripeProducts().catch((err) => {
  console.error("Error creating Stripe products:", err.message);
  process.exit(1);
});
