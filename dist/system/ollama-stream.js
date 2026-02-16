export function createOllamaStreamFn(baseUrl) {
    return async function* ollamaStream({ model, messages, tools, temperature, maxTokens }) {
        // Convert messages to Ollama format
        const ollamaMessages = messages.map(msg => ({
            role: msg.role === "assistant" ? "assistant" : msg.role === "user" ? "user" : "system",
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
        }));
        // Build request body
        const requestBody = {
            model: model.id,
            messages: ollamaMessages,
            stream: true,
            options: {
                temperature: temperature ?? 0.7,
                num_ctx: model.contextWindow || 65536
            }
        };
        // Add tools if provided
        if (tools && tools.length > 0) {
            requestBody.tools = tools.map(tool => ({
                type: "function",
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.schema
                }
            }));
        }
        // Make request to Ollama
        const response = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            throw new Error(`Ollama request failed: ${response.statusText}`);
        }
        if (!response.body) {
            throw new Error("No response body from Ollama");
        }
        // Parse NDJSON stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";
        let toolCalls = [];
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    try {
                        const chunk = JSON.parse(line);
                        // Handle content delta
                        if (chunk.message?.content) {
                            fullContent += chunk.message.content;
                            yield {
                                type: "delta",
                                delta: { content: chunk.message.content }
                            };
                        }
                        // Handle tool calls
                        if (chunk.message?.tool_calls) {
                            toolCalls = chunk.message.tool_calls;
                        }
                        // Check if done
                        if (chunk.done) {
                            const message = {
                                role: "assistant",
                                content: fullContent
                            };
                            if (toolCalls.length > 0) {
                                message.tool_calls = toolCalls.map(tc => ({
                                    id: tc.function.name + "-" + Date.now(),
                                    type: "function",
                                    function: {
                                        name: tc.function.name,
                                        arguments: JSON.stringify(tc.function.arguments)
                                    }
                                }));
                            }
                            yield {
                                type: "done",
                                message,
                                usage: {
                                    input: chunk.prompt_eval_count || 0,
                                    output: chunk.eval_count || 0,
                                    cacheRead: 0,
                                    cacheWrite: 0,
                                    total: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0)
                                }
                            };
                        }
                    }
                    catch (parseError) {
                        console.error("Failed to parse Ollama chunk:", parseError);
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    };
}
//# sourceMappingURL=ollama-stream.js.map