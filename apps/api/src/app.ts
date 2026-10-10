import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import apiRouter from './routes';
import { errorHandler } from './middleware/error';
import { swaggerDocument } from './docs/swagger';
import { config } from './config';

const app = express();

// Security headers (Helmet)
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false // Allows map tiles & external fonts in dev
}));

// CORS
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

// Rate limiting (120 requests per minute per IP for normal endpoints)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please slow down' }
});
app.use('/api/', limiter);

// Request parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Structured HTTP logging
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

import { prisma } from '@smart-ambulance/database';
import { getSocketServer } from './socket';

// Health check endpoint (Requirement 36)
app.get('/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'error';
  }

  const socketActive = !!getSocketServer();

  res.json({
    status: 'ok',
    database: dbStatus,
    socket: socketActive ? 'active' : 'inactive',
    service: 'Smart Ambulance Emergency Mobility Platform API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Swagger Documentation UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Mount main API
app.use('/api', apiRouter);

// Central error handler
app.use(errorHandler);

export default app;
