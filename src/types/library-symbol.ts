export type SymbolLibraryKind = 'report' | 'video' | 'community_query';

export interface SymbolLibraryItem {
  id: string;
  kind: SymbolLibraryKind;
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
}

export interface SymbolLibraryCounts {
  all: number;
  reports: number;
  videos: number;
  community: number;
}

export interface SymbolLibraryResponse {
  input_symbol: string;
  normalized_symbol: string | null;
  counts: SymbolLibraryCounts;
  items: SymbolLibraryItem[];
  faq_questions: string[];
}
