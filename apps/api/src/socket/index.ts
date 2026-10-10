import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../logger';
import { SOCKET_EVENTS, UserRole } from '@smart-ambulance/shared';

let io: SocketIOServer | null = null;

export function initSocketServer(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', // Allows Web client and Expo mobile client
      methods: ['GET', 'POST']
    }
  });

  // Socket authentication middleware
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      // Allow unauthenticated connection as guest/anonymous, but restrict to public events
      socket.data.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; role: UserRole };
      socket.data.user = decoded;
      next();
    } catch (err) {
      logger.warn('Socket authentication failed for token', { error: (err as any).message });
      next();
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    logger.info('Client connected to WebSocket', { socketId: socket.id, userId: user?.userId, role: user?.role });

    if (user) {
      // Join personal room for targeted alerts (Requirement 43)
      socket.join(`user:${user.userId}`);

      // If Admin, join room:admin
      if (user.role === UserRole.ADMIN) {
        socket.join(SOCKET_EVENTS.ROOM_ADMIN);
      }

      // If Hospital Operator
      if (user.role === UserRole.HOSPITAL_OPERATOR && user.hospitalId) {
        socket.join(`hospital:${user.hospitalId}`);
      }
    }

    // Join specific emergency tracking room
    socket.on('join:emergency', (emergencyId: string) => {
      socket.join(`emergency:${emergencyId}`);
      logger.debug(`Socket ${socket.id} joined emergency:${emergencyId}`);
    });

    socket.on('leave:emergency', (emergencyId: string) => {
      socket.leave(`emergency:${emergencyId}`);
      logger.debug(`Socket ${socket.id} left emergency:${emergencyId}`);
    });

    // Client registers their user room
    socket.on('register:user', (userId: string) => {
      socket.join(`user:${userId}`);
      logger.debug(`Socket ${socket.id} joined user:${userId}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}
