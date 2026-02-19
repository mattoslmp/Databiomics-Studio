export type ResearchType = 'article' | 'preprint' | 'dataset' | 'book' | 'thesis';

export type FulltextResolution = {
  status: 'allowed' | 'restricted';
  pdf_url_if_allowed?: string;
  reason_not_available?: string;
};

export type ResearchItem = {
  provider: string;
  provider_id: string;
  title: string;
  authors: string[];
  year: number;
  venue?: string;
  doi?: string;
  provider_url?: string;
  url: string;
  abstract?: string;
  type: ResearchType;
  keywords: string[];
  license?: string;
  oa_status: 'oa' | 'closed' | 'unknown';
  pdf_url?: string;
  is_preprint: boolean;
  fetched_at: string;
};

export type SearchFilters = {
  year_from?: number;
  year_to?: number;
  type?: ResearchType;
  oa_only?: boolean;
};

export type ProviderRateLimitPolicy = {
  requests_per_minute: number;
  burst: number;
  notes: string;
};

export type ResearchProviderAdapter = {
  id: string;
  search: (q: string, filters?: SearchFilters) => Promise<ResearchItem[]>;
  get_item: (id: string) => Promise<ResearchItem | null>;
  resolve_fulltext: (item: ResearchItem) => Promise<FulltextResolution>;
  normalize: (raw: unknown) => ResearchItem;
  rate_limit_policy: () => ProviderRateLimitPolicy;
};

export type ProviderRegistry = {
  registry_version: string;
  providers: Record<string, ResearchProviderAdapter>;
};

const fixtureBase: Omit<ResearchItem, 'fetched_at'>[] = [
  {
    provider: 'fixture',
    provider_id: 'bio-edu-001',
    title: 'Synthetic Biology in Education',
    authors: ['A. Silva', 'B. Costa'],
    year: 2024,
    venue: 'Journal of Bio Education',
    doi: '10.1000/example',
    provider_url: 'https://example.org/paper',
    url: 'https://example.org/paper',
    abstract: 'A practical framework for science communication and classroom adoption.',
    type: 'article',
    keywords: ['education', 'biology'],
    license: 'CC-BY-4.0',
    oa_status: 'oa',
    pdf_url: 'https://example.org/paper.pdf',
    is_preprint: false
  }
];

function withFetchedAt(items: Omit<ResearchItem, 'fetched_at'>[]): ResearchItem[] {
  const now = new Date().toISOString();
  return items.map((item) => ({ ...item, fetched_at: now }));
}

function applyFilters(items: ResearchItem[], filters: SearchFilters = {}): ResearchItem[] {
  return items.filter((item) => {
    if (filters.year_from && item.year < filters.year_from) return false;
    if (filters.year_to && item.year > filters.year_to) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.oa_only && item.oa_status !== 'oa') return false;
    return true;
  });
}

function normalizeCrossref(raw: any): ResearchItem {
  const published = raw?.issued?.['date-parts']?.[0]?.[0];
  const year = typeof published === 'number' ? published : 0;
  return withFetchedAt([
    {
      provider: 'crossref',
      provider_id: raw?.DOI ?? String(raw?.URL ?? Math.random()),
      title: Array.isArray(raw?.title) ? raw.title[0] ?? 'Untitled' : 'Untitled',
      authors: Array.isArray(raw?.author)
        ? raw.author.map((a: any) => `${a?.given ?? ''} ${a?.family ?? ''}`.trim()).filter(Boolean)
        : [],
      year,
      venue: Array.isArray(raw?.['container-title']) ? raw['container-title'][0] : undefined,
      doi: raw?.DOI,
      provider_url: raw?.URL,
      url: raw?.URL ?? '',
      abstract: typeof raw?.abstract === 'string' ? raw.abstract : undefined,
      type: 'article',
      keywords: Array.isArray(raw?.subject) ? raw.subject : [],
      license: Array.isArray(raw?.license) ? raw.license?.[0]?.URL : undefined,
      oa_status: Array.isArray(raw?.license) && raw.license.length > 0 ? 'oa' : 'unknown',
      is_preprint: false
    }
  ])[0];
}

function normalizeArxiv(entry: string): ResearchItem {
  const idMatch = entry.match(/<id>(.*?)<\/id>/s);
  const titleMatch = entry.match(/<title>(.*?)<\/title>/s);
  const summaryMatch = entry.match(/<summary>(.*?)<\/summary>/s);
  const yearMatch = entry.match(/<published>(\d{4})-/);
  const authors = [...entry.matchAll(/<name>(.*?)<\/name>/g)].map((m) => m[1]);
  const id = idMatch?.[1]?.trim() ?? `arxiv-${Math.random()}`;
  return withFetchedAt([
    {
      provider: 'arxiv',
      provider_id: id,
      title: (titleMatch?.[1] ?? 'Untitled').replace(/\s+/g, ' ').trim(),
      authors,
      year: yearMatch ? Number(yearMatch[1]) : 0,
      provider_url: id,
      url: id,
      abstract: (summaryMatch?.[1] ?? '').replace(/\s+/g, ' ').trim(),
      type: 'preprint',
      keywords: ['preprint'],
      oa_status: 'oa',
      pdf_url: id.replace('/abs/', '/pdf/'),
      is_preprint: true
    }
  ])[0];
}

