/**
 * Document Processing Pipeline
 *
 * Orchestrates the multi-stage document processing workflow:
 * Upload → Classify → OCR → Extract → Validate → Store
 */

import { prisma } from "@/lib/prisma";
import { downloadFromS3 } from "@/lib/s3/client";
import { agentCore } from "@/lib/agentcore/client";
import { extractPipeJacks, type PipeJackResult } from "@/lib/agentcore/tools/pipe-jack-extractor";
import { extractVents, type VentResult } from "@/lib/agentcore/tools/vent-extractor";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface ProcessingResult {
  success: boolean;
  documentId: string;
  documentType?: string;
  extraction?: InsuranceExtraction | AerialExtraction;
  validation?: ValidationResult;
  error?: string;
}

export interface InsuranceExtraction {
  headerData: {
    customerName?: string;
    insuranceCompany?: string;
    policyNumber?: string;
    claimNumber?: string;
    dateOfLoss?: string;
    adjusterName?: string;
  };
  roofMeasurements: {
    totalArea?: number;
    perimeter?: number;
    ridge?: number;
    hip?: number;
    valley?: number;
    eave?: number;
    rake?: number;
  };
  pipeJacks: PipeJackResult;
  ventilation: VentResult;
  materials: MaterialItem[];
  financialSummary: {
    totalRCV: number;
    totalACV: number;
    roofRCV?: number;
    roofACV?: number;
    gutterRCV?: number;
    gutterACV?: number;
    deductible?: number;
  };
  lineItems: InsuranceLineItem[];
  confidenceScores: {
    header: number;
    pipeJacks: number;
    ventilation: number;
    materials: number;
    financial: number;
    overall: number;
  };
}

export interface AerialExtraction {
  provider: string;
  reportId?: string;
  totalArea: number;
  totalPerimeter: number;
  ridgeLength: number;
  hipLength: number;
  valleyLength: number;
  eaveLength: number;
  rakeLength: number;
  slopes: { pitch: string; area: number; percentage: number }[];
  structures: { name: string; area: number }[];
  facetCount: number;
  roofComplexity: string;
}

export interface MaterialItem {
  category: string;
  subcategory?: string;
  description: string;
  quantity: number;
  unit: string;
}

export interface InsuranceLineItem {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  rcv: number;
  acv?: number;
  depreciation?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export class DocumentProcessor {
  /**
   * Process a document through the full pipeline
   */
  async processDocument(documentId: string): Promise<ProcessingResult> {
    // Fetch document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { job: true },
    });

    if (!document) {
      return { success: false, documentId, error: "Document not found" };
    }

