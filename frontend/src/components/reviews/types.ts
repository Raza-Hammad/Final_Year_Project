/** Shared Reviews ("Wall of Signals") types. */

export interface ReviewItem {
  id: number;
  author: string;
  rating: number;
  title: string;
  body: string;
  would_recommend: boolean;
  suggestion: string;
  tags: string[];
  helpful_count: number;
  created_at: string;
  updated_at: string;
  edited: boolean;
  mine: boolean;
  i_marked_helpful: boolean;
  /** Only present in the admin/own views. */
  status?: 'published' | 'hidden';
  user_id?: number;
}

export interface ReviewSummary {
  count: number;
  average: number;
  distribution: Record<string, number>;
  recommend_pct: number;
  top_tags: { tag: string; count: number }[];
  tag_vocabulary: string[];
}

export interface ReviewDraft {
  rating: number;
  title: string;
  body: string;
  would_recommend: boolean;
  suggestion: string;
  tags: string[];
}

export const EMPTY_DRAFT: ReviewDraft = {
  rating: 0,
  title: '',
  body: '',
  would_recommend: true,
  suggestion: '',
  tags: [],
};

export const LIMITS = { title: 80, body: 1000, suggestion: 500 } as const;

export type ReviewSort = 'recent' | 'top' | 'helpful';
