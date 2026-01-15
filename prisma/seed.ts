import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create dev organization and user for development
  console.log("Creating dev organization and user...");

  const devOrg = await prisma.organization.upsert({
    where: { id: "dev-org-id" },
    update: {},
    create: {
      id: "dev-org-id",
      name: "Dev Organization",
      slug: "dev-org",
      subscriptionTier: "enterprise",
    },
  });
  console.log(`  Created/updated org: ${devOrg.name}`);

  const devUser = await prisma.user.upsert({
    where: { id: "dev-user-id" },
    update: {},
    create: {
      id: "dev-user-id",
      email: "dev@insurancexpert.local",
      name: "Dev User",
      organizationId: devOrg.id,
      role: "owner",
    },
  });
  console.log(`  Created/updated user: ${devUser.email}`);

  console.log("Seeding subscription plans...");

  // Create subscription plans
  const plans = [
    {
      name: "starter",
      displayName: "Starter",
      monthlyPrice: 49.00,
      annualPrice: 490.00, // ~17% discount
      jobsPerMonth: 10,
      maxUsers: 1,
      features: ["Basic document analysis", "Standard support", "10 jobs/month"],
    },
    {
      name: "professional",
      displayName: "Professional",
      monthlyPrice: 149.00,
      annualPrice: 1490.00, // ~17% discount
      jobsPerMonth: 50,
      maxUsers: 5,
      features: [
        "Full document analysis",
        "Aerial report integration",
        "API access",
        "Priority support",
        "50 jobs/month",
        "5 team members",
      ],
    },
    {
      name: "enterprise",
      displayName: "Enterprise",
      monthlyPrice: 399.00,
      annualPrice: 3990.00, // ~17% discount
      jobsPerMonth: -1, // Unlimited
      maxUsers: -1, // Unlimited
      features: [
        "Everything in Professional",
        "Unlimited jobs",
        "Unlimited team members",
        "Custom integrations",
        "Dedicated support",
        "Admin dashboard",
      ],
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {
        displayName: plan.displayName,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        jobsPerMonth: plan.jobsPerMonth,
        maxUsers: plan.maxUsers,
        features: plan.features,
      },
      create: {
        name: plan.name,
        displayName: plan.displayName,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        jobsPerMonth: plan.jobsPerMonth,
        maxUsers: plan.maxUsers,
        features: plan.features,
      },
    });
    console.log(`  Created/updated plan: ${plan.displayName}`);
  }

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
