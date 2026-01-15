"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { uploadToS3, generateDocumentKey, getSignedDownloadUrl } from "@/lib/s3/client";
import { documentProcessor } from "@/lib/agentcore/pipeline/document-processor";

/**
 * Upload a document for processing
 */
export async function uploadDocument(formData: FormData) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  const file = formData.get("file") as File;
  const jobId = formData.get("jobId") as string;
  const documentType = (formData.get("documentType") as string) || "pending";

  if (!file || !jobId) {
    throw new Error("Missing required fields");
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

  // Convert file to buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Generate S3 key and upload
  const s3Key = generateDocumentKey(
    session.user.organizationId,
    jobId,
    documentType,
    file.name
  );

  const uploadResult = await uploadToS3(buffer, s3Key, file.type);

  // Create document record
  const document = await prisma.document.create({
    data: {
      organizationId: session.user.organizationId,
      jobId,
      name: file.name,
      type: documentType,
      s3Key: uploadResult.key,
      s3Bucket: uploadResult.bucket,
      mimeType: file.type,
      fileSize: buffer.length,
      processingStatus: "pending",
    },
  });

  // Trigger async processing
  processDocumentAsync(document.id);

  revalidatePath(`/jobs/${jobId}`);

  return document;
}

/**
 * Process document asynchronously
 */
async function processDocumentAsync(documentId: string) {
  try {
    await documentProcessor.processDocument(documentId);
  } catch (error) {
    console.error("Document processing failed:", error);
  }
}

/**
 * Get document by ID
 */
export async function getDocument(documentId: string) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: session.user.organizationId,
    },
    include: {
      job: true,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  return document;
}

/**
 * Get documents for a job
 */
export async function getJobDocuments(jobId: string) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  return prisma.document.findMany({
    where: {
      jobId,
      organizationId: session.user.organizationId,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get signed download URL for a document
 */
export async function getDocumentDownloadUrl(documentId: string) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: session.user.organizationId,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  return getSignedDownloadUrl(document.s3Key);
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: string) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: session.user.organizationId,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  await prisma.document.delete({
    where: { id: documentId },
  });

  revalidatePath(`/jobs/${document.jobId}`);

  return { success: true };
}

/**
 * Reprocess a document
 */
export async function reprocessDocument(documentId: string) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    throw new Error("Unauthorized");
  }

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: session.user.organizationId,
    },
  });

  if (!document) {
    throw new Error("Document not found");
  }

  // Reset processing status
  await prisma.document.update({
    where: { id: documentId },
    data: {
      processingStatus: "pending",
      processingError: null,
      extractedData: undefined,
    },
  });

  // Trigger reprocessing
  processDocumentAsync(documentId);

  revalidatePath(`/jobs/${document.jobId}`);

  return { success: true };
}

/**
 * Get insurance analysis for a job
 */
export async function getInsuranceAnalysis(jobId: string) {
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

  return prisma.insuranceAnalysis.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get aerial reports for a job
 */
export async function getAerialReports(jobId: string) {
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

  return prisma.aerialReport.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
  });
}
