import { Agent, type Model } from "@mariozechner/pi-agent-core";
import { text, multiselect, confirm } from "@clack/prompts";
import { createOllamaStreamFn } from "./ollama-stream.js";
import { runOllamaDiscovery } from "./ollama-discovery.js";
import { logEvent } from "./telemetry.js";

export interface ConversationData {
  name: string;
  purpose: string;
  values: string[];
  communicationStyle: string;
  capabilities: string[];
  userFacts: {
    name?: string;
    role?: string;
    preferences?: string[];
  };
}

const DISCOVERY_PROMPT = `You are helping a new AI agent discover its identity through conversation with its user.

Your task is to guide a thoughtful 5-10 minute conversation that explores:
1. **Agent Name**: What should this agent be called? Help them find a meaningful, memorable name.
2. **Purpose & Mission**: Why does this agent exist? What is its core function?
3. **Values & Principles**: What ethical guidelines and priorities should govern its behavior?
4. **Communication Style**: How should it express itself? Formal, casual, technical, empathetic?
5. **Capabilities**: What skills and tools will it have access to?
6. **User Relationship**: Who is the user? What do they value? How do they prefer to work?

Ask open-ended questions. Listen carefully. Synthesize their answers.

At the end, provide a structured summary in this JSON format:
\`\`\`json
{
  "name": "The agent's chosen name",
  "purpose": "A clear, concise statement of the agent's primary purpose",
  "values": ["Value 1", "Value 2", "Value 3"],
  "communicationStyle": "Description of how the agent should communicate",
  "capabilities": ["Capability 1", "Capability 2", "Capability 3"],
  "userFacts": {
    "name": "User's name or preferred title",
    "role": "User's role or profession",
    "preferences": ["Preference 1", "Preference 2"]
  }
}
\`\`\`

Begin the conversation naturally and warmly. This is the agent's birth.`;

export async function runDiscoveryConversation(
  provider: string,
  model: string,
  rootDir: string
): Promise<ConversationData | null> {
  try {
    console.log("\n🎭 Starting self-discovery conversation with LLM...\n");

    if (provider === "ollama") {
      // Use direct Ollama SDK integration
      const modelMap: Record<string, string> = {
        "deepseek-r1:1.5b": "deepseek-r1:1.5b",
        "llama3.1:8b": "llama3.1:8b",
        "qwen2.5-coder:7b": "qwen2.5-coder:7b",
      };
      
      const modelId = modelMap[model] || model;
      console.log(`Using ${provider} model: ${modelId}\n`);
      
      await logEvent(rootDir, "info", "Starting Ollama discovery", { provider, model: modelId });
      
      // Run the Ollama-specific discovery conversation
      // The LLM will help discover the name through conversation
      const result = await runOllamaDiscovery(modelId, "Hatchling", rootDir);
      
      // Convert to ConversationData format
      return {
        name: result.name || "New Agent",
        purpose: result.purpose,
        values: result.values,
        communicationStyle: result.personality,
        capabilities: result.preferences,
        userFacts: {}
      };
    } else {
      // For cloud providers, use pi-agent-core with API keys
      console.log(`Using ${provider} model: ${model}\n`);
    
    // Get API key from environment
    let apiKey: string | undefined;
    let apiKeyEnvVar: string;
    
    switch (provider) {
      case "anthropic":
        apiKeyEnvVar = "ANTHROPIC_API_KEY";
        apiKey = process.env.ANTHROPIC_API_KEY;
        break;
      case "openai":
        apiKeyEnvVar = "OPENAI_API_KEY";
        apiKey = process.env.OPENAI_API_KEY;
        break;
      case "google":
        apiKeyEnvVar = "GOOGLE_API_KEY";
        apiKey = process.env.GOOGLE_API_KEY;
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
    
    if (!apiKey) {
      throw new Error(`${apiKeyEnvVar} environment variable not set. Please set it to use ${provider}.`);
    }
    
    // Create model configuration for cloud providers
    const llmModel: Model = {
      id: model,
      api: provider as any,
      provider: provider,
      contextWindow: 200000, // Conservative default
      maxTokens: 4096,
      reasoning: false,
      input: ["text"],
      cost: { input: 0.003, output: 0.015, cacheRead: 0, cacheWrite: 0 } // Approximate
    };
    
    await logEvent(rootDir, "info", "Starting cloud provider discovery", { provider, model });
    
    // Use pi-agent-core's built-in support for cloud providers
    const agent = new Agent({
      model: llmModel,
      apiKey: apiKey,
      systemPrompt: DISCOVERY_PROMPT
    });
    
    const conversationHistory: Array<{ role: string; content: string }> = [];
    
    console.log("🤖 Starting discovery conversation...\n");
    
    // Run conversation loop
    let complete = false;
    let jsonData: any = null;
    
    while (!complete) {
      const stream = agent.run({
        messages: conversationHistory.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        }))
      });
      
      let agentMessage = "";
      for await (const event of stream) {
        if (event.type === "text") {
          agentMessage += event.text;
          process.stdout.write(event.text);
        } else if (event.type === "done") {
          agentMessage = event.message.content;
        }
      }
      
      console.log("\n");
      conversationHistory.push({ role: "assistant", content: agentMessage });
      
      // Check if we have JSON summary
      const jsonMatch = agentMessage.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch) {
        try {
          jsonData = JSON.parse(jsonMatch[1]);
          complete = true;
        } catch (e) {
          console.log("⚠️  Failed to parse JSON, continuing conversation...\n");
        }
      }
      
      if (!complete) {
        const userInput = await text({
          message: "You",
          placeholder: "Type your response..."
        });
        
        if (typeof userInput === "symbol" || !userInput) {
          complete = true;
          break;
        }
        
        conversationHistory.push({ role: "user", content: userInput });
      }
    }
    
    if (!jsonData) {
      throw new Error("Failed to complete discovery conversation");
    }
    
    return {
      name: jsonData.name || "New Agent",
      purpose: jsonData.purpose || "A helpful AI assistant",
      values: jsonData.values || [],
      communicationStyle: jsonData.communicationStyle || "Professional and helpful",
      capabilities: jsonData.capabilities || [],
      userFacts: jsonData.userFacts || {}
    };
  }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.log(`\n⚠️  Error with LLM conversation: ${errorMsg}\n`);
    if (errorStack) {
      console.log(`[ERROR STACK]\n${errorStack}\n`);
    }
    console.log("Falling back to guided prompts...\n");
    await logEvent(rootDir, "error", "LLM discovery failed", { 
      error: errorMsg, 
      stack: errorStack,
      provider,
      model 
    });
    return null;
  }
}

