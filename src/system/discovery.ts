import { spawn } from "child_process";
import path from "path";
import { text, multiselect, confirm } from "@clack/prompts";

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
  return new Promise((resolve, reject) => {
    console.log("\n🎭 Starting self-discovery conversation...\n");

    // Try to spawn pi-tui first
    const piTui = spawn("bun", ["pi-tui", "--provider", provider, "--model", model], {
      stdio: ["inherit", "pipe", "inherit"],
      cwd: rootDir,
    });

    let output = "";
    let conversationComplete = false;
    let errorOccurred = false;

    // Collect output from pi-tui
    piTui.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write(chunk); // Show to user in real-time
    });

    piTui.on("close", (code) => {
      if (errorOccurred) return; // Already handled in error event
      
      if (code === 0 && !conversationComplete) {
        // Try to parse JSON from output
        try {
          // Look for JSON block in output
          const jsonMatch = output.match(/```json\s*(\{[\s\S]*?\})\s*```/);
          if (jsonMatch) {
            const conversationData = JSON.parse(jsonMatch[1]) as ConversationData;
            conversationComplete = true;
            resolve(conversationData);
          } else {
            resolve(null);
          }
        } catch (error) {
          resolve(null);
        }
      } else if (code !== 0) {
        resolve(null);
      }
    });

    piTui.on("error", (error) => {
      errorOccurred = true;
      if ((error as any).code === "ENOENT") {
        console.log("⚠️  pi-tui not available. Using guided prompts instead.\n");
      }
      // Fall through to guided prompts
      resolve(null);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!conversationComplete && !errorOccurred) {
        piTui.kill();
        resolve(null);
      }
    }, 300000);
  });
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
