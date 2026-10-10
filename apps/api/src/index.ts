import http from 'http';
import app from './app';
import { initSocketServer } from './socket';
import { config } from './config';
import { logger } from './logger';

const server = http.createServer(app);

// Initialize real-time WebSocket layer
initSocketServer(server);

server.listen(config.port, () => {
  logger.info(`🚨 Smart Ambulance Platform API listening on http://localhost:${config.port}`);
  logger.info(`📚 Swagger API Docs available at http://localhost:${config.port}/api-docs`);
  logger.info(`⚡ Socket.IO real-time corridor engine initialized`);
});
