export interface WebSocketState {
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
    messages: WebSocketMessage[];
    reconnectAttempts: number;
}

export interface WebSocketMessage {
    id: string;
    type: string;
    payload: unknown; // Use 'unknown' for better type safety
    timestamp: number;
}

export interface WebSocketConfig {
    url: string;
    protocols?: string | string[];
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
}

export const WebSocketActionType = {
    CONNECT: 'websocket/connect',
    DISCONNECT: 'websocket/disconnect',
    SEND_MESSAGE: 'websocket/sendMessage',
    CONNECTION_OPENED: 'websocket/connectionOpened',
    CONNECTION_CLOSED: 'websocket/connectionClosed',
    CONNECTION_ERROR: 'websocket/connectionError',
    MESSAGE_RECEIVED: 'websocket/messageReceived',
    RECONNECT_ATTEMPT: 'websocket/reconnectAttempt'
} as const;

export type WebSocketActionType = typeof WebSocketActionType[keyof typeof WebSocketActionType];
