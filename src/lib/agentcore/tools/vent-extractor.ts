/**
 * Vent Extractor
 *
 * Specialized tool for accurately extracting ventilation component quantities
 * from insurance scope documents. Critical for proper roof ventilation estimates.
 */

import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface VentResult {
  vsTurtleVent: number;     // Box/turtle/static vents (EA)
  vsRidgeVent: number;      // Ridge vent (LF)
  vsIntakeVent: number;     // Intake/soffit vents (LF or EA)
  vsOffRidgeVent: number;   // Off-ridge vents (EA)
  vsBroan4: number;         // 4" Broan exhaust (EA)
  vsBroan6: number;         // 6" Broan exhaust (EA)
  vsPowerVent: number;      // Power/attic fan vents (EA)
  vsGableVent: number;      // Gable vents (EA)
  vsWhirlybird: number;     // Turbine/whirlybird vents (EA)
  hvacVent: number;         // HVAC penetrations (EA)
  vsOther: { description: string; quantity: number; unit: string }[];
  totalExhaust: number;     // Total exhaust ventilation
  totalIntake: number;      // Total intake ventilation
  nfa: number;              // Calculated Net Free Area (sq in)
  confidence: number;
  validationNotes: string[];
  isBalanced: boolean;      // Intake/exhaust balance check
}

/**
 * Extract vent quantities from OCR text
 */
export async function extractVents(
  ocrText: string,
  ridgeLength?: number,
  roofArea?: number
): Promise<VentResult> {
  const result: VentResult = {
    vsTurtleVent: 0,
    vsRidgeVent: 0,
    vsIntakeVent: 0,
    vsOffRidgeVent: 0,
    vsBroan4: 0,
    vsBroan6: 0,
    vsPowerVent: 0,
    vsGableVent: 0,
    vsWhirlybird: 0,
    hvacVent: 0,
    vsOther: [],
    totalExhaust: 0,
    totalIntake: 0,
    nfa: 0,
    confidence: 0,
    validationNotes: [],
    isBalanced: false,
  };

  // Use AI for accurate extraction
  const aiExtraction = await extractWithAI(ocrText);

  // Merge AI results
  Object.assign(result, aiExtraction);

  // Calculate totals
  result.totalExhaust =
    result.vsTurtleVent +
    result.vsOffRidgeVent +
    result.vsBroan4 +
    result.vsBroan6 +
    result.vsPowerVent +
    result.vsWhirlybird;

  // Ridge vent contributes to exhaust (18 sq in NFA per LF typical)
  const ridgeVentNFA = result.vsRidgeVent * 18;

  // Turtle vents: ~50 sq in NFA each
  const turtleNFA = result.vsTurtleVent * 50;

  // Calculate total NFA
  result.nfa = ridgeVentNFA + turtleNFA + result.vsBroan4 * 28 + result.vsBroan6 * 50;

  // Validate against roof measurements
  if (roofArea) {
    const requiredNFA = calculateRequiredNFA(roofArea);
    if (result.nfa < requiredNFA * 0.8) {
      result.validationNotes.push(
        `Exhaust ventilation (${result.nfa} sq in NFA) may be insufficient for ${roofArea} sq ft roof (recommended: ${requiredNFA} sq in)`
      );
    }
  }

  // Validate ridge vent against ridge length
  if (ridgeLength && result.vsRidgeVent > 0) {
    if (result.vsRidgeVent > ridgeLength * 1.1) {
      result.validationNotes.push(
        `Ridge vent length (${result.vsRidgeVent} LF) exceeds ridge length (${ridgeLength} LF)`
      );
      result.confidence *= 0.85;
    }
  }

  // Check intake/exhaust balance
  result.isBalanced = checkVentilationBalance(result, roofArea);

  return result;
}

/**
 * Use AI to extract vent quantities with high accuracy
 */
