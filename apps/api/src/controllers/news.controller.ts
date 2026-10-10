import { Request, Response, NextFunction } from 'express';
import { newsProvider, weatherProvider } from '../providers';

export class NewsController {
  async getLocalNews(req: Request, res: Response, next: NextFunction) {
    try {
      const category = req.query.category as string | undefined;
      const articles = await newsProvider.getArticles(undefined, undefined, category);

      if (articles.length === 0) {
        res.json({
          status: 'unavailable',
          message: 'Local news is temporarily unavailable.',
          articles: []
        });
        return;
      }

      res.json({
        status: 'ok',
        articles
      });
    } catch (err) {
      next(err);
    }
  }
}

export class WeatherController {
  async getWeather(req: Request, res: Response, next: NextFunction) {
    try {
      const lat = parseFloat(req.query.lat as string) || 28.6139;
      const lng = parseFloat(req.query.lng as string) || 77.2090;

      const weather = await weatherProvider.getWeather(lat, lng);
      res.json(weather);
    } catch (err) {
      next(err);
    }
  }
}

export const newsController = new NewsController();
export const weatherController = new WeatherController();
