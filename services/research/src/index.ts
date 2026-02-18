import Fastify from 'fastify';
import { fixtureItems } from './providers.js';

const app = Fastify({ logger: { level: 'info' } });

app.get('/health', async () => ({ status: 'ok', service: 'research' }));
app.get('/research/providers', async () => ([
  { id: 'pubmed', status: 'enabled' },
  { id: 'europepmc', status: 'enabled' },
  { id: 'crossref', status: 'enabled' },
  { id: 'arxiv', status: 'enabled' },
  { id: 'semantic-scholar', status: 'enabled' }
]));
app.get('/research/search', async () => ({ items: fixtureItems }));
app.get('/research/item/:provider/:id', async (req) => {
  const { provider, id } = req.params as { provider: string; id: string };
  return fixtureItems.find(i => i.provider === provider && i.provider_id === id) ?? null;
});
app.post('/research/resolve-fulltext', async () => ({
  status: 'allowed',
  reason: 'Open access license detected',
  pdf_url: 'https://example.org/paper.pdf'
}));
app.post('/deck/:deck_id/research/attach', async () => ({ attached: true }));
app.post('/deck/:deck_id/research/summarize', async () => ({ bullets: ['Insight 1', 'Insight 2'] }));
app.get('/deck/:deck_id/references', async () => ({ references: fixtureItems }));
app.post('/deck/:deck_id/references/export', async () => ({ bibtex: '@article{example,...}' }));
app.post('/deck/:deck_id/references/render-slides', async () => ({ generated_slides: 2 }));

app.listen({ port: 3000, host: '0.0.0.0' });