async function fulltextByRules(item: ResearchItem): Promise<FulltextResolution> {
  if (item.pdf_url && item.oa_status === 'oa') {
    return { status: 'allowed', pdf_url_if_allowed: item.pdf_url };
  }
  if (item.provider === 'europepmc' && item.pdf_url) {
    return { status: 'allowed', pdf_url_if_allowed: item.pdf_url };
  }
  if (item.license?.toLowerCase().includes('cc-')) {
    return { status: 'allowed', pdf_url_if_allowed: item.pdf_url ?? item.url };
  }
  if (item.oa_status === 'closed') {
    return { status: 'restricted', reason_not_available: 'não OA' };
  }
  return { status: 'restricted', reason_not_available: 'licença não permite ou PDF indisponível' };
}

function makeSimpleAdapter(id: string, isPreprint = false): ResearchProviderAdapter {
  return {
    id,
    async search(q) {
      const seed = withFetchedAt(fixtureBase).map((item, idx) => ({
        ...item,
        provider: id,
        provider_id: `${id}-${idx + 1}`,
        title: `${item.title} (${id})`,
        is_preprint: isPreprint,
        type: isPreprint ? 'preprint' : 'article',
        url: `https://example.org/${id}/${encodeURIComponent(q)}/${idx + 1}`,
        provider_url: `https://example.org/${id}/${encodeURIComponent(q)}/${idx + 1}`
      }));
      return applyFilters(seed, {});
    },
    async get_item(itemId) {
      return withFetchedAt(fixtureBase)
        .map((item) => ({
          ...item,
          provider: id,
          provider_id: itemId,
          is_preprint: isPreprint,
          type: isPreprint ? 'preprint' : 'article'
        }))[0];
    },
    async resolve_fulltext(item) {
      return fulltextByRules(item);
    },
    normalize(raw) {
      const rec = raw as Record<string, unknown>;
      return withFetchedAt([
        {
          ...fixtureBase[0],
          provider: id,
          provider_id: String(rec.id ?? `${id}-raw`),
          title: String(rec.title ?? fixtureBase[0].title),
          is_preprint: isPreprint,
          type: isPreprint ? 'preprint' : 'article'
        }
      ])[0];
    },
    rate_limit_policy() {
      return { requests_per_minute: 30, burst: 10, notes: `${id} public endpoint policy` };
    }
  };
}

export const fixtureAdapter: ResearchProviderAdapter = makeSimpleAdapter('fixture', false);

export const crossrefAdapter: ResearchProviderAdapter = {
  id: 'crossref',
  async search(q, filters) {
    const url = new URL('https://api.crossref.org/works');
    url.searchParams.set('query', q);
    url.searchParams.set('rows', '10');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Crossref search failed: ${response.status}`);
    const data = await response.json();
    const items = Array.isArray(data?.message?.items) ? data.message.items.map((entry: unknown) => normalizeCrossref(entry)) : [];
    return applyFilters(items, filters);
  },
  async get_item(id) {
    const url = new URL(`https://api.crossref.org/works/${encodeURIComponent(id)}`);
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.message ? normalizeCrossref(data.message) : null;
  },
  async resolve_fulltext(item) {
    return fulltextByRules(item);
  },
  normalize(raw) {
    return normalizeCrossref(raw);
  },
  rate_limit_policy() {
    return { requests_per_minute: 50, burst: 20, notes: 'Crossref etiquette: include mailto in production.' };
  }
};

export const arxivAdapter: ResearchProviderAdapter = {
  id: 'arxiv',
  async search(q, filters) {
    const url = new URL('http://export.arxiv.org/api/query');
    url.searchParams.set('search_query', `all:${q}`);
    url.searchParams.set('start', '0');
    url.searchParams.set('max_results', '10');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`arXiv search failed: ${response.status}`);
    const text = await response.text();
    const entries = text.split('<entry>').slice(1).map((chunk) => `<entry>${chunk}`);
    const items = entries.map(normalizeArxiv);
    return applyFilters(items, filters);
  },
  async get_item(id) {
    const url = new URL('http://export.arxiv.org/api/query');
    url.searchParams.set('id_list', id);
    const response = await fetch(url);
    if (!response.ok) return null;
    const text = await response.text();
    const entry = text.split('<entry>').slice(1)[0];
    if (!entry) return null;
    return normalizeArxiv(`<entry>${entry}`);
  },
  async resolve_fulltext(item) {
    return fulltextByRules(item);
  },
  normalize(raw) {
    return normalizeArxiv(String(raw));
  },
  rate_limit_policy() {
    return { requests_per_minute: 60, burst: 20, notes: 'arXiv query API soft limits.' };
  }
};

export const providerRegistry: ProviderRegistry = {
  registry_version: '2026-02-01',
  providers: {
    fixture: fixtureAdapter,
    crossref: crossrefAdapter,
    arxiv: arxivAdapter,
    pubmed: makeSimpleAdapter('pubmed'),
    europepmc: makeSimpleAdapter('europepmc'),
    biorxiv: makeSimpleAdapter('biorxiv', true),
    medrxiv: makeSimpleAdapter('medrxiv', true),
    semanticscholar: makeSimpleAdapter('semanticscholar')
  }
};
