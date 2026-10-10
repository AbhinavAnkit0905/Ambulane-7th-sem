import { INewsProvider } from '../interfaces';
import { NewsArticleSummary } from '@smart-ambulance/shared';
import { prisma } from '@smart-ambulance/database';
import { logger } from '../../logger';

export class NewsProvider implements INewsProvider {
  private cache: NewsArticleSummary[] = [];
  private lastFetchTime: number = 0;
  private readonly CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes cache (Requirement 80)

  async getArticles(lat?: number, lng?: number, category?: string): Promise<NewsArticleSummary[]> {
    const now = Date.now();

    // Check if in-memory cache is fresh
    if (this.cache.length > 0 && now - this.lastFetchTime < this.CACHE_TTL_MS) {
      return this.filterCategory(this.cache, category);
    }

    try {
      // 1. Try to fetch from database cache first
      const dbArticles = await prisma.newsArticle.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 15
      });

      if (dbArticles.length > 0) {
        this.cache = dbArticles.map((a: any) => ({
          id: a.id,
          title: a.title,
          summary: a.summary,
          source: a.source,
          url: a.url || undefined,
          imageUrl: a.imageUrl || undefined,
          category: a.category as any,
          publishedAt: a.publishedAt
        }));
        this.lastFetchTime = now;
        return this.filterCategory(this.cache, category);
      }

      // If database is empty and no remote feed is reachable, return empty array
      // (Requirement 49: "If cache is empty: Show unavailable message. Never fabricate news.")
      return [];
    } catch (err: any) {
      logger.error('Failed to retrieve news articles', err);
      // Return previous cache if available, or empty
      return this.filterCategory(this.cache, category);
    }
  }

  private filterCategory(articles: NewsArticleSummary[], category?: string): NewsArticleSummary[] {
    if (!category || category === 'All') return articles;
    return articles.filter(a => a.category.toLowerCase() === category.toLowerCase());
  }
}
