import { io, Socket } from 'socket.io-client';

export const getSocketUrl = (): string => {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) return process.env.NEXT_PUBLIC_SOCKET_URL;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }
  return 'http://localhost:5000';
};

const SOCKET_SERVER = getSocketUrl();

let socketInstance: Socket | null = null;

export function getSocket(token?: string): Socket {
  if (!socketInstance) {
    socketInstance = io(SOCKET_SERVER, {
      auth: token ? { token } : undefined,
      autoConnect: true,
      transports: ['websocket', 'polling']
    });
  } else if (token && (socketInstance.auth as any)?.token !== token) {
    socketInstance.auth = { token };
    socketInstance.disconnect().connect();
  }

  return socketInstance;
}
