export type ResearchType = 'article' | 'preprint' | 'dataset' | 'book' | 'thesis';

export type ResearchItem = {
  provider: string;
  provider_id: string;
  title: string;
  authors: string[];
  year: number;
  venue?: string;
  doi?: string;
  url: string;
  abstract?: string;
  type: ResearchType;
  keywords: string[];
  license?: string;
  oa_status: 'oa' | 'closed' | 'unknown';
  pdf_url?: string;
  fetched_at: string;
};

export type SearchFilters = {
  year_from?: number;
  year_to?: number;
  type?: ResearchType;
  oa_only?: boolean;
};

export type ResearchProviderAdapter = {
  id: 'crossref' | 'arxiv' | 'fixture';
  search: (q: string, filters?: SearchFilters) => Promise<ResearchItem[]>;
  getItem: (id: string) => Promise<ResearchItem | null>;
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
    url: 'https://example.org/paper',
    abstract: 'A practical framework for science communication and classroom adoption.',
    type: 'article',
    keywords: ['education', 'biology'],
    license: 'CC-BY-4.0',
    oa_status: 'oa',
    pdf_url: 'https://example.org/paper.pdf'
  }
];

function withFetchedAt(items: Omit<ResearchItem, 'fetched_at'>[]): ResearchItem[] {
  const now = new Date().toISOString();
  return items.map((item) => ({ ...item, fetched_at: now }));
}

function mapCrossrefItem(item: any): Omit<ResearchItem, 'fetched_at'> {
  const published = item?.issued?.['date-parts']?.[0]?.[0];
  const year = typeof published === 'number' ? published : 0;
  return {
    provider: 'crossref',
    provider_id: item?.DOI ?? String(item?.URL ?? Math.random()),
    title: Array.isArray(item?.title) ? item.title[0] ?? 'Untitled' : 'Untitled',
    authors: Array.isArray(item?.author)
      ? item.author.map((a: any) => `${a?.given ?? ''} ${a?.family ?? ''}`.trim()).filter(Boolean)
      : [],
    year,
    venue: Array.isArray(item?.['container-title']) ? item['container-title'][0] : undefined,
    doi: item?.DOI,
    url: item?.URL ?? '',
    abstract: typeof item?.abstract === 'string' ? item.abstract : undefined,
    type: 'article',
    keywords: Array.isArray(item?.subject) ? item.subject : [],
    license: Array.isArray(item?.license) ? item.license?.[0]?.URL : undefined,
    oa_status: Array.isArray(item?.license) && item.license.length > 0 ? 'oa' : 'unknown'
  };
}

function mapArxivEntry(entry: string): Omit<ResearchItem, 'fetched_at'> {
  const idMatch = entry.match(/<id>(.*?)<\/id>/s);
  const titleMatch = entry.match(/<title>(.*?)<\/title>/s);
  const summaryMatch = entry.match(/<summary>(.*?)<\/summary>/s);
  const yearMatch = entry.match(/<published>(\d{4})-/);
  const authors = [...entry.matchAll(/<name>(.*?)<\/name>/g)].map((m) => m[1]);
  const id = idMatch?.[1]?.trim() ?? `arxiv-${Math.random()}`;
  return {
    provider: 'arxiv',
    provider_id: id,
    title: (titleMatch?.[1] ?? 'Untitled').replace(/\s+/g, ' ').trim(),
    authors,
    year: yearMatch ? Number(yearMatch[1]) : 0,
    url: id,
    abstract: (summaryMatch?.[1] ?? '').replace(/\s+/g, ' ').trim(),
    type: 'preprint',
    keywords: ['preprint'],
    oa_status: 'oa',
    pdf_url: id.replace('/abs/', '/pdf/')
  };
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

export const fixtureAdapter: ResearchProviderAdapter = {
  id: 'fixture',
  async search(q, filters) {
    const base = withFetchedAt(fixtureBase).filter((item) =>
      item.title.toLowerCase().includes(q.toLowerCase()) || (item.abstract ?? '').toLowerCase().includes(q.toLowerCase())
    );
    return applyFilters(base, filters);
  },
  async getItem(id) {
    return withFetchedAt(fixtureBase).find((item) => item.provider_id === id) ?? null;
  }
};

export const crossrefAdapter: ResearchProviderAdapter = {
  id: 'crossref',
  async search(q, filters) {
    const url = new URL('https://api.crossref.org/works');
    url.searchParams.set('query', q);
    url.searchParams.set('rows', '10');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Crossref search failed: ${response.status}`);
    }
    const data = await response.json();
    const items = Array.isArray(data?.message?.items) ? data.message.items.map(mapCrossrefItem) : [];
    return applyFilters(withFetchedAt(items), filters);
  },
  async getItem(id) {
    const url = new URL(`https://api.crossref.org/works/${encodeURIComponent(id)}`);
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const msg = data?.message;
    if (!msg) return null;
    return withFetchedAt([mapCrossrefItem(msg)])[0];
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
    const items = entries.map(mapArxivEntry);
    return applyFilters(withFetchedAt(items), filters);
  },
  async getItem(id) {
    const url = new URL('http://export.arxiv.org/api/query');
    url.searchParams.set('id_list', id);
    const response = await fetch(url);
    if (!response.ok) return null;
    const text = await response.text();
    const entry = text.split('<entry>').slice(1)[0];
    if (!entry) return null;
    return withFetchedAt([mapArxivEntry(`<entry>${entry}`)])[0];
  }
};

export const providerRegistry: Record<string, ResearchProviderAdapter> = {
  fixture: fixtureAdapter,
  crossref: crossrefAdapter,
  arxiv: arxivAdapter
};
