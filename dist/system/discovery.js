import { Agent } from "@mariozechner/pi-agent-core";
import { text, multiselect } from "@clack/prompts";
import { createOllamaStreamFn } from "./ollama-stream.js";
import { runOllamaDiscovery } from "./ollama-discovery.js";
import { logEvent } from "./telemetry.js";
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
export async function runDiscoveryConversation(provider, model, rootDir) {
    try {
        console.log("\n🎭 Starting self-discovery conversation with LLM...\n");
        if (provider === "ollama") {
            // Use direct Ollama SDK integration
            const modelMap = {
                "deepseek-r1:1.5b": "deepseek-r1:1.5b",
                "llama3.1:8b": "llama3.1:8b",
                "qwen2.5-coder:7b": "qwen2.5-coder:7b",
            };
            const modelId = modelMap[model] || model;
            console.log(`Using ${provider} model: ${modelId}\n`);
            await logEvent(rootDir, "info", "Starting Ollama discovery", { provider, model: modelId });
            // Run the Ollama-specific discovery conversation
            const result = await runOllamaDiscovery(modelId, "New Agent", rootDir);
            // Convert to ConversationData format
            return {
                name: result.name || "New Agent",
                purpose: result.purpose,
                values: result.values,
                communicationStyle: result.personality,
                capabilities: result.preferences,
                userFacts: {}
            };
        }
        // For cloud providers, use pi-agent-core with API keys
        console.log(`Using ${provider} model: ${model}\n`);
        // Get API key from environment
        let apiKey;
        let apiKeyEnvVar;
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
        const llmModel = {
            id: model,
            api: provider,
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
        const conversationHistory = [];
        console.log("🤖 Starting discovery conversation...\n");
        // Run conversation loop
        let complete = false;
        let jsonData = null;
        while (!complete) {
            const stream = agent.run({
                messages: conversationHistory.map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            });
            let agentMessage = "";
            for await (const event of stream) {
                if (event.type === "text") {
                    agentMessage += event.text;
                    process.stdout.write(event.text);
                }
                else if (event.type === "done") {
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
                }
                catch (e) {
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
        // Legacy code below (keeping for reference to non-Ollama providers)
        // Create model configuration manually for Ollama
        let llmModel;
        let streamFn;
        if (provider === "ollama") {
            // Map model names to Ollama model IDs
            const modelMap = {
                "deepseek-r1:1.5b": "deepseek-r1:1.5b",
                "llama3.1:8b": "llama3.1:8b",
                "qwen2.5-coder:7b": "qwen2.5-coder:7b",
            };
            const modelId = modelMap[model] || model;
            llmModel = {
                id: modelId,
                api: "ollama",
                provider: "ollama",
                contextWindow: 65536,
                maxTokens: 4096,
                reasoning: false,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
            };
            streamFn = createOllamaStreamFn("http://127.0.0.1:11434");
            console.log(`Using Ollama model: ${modelId}\n`);
            await logEvent(rootDir, "info", "Starting LLM discovery", { provider, model: modelId });
        }
        else {
            throw new Error(`Provider ${provider} is not yet supported. Only Ollama is currently implemented.`);
        }
        // Create agent with system prompt and model
        const agent = new Agent({
            model: llmModel,
            streamFn,
            systemPrompt: DISCOVERY_PROMPT,
        });
        await logEvent(rootDir, "info", "Agent created successfully", { modelId: llmModel.id });
        // Collect the full conversation
        let fullResponse = "";
        // Subscribe to agent events
        agent.subscribe((event) => {
            if (event.type === "message") {
                const msg = event.message;
                if (msg.role === "assistant" && msg.content) {
                    fullResponse += msg.content;
                    process.stdout.write(msg.content); // Show in real-time
                }
            }
            else if (event.type === "error") {
                console.error("Agent error:", event);
                logEvent(rootDir, "error", "Agent event error", { event }).catch(console.error);
            }
        });
        // Start the conversation
        await logEvent(rootDir, "info", "Prompting agent for discovery");
        try {
            console.log("[DEBUG] About to call agent.prompt()");
            console.log("[DEBUG] Agent model:", llmModel.id);
            console.log("[DEBUG] Agent systemPrompt:", DISCOVERY_PROMPT.substring(0, 100) + "...");
            const promptResult = await agent.prompt("Let's begin the conversation to discover my identity. Please start by asking me about what I should be called and what my purpose is.");
            console.log("[DEBUG] agent.prompt() completed, result:", promptResult);
            // Wait for the agent to become idle
            console.log("[DEBUG] Waiting for agent to become idle...");
            await agent.waitForIdle();
            console.log("[DEBUG] Agent is now idle");
        }
        catch (promptError) {
            console.error("[ERROR] Error during agent.prompt():", promptError);
            console.error("[ERROR] Error stack:", promptError instanceof Error ? promptError.stack : "No stack");
            console.error("[ERROR] Error name:", promptError instanceof Error ? promptError.name : "Unknown");
            console.error("[ERROR] Full error object:", JSON.stringify(promptError, null, 2));
            throw promptError;
        }
        // Parse the response for JSON
        const jsonMatch = fullResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
            const conversationData = JSON.parse(jsonMatch[1]);
            console.log("\n\n✨ Identity discovered from conversation!\n");
            await logEvent(rootDir, "info", "Identity discovered", { name: conversationData.name });
            return conversationData;
        }
        console.log("\n\n⚠️  Could not parse conversation data. Using guided prompts.\n");
        await logEvent(rootDir, "warn", "Could not parse LLM response", { fullResponse: fullResponse.substring(0, 500) });
        return null;
    }
    catch (error) {
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
export async function runInteractiveDiscovery(provider, model, rootDir) {
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
        name: agentName,
        purpose: purpose,
        values: values,
        communicationStyle: communicationStyle,
        capabilities: [
            "Code generation and refactoring",
            "System automation",
            "Self-improvement through mutations",
            "Proactive problem-solving",
        ],
        userFacts: {
            name: userName,
            role: userRole,
            preferences: ["Clear communication", "Efficient workflows"],
        },
    };
}
function getDefaultData() {
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
//# sourceMappingURL=discovery.js.map