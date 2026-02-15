import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { text, multiselect, confirm } from "@clack/prompts";

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

    // Get the model
    const llmModel = getModel(provider, model);
    
    // Create agent with system prompt
    const agent = new Agent({
      initialState: {
        systemPrompt: DISCOVERY_PROMPT,
        model: llmModel,
        tools: [], // No tools needed
      },
    });

    // Collect the assistant's response
    let assistantResponse = "";
    let conversationComplete = false;

    // Subscribe to agent events
    agent.subscribe((event) => {
      if (event.type === "message") {
        const msg = event.message;
        if (msg.role === "assistant" && msg.content) {
          assistantResponse += msg.content;
          process.stdout.write(msg.content); // Show in real-time
        }
      } else if (event.type === "idle") {
        conversationComplete = true;
      }
    });

    // Start the conversation
    await agent.prompt(
      "Let's begin the conversation to discover my identity. Please start by asking me about my purpose."
    );

    // Wait for completion
    await agent.waitForIdle();

    // Parse the response for JSON
    const jsonMatch = assistantResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      const conversationData = JSON.parse(jsonMatch[1]) as ConversationData;
      console.log("\n✨ Identity discovered from conversation!\n");
      return conversationData;
    }

    console.log("\n⚠️  Could not parse conversation. Using guided prompts.\n");
    return null;
  } catch (error) {
    console.log(`\n⚠️  Error with LLM conversation: ${error instanceof Error ? error.message : String(error)}\n`);
    console.log("Falling back to guided prompts...\n");
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
