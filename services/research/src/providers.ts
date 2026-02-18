export type ResearchItem = {
  provider: string;
  provider_id: string;
  title: string;
  authors: string[];
  year: number;
  doi?: string;
  url: string;
  abstract?: string;
  type: 'article' | 'preprint' | 'dataset' | 'book' | 'thesis';
  oa_status: 'oa' | 'closed' | 'unknown';
  license?: string;
};

export const fixtureItems: ResearchItem[] = [
  {
    provider: 'pubmed',
    provider_id: '12345',
    title: 'Synthetic Biology in Education',
    authors: ['A. Silva', 'B. Costa'],
    year: 2024,
    doi: '10.1000/example',
    url: 'https://example.org/paper',
    abstract: 'A practical framework for science communication.',
    type: 'article',
    oa_status: 'oa',
    license: 'CC-BY-4.0'
  }
];
