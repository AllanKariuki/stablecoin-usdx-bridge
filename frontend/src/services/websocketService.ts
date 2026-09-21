import type { WebSocketConfig, WebSocketMessage } from "../types/auth-and-websocket/websocket";

interface WebSocketInstance {
    connect: () => Promise<void>;
    disconnect: () => void;
    sendMessage: (message: WebSocketMessage) => void;
    on: (event: string, handler: (data: any) => void) => void;
    off: (event: string) => void;
    isConnected: boolean;
    readyState: number;
}

export type { WebSocketInstance };

export const createWebSocketService = (config: WebSocketConfig): WebSocketInstance => {
    // Private state using closures
    let socket: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let messageQueue: WebSocketMessage[] = [];
    const eventHandlers: { [key: string]: (data?: any) => void} = {};
    let reconnectAttempts = 0;

    const finalConfig = {
        reconnectInterval: 5000,
        maxReconnectAttempts: 5,
        ...config
    };

    const connect = (): Promise<void> => {
        return new Promise((resolve, reject) => {
            try{
                // Clean up existing connection if any
                if (socket) {
                    socket.close();
                }

                socket = new WebSocket(finalConfig.url, finalConfig.protocols);

                socket.onopen = () => {
                    reconnectAttempts = 0;
                    onConnectionOpened();
                    flushMessageQueue();
                    resolve();
                };

                socket.onmessage = (event) => {
                    handleMessage(event.data);
                };

                socket.onclose =(event) => {
                    // console.log('Websocket disconnected:', event.code, event.reason);
                    onConnectionClosed(event);
                } 

                socket.onerror = (error) => {
                    // console.error('Websocket error:', error);
                    onConnectionError(error);
                    reject(error);
                };
            } catch (error) {
                reject(error);
            }
        });
    };

    const disconnect = (): void => {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        if (socket) { 
            socket.close(1000, 'Manual disconnect');
            socket = null;
        }

        // Clear queued messages
        messageQueue = [];
        reconnectAttempts = 0;
    };

    const sendMessage = (message: WebSocketMessage): void => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        } else {
            // Queue message is not connected
            messageQueue.push(message);
        }
    };

    const on = (event:string, handler: (data: any) => void): void => {
        eventHandlers[event] = handler;
    };

    const off = (event: string): void => {
        delete eventHandlers[event];
    };

    const handleMessage = (data: string): void => {
        try{
            const message = JSON.parse(data);
            eventHandlers['message']?.(message);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    const onConnectionOpened = ():void => {
        eventHandlers['open']?.();
    };

    const onConnectionClosed = (event: CloseEvent): void => {
        eventHandlers['close']?.(event);
        attemptReconnect();
    };

    const onConnectionError = (error: Event): void => {
        eventHandlers['error']?.(error);
    };

    const attemptReconnect = (): void => {
        if (reconnectTimer || reconnectAttempts >= finalConfig.maxReconnectAttempts!) {
            return;
        }

        reconnectAttempts++;
        reconnectTimer = setTimeout(() => {
            eventHandlers['reconnectAttempt']?.(reconnectAttempts);
            connect()
                .then(() => {
                    reconnectTimer = null;
                })
                .catch(() => {
                    reconnectTimer = null;
                });
        }, finalConfig.reconnectInterval);
    };

    const flushMessageQueue = ():void => {
        while (messageQueue.length > 0) {
            const message = messageQueue.shift();
            if (message) {
                sendMessage(message);
            }
        }
    };

    // Return public interface
    return {
        connect,
        disconnect,
        sendMessage,
        on,
        off,
        get isConnected(): boolean {
            return socket?.readyState === WebSocket.OPEN;
        },
        get readyState(): number {
            return socket?.readyState ?? WebSocket.CLOSED;
        }
    };

};

// Alternative: single instance factory with module-level state
let globalWebSocketInstance: WebSocketInstance | null = null;
export const getWebSocketInstance = (config: WebSocketConfig): WebSocketInstance => {
    if (!globalWebSocketInstance) {
        globalWebSocketInstance = createWebSocketService(config);
    }

    return globalWebSocketInstance;
};

export const destroyWebSocketInstance = (): void => {
    if (globalWebSocketInstance) {
        globalWebSocketInstance.disconnect();
        globalWebSocketInstance = null;
    }
};