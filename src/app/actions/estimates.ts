"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { PricingCalculator } from "@/lib/pricing/calculator";

const pricingCalculator = new PricingCalculator();

/**
 * Generate an estimate for a job
 */
export async function generateEstimate(
  jobId: string,
  type: "consumer" | "contractor" | "material_only",
  options?: {
    preferredSupplier?: string;
    laborMarkup?: number;
    materialMarkup?: number;
    overhead?: number;
  }
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  // Get job with line items
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId: session.user.organizationId,
    },
    include: {
      lineItems: true,
      insuranceAnalyses: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!job) {
    throw new Error("Job not found");
  }

  // Get supplier configurations
  const supplierConfigs = await prisma.supplierConfiguration.findMany({
    where: {
      organizationId: session.user.organizationId,
      isEnabled: true,
    },
  });

  // Calculate pricing
  const pricingResult = await pricingCalculator.calculateEstimate(
    job.lineItems,
    session.user.organizationId,
    {
      preferredSupplier: options?.preferredSupplier,
      laborMarkup: options?.laborMarkup ?? 0.35, // 35% default
      materialMarkup: options?.materialMarkup ?? 0.25, // 25% default
      overhead: options?.overhead ?? 0.1, // 10% default
    }
  );

  // Calculate totals
  const materialCost = pricingResult.totalMaterialCost;
  const laborCost = pricingResult.totalLaborCost;
  const overheadAmount = (materialCost + laborCost) * (options?.overhead ?? 0.1);
  const profit = pricingResult.profit;
  const totalPrice = materialCost + laborCost + overheadAmount + profit;

  // Create estimate
  const estimate = await prisma.estimate.create({
    data: {
      jobId,
      type,
      status: "draft",
      materialCost,
      laborCost,
      overhead: overheadAmount,
      profit,
      totalPrice,
      lineItems: pricingResult.items as object,
      supplierUsed: pricingResult.primarySupplier,
      priceDate: new Date(),
    },
  });

  // Update job with estimated profit
  await prisma.job.update({
    where: { id: jobId },
    data: {
      estimatedProfit: profit,
      profitMargin: totalPrice > 0 ? (profit / totalPrice) * 100 : 0,
    },
  });

  revalidatePath(`/jobs/${jobId}`);

  return estimate;
}

/**
 * Get estimates for a job
 */
export async function getJobEstimates(jobId: string) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  // Verify job belongs to organization
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId: session.user.organizationId,
    },
  });

  if (!job) {
    throw new Error("Job not found");
  }

  return prisma.estimate.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a single estimate
 */
export async function getEstimate(estimateId: string) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId },
    include: {
      job: {
        select: {
          id: true,
          organizationId: true,
          jobNumber: true,
          customerName: true,
          streetAddress: true,
          city: true,
          state: true,
          zipCode: true,
        },
      },
    },
  });

  if (!estimate || estimate.job.organizationId !== session.user.organizationId) {
    throw new Error("Estimate not found");
  }

  return estimate;
}

/**
 * Update estimate status
 */
export async function updateEstimateStatus(
  estimateId: string,
  status: "draft" | "sent" | "accepted" | "declined"
) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId },
    include: { job: { select: { organizationId: true } } },
  });

  if (!estimate || estimate.job.organizationId !== session.user.organizationId) {
    throw new Error("Estimate not found");
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "sent") {
    updateData.sentAt = new Date();
  }

  const updated = await prisma.estimate.update({
    where: { id: estimateId },
    data: updateData,
  });

  revalidatePath(`/jobs/${estimate.jobId}`);

  return updated;
}

/**
 * Delete an estimate
 */
export async function deleteEstimate(estimateId: string) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId },
    include: { job: { select: { organizationId: true, id: true } } },
  });

  if (!estimate || estimate.job.organizationId !== session.user.organizationId) {
    throw new Error("Estimate not found");
  }

  await prisma.estimate.delete({
    where: { id: estimateId },
  });

  revalidatePath(`/jobs/${estimate.job.id}`);

  return { success: true };
}

/**
 * Get profitability report for a job
 */
export async function getProfitabilityReport(jobId: string) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId: session.user.organizationId,
    },
    include: {
      lineItems: true,
      estimates: {
        where: { type: "contractor" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      insuranceAnalyses: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!job) {
    throw new Error("Job not found");
  }

  const estimate = job.estimates[0];
  const analysis = job.insuranceAnalyses[0];

  // Calculate profitability metrics
  const insuranceRCV = Number(job.totalRCV) || 0;
  const insuranceACV = Number(job.totalACV) || 0;
  const deductible = Number(job.deductible) || 0;

  const materialCost = estimate ? Number(estimate.materialCost) : 0;
  const laborCost = estimate ? Number(estimate.laborCost) : 0;
  const overhead = estimate ? Number(estimate.overhead) : 0;
  const totalCost = materialCost + laborCost + overhead;

  const grossProfit = insuranceRCV - totalCost;
  const netProfit = insuranceRCV - totalCost - deductible;
  const profitMargin = insuranceRCV > 0 ? (grossProfit / insuranceRCV) * 100 : 0;

  // Breakdown by category
  const categoryBreakdown = job.lineItems.reduce(
    (acc, item) => {
      const category = item.category;
      if (!acc[category]) {
        acc[category] = { rcv: 0, cost: 0, profit: 0 };
      }
      acc[category].rcv += Number(item.rcv) || 0;
      acc[category].cost += Number(item.actualCost) || 0;
      acc[category].profit = acc[category].rcv - acc[category].cost;
      return acc;
    },
    {} as Record<string, { rcv: number; cost: number; profit: number }>
  );

  return {
    jobId,
    jobNumber: job.jobNumber,
    insuranceRCV,
    insuranceACV,
    deductible,
    costs: {
      material: materialCost,
      labor: laborCost,
      overhead,
      total: totalCost,
    },
    profit: {
      gross: grossProfit,
      net: netProfit,
      margin: profitMargin,
    },
    categoryBreakdown,
    analysis: analysis
      ? {
          confidence: (analysis.confidenceScores as Record<string, number>)?.overall,
          pipeJackCount: (analysis.pipeJacks as Record<string, number>)?.totalCount,
          ventCount:
            (analysis.ventilation as Record<string, number>)?.totalExhaust +
            (analysis.ventilation as Record<string, number>)?.totalIntake,
        }
      : null,
  };
}
