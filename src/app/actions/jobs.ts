"use server";

import { getOrganizationId } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { generateJobNumber } from "@/lib/utils";
import { z } from "zod";

const createJobSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  streetAddress: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required"),
  zipCode: z.string().min(5, "Zip code is required"),
  insuranceCompany: z.string().optional(),
  policyNumber: z.string().optional(),
  claimNumber: z.string().optional(),
  dateOfLoss: z.string().optional(),
});

/**
 * Create a new job
 */
export async function createJob(data: z.infer<typeof createJobSchema>) {
  const organizationId = await getOrganizationId();
  const validated = createJobSchema.parse(data);
  const jobNumber = generateJobNumber();

  const job = await prisma.job.create({
    data: {
      organizationId,
      jobNumber,
      status: "draft",
      customerName: validated.customerName,
      customerPhone: validated.customerPhone || null,
      customerEmail: validated.customerEmail || null,
      streetAddress: validated.streetAddress,
      city: validated.city,
      state: validated.state,
      zipCode: validated.zipCode,
      insuranceCompany: validated.insuranceCompany || null,
      policyNumber: validated.policyNumber || null,
      claimNumber: validated.claimNumber || null,
      dateOfLoss: validated.dateOfLoss ? new Date(validated.dateOfLoss) : null,
    },
  });

  revalidatePath("/jobs");

  return job;
}

/**
 * Update a job
 */
export async function updateJob(
  jobId: string,
  data: Partial<z.infer<typeof createJobSchema>>
) {
  const organizationId = await getOrganizationId();

  // Verify job belongs to organization
  const existingJob = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId,
    },
  });

  if (!existingJob) {
    throw new Error("Job not found");
  }

  const updateData: Record<string, unknown> = {};

  if (data.customerName !== undefined) updateData.customerName = data.customerName;
  if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone || null;
  if (data.customerEmail !== undefined) updateData.customerEmail = data.customerEmail || null;
  if (data.streetAddress !== undefined) updateData.streetAddress = data.streetAddress;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.state !== undefined) updateData.state = data.state;
  if (data.zipCode !== undefined) updateData.zipCode = data.zipCode;
  if (data.insuranceCompany !== undefined) updateData.insuranceCompany = data.insuranceCompany || null;
  if (data.policyNumber !== undefined) updateData.policyNumber = data.policyNumber || null;
  if (data.claimNumber !== undefined) updateData.claimNumber = data.claimNumber || null;
  if (data.dateOfLoss !== undefined) {
    updateData.dateOfLoss = data.dateOfLoss ? new Date(data.dateOfLoss) : null;
  }

  const job = await prisma.job.update({
    where: { id: jobId },
    data: updateData,
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");

  return job;
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string) {
  const organizationId = await getOrganizationId();

  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId,
    },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
      },
      insuranceAnalyses: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      aerialReports: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      lineItems: true,
      estimates: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!job) {
    throw new Error("Job not found");
  }

  return job;
}

/**
 * Get all jobs for the organization
 */
export async function getJobs(options?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const organizationId = await getOrganizationId();

  const where: Record<string, unknown> = {
    organizationId,
  };

  if (options?.status) {
    where.status = options.status;
  }

  if (options?.search) {
    where.OR = [
      { customerName: { contains: options.search, mode: "insensitive" } },
      { jobNumber: { contains: options.search, mode: "insensitive" } },
      { streetAddress: { contains: options.search, mode: "insensitive" } },
      { claimNumber: { contains: options.search, mode: "insensitive" } },
    ];
  }

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit || 50,
      skip: options?.offset || 0,
      include: {
        _count: {
          select: { documents: true },
        },
      },
    }),
    prisma.job.count({ where }),
  ]);

  return { jobs, total };
}

/**
 * Update job status
 */
export async function updateJobStatus(jobId: string, status: string) {
  const organizationId = await getOrganizationId();

  const validStatuses = ["draft", "analyzing", "ready", "in_progress", "completed"];
  if (!validStatuses.includes(status)) {
    throw new Error("Invalid status");
  }

  const existingJob = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId,
    },
  });

  if (!existingJob) {
    throw new Error("Job not found");
  }

  const job = await prisma.job.update({
    where: { id: jobId },
    data: { status },
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");

  return job;
}

/**
 * Delete a job
 */
export async function deleteJob(jobId: string) {
  const organizationId = await getOrganizationId();

  const existingJob = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId,
    },
  });

  if (!existingJob) {
    throw new Error("Job not found");
  }

  await prisma.job.delete({
    where: { id: jobId },
  });

  revalidatePath("/jobs");

  return { success: true };
}

/**
 * Get job statistics for dashboard
 */
export async function getJobStats() {
  const organizationId = await getOrganizationId();

  const [total, draft, analyzing, ready, inProgress, completed] = await Promise.all([
    prisma.job.count({
      where: { organizationId },
    }),
    prisma.job.count({
      where: { organizationId, status: "draft" },
    }),
    prisma.job.count({
      where: { organizationId, status: "analyzing" },
    }),
    prisma.job.count({
      where: { organizationId, status: "ready" },
    }),
    prisma.job.count({
      where: { organizationId, status: "in_progress" },
    }),
    prisma.job.count({
      where: { organizationId, status: "completed" },
    }),
  ]);

  // Get total RCV this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyJobs = await prisma.job.findMany({
    where: {
      organizationId,
      createdAt: { gte: startOfMonth },
    },
    select: { totalRCV: true, estimatedProfit: true },
  });

  const monthlyRCV = monthlyJobs.reduce(
    (sum, job) => sum + (Number(job.totalRCV) || 0),
    0
  );
  const monthlyProfit = monthlyJobs.reduce(
    (sum, job) => sum + (Number(job.estimatedProfit) || 0),
    0
  );

  return {
    total,
    byStatus: {
      draft,
      analyzing,
      ready,
      inProgress,
      completed,
    },
    monthlyRCV,
    monthlyProfit,
    monthlyJobCount: monthlyJobs.length,
  };
}

/**
 * Get line items for a job
 */
export async function getJobLineItems(jobId: string) {
  const organizationId = await getOrganizationId();

  // Verify job belongs to organization
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      organizationId,
    },
  });

  if (!job) {
    throw new Error("Job not found");
  }

  return prisma.lineItem.findMany({
    where: { jobId },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
}
