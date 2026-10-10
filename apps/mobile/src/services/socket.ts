import { io, Socket } from 'socket.io-client';

const DEFAULT_SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:5000';
let mobileSocket: Socket | null = null;

export type SocketConnectionState = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

const listeners: ((state: SocketConnectionState) => void)[] = [];

export function onSocketStateChange(callback: (state: SocketConnectionState) => void): () => void {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notifyState(state: SocketConnectionState) {
  listeners.forEach((fn) => fn(state));
}

export function getMobileSocket(token?: string, customUrl?: string): Socket {
  const url = customUrl || DEFAULT_SOCKET_URL;

  if (!mobileSocket) {
    mobileSocket = io(url, {
      auth: token ? { token } : undefined,
      transports: ['websocket', 'polling'], // Resilient mobile connections (Requirement 2 & 9)
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    mobileSocket.on('connect', () => notifyState('CONNECTED'));
    mobileSocket.on('disconnect', () => notifyState('DISCONNECTED'));
    mobileSocket.on('reconnecting', () => notifyState('RECONNECTING'));
  } else if (token && mobileSocket.auth?.token !== token) {
    mobileSocket.auth = { token };
    mobileSocket.disconnect().connect();
  }

  return mobileSocket;
}