    // Update status to processing
    await prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: "processing" },
    });

    try {
      // Step 1: Download and OCR
      const fileBuffer = await downloadFromS3(document.s3Key);
      const ocrResult = await this.performOCR(fileBuffer, document.mimeType || "application/pdf");

      // Store OCR result
      await prisma.document.update({
        where: { id: documentId },
        data: {
          ocrText: ocrResult.text,
          ocrProvider: ocrResult.provider,
          ocrConfidence: ocrResult.confidence,
        },
      });

      // Step 2: Classify document
      const classification = await this.classifyDocument(ocrResult.text);

      await prisma.document.update({
        where: { id: documentId },
        data: { type: classification.type, subType: classification.subType },
      });

      // Step 3: Extract based on document type
      let extraction: InsuranceExtraction | AerialExtraction;
      let validation: ValidationResult;

      if (classification.type === "insurance_scope" || classification.type === "supplement") {
        extraction = await this.extractInsuranceData(ocrResult.text, document);
        validation = await this.validateInsuranceExtraction(extraction as InsuranceExtraction);

        // Store insurance analysis
        await this.storeInsuranceAnalysis(document.jobId, documentId, extraction as InsuranceExtraction);
      } else if (classification.type === "aerial_report") {
        extraction = await this.extractAerialData(ocrResult.text, classification.subType);
        validation = await this.validateAerialExtraction(extraction as AerialExtraction);

        // Store aerial report
        await this.storeAerialReport(document.jobId, documentId, extraction as AerialExtraction);
      } else {
        extraction = {} as InsuranceExtraction;
        validation = { isValid: true, errors: [], warnings: [], suggestions: [] };
      }

      // Step 4: Update document with results
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: "completed",
          processedAt: new Date(),
          extractedData: extraction as object,
          validationErrors: validation.errors.length > 0 ? (validation as object) : undefined,
        },
      });

      return {
        success: true,
        documentId,
        documentType: classification.type,
        extraction,
        validation,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: "failed",
          processingError: errorMessage,
        },
      });

      return { success: false, documentId, error: errorMessage };
    }
  }

  /**
   * Perform OCR on document
   */
  private async performOCR(
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<{ text: string; provider: string; confidence: number }> {
    // Use Mistral OCR for PDFs
    if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
      return await this.mistralOCR(fileBuffer, mimeType);
    }

    // For text files, just read directly
    return {
      text: fileBuffer.toString("utf-8"),
      provider: "direct",
      confidence: 1.0,
    };
  }

  /**
   * Mistral OCR implementation
   */
  private async mistralOCR(
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<{ text: string; provider: string; confidence: number }> {
    const base64Content = fileBuffer.toString("base64");

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "pixtral-large-latest",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all text from this document. Preserve the structure and formatting as much as possible. Include all numbers, measurements, and line items.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Content}`,
                },
              },
            ],
          },
        ],
        max_tokens: 16384,
      }),
    });

    if (!response.ok) {
      throw new Error(`Mistral OCR failed: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    return {
      text,
      provider: "mistral",
      confidence: 0.9,
    };
  }

  /**
   * Classify document type
   */
  private async classifyDocument(
    text: string
  ): Promise<{ type: string; subType?: string }> {
    const systemPrompt = `Classify this roofing document into one of these types:
- insurance_scope: Insurance claim scope documents with line items and pricing
- supplement: Supplemental insurance claims or additional scope
- aerial_report: Aerial roof measurement reports (EagleView, RoofScope, Hover)
- photo: Roof photos or damage documentation
- other: Other document types

Also identify the sub-type if applicable:
- For insurance_scope: state_farm, allstate, farmers, usaa, travelers, nationwide, liberty_mutual, progressive, etc.
- For aerial_report: eagleview, roofscope, hover, gaf_quickmeasure, etc.

OUTPUT JSON ONLY:
{"type": "<type>", "subType": "<subtype or null>"}`;

    const command = new ConverseCommand({
      modelId: "anthropic.claude-3-haiku-20240307",
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: "user",
          content: [{ text: `Classify this document:\n\n${text.substring(0, 4000)}` }],
        },
      ],
      inferenceConfig: { maxTokens: 256, temperature: 0.1 },
    });

    const response = await bedrockClient.send(command);

    let content = "";
    if (response.output?.message?.content) {
      for (const block of response.output.message.content) {
        if ("text" in block && block.text) {
          content += block.text;
        }
      }
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { type: "other" };
  }

  /**
   * Extract insurance data using specialized extractors
   */
  private async extractInsuranceData(
    ocrText: string,
    document: { jobId: string }
  ): Promise<InsuranceExtraction> {
    // Extract in parallel for speed
    const [headerData, pipeJacks, vents, materialsAndFinancials] = await Promise.all([
      this.extractHeaderData(ocrText),
      extractPipeJacks(ocrText),
      extractVents(ocrText),
      this.extractMaterialsAndFinancials(ocrText),
    ]);

    const { materials, financialSummary, lineItems } = materialsAndFinancials;

    // Calculate overall confidence
    const overallConfidence =
      (headerData.confidence +
        pipeJacks.confidence +
        vents.confidence +
        financialSummary.confidence) /
      4;

    return {
      headerData: headerData.data,
      roofMeasurements: headerData.measurements,
      pipeJacks,
      ventilation: vents,
      materials,
      financialSummary: financialSummary.data,
      lineItems,
      confidenceScores: {
        header: headerData.confidence,
        pipeJacks: pipeJacks.confidence,
        ventilation: vents.confidence,
        materials: financialSummary.confidence,
        financial: financialSummary.confidence,
        overall: overallConfidence,
      },
    };
  }

  /**
   * Extract header data (customer, insurance info)
   */
  private async extractHeaderData(ocrText: string): Promise<{
    data: InsuranceExtraction["headerData"];
    measurements: InsuranceExtraction["roofMeasurements"];
    confidence: number;
  }> {
    const systemPrompt = `Extract header and measurement data from this insurance document.

OUTPUT JSON:
{
  "data": {
    "customerName": "<string or null>",
    "insuranceCompany": "<string or null>",
    "policyNumber": "<string or null>",
    "claimNumber": "<string or null>",
    "dateOfLoss": "<YYYY-MM-DD or null>",
    "adjusterName": "<string or null>"
  },
  "measurements": {
    "totalArea": <number in SQ or null>,
    "perimeter": <number in LF or null>,
    "ridge": <number in LF or null>,
    "hip": <number in LF or null>,
    "valley": <number in LF or null>,
    "eave": <number in LF or null>,
    "rake": <number in LF or null>
  },
  "confidence": <0-1>
}`;

    const command = new ConverseCommand({
      modelId: "anthropic.claude-sonnet-4-20250514",
      system: [{ text: systemPrompt }],
      messages: [
        { role: "user", content: [{ text: ocrText.substring(0, 8000) }] },
      ],
      inferenceConfig: { maxTokens: 1024, temperature: 0.1 },
    });

    const response = await bedrockClient.send(command);

    let content = "";
    if (response.output?.message?.content) {
      for (const block of response.output.message.content) {
        if ("text" in block && block.text) {
          content += block.text;
        }
      }
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { data: {}, measurements: {}, confidence: 0.5 };
  }

  /**
   * Extract materials and financial summary
   */
  private async extractMaterialsAndFinancials(ocrText: string): Promise<{
    materials: MaterialItem[];
    financialSummary: { data: InsuranceExtraction["financialSummary"]; confidence: number };
    lineItems: InsuranceLineItem[];
  }> {
    const systemPrompt = `Extract all materials and financial data from this insurance scope.

Categories: roof, gutters, siding, windows, interior, other

OUTPUT JSON:
{
  "materials": [
    {"category": "<string>", "subcategory": "<string>", "description": "<string>", "quantity": <number>, "unit": "<SQ|LF|EA|SF>"}
  ],
  "financialSummary": {
    "totalRCV": <number>,
    "totalACV": <number>,
    "roofRCV": <number or null>,
    "roofACV": <number or null>,
    "gutterRCV": <number or null>,
    "gutterACV": <number or null>,
    "deductible": <number or null>
  },
  "lineItems": [
    {"category": "<string>", "description": "<string>", "quantity": <number>, "unit": "<string>", "rcv": <number>, "acv": <number or null>, "depreciation": <number or null>}
  ],
  "confidence": <0-1>
}`;

    const command = new ConverseCommand({
      modelId: "anthropic.claude-sonnet-4-20250514",
      system: [{ text: systemPrompt }],
      messages: [{ role: "user", content: [{ text: ocrText }] }],
      inferenceConfig: { maxTokens: 4096, temperature: 0.1 },
    });

    const response = await bedrockClient.send(command);

    let content = "";
    if (response.output?.message?.content) {
      for (const block of response.output.message.content) {
        if ("text" in block && block.text) {
          content += block.text;
        }
      }
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        materials: parsed.materials || [],
        financialSummary: {
          data: parsed.financialSummary || { totalRCV: 0, totalACV: 0 },
          confidence: parsed.confidence || 0.8,
        },
        lineItems: parsed.lineItems || [],
      };
    }

    return {
      materials: [],
      financialSummary: { data: { totalRCV: 0, totalACV: 0 }, confidence: 0.5 },
      lineItems: [],
    };
  }

  /**
   * Extract aerial report data
   */
  private async extractAerialData(
    ocrText: string,
    provider?: string
  ): Promise<AerialExtraction> {
    const systemPrompt = `Extract roof measurement data from this aerial report.

OUTPUT JSON:
{
  "provider": "<eagleview|roofscope|hover|other>",
  "reportId": "<string or null>",
  "totalArea": <number in SF>,
  "totalPerimeter": <number in LF>,
  "ridgeLength": <number in LF>,
  "hipLength": <number in LF>,
  "valleyLength": <number in LF>,
  "eaveLength": <number in LF>,
  "rakeLength": <number in LF>,
  "slopes": [{"pitch": "<e.g. 6:12>", "area": <SF>, "percentage": <0-100>}],
  "structures": [{"name": "<main|garage|shed>", "area": <SF>}],
  "facetCount": <number>,
  "roofComplexity": "<simple|moderate|complex|very_complex>"
}`;

    const command = new ConverseCommand({
      modelId: "anthropic.claude-sonnet-4-20250514",
      system: [{ text: systemPrompt }],
      messages: [{ role: "user", content: [{ text: ocrText }] }],
      inferenceConfig: { maxTokens: 2048, temperature: 0.1 },
    });

    const response = await bedrockClient.send(command);

    let content = "";
    if (response.output?.message?.content) {
      for (const block of response.output.message.content) {
        if ("text" in block && block.text) {
          content += block.text;
        }
      }
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      provider: provider || "other",
      totalArea: 0,
      totalPerimeter: 0,
      ridgeLength: 0,
      hipLength: 0,
      valleyLength: 0,
      eaveLength: 0,
      rakeLength: 0,
      slopes: [],
      structures: [],
      facetCount: 0,
      roofComplexity: "unknown",
    };
  }

  /**
   * Validate insurance extraction
   */
  private async validateInsuranceExtraction(
    extraction: InsuranceExtraction
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check for missing critical data
    if (!extraction.financialSummary.totalRCV) {
      errors.push("Missing total RCV value");
    }

    // Add pipe jack validation notes
    if (extraction.pipeJacks.validationNotes.length > 0) {
      warnings.push(...extraction.pipeJacks.validationNotes);
    }

    // Add vent validation notes
    if (extraction.ventilation.validationNotes.length > 0) {
      warnings.push(...extraction.ventilation.validationNotes);
    }

    // Check confidence scores
    if (extraction.confidenceScores.overall < 0.7) {
      warnings.push(
        `Overall extraction confidence is low (${(extraction.confidenceScores.overall * 100).toFixed(0)}%)`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Validate aerial extraction
   */
  private async validateAerialExtraction(
    extraction: AerialExtraction
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!extraction.totalArea || extraction.totalArea === 0) {
      errors.push("Missing total roof area");
    }

    if (extraction.slopes.length === 0) {
      warnings.push("No slope information extracted");
    }

    return { isValid: errors.length === 0, errors, warnings, suggestions };
  }

  /**
   * Store insurance analysis in database
   */
  private async storeInsuranceAnalysis(
    jobId: string,
    documentId: string,
    extraction: InsuranceExtraction
  ): Promise<void> {
    await prisma.insuranceAnalysis.create({
      data: {
        jobId,
        documentId,
        analysisType: "full",
        headerData: extraction.headerData as object,
        roofMeasurements: extraction.roofMeasurements as object,
        pipeJacks: extraction.pipeJacks as object,
        ventilation: extraction.ventilation as object,
        materials: extraction.materials as object,
        financialSummary: extraction.financialSummary as object,
        confidenceScores: extraction.confidenceScores as object,
      },
    });

    // Update job with financial summary
    await prisma.job.update({
      where: { id: jobId },
      data: {
        totalRCV: extraction.financialSummary.totalRCV,
        totalACV: extraction.financialSummary.totalACV,
        deductible: extraction.financialSummary.deductible,
        insuranceCompany: extraction.headerData.insuranceCompany,
        policyNumber: extraction.headerData.policyNumber,
        claimNumber: extraction.headerData.claimNumber,
      },
    });

    // Create line items
    if (extraction.lineItems.length > 0) {
      await prisma.lineItem.createMany({
        data: extraction.lineItems.map((item) => ({
          jobId,
          source: "insurance",
          category: item.category,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          rcv: item.rcv,
          acv: item.acv,
          depreciation: item.depreciation,
        })),
      });
    }
  }

  /**
   * Store aerial report in database
   */
  private async storeAerialReport(
    jobId: string,
    documentId: string,
    extraction: AerialExtraction
  ): Promise<void> {
    await prisma.aerialReport.create({
      data: {
        jobId,
        documentId,
        provider: extraction.provider,
        reportId: extraction.reportId,
        totalArea: extraction.totalArea,
        totalPerimeter: extraction.totalPerimeter,
        ridgeLength: extraction.ridgeLength,
        hipLength: extraction.hipLength,
        valleyLength: extraction.valleyLength,
        eaveLength: extraction.eaveLength,
        rakeLength: extraction.rakeLength,
        slopes: extraction.slopes as object,
        structures: extraction.structures as object,
        facetCount: extraction.facetCount,
        roofComplexity: extraction.roofComplexity,
      },
    });
  }
}

// Export singleton instance
export const documentProcessor = new DocumentProcessor();