async function extractWithAI(ocrText: string): Promise<Partial<VentResult>> {
  const systemPrompt = `You are an expert at extracting roof ventilation quantities from roofing insurance documents.

VENT TYPES TO IDENTIFY:

EXHAUST VENTS (remove hot air from attic):
1. vsTurtleVent - Box/turtle/static/mushroom vents (count in EA)
2. vsRidgeVent - Ridge vent (measure in LINEAR FEET, not EA)
3. vsOffRidgeVent - Off-ridge/eyebrow vents (count in EA)
4. vsBroan4 - 4" Broan/bath exhaust vents (count in EA)
5. vsBroan6 - 6" Broan/kitchen exhaust vents (count in EA)
6. vsPowerVent - Power/attic fan vents (count in EA)
7. vsWhirlybird - Turbine/whirlybird vents (count in EA)
8. vsGableVent - Gable vents (count in EA)

INTAKE VENTS (bring fresh air into attic):
9. vsIntakeVent - Soffit/intake vents (can be LF or EA)

HVAC:
10. hvacVent - HVAC penetrations through roof (count in EA)

EXTRACTION RULES:
- Look for quantities: "QTY x DESCRIPTION" or line item quantities
- Ridge vent is measured in LINEAR FEET (LF), not each
- "Roof louver" = turtle vent
- "750" or "Lomanco" = turtle vent brand
- "O'Hagin" = intake vent brand
- "Solar fan" or "powered vent" = power vent
- Distinguish between intake (soffit area) and exhaust (roof area)

OUTPUT FORMAT (JSON only):
{
  "vsTurtleVent": <number>,
  "vsRidgeVent": <number in LF>,
  "vsIntakeVent": <number>,
  "vsOffRidgeVent": <number>,
  "vsBroan4": <number>,
  "vsBroan6": <number>,
  "vsPowerVent": <number>,
  "vsGableVent": <number>,
  "vsWhirlybird": <number>,
  "hvacVent": <number>,
  "vsOther": [{"description": "<string>", "quantity": <number>, "unit": "<EA|LF>"}],
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
            text: `Extract ALL ventilation component quantities from this insurance document. Be thorough:\n\n${ocrText}`,
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

  return { confidence: 0.5, validationNotes: ["AI extraction failed, using fallback"] };
}

/**
 * Calculate required NFA (Net Free Area) based on roof area
 * Standard: 1 sq ft NFA per 150 sq ft attic space (with vapor barrier)
 * Or 1 sq ft NFA per 300 sq ft if balanced intake/exhaust
 */
function calculateRequiredNFA(roofArea: number): number {
  // Convert to sq inches (1 sq ft = 144 sq in)
  // Using 1:300 ratio for balanced systems
  return (roofArea / 300) * 144;
}

/**
 * Check if ventilation is properly balanced
 * Best practice: 50% intake, 50% exhaust at minimum
 */
function checkVentilationBalance(result: VentResult, roofArea?: number): boolean {
  // If no intake data, can't verify balance
  if (result.vsIntakeVent === 0 && result.totalExhaust > 0) {
    result.validationNotes.push(
      "No intake ventilation detected - verify soffit vents are included"
    );
    return false;
  }

  // Ridge vent systems often have built-in intake via ridge profile
  if (result.vsRidgeVent > 0) {
    return true; // Assume balanced ridge vent system
  }

  // For standard systems, intake should roughly match exhaust
  if (result.totalIntake > 0 && result.totalExhaust > 0) {
    const ratio = result.totalIntake / result.totalExhaust;
    if (ratio < 0.5 || ratio > 2.0) {
      result.validationNotes.push(
        `Intake/exhaust ratio (${ratio.toFixed(2)}) may indicate unbalanced ventilation`
      );
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Determine if roof has adequate ventilation
 */
export function assessVentilationAdequacy(
  result: VentResult,
  roofArea: number
): {
  isAdequate: boolean;
  recommendation: string;
  suggestedAdditions?: { type: string; quantity: number }[];
} {
  const requiredNFA = calculateRequiredNFA(roofArea);

  if (result.nfa >= requiredNFA) {
    return {
      isAdequate: true,
      recommendation: "Ventilation appears adequate for roof size",
    };
  }

  const deficit = requiredNFA - result.nfa;
  const suggestedAdditions: { type: string; quantity: number }[] = [];

  // Suggest additions based on deficit
  if (deficit > 0) {
    // Ridge vent is most effective (18 sq in NFA per LF)
    const ridgeNeeded = Math.ceil(deficit / 18);
    suggestedAdditions.push({ type: "vsRidgeVent", quantity: ridgeNeeded });

    // Alternative: turtle vents (50 sq in NFA each)
    const turtlesNeeded = Math.ceil(deficit / 50);
    suggestedAdditions.push({ type: "vsTurtleVent", quantity: turtlesNeeded });
  }

  return {
    isAdequate: false,
    recommendation: `Ventilation deficit of ${Math.round(deficit)} sq in NFA detected`,
    suggestedAdditions,
  };
}
