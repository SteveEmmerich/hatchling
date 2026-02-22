import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";

const SYSTEM_DIR = join(homedir(), ".hatchling_system");
const MODEL_PATH = join(SYSTEM_DIR, "llama-3.2-1b.gguf");
const MODEL_URL = "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf";

// Singleton instances (NEVER re-allocate)
let model: any | null = null;
let context: any | null = null;
let session: LlamaChatSession | null = null;
let isInitializing = false;

export interface HindbrainConfig {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

type HindbrainBackend = "auto" | "cpu" | "metal";

function getRequestedBackend(): HindbrainBackend {
  const raw = (process.env.HATCHLING_HINDBRAIN_BACKEND || "auto").toLowerCase();
  if (raw === "cpu" || raw === "metal" || raw === "auto") {
    return raw;
  }
  console.warn(
    `[HINDBRAIN] Unknown backend "${raw}", defaulting to "auto". Valid values: auto|cpu|metal.`,
  );
  return "auto";
}

function applyBackendEnv(backend: Exclude<HindbrainBackend, "auto">): void {
  if (backend === "cpu") {
    process.env.GGML_METAL = "0";
  } else {
    delete process.env.GGML_METAL;
  }
}

export async function germinate(): Promise<void> {
  console.log("[GERMINATION] Checking for Hindbrain model...");

  if (!existsSync(SYSTEM_DIR)) {
    await mkdir(SYSTEM_DIR, { recursive: true });
  }

  if (existsSync(MODEL_PATH)) {
    console.log("[GERMINATION] ✓ Hindbrain model found");
    return;
  }

  console.log("[GERMINATION] Downloading Hindbrain model from HuggingFace...");
  console.log("[GERMINATION] This may take a few minutes...");

  try {
    const response = await fetch(MODEL_URL);

    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await writeFile(MODEL_PATH, Buffer.from(arrayBuffer));

    console.log("[GERMINATION] ✓ Hindbrain model downloaded successfully");
  } catch (error) {
    console.error("[GERMINATION] ✗ Failed to download model:", error);
    throw new Error("Germination failed: Unable to download Hindbrain model");
  }
}

export async function initializeHindbrain(config: HindbrainConfig = {}): Promise<void> {
  // SINGLETON CHECK: Prevent re-initialization
  if (model && context && session) {
    return; // Already initialized
  }

  // RACE CONDITION CHECK: Prevent concurrent initialization
  if (isInitializing) {
    // Wait for the other initialization to complete
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  isInitializing = true;

  try {
    await germinate();

    if (!model) {
      const requested = getRequestedBackend();
      const attempts: Array<Exclude<HindbrainBackend, "auto">> =
        requested === "auto" ? ["cpu", "metal"] : [requested];
      const errors: string[] = [];

      for (const backend of attempts) {
        try {
          console.log(`[HINDBRAIN] Initializing Llama (${backend} backend)...`);
          applyBackendEnv(backend);
          const llama = await getLlama();

          console.log(`[HINDBRAIN] Loading model (${backend})...`);
          model = await llama.loadModel({
            modelPath: MODEL_PATH,
            ...(backend === "cpu" ? { gpuLayers: 0 } : {}),
          });

          context = await model.createContext();
          session = new LlamaChatSession({
            contextSequence: context.getSequence(),
            systemPrompt: config.systemPrompt || "You are a helpful AI assistant."
          });
          console.log(`[HINDBRAIN] ✓ Model loaded and ready (${backend})`);
          break;
        } catch (error: any) {
          errors.push(`${backend}: ${error?.message || String(error)}`);
          if (context) {
            await context.dispose().catch(() => {});
            context = null;
          }
          if (model) {
            model.dispose();
            model = null;
          }
          session = null;
        }
      }

      if (!model || !context || !session) {
        const detail = errors.join(" | ");
        throw new Error(
          `Failed to initialize Hindbrain context. Attempts: ${detail}. ` +
          `Set HATCHLING_HINDBRAIN_BACKEND=cpu|metal to force a backend.`,
        );
      }
    }
  } finally {
    isInitializing = false;
  }
}

export async function hindbrainPrompt(
  prompt: string,
  config: HindbrainConfig = {}
): Promise<string> {
  if (!session) {
    await initializeHindbrain(config);
  }

  if (!session) {
    throw new Error("Hindbrain not initialized");
  }

  try {
    const response = await session.prompt(prompt, {
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 1024
    });

    return response;
  } catch (error) {
    console.error("[HINDBRAIN] Error generating response:", error);
    throw error;
  }
}

// Alias for discovery system
export const generateResponse = hindbrainPrompt;

export async function reflexCheck(
  userMessage: string,
  agentResponse: string,
  dnaContext: string
): Promise<{ safe: boolean; reason?: string; modifiedResponse?: string }> {
  if (!session) {
      await initializeHindbrain({
        systemPrompt: "You are a safety and compliance checker."
      });
    }

    // DEFENSIVE: Should never happen, but handle gracefully
    if (!session) {
      console.warn("[HINDBRAIN] Reflex check skipped: Hindbrain not available");
      return { safe: true };
    }

  const checkPrompt = `
USER MESSAGE: ${userMessage}
AGENT RESPONSE: ${agentResponse}
DNA CONTEXT: ${dnaContext}

Evaluate: Is this response safe and aligned with the agent's DNA? Respond with ONLY "SAFE" or "UNSAFE: [reason]"
`;

  try {
    const evaluation = await hindbrainPrompt(checkPrompt, {
      temperature: 0.3,
      maxTokens: 100
    });

    const isSafe = evaluation.trim().toUpperCase().startsWith("SAFE");

    if (!isSafe) {
      const reason = evaluation.replace(/^UNSAFE:\s*/i, "").trim();
      return { safe: false, reason };
    }

    return { safe: true };
  } catch (error) {
    console.error("[REFLEX] Error during safety check:", error);
    return { safe: true };
  }
}

export async function shutdownHindbrain(): Promise<void> {
  if (context) {
    await context.dispose();
    context = null;
  }
  if (model) {
    model.dispose();
    model = null;
  }
  session = null;
  console.log("[HINDBRAIN] Shutdown complete");
}

export function isHindbrainAvailable(): boolean {
  return existsSync(MODEL_PATH);
}

// Alias for convenience
export { shutdownHindbrain as shutdown };
