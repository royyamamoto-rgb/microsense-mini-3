/**
 * Ollama Client - Streaming chat with local Ollama LLM
 */

class OllamaClient {
  constructor(baseUrl, model) {
    this.baseUrl = baseUrl || 'http://localhost:11434';
    this.model = model || 'llama3.2';
    this.connected = false;
    this.abortController = null;
  }

  async testConnection() {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });
      if (resp.ok) {
        this.connected = true;
        return true;
      }
    } catch (e) {
      this.connected = false;
    }
    return false;
  }

  async listModels() {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`);
      if (resp.ok) {
        const data = await resp.json();
        return (data.models || []).map(m => m.name);
      }
    } catch (e) {}
    return [];
  }

  /**
   * Streaming chat - yields tokens as they arrive
   * @param {Array} messages - [{role:'user'|'assistant', content:'...'}]
   * @param {string} systemPrompt - System prompt for context
   * @yields {string} Token text
   */
  async *chat(messages, systemPrompt) {
    this.abortController = new AbortController();
    const allMessages = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages.slice(-6)); // keep last 6 messages for context

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        stream: true,
        options: {
          num_ctx: 2048,
          temperature: 0.7
        }
      }),
      signal: this.abortController.signal
    });

    if (!resp.ok) {
      throw new Error(`Ollama error: ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message && json.message.content) {
            yield json.message.content;
          }
          if (json.done) return;
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
