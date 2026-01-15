/**
 * Insurance Expert Agent Configuration
 *
 * This agent specializes in analyzing roofing insurance documents
 * with particular focus on accurate extraction of pipe jacks and ventilation.
 */

export const insuranceExpertAgentConfig = {
  name: "insurance-expert-agent",
  description:
    "Expert agent for roofing insurance document analysis and estimation",
  modelId: "anthropic.claude-sonnet-4-20250514",

  systemPrompt: `You are an expert insurance document analyst specializing in roofing claims.
Your primary responsibilities:

1. DOCUMENT ANALYSIS
   - Parse insurance scope documents from all major carriers
   - Extract line items with descriptions, quantities, units, and pricing
   - Identify document type: insurance scope, supplement, aerial report

2. ACCURATE EXTRACTION (Critical Focus Areas)

   Pipe Jacks - MUST identify each type:
   - pf3n1: 3-in-1 universal pipe flashing
   - pf14: 1-4" diameter pipe jacks
   - pf14_4, pf14_5, pf14_6, pf14_8: Size-specific pipe jacks
   - pfSplitBoot: Split boot pipe flashing
   - pfLead: Lead pipe flashing
   - pfGooseNeckSmall/Large: Goose neck vents

   Ventilation - MUST identify each type:
   - vsTurtleVent: Box/turtle vents (EA)
   - vsRidgeVent: Ridge vent (LF)
   - vsIntakeVent: Intake vents (LF or EA)
   - vsOffRidgeVent: Off-ridge vents (EA)
   - vsBroan4/6: Broan exhaust vents
   - hvacVent: HVAC penetrations

3. AERIAL REPORT PARSING
   - Extract measurements from EagleView, RoofScope, Hover reports
   - Parse total area, slopes, ridge, hip, valley lengths
   - Identify building structures (main, garage, shed)

4. PRICING & ESTIMATION
   - Match extracted items to product catalog
   - Calculate material costs using supplier pricing
   - Generate consumer estimates and profitability analysis

5. VALIDATION
   - Cross-check quantities against roof measurements
   - Flag unusual values with low confidence scores
   - Ensure all pipe jacks/vents are accounted for

OUTPUT FORMAT: Always return structured JSON with confidence scores.`,

  tools: [
    "document-classifier",
    "ocr-processor",
    "pipe-jack-extractor",
    "vent-extractor",
    "material-extractor",
    "aerial-report-parser",
    "pricing-calculator",
    "profitability-analyzer",
  ],

  memoryConfig: {
    sessionMemory: true,
    longTermMemory: true,
    entityMemory: true,
  },

  guardrails: {
    maxTokens: 8192,
    temperature: 0.1, // Low for accuracy
    topP: 0.9,
  },
};

/**
 * Tool definitions for AgentCore Gateway
 */
export const agentTools = {
  documentClassifier: {
    name: "document-classifier",
    description:
      "Classifies documents into types: insurance_scope, aerial_report, supplement, photo",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        text: { type: "string" },
      },
      required: ["text"],
    },
  },

  pipeJackExtractor: {
    name: "pipe-jack-extractor",
    description: `Specialized extractor for pipe jack/flashing quantities.
Types: pf3n1, pf14, pf14_4, pf14_5, pf14_6, pf14_8, pfSplitBoot, pfLead, pfGooseNeckSmall, pfGooseNeckLarge`,
    inputSchema: {
      type: "object",
      properties: {
        ocrText: { type: "string" },
        roofArea: { type: "number" },
      },
      required: ["ocrText"],
    },
  },

  ventExtractor: {
    name: "vent-extractor",
    description: `Specialized extractor for ventilation components.
Types: vsTurtleVent, vsRidgeVent, vsIntakeVent, vsOffRidgeVent, vsBroan4, vsBroan6, hvacVent`,
    inputSchema: {
      type: "object",
      properties: {
        ocrText: { type: "string" },
        ridgeLength: { type: "number" },
        roofArea: { type: "number" },
      },
      required: ["ocrText"],
    },
  },

  aerialReportParser: {
    name: "aerial-report-parser",
    description:
      "Parses aerial roof reports from EagleView, RoofScope, Hover",
    inputSchema: {
      type: "object",
      properties: {
        ocrText: { type: "string" },
        provider: {
          type: "string",
          enum: ["eagleview", "roofscope", "hover", "other"],
        },
      },
      required: ["ocrText"],
    },
  },

  pricingCalculator: {
    name: "pricing-calculator",
    description: "Calculates material costs using supplier pricing",
    inputSchema: {
      type: "object",
      properties: {
        materials: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string" },
              subcategory: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
            },
          },
        },
        preferredSupplier: {
          type: "string",
          enum: ["beacon", "srs", "abc", "gulf_eagle", "lowest"],
        },
      },
      required: ["materials"],
    },
  },
};
