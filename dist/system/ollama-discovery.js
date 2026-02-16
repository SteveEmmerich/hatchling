/**
 * Direct Ollama integration for self-discovery conversation
 * Bypasses pi-agent-core to use Ollama SDK directly
 */
import { Ollama } from 'ollama';
import * as clack from '@clack/prompts';
import { logEvent } from './telemetry';
export async function runOllamaDiscovery(modelId, suggestedName, rootDir) {
    const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
    const systemPrompt = `You are assisting in the creation of a new AI agent.
Your goal is to have a natural conversation with the user to help them define their agent's identity.

Ask ONE question at a time. Be conversational and friendly. Based on the user's answers, ask follow-up questions to understand:
1. What should this agent be called? (Suggest starting with "${suggestedName}" but let them change it)
2. What is this agent's purpose? (Could be anything: learning companion, creative partner, task helper, problem solver, etc.)
3. What is the agent's personality? (e.g., "thoughtful and deliberate", "curious and exploratory", "calm and patient")
4. What are the agent's core values? (e.g., "honesty and transparency", "growth through experience", "helpful and supportive")
5. What preferences does it have? (technical, communication style, working approach, etc.)

After 4-5 exchanges, summarize what you've learned and ask if they'd like to add anything else.
When the user confirms they're done, respond with exactly: "DISCOVERY_COMPLETE"`;
    const messages = [
        { role: 'system', content: systemPrompt }
    ];
    const conversationLog = [];
    // Start the conversation
    const response = await ollama.chat({
        model: modelId,
        messages,
        stream: false
    });
    let assistantMessage = response.message.content;
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
        const userMessage = userInput;
        messages.push({ role: 'user', content: userMessage });
        conversationLog.push({ speaker: 'user', message: userMessage });
        // Get LLM response
        const response = await ollama.chat({
            model: modelId,
            messages,
            stream: false
        });
        assistantMessage = response.message.content;
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
    const extractionResponse = await ollama.chat({
        model: modelId,
        messages: [
            { role: 'user', content: extractionPrompt }
        ],
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
//# sourceMappingURL=ollama-discovery.js.map