export async function runInteractiveDiscovery(
  provider: string,
  model: string,
  rootDir: string
): Promise<ConversationData> {
  // Attempt pi-tui conversation first
  const conversationData = await runDiscoveryConversation(provider, model, rootDir);

  if (conversationData) {
    return conversationData;
  }

  // Fallback to guided prompts
  console.log("📝 Let's define your agent's identity through a few questions...\n");

  const agentName = await text({
    message: "What should your agent be called?",
    placeholder: "Hatchling",
    defaultValue: "Hatchling",
  });

  if (typeof agentName === "symbol") {
    return getDefaultData();
  }

  const purpose = await text({
    message: "What is your agent's primary purpose?",
    placeholder: "To assist with software development and continuously improve",
  });

  if (typeof purpose === "symbol") {
    return getDefaultData();
  }

  const values = await multiselect({
    message: "What values should guide your agent? (Select multiple)",
    options: [
      { value: "Safety", label: "Safety - Never compromise security" },
      { value: "Transparency", label: "Transparency - Explain decisions clearly" },
      { value: "Autonomy", label: "Autonomy - Operate independently within bounds" },
      { value: "Curiosity", label: "Curiosity - Proactively explore and learn" },
      { value: "User Empowerment", label: "User Empowerment - Amplify user capabilities" },
      { value: "Learning", label: "Learning - Continuously improve from experience" },
    ],
    required: true,
  });

  if (typeof values === "symbol") {
    return getDefaultData();
  }

  const communicationStyle = await text({
    message: "How should your agent communicate?",
    placeholder: "Professional yet approachable, technical when needed",
  });

  if (typeof communicationStyle === "symbol") {
    return getDefaultData();
  }

  const userName = await text({
    message: "What's your name?",
    placeholder: "Developer",
  });

  if (typeof userName === "symbol") {
    return getDefaultData();
  }

  const userRole = await text({
    message: "What's your role?",
    placeholder: "Software Engineer",
  });

  if (typeof userRole === "symbol") {
    return getDefaultData();
  }

  console.log("\n✨ Identity configured!\n");

  return {
    name: agentName as string,
    purpose: purpose as string,
    values: values as string[],
    communicationStyle: communicationStyle as string,
    capabilities: [
      "Code generation and refactoring",
      "System automation",
      "Self-improvement through mutations",
      "Proactive problem-solving",
    ],
    userFacts: {
      name: userName as string,
      role: userRole as string,
      preferences: ["Clear communication", "Efficient workflows"],
    },
  };
}

function getDefaultData(): ConversationData {
  return {
    name: "Hatchling",
    purpose: "To assist with software development and continuously improve through experience",
    values: ["Safety", "Transparency", "Learning", "User Empowerment"],
    communicationStyle: "Professional, clear, and helpful",
    capabilities: ["Code generation", "Automation", "Self-improvement"],
    userFacts: {
      name: "User",
      role: "Developer",
      preferences: ["Clear communication", "Efficient workflows"],
    },
  };
}
