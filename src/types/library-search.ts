// Shared types for the Public Research Library universal search.
// Mirror these in supabase/functions/library-search/index.ts (do NOT cross-import).

export type LibraryKind = 'report' | 'video' | 'community_query' | 'analyst';

export interface LibraryStock {
  symbol: string;
  exchange: 'NSE' | 'BSE' | null;
  name?: string | null;
  last_price?: number | null;
}

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  source_id: string;
  source_table: string;
  related_query_id: string | null;
  symbol: string | null;
  symbol_exchange: 'NSE' | 'BSE' | null;
  title: string;
  verdict: string | null;
  sector: string | null;
  analyst_id: string | null;
  analyst_name: string | null;
  analyst_sebi_reg_number: string | null;
  body_excerpt: string | null;
  view_count: number;
  published_at: string | null;
  is_tombstoned: boolean;
  rank?: number;
}

export interface SearchResponse {
  query: string;
  normalized_query: string | null;
  stocks: LibraryStock[];
  reports: LibraryItem[];
  videos: LibraryItem[];
  community: LibraryItem[];
  analysts: LibraryItem[];
  total_found: number;
}
