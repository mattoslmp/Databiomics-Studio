import type { ResearchItem } from './providers.js';

export type LlmRequest = {
  model: string;
  topic: string;
  items: ResearchItem[];
};

export async function generateInsights(req: LlmRequest): Promise<{ bullets: string[]; engine: string }> {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;

  if (baseUrl) {
    const prompt = buildPrompt(req.topic, req.items);
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: 'system', content: 'You are a research assistant. Return concise bullet points with source mentions.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`LLM provider error: ${response.status}`);
    }

    const data = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    const bullets = content
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 8);

    if (bullets.length > 0) return { bullets, engine: 'remote-llm' };
  }

  return { bullets: localExtractiveBullets(req.items), engine: 'local-extractive' };
}

function buildPrompt(topic: string, items: ResearchItem[]): string {
  const references = items
    .map((i, idx) => `${idx + 1}. ${i.title} (${i.year}) - ${i.provider}:${i.provider_id} - ${i.abstract ?? 'sem abstract'}`)
    .join('\n');
  return `Tema: ${topic}\nBase bibliográfica:\n${references}\n\nGere bullets em PT-BR com referência [n].`;
}

export function localExtractiveBullets(items: ResearchItem[]): string[] {
  const ranked = items
    .map((item) => {
      const text = `${item.title}. ${item.abstract ?? ''}`;
      const score = (item.abstract?.length ?? 0) + item.title.length + item.year;
      return { text, score, ref: `${item.provider}:${item.provider_id}` };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return ranked.map((r) => `${r.text} [${r.ref}]`);
}
