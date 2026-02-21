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

const fixtureBase: Omit<ResearchItem, 'fetched_at'> = {
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
};

function withFetchedAt(item: Omit<ResearchItem, 'fetched_at'>): ResearchItem {
  return { ...item, fetched_at: new Date().toISOString() };
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

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

async function fulltextByRules(item: ResearchItem): Promise<FulltextResolution> {
  const license = (item.license ?? '').toLowerCase();
  if (item.pdf_url && item.oa_status === 'oa') return { status: 'allowed', pdf_url_if_allowed: item.pdf_url };
  if (item.provider === 'europepmc' && item.pdf_url) return { status: 'allowed', pdf_url_if_allowed: item.pdf_url };
  if (license.includes('cc-') || license.includes('creativecommons')) {
    return { status: 'allowed', pdf_url_if_allowed: item.pdf_url ?? item.url };
  }
  if (item.oa_status === 'closed') return { status: 'restricted', reason_not_available: 'não OA' };
  if (!item.pdf_url) return { status: 'restricted', reason_not_available: 'PDF indisponível' };
  return { status: 'restricted', reason_not_available: 'licença não permite' };
}

function normalizeCrossref(raw: any): ResearchItem {
  const published = raw?.issued?.['date-parts']?.[0]?.[0];
  return withFetchedAt({
    provider: 'crossref',
    provider_id: raw?.DOI ?? String(raw?.URL ?? Math.random()),
    title: Array.isArray(raw?.title) ? raw.title[0] ?? 'Untitled' : 'Untitled',
    authors: Array.isArray(raw?.author)
      ? raw.author.map((a: any) => `${a?.given ?? ''} ${a?.family ?? ''}`.trim()).filter(Boolean)
      : [],
    year: typeof published === 'number' ? published : 0,
    venue: Array.isArray(raw?.['container-title']) ? raw['container-title'][0] : undefined,
    doi: raw?.DOI,
    provider_url: raw?.URL,
    url: raw?.URL ?? `https://doi.org/${raw?.DOI ?? ''}`,
    abstract: typeof raw?.abstract === 'string' ? raw.abstract : undefined,
    type: 'article',
    keywords: Array.isArray(raw?.subject) ? raw.subject : [],
    license: Array.isArray(raw?.license) ? raw.license?.[0]?.URL : undefined,
    oa_status: Array.isArray(raw?.license) && raw.license.length > 0 ? 'oa' : 'unknown',
    pdf_url: undefined,
    is_preprint: false
  });
}

function normalizeArxiv(entry: string): ResearchItem {
  const id = entry.match(/<id>(.*?)<\/id>/s)?.[1]?.trim() ?? `arxiv-${Math.random()}`;
  const title = decodeXml(entry.match(/<title>(.*?)<\/title>/s)?.[1] ?? 'Untitled').replace(/\s+/g, ' ').trim();
  const summary = decodeXml(entry.match(/<summary>(.*?)<\/summary>/s)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const year = Number(entry.match(/<published>(\d{4})-/)?.[1] ?? 0);
  const authors = [...entry.matchAll(/<name>(.*?)<\/name>/g)].map((m) => decodeXml(m[1]));
  return withFetchedAt({
    provider: 'arxiv',
    provider_id: id,
    title,
    authors,
    year,
    provider_url: id,
    url: id,
    abstract: summary,
    type: 'preprint',
    keywords: ['preprint'],
    oa_status: 'oa',
    pdf_url: id.replace('/abs/', '/pdf/'),
    is_preprint: true
  });
}

function normalizePubmed(raw: any): ResearchItem {
  return withFetchedAt({
    provider: 'pubmed',
    provider_id: String(raw.uid ?? raw.pubmed_id ?? raw.id),
    title: raw.title ?? 'Untitled',
    authors: Array.isArray(raw.authors) ? raw.authors.map((a: any) => a.name).filter(Boolean) : [],
    year: Number(raw.pubdate?.match(/\d{4}/)?.[0] ?? 0),
    venue: raw.fulljournalname,
    doi: Array.isArray(raw.articleids) ? raw.articleids.find((i: any) => i.idtype === 'doi')?.value : undefined,
    provider_url: `https://pubmed.ncbi.nlm.nih.gov/${raw.uid}/`,
    url: `https://pubmed.ncbi.nlm.nih.gov/${raw.uid}/`,
    abstract: Array.isArray(raw.abstract) ? raw.abstract.join(' ') : raw.abstract,
    type: 'article',
    keywords: [],
    oa_status: 'unknown',
    is_preprint: false
  });
}

function normalizeEuropePmc(raw: any): ResearchItem {
  const pdfUrl = raw?.hasPDF === 'Y' && raw?.pmcid ? `https://europepmc.org/articles/${raw.pmcid}?pdf=render` : undefined;
  return withFetchedAt({
    provider: 'europepmc',
    provider_id: raw.id,
    title: raw.title ?? 'Untitled',
    authors: typeof raw.authorString === 'string' ? raw.authorString.split(',').map((a: string) => a.trim()) : [],
    year: Number(raw.pubYear ?? 0),
    venue: raw.journalTitle,
    doi: raw.doi,
    provider_url: `https://europepmc.org/article/${raw.source}/${raw.id}`,
    url: `https://europepmc.org/article/${raw.source}/${raw.id}`,
    abstract: raw.abstractText,
    type: 'article',
    keywords: [],
    oa_status: raw.isOpenAccess === 'Y' ? 'oa' : 'closed',
    pdf_url: pdfUrl,
    is_preprint: raw.source === 'PPR'
  });
}

function normalizeBiorxiv(raw: any, provider: 'biorxiv' | 'medrxiv'): ResearchItem {
  return withFetchedAt({
    provider,
    provider_id: raw.doi,
    title: raw.title ?? 'Untitled',
    authors: typeof raw.authors === 'string' ? raw.authors.split(';').map((a: string) => a.trim()) : [],
    year: Number(String(raw.date ?? '').slice(0, 4) || 0),
    venue: provider,
    doi: raw.doi,
    provider_url: raw.url,
    url: raw.url,
    abstract: raw.abstract,
    type: 'preprint',
    keywords: ['preprint'],
    license: raw.license,
    oa_status: 'oa',
    pdf_url: raw.url ? `${raw.url}.full.pdf` : undefined,
    is_preprint: true
  });
}

function normalizeSemanticScholar(raw: any): ResearchItem {
  return withFetchedAt({
    provider: 'semanticscholar',
    provider_id: raw.paperId,
    title: raw.title ?? 'Untitled',
    authors: Array.isArray(raw.authors) ? raw.authors.map((a: any) => a.name).filter(Boolean) : [],
    year: Number(raw.year ?? 0),
    venue: raw.venue,
    doi: raw.externalIds?.DOI,
    provider_url: `https://www.semanticscholar.org/paper/${raw.paperId}`,
    url: raw.url ?? `https://www.semanticscholar.org/paper/${raw.paperId}`,
    abstract: raw.abstract,
    type: raw.publicationTypes?.includes('Review') ? 'article' : 'article',
    keywords: [],
    oa_status: raw.isOpenAccess ? 'oa' : 'closed',
    pdf_url: raw.openAccessPdf?.url,
    is_preprint: false
  });
}

function makeFixtureAdapter(): ResearchProviderAdapter {
  return {
    id: 'fixture',
    async search(q, filters) {
      const item = withFetchedAt({ ...fixtureBase, title: `${fixtureBase.title} (${q})` });
      return applyFilters([item], filters);
    },
    async get_item() {
      return withFetchedAt(fixtureBase);
    },
    async resolve_fulltext(item) {
      return fulltextByRules(item);
    },
    normalize(raw) {
      const rec = raw as Record<string, unknown>;
      return withFetchedAt({ ...fixtureBase, provider_id: String(rec.id ?? fixtureBase.provider_id), title: String(rec.title ?? fixtureBase.title) });
    },
    rate_limit_policy() {
      return { requests_per_minute: 120, burst: 40, notes: 'Local development fixture provider.' };
    }
  };
}

export const fixtureAdapter = makeFixtureAdapter();

export const crossrefAdapter: ResearchProviderAdapter = {
  id: 'crossref',
  async search(q, filters) {
    const url = new URL('https://api.crossref.org/works');
    url.searchParams.set('query', q);
    url.searchParams.set('rows', '10');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Crossref search failed: ${response.status}`);
    const data = await response.json();
    const items = Array.isArray(data?.message?.items) ? data.message.items.map((item: unknown) => normalizeCrossref(item)) : [];
    return applyFilters(items, filters);
  },
  async get_item(id) {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(id)}`);
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
    return { requests_per_minute: 50, burst: 20, notes: 'Public API etiquette in production with contact email.' };
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
    const items = text.split('<entry>').slice(1).map((entry) => normalizeArxiv(`<entry>${entry}`));
    return applyFilters(items, filters);
  },
  async get_item(id) {
    const url = new URL('http://export.arxiv.org/api/query');
    url.searchParams.set('id_list', id);
    const response = await fetch(url);
    if (!response.ok) return null;
    const text = await response.text();
    const entry = text.split('<entry>').slice(1)[0];
    return entry ? normalizeArxiv(`<entry>${entry}`) : null;
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

const pubmedAdapter: ResearchProviderAdapter = {
  id: 'pubmed',
  async search(q, filters) {
    const searchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
    searchUrl.searchParams.set('db', 'pubmed');
    searchUrl.searchParams.set('retmode', 'json');
    searchUrl.searchParams.set('term', q);
    searchUrl.searchParams.set('retmax', '10');
    const searchResp = await fetch(searchUrl);
    if (!searchResp.ok) throw new Error(`PubMed search failed: ${searchResp.status}`);
    const searchData = await searchResp.json();
    const ids: string[] = searchData?.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
    summaryUrl.searchParams.set('db', 'pubmed');
    summaryUrl.searchParams.set('retmode', 'json');
    summaryUrl.searchParams.set('id', ids.join(','));
    const summaryResp = await fetch(summaryUrl);
    if (!summaryResp.ok) throw new Error(`PubMed summary failed: ${summaryResp.status}`);
    const summaryData = await summaryResp.json();
    const items = ids.map((id) => normalizePubmed(summaryData.result[id])).filter((item) => item.provider_id !== 'undefined');
    return applyFilters(items, filters);
  },
  async get_item(id) {
    const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
    summaryUrl.searchParams.set('db', 'pubmed');
    summaryUrl.searchParams.set('retmode', 'json');
    summaryUrl.searchParams.set('id', id);
    const response = await fetch(summaryUrl);
    if (!response.ok) return null;
    const data = await response.json();
    return data?.result?.[id] ? normalizePubmed(data.result[id]) : null;
  },
  async resolve_fulltext(item) {
    return fulltextByRules(item);
  },
  normalize(raw) {
    return normalizePubmed(raw);
  },
  rate_limit_policy() {
    return { requests_per_minute: 180, burst: 60, notes: 'NCBI e-utilities default throughput for unauthenticated clients.' };
  }
};

const europePmcAdapter: ResearchProviderAdapter = {
  id: 'europepmc',
  async search(q, filters) {
    const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
    url.searchParams.set('query', q);
    url.searchParams.set('resultType', 'core');
    url.searchParams.set('pageSize', '10');
    url.searchParams.set('format', 'json');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Europe PMC search failed: ${response.status}`);
    const data = await response.json();
    const results = Array.isArray(data?.resultList?.result) ? data.resultList.result : [];
    return applyFilters(results.map((raw: unknown) => normalizeEuropePmc(raw)), filters);
  },
  async get_item(id) {
    const response = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:${encodeURIComponent(id)}&format=json`);
    if (!response.ok) return null;
    const data = await response.json();
    const item = data?.resultList?.result?.[0];
    return item ? normalizeEuropePmc(item) : null;
  },
  async resolve_fulltext(item) {
    return fulltextByRules(item);
  },
  normalize(raw) {
    return normalizeEuropePmc(raw);
  },
  rate_limit_policy() {
    return { requests_per_minute: 120, burst: 30, notes: 'Europe PMC public API usage profile.' };
  }
};

function makeBiorxivFamilyAdapter(provider: 'biorxiv' | 'medrxiv'): ResearchProviderAdapter {
  return {
    id: provider,
    async search(q, filters) {
      const endpoint = `https://api.biorxiv.org/details/${provider}/2020-01-01/3000-01-01/0`;
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`${provider} search failed: ${response.status}`);
      const data = await response.json();
      const entries = Array.isArray(data?.collection) ? data.collection : [];
      const items = entries
        .filter((entry: any) => String(entry.title ?? '').toLowerCase().includes(q.toLowerCase()))
        .slice(0, 10)
        .map((entry: unknown) => normalizeBiorxiv(entry, provider));
      return applyFilters(items, filters);
    },
    async get_item(id) {
      const endpoint = `https://api.biorxiv.org/details/${provider}/${encodeURIComponent(id)}/na/0`;
      const response = await fetch(endpoint);
      if (!response.ok) return null;
      const data = await response.json();
      const raw = Array.isArray(data?.collection) ? data.collection[0] : null;
      return raw ? normalizeBiorxiv(raw, provider) : null;
    },
    async resolve_fulltext(item) {
      return fulltextByRules(item);
    },
    normalize(raw) {
      return normalizeBiorxiv(raw, provider);
    },
    rate_limit_policy() {
      return { requests_per_minute: 60, burst: 20, notes: `${provider} public API (aggregate endpoint).` };
    }
  };
}

const semanticScholarAdapter: ResearchProviderAdapter = {
  id: 'semanticscholar',
  async search(q, filters) {
    const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
    url.searchParams.set('query', q);
    url.searchParams.set('limit', '10');
    url.searchParams.set('fields', 'paperId,title,authors,year,venue,url,abstract,externalIds,isOpenAccess,openAccessPdf,publicationTypes');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Semantic Scholar search failed: ${response.status}`);
    const data = await response.json();
    const items = Array.isArray(data?.data) ? data.data.map((item: unknown) => normalizeSemanticScholar(item)) : [];
    return applyFilters(items, filters);
  },
  async get_item(id) {
    const url = new URL(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(id)}`);
    url.searchParams.set('fields', 'paperId,title,authors,year,venue,url,abstract,externalIds,isOpenAccess,openAccessPdf,publicationTypes');
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return normalizeSemanticScholar(data);
  },
  async resolve_fulltext(item) {
    return fulltextByRules(item);
  },
  normalize(raw) {
    return normalizeSemanticScholar(raw);
  },
  rate_limit_policy() {
    return { requests_per_minute: 100, burst: 25, notes: 'Semantic Scholar Graph API rate-limits vary by key/tier.' };
  }
};

export const providerRegistry: ProviderRegistry = {
  registry_version: '2026-02-15',
  providers: {
    fixture: fixtureAdapter,
    crossref: crossrefAdapter,
    arxiv: arxivAdapter,
    pubmed: pubmedAdapter,
    europepmc: europePmcAdapter,
    biorxiv: makeBiorxivFamilyAdapter('biorxiv'),
    medrxiv: makeBiorxivFamilyAdapter('medrxiv'),
    semanticscholar: semanticScholarAdapter
  }
};
