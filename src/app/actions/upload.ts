"use server";

import { getOrganizationId } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { generateJobNumber } from "@/lib/utils";
import { uploadToS3, generateDocumentKey } from "@/lib/s3/client";
import { documentProcessor } from "@/lib/agentcore/pipeline/document-processor";

/**
 * Create a job directly from an uploaded document
 * The document is processed and job details are extracted automatically
 */
export async function createJobFromDocument(formData: FormData) {
  const organizationId = await getOrganizationId();

  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("No file provided");
  }

  // Generate job number first
  const jobNumber = generateJobNumber();

  // Create a placeholder job with minimal info
  // We'll update it after document processing
  const job = await prisma.job.create({
    data: {
      organizationId,
      jobNumber,
      status: "analyzing",
      customerName: "Processing...",
      streetAddress: "Processing...",
      city: "Processing",
      state: "XX",
      zipCode: "00000",
    },
  });

  try {
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate S3 key and upload
    const s3Key = generateDocumentKey(
      organizationId,
      job.id,
      "insurance_scope",
      file.name
    );

    const uploadResult = await uploadToS3(buffer, s3Key, file.type);

    // Create document record
    const document = await prisma.document.create({
      data: {
        organizationId,
        jobId: job.id,
        name: file.name,
        type: "insurance_scope",
        s3Key: uploadResult.key,
        s3Bucket: uploadResult.bucket,
        mimeType: file.type,
        fileSize: buffer.length,
        processingStatus: "processing",
      },
    });

    // Process the document and extract data
    const extractedData = await documentProcessor.processDocument(document.id);

    // Update job with extracted data if available
    if (extractedData) {
      const headerData = extractedData.headerData as Record<string, string> | null;

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "ready",
          customerName: headerData?.customerName || "Unknown Customer",
          customerPhone: headerData?.customerPhone || null,
          customerEmail: headerData?.customerEmail || null,
          streetAddress: headerData?.streetAddress || "Address not extracted",
          city: headerData?.city || "Unknown",
          state: headerData?.state || "XX",
          zipCode: headerData?.zipCode || "00000",
          insuranceCompany: headerData?.insuranceCompany || null,
          policyNumber: headerData?.policyNumber || null,
          claimNumber: headerData?.claimNumber || null,
          dateOfLoss: headerData?.dateOfLoss ? new Date(headerData.dateOfLoss) : null,
          totalRCV: extractedData.financialSummary
            ? (extractedData.financialSummary as Record<string, number>).totalRCV
            : null,
          totalACV: extractedData.financialSummary
            ? (extractedData.financialSummary as Record<string, number>).totalACV
            : null,
          deductible: extractedData.financialSummary
            ? (extractedData.financialSummary as Record<string, number>).deductible
            : null,
        },
      });
    } else {
      // Mark as needing manual review
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "draft",
          customerName: "Manual Entry Required",
        },
      });
    }

    revalidatePath("/jobs");
    revalidatePath("/dashboard");

    return {
      jobId: job.id,
      documentId: document.id,
      success: true,
    };
  } catch (error) {
    // If processing fails, keep the job but mark it for manual entry
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "draft",
        customerName: "Processing Failed - Manual Entry Required",
      },
    });

    console.error("Document processing error:", error);

    return {
      jobId: job.id,
      success: false,
      error: error instanceof Error ? error.message : "Processing failed",
    };
  }
}
