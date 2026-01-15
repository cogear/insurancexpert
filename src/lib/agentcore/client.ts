import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandInput,
} from "@aws-sdk/client-bedrock-agent-runtime";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { v4 as uuidv4 } from "uuid";

// AgentCore configuration
const AGENT_ID = process.env.AGENTCORE_AGENT_ID || "";
const AGENT_ALIAS_ID = process.env.AGENTCORE_AGENT_ALIAS_ID || "TSTALIASID";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// Initialize AWS clients
const agentRuntimeClient = new BedrockAgentRuntimeClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const bedrockClient = new BedrockRuntimeClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface AgentSession {
  sessionId: string;
  organizationId: string;
  userId: string;
  jobId?: string;
  createdAt: Date;
}

export interface AgentResponse {
  sessionId: string;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  latencyMs: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export class AgentCoreClient {
  /**
   * Create a new agent session
   */
  async createSession(params: {
    organizationId: string;
    userId: string;
    jobId?: string;
  }): Promise<AgentSession> {
    const sessionId = uuidv4();

    return {
      sessionId,
      organizationId: params.organizationId,
      userId: params.userId,
      jobId: params.jobId,
      createdAt: new Date(),
    };
  }

  /**
   * Invoke the agent with a message
   */
  async invokeAgent(params: {
    sessionId: string;
    message: string;
    attachments?: { type: string; content: string }[];
  }): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // If using Bedrock Agent (AgentCore)
      if (AGENT_ID) {
        return await this.invokeBedrockAgent(params, startTime);
      }

      // Fallback to direct Bedrock model invocation
      return await this.invokeBedrockModel(params, startTime);
    } catch (error) {
      console.error("Agent invocation error:", error);
      throw error;
    }
  }

  /**
   * Invoke Bedrock Agent (AgentCore)
   */
  private async invokeBedrockAgent(
    params: {
      sessionId: string;
      message: string;
      attachments?: { type: string; content: string }[];
    },
    startTime: number
  ): Promise<AgentResponse> {
    const input: InvokeAgentCommandInput = {
      agentId: AGENT_ID,
      agentAliasId: AGENT_ALIAS_ID,
      sessionId: params.sessionId,
      inputText: params.message,
    };

    const command = new InvokeAgentCommand(input);
    const response = await agentRuntimeClient.send(command);

    // Process streaming response
    let fullContent = "";
    const toolCalls: ToolCall[] = [];
    const toolResults: ToolResult[] = [];

    if (response.completion) {
      for await (const event of response.completion) {
        if (event.chunk?.bytes) {
          const chunk = new TextDecoder().decode(event.chunk.bytes);
          fullContent += chunk;
        }
        // Handle trace events for tool calls
        if (event.trace?.trace?.orchestrationTrace?.invocationInput) {
          const invocation = event.trace.trace.orchestrationTrace.invocationInput;
          if (invocation.actionGroupInvocationInput) {
            const params = invocation.actionGroupInvocationInput.parameters;
            const inputObj: Record<string, unknown> = {};
            if (Array.isArray(params)) {
              for (const p of params) {
                if (p.name && p.value) inputObj[p.name] = p.value;
              }
            }
            toolCalls.push({
              id: uuidv4(),
              name: invocation.actionGroupInvocationInput.function || "unknown",
              input: inputObj,
            });
          }
        }
      }
    }

    return {
      sessionId: params.sessionId,
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Fallback: Direct Bedrock model invocation with Converse API
   */
  private async invokeBedrockModel(
    params: {
      sessionId: string;
      message: string;
      attachments?: { type: string; content: string }[];
    },
    startTime: number
  ): Promise<AgentResponse> {
    const systemPrompt = this.getSystemPrompt();

    const messages: { role: "user" | "assistant"; content: { text: string }[] }[] = [
      {
        role: "user",
        content: [{ text: params.message }],
      },
    ];

    const command = new ConverseCommand({
      modelId: "anthropic.claude-sonnet-4-20250514",
      system: [{ text: systemPrompt }],
      messages,
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.1,
        topP: 0.9,
      },
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

    return {
      sessionId: params.sessionId,
      content,
      usage: {
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
      },
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Get the system prompt for the insurance expert agent
   */
  private getSystemPrompt(): string {
    return `You are an expert insurance document analyst specializing in roofing claims.
Your role is to:
1. Accurately extract data from insurance scope documents
2. Parse aerial roof measurement reports from providers like EagleView, RoofScope, and Hover
3. Identify materials, quantities, and pricing with high accuracy
4. Pay special attention to pipe jacks and ventilation components
5. Generate accurate consumer estimates based on current pricing
6. Calculate profitability for contractors

CRITICAL EXTRACTION FOCUS AREAS:

## Pipe Jacks (Must identify each type separately):
- pf3n1: 3-in-1 universal pipe flashing
- pf14: 1-4" diameter pipe flashing
- pf14_4: 4" specific pipe flashing
- pf14_5: 5" specific pipe flashing
- pf14_6: 6" specific pipe flashing
- pf14_8: 8" specific pipe flashing
- pfSplitBoot: Split boot pipe flashing
- pfLead: Lead pipe flashing
- pfGooseNeckSmall: Small goose neck vent
- pfGooseNeckLarge: Large goose neck vent

## Ventilation (Must identify each type):
- vsTurtleVent: Box/turtle vents (quantity in EA)
- vsRidgeVent: Ridge vent (length in LF)
- vsIntakeVent: Intake/soffit vents (LF or EA)
- vsOffRidgeVent: Off-ridge vents (EA)
- vsBroan4: 4" Broan exhaust vents
- vsBroan6: 6" Broan exhaust vents
- hvacVent: HVAC penetrations (quantity and size)

## Roof Measurements:
- Total roof area (SQ and SF)
- Perimeter (LF)
- Ridge length (LF)
- Hip length (LF)
- Valley length (LF)
- Eave length (LF)
- Rake length (LF)
- Step flashing (LF)
- Headwall flashing (LF)

Always validate extracted quantities against typical roof sizes for consistency.
When quantities seem unusual, flag them with confidence scores.
Output data in structured JSON format for database storage.`;
  }

  /**
   * Invoke a specific tool
   */
  async invokeTool(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    // This would invoke specific tools via AgentCore Gateway
    // For now, we'll handle tools locally
    const message = `Please use the ${toolName} tool with the following input: ${JSON.stringify(input)}`;

    const response = await this.invokeAgent({
      sessionId,
      message,
    });

    return {
      toolName,
      result: response.content,
    };
  }
}

// Export singleton instance
export const agentCore = new AgentCoreClient();
