import type { ResearchItem } from './providers.js';

export type LlmRequest = {
  model: string;
  topic: string;
  items: ResearchItem[];
};

export type RagAnswerRequest = {
  model: string;
  question: string;
  contextItems: ResearchItem[];
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

export async function answerWithRag(req: RagAnswerRequest): Promise<{ answer: string; citations: string[]; engine: string }> {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const citations = req.contextItems.map((i) => `${i.provider}:${i.provider_id}`).slice(0, 6);

  if (baseUrl) {
    const prompt = buildRagPrompt(req.question, req.contextItems);
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model: req.model,
        messages: [
          { role: 'system', content: 'Você responde em PT-BR com base somente no contexto e deve citar as fontes.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content: string = data?.choices?.[0]?.message?.content ?? '';
      if (content.trim().length > 0) {
        return { answer: content.trim(), citations, engine: 'remote-llm-rag' };
      }
    }
  }

  const fallback = req.contextItems[0];
  const answer = fallback
    ? `Resposta baseada no contexto: ${fallback.title}. ${(fallback.abstract ?? '').slice(0, 240)} [${fallback.provider}:${fallback.provider_id}]`
    : 'Sem contexto suficiente para responder com segurança.';
  return { answer, citations, engine: 'local-rag-fallback' };
}

function buildPrompt(topic: string, items: ResearchItem[]): string {
  const references = items
    .map((i, idx) => `${idx + 1}. ${i.title} (${i.year}) - ${i.provider}:${i.provider_id} - ${i.abstract ?? 'sem abstract'}`)
    .join('\n');
  return `Tema: ${topic}\nBase bibliográfica:\n${references}\n\nGere bullets em PT-BR com referência [n].`;
}

function buildRagPrompt(question: string, items: ResearchItem[]): string {
  const context = items
    .map((i, idx) => `[${idx + 1}] ${i.title} (${i.year}) ${i.provider}:${i.provider_id}\nResumo: ${i.abstract ?? 'N/A'}`)
    .join('\n\n');
  return `Pergunta: ${question}\n\nContexto:\n${context}\n\nResponda em PT-BR e cite as fontes ao final.`;
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

export function retrieveTopK(question: string, items: ResearchItem[], k = 5): ResearchItem[] {
  const queryTerms = question.toLowerCase().split(/\W+/).filter(Boolean);
  return items
    .map((item) => {
      const hay = `${item.title} ${item.abstract ?? ''} ${item.keywords.join(' ')}`.toLowerCase();
      const score = queryTerms.reduce((acc, term) => acc + (hay.includes(term) ? 1 : 0), 0);
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((entry) => entry.item);
}
