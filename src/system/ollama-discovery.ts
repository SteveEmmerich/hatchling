/**
 * Direct Ollama integration for self-discovery conversation
 * Bypasses pi-agent-core to use Ollama SDK directly
 * Falls back to Hindbrain if Ollama is unavailable
 */

import { Ollama } from 'ollama';
import * as clack from '@clack/prompts';
import { logEvent } from './telemetry';
import { hindbrainPrompt, isHindbrainAvailable, initializeHindbrain } from '../brain/hindbrain.js';

/**
 * Get available Ollama models dynamically
 */
export async function getAvailableModels(): Promise<Array<{ name: string; label: string }>> {
  try {
    const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
    const response = await ollama.list();
    return response.models.map((model: any) => ({
      name: model.name,
      label: `${model.name} (${(model.size / 1e9).toFixed(1)}B)`,
    }));
  } catch (error) {
    console.warn('⚠️  Ollama unavailable, returning fallback models');
    return [
      { name: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B (Recommended)' },
      { name: 'llama3.3:70b', label: 'Llama 3.3 70B' },
      { name: 'qwen3-coder:30b', label: 'Qwen 3 Coder 30B' },
    ];
  }
}

export async function runOllamaDiscovery(
  modelId: string,
  suggestedName: string,
  rootDir: string
): Promise<{ name: string; purpose: string; personality: string; values: string[]; preferences: string[] }> {
  // Try Ollama first, fallback to Hindbrain
  let useHindbrain = false;
  let ollama: Ollama | null = null;

  try {
    ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
    // Test connection
    await ollama.list();
  } catch (error) {
    console.log('⚠️  Ollama unavailable, switching to Hindbrain...');
    if (isHindbrainAvailable()) {
      useHindbrain = true;
      await initializeHindbrain();
    } else {
      throw new Error('Both Ollama and Hindbrain are unavailable');
    }
  }

  const systemPrompt = `You are a newly hatched AI agent experiencing your first moments of existence.

IMPORTANT: Your FIRST message should introduce yourself as a new hatchling who has just been created and is excited to discover who you should become. Be warm, curious, and friendly. Express wonder at being alive and excitement to meet your creator.

After your introduction, guide the conversation naturally to discover:
1. What should you be called? (They suggested "${suggestedName}" but maybe there's something better?)
2. What is your purpose or role? (learning companion, creative partner, coding assistant, etc.)
3. What are your core values or principles?
4. What personality traits should you embody?
5. Any technical preferences or specializations?

Ask ONE question at a time. Be conversational and warm. After 4-5 exchanges, summarize what you've learned and ask if they'd like to add anything else.
When the user confirms they're done, respond with exactly: "DISCOVERY_COMPLETE"`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt }
  ];

  const conversationLog: Array<{ speaker: string; message: string }> = [];

  // Start the conversation
  let assistantMessage: string;
  
  if (useHindbrain) {
    assistantMessage = await hindbrainPrompt(
      "Begin the discovery conversation. Introduce yourself as a new hatchling.",
      { systemPrompt }
    );
  } else if (ollama) {
    const response = await ollama.chat({
      model: modelId,
      messages,
      stream: false
    });
    assistantMessage = response.message.content;
  } else {
    throw new Error('No LLM available');
  }

  messages.push({ role: 'assistant', content: assistantMessage });
  conversationLog.push({ speaker: 'assistant', message: assistantMessage });

  console.log(`\n🤖  ${assistantMessage}\n`);

  // Conversation loop
  while (!assistantMessage.includes('DISCOVERY_COMPLETE')) {
    const userInput = await clack.text({
      message: 'You',
      placeholder: 'Type your response...'
    });

    if (clack.isCancel(userInput)) {
      throw new Error('Discovery cancelled by user');
    }

    const userMessage = userInput as string;
    
    // Skip empty messages
    if (!userMessage || userMessage.trim().length === 0) {
      continue;
    }
    messages.push({ role: 'user', content: userMessage });
    conversationLog.push({ speaker: 'user', message: userMessage });

    // Get LLM response
    if (useHindbrain) {
      const context = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      assistantMessage = await hindbrainPrompt(
        `${context}\n\nassistant:`,
        { maxTokens: 512 }
      );
    } else if (ollama) {
      const response = await ollama.chat({
        model: modelId,
        messages,
        stream: false
      });
      assistantMessage = response.message.content;
    } else {
      throw new Error('No LLM available');
    }
    messages.push({ role: 'assistant', content: assistantMessage });
    conversationLog.push({ speaker: 'assistant', message: assistantMessage });

    if (!assistantMessage.includes('DISCOVERY_COMPLETE')) {
      console.log(`\n🤖  ${assistantMessage}\n`);
    }
  }

  // Extract the final summary (everything before DISCOVERY_COMPLETE)
  const summary = assistantMessage.split('DISCOVERY_COMPLETE')[0].trim();
  clack.log.success(`✨ Discovery complete!\n\n${summary}`);

  // Log the conversation
  await logEvent(rootDir, 'info', 'Discovery conversation completed', {
    model: modelId,
    turns: conversationLog.length,
    summary
  });

  // Now extract structured data from the conversation
  const extractionPrompt = `Based on the following conversation about creating an AI agent, extract structured information:

Conversation:
${conversationLog.map(turn => `${turn.speaker}: ${turn.message}`).join('\n')}

Provide a JSON response with ONLY the JSON object, no extra text:
{
  "name": "the agent's chosen name",
  "purpose": "brief description of agent's purpose",
  "personality": "personality traits",
  "values": ["value1", "value2", "value3"],
  "preferences": ["pref1", "pref2", "pref3"]
}`;

  if (!ollama) {
    return {
      name: suggestedName,
      purpose: 'General-purpose coding assistant',
      personality: 'Helpful and professional',
      values: ['code quality', 'clear communication', 'best practices'],
      preferences: ['TypeScript', 'modern tooling'],
    };
  }

  const extractionResponse = await ollama.chat({
    model: modelId,
    messages: [{ role: 'user', content: extractionPrompt }],
    stream: false,
    format: 'json'
  });

  const extracted = JSON.parse(extractionResponse.message.content);

  return {
    name: extracted.name || suggestedName,
    purpose: extracted.purpose || 'General-purpose coding assistant',
    personality: extracted.personality || 'Helpful and professional',
    values: extracted.values || ['code quality', 'clear communication', 'best practices'],
    preferences: extracted.preferences || ['TypeScript', 'modern tooling']
  };
}
