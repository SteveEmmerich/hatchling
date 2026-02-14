import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';
import { Telemetry } from './telemetry.js';

interface VectorEntry {
  text: string;
  vector: number[];
  metadata?: any;
}

export class VectorMemory {
  
  // Simple in-memory store backed by JSON for now
  static async loadStore(): Promise<VectorEntry[]> {
    try {
      const path = await PathGuard.validatePath('memory/vector_store.json', 'read');
      return await Bun.file(path).json();
    } catch {
      return [];
    }
  }

  static async embed(text: string): Promise<number[]> {
    try {
      // Assuming Ollama is running locally
      const response = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        body: JSON.stringify({
          model: 'nomic-embed-text', // or whatever is available
          prompt: text
        })
      });

      if (!response.ok) throw new Error('Ollama embedding failed');
      const data = await response.json();
      return data.embedding;
    } catch (e: any) {
      Telemetry.warn('Vector embedding failed (Ollama offline?)', { error: e.message });
      return []; // Return empty if failed
    }
  }

  static async store(text: string, metadata?: any) {
    const vector = await this.embed(text);
    if (vector.length === 0) return;

    const store = await this.loadStore();
    store.push({ text, vector, metadata });
    
    const path = await PathGuard.validatePath('memory/vector_store.json', 'write');
    await fs.writeFile(path, JSON.stringify(store));
  }

  static async recall(query: string, limit: number = 3): Promise<string[]> {
    const queryVector = await this.embed(query);
    if (queryVector.length === 0) return [];

    const store = await this.loadStore();
    
    // Calculate Cosine Similarity
    const scored = store.map(entry => {
      const dot = entry.vector.reduce((a, b, i) => a + (b * queryVector[i]), 0);
      // Assuming normalized vectors for simplicity (if not, divide by magnitudes)
      return { text: entry.text, score: dot };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.text);
  }
}
