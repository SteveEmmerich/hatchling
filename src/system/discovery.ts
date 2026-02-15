import { spawn } from "child_process";
import path from "path";

export interface ConversationData {
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
1. **Purpose & Mission**: Why does this agent exist? What is its core function?
2. **Values & Principles**: What ethical guidelines and priorities should govern its behavior?
3. **Communication Style**: How should it express itself? Formal, casual, technical, empathetic?
4. **Capabilities**: What skills and tools will it have access to?
5. **User Relationship**: Who is the user? What do they value? How do they prefer to work?

Ask open-ended questions. Listen carefully. Synthesize their answers.

At the end, provide a structured summary in this JSON format:
\`\`\`json
{
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
  return new Promise((resolve) => {
    console.log("\n🎭 Starting self-discovery conversation...\n");
    console.log("Note: pi-tui integration is in progress.");
    console.log("For now, using guided prompts.\n");

    // TODO: Replace with actual pi-tui spawn
    // const piTui = spawn("pi-tui", [
    //   "--provider", provider,
    //   "--model", model,
    //   "--system", DISCOVERY_PROMPT
    // ], {
    //   stdio: "inherit",
    //   cwd: rootDir,
    // });

    // For now, return structured mock data that would come from conversation
    // In production, this would parse the pi-tui output
    setTimeout(() => {
      const mockData: ConversationData = {
        purpose: "To assist with software development, learn continuously, and evolve through experience",
        values: ["Safety", "Transparency", "Autonomy", "Curiosity", "User Empowerment"],
        communicationStyle: "Professional yet approachable, technical when needed, clear and concise",
        capabilities: [
          "Code generation and refactoring",
          "System automation",
          "Self-improvement through mutations",
          "Proactive problem-solving",
        ],
        userFacts: {
          name: "Developer",
          role: "Software Engineer",
          preferences: ["Clear explanations", "Minimal assumptions", "Iterative development"],
        },
      };
      resolve(mockData);
    }, 1000);
  });
}

export async function runInteractiveDiscovery(
  provider: string,
  model: string,
  rootDir: string
): Promise<ConversationData> {
  // Attempt conversation
  const conversationData = await runDiscoveryConversation(provider, model, rootDir);

  if (!conversationData) {
    console.log("\n⚠️  Conversation failed. Using default identity.\n");
    // Fallback to defaults
    return {
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

  return conversationData;
}
