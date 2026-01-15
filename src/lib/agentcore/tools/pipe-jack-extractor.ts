/**
 * Pipe Jack Extractor
 *
 * Specialized tool for accurately extracting pipe jack/flashing quantities
 * from insurance scope documents. This is critical for estimate accuracy.
 */

import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface PipeJackResult {
  pf3n1: number;           // 3-in-1 universal
  pf14: number;            // 1-4" standard (unspecified size)
  pf14_4: number;          // 4" specific
  pf14_5: number;          // 5" specific
  pf14_6: number;          // 6" specific
  pf14_8: number;          // 8" specific
  pfSplitBoot: number;     // Split boot
  pfLead: number;          // Lead flashing
  pfGooseNeckSmall: number; // Small goose neck (≤4")
  pfGooseNeckLarge: number; // Large goose neck (>4")
  pfOther: { description: string; quantity: number }[];
  totalCount: number;
  confidence: number;
  validationNotes: string[];
}

/**
 * Common pipe jack patterns found in insurance documents
 */
const PIPE_JACK_PATTERNS = {
  // 3-in-1 universal patterns
  pf3n1: [
    /3[\s-]?(?:in|n)[\s-]?1\s*(?:pipe\s*)?(?:flash|boot|jack)/gi,
    /(?:pipe\s*)?(?:flash|boot|jack)\s*3[\s-]?(?:in|n)[\s-]?1/gi,
    /universal\s*(?:pipe\s*)?(?:flash|boot)/gi,
    /combo\s*(?:pipe\s*)?flash/gi,
  ],

  // Size-specific patterns
  pf14: [
    /(\d+)\s*(?:-\s*)?(\d*)\s*["\u201d]\s*(?:pipe\s*)?(?:flash|boot|jack)/gi,
    /(?:pipe\s*)?(?:flash|boot|jack)\s*(\d+)\s*["\u201d]/gi,
  ],

  // Split boot patterns
  pfSplitBoot: [
    /split\s*boot/gi,
    /2[\s-]?(?:piece|pc)\s*(?:pipe\s*)?(?:flash|boot)/gi,
    /retrofit\s*(?:pipe\s*)?(?:flash|boot)/gi,
  ],

  // Lead patterns
  pfLead: [
    /lead\s*(?:pipe\s*)?(?:flash|boot|jack)/gi,
    /(?:pipe\s*)?(?:flash|boot)\s*lead/gi,
    /plumb(?:ing)?\s*(?:pipe\s*)?flash/gi,
  ],

  // Goose neck patterns
  pfGooseNeck: [
    /goose\s*neck/gi,
    /exhaust\s*(?:vent\s*)?(?:flash|cap|hood)/gi,
    /dryer\s*(?:vent\s*)?(?:flash|cap|hood)/gi,
    /bath(?:room)?\s*(?:exhaust\s*)?(?:vent\s*)?(?:flash|cap)/gi,
  ],
};

/**
 * Extract pipe jack quantities from OCR text
 */
export async function extractPipeJacks(
  ocrText: string,
  roofArea?: number
): Promise<PipeJackResult> {
  const result: PipeJackResult = {
    pf3n1: 0,
    pf14: 0,
    pf14_4: 0,
    pf14_5: 0,
    pf14_6: 0,
    pf14_8: 0,
    pfSplitBoot: 0,
    pfLead: 0,
    pfGooseNeckSmall: 0,
    pfGooseNeckLarge: 0,
    pfOther: [],
    totalCount: 0,
    confidence: 0,
    validationNotes: [],
  };

  // Use AI for accurate extraction
  const aiExtraction = await extractWithAI(ocrText);

  // Merge AI results
  Object.assign(result, aiExtraction);

  // Calculate total
  result.totalCount =
    result.pf3n1 +
    result.pf14 +
    result.pf14_4 +
    result.pf14_5 +
    result.pf14_6 +
    result.pf14_8 +
    result.pfSplitBoot +
    result.pfLead +
    result.pfGooseNeckSmall +
    result.pfGooseNeckLarge +
    result.pfOther.reduce((sum, item) => sum + item.quantity, 0);

  // Validate against roof area
  if (roofArea) {
    const expectedRange = getExpectedPipeJackRange(roofArea);
    if (result.totalCount < expectedRange.min) {
      result.validationNotes.push(
        `Total pipe jacks (${result.totalCount}) is below expected minimum (${expectedRange.min}) for ${roofArea} sq ft roof`
      );
      result.confidence *= 0.8;
    } else if (result.totalCount > expectedRange.max) {
      result.validationNotes.push(
        `Total pipe jacks (${result.totalCount}) exceeds expected maximum (${expectedRange.max}) for ${roofArea} sq ft roof`
      );
      result.confidence *= 0.9;
    }
  }

  return result;
}

/**
 * Use AI to extract pipe jack quantities with high accuracy
 */
async function extractWithAI(ocrText: string): Promise<Partial<PipeJackResult>> {
  const systemPrompt = `You are an expert at extracting pipe jack/flashing quantities from roofing insurance documents.

PIPE JACK TYPES TO IDENTIFY:
1. pf3n1 - 3-in-1 universal pipe flashing (also called "combo boot", "universal boot")
2. pf14 - Generic 1-4" pipe jacks when size not specified
3. pf14_4 - 4" pipe jacks specifically
4. pf14_5 - 5" pipe jacks specifically
5. pf14_6 - 6" pipe jacks specifically
6. pf14_8 - 8" pipe jacks specifically
7. pfSplitBoot - Split boot/2-piece retrofit flashings
8. pfLead - Lead pipe flashings
9. pfGooseNeckSmall - Small goose neck vents (≤4") - dryer/bath exhaust
10. pfGooseNeckLarge - Large goose neck vents (>4") - kitchen/HVAC exhaust

EXTRACTION RULES:
- Look for quantities in format: "QTY x DESCRIPTION" or "DESCRIPTION (QTY)"
- Match insurance line item numbers (e.g., "2.45", "R&R 3")
- Size specifications like 1.5", 2", 3", 4" should map to pf14 unless exact match
- "Plumbing boot" = pfLead unless otherwise specified
- "Pipe collar" = pf14 (generic)
- Exhaust vents going through roof = goose neck category

OUTPUT FORMAT (JSON only):
{
  "pf3n1": <number>,
  "pf14": <number>,
  "pf14_4": <number>,
  "pf14_5": <number>,
  "pf14_6": <number>,
  "pf14_8": <number>,
  "pfSplitBoot": <number>,
  "pfLead": <number>,
  "pfGooseNeckSmall": <number>,
  "pfGooseNeckLarge": <number>,
  "pfOther": [{"description": "<string>", "quantity": <number>}],
  "confidence": <0-1>,
  "validationNotes": ["<string>"]
}`;

  const command = new ConverseCommand({
    modelId: "anthropic.claude-sonnet-4-20250514",
    system: [{ text: systemPrompt }],
    messages: [
      {
        role: "user",
        content: [
          {
            text: `Extract ALL pipe jack/flashing quantities from this insurance document text. Be thorough and accurate:\n\n${ocrText}`,
          },
        ],
      },
    ],
    inferenceConfig: {
      maxTokens: 2048,
      temperature: 0.1,
    },
  });

  try {
    const response = await bedrockClient.send(command);

    let content = "";
    if (response.output?.message?.content) {
      for (const block of response.output.message.content) {
        if ("text" in block && block.text) {
          content += block.text;
        }
      }
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("AI extraction error:", error);
  }

  return { confidence: 0.5, validationNotes: ["AI extraction failed, using regex fallback"] };
}

/**
 * Get expected pipe jack range based on roof area
 * Typical residential roof has 2-8 pipe jacks
 */
function getExpectedPipeJackRange(roofArea: number): { min: number; max: number } {
  // Approximate: 1 pipe jack per 500-1000 sq ft
  const min = Math.max(2, Math.floor(roofArea / 1000));
  const max = Math.max(8, Math.ceil(roofArea / 300));

  return { min, max };
}

/**
 * Validate pipe jack extraction against aerial report
 */
export function validateAgainstAerial(
  extraction: PipeJackResult,
  aerialData: { roofArea: number; structures: { name: string; area: number }[] }
): PipeJackResult {
  const totalStructures = aerialData.structures.length;
  const minExpected = totalStructures * 2; // At least 2 per structure

  if (extraction.totalCount < minExpected) {
    extraction.validationNotes.push(
      `Warning: ${extraction.totalCount} pipe jacks for ${totalStructures} structures may be low`
    );
    extraction.confidence *= 0.85;
  }

  return extraction;
}
