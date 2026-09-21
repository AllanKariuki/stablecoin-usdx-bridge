import type { Middleware } from "@reduxjs/toolkit";
import { createWebSocketService } from './websocketService';
import { type WebSocketInstance } from './websocketService';
import type { WebSocketConfig } from '../types/auth-and-websocket/websocket';
import {
    connect,
    disconnect,
    connectionOpened,
    connectionClosed,
    connectionError,
    messageReceived,
    sendMessage,
    reconnectAttempt
} from '../redux/slices/oauth-web-sockets/websocketSlice';


export const createWebSocketMiddleWare = (config: WebSocketConfig): Middleware => {
    let websocketService: WebSocketInstance | null = null;

    return (store) => (next) => (action) => {
        const { dispatch } = store;

        // Check if this is a websocket action
        // if (!action.type || typeof action.type !== 'string' || !action.type.startsWith('websocket/')) {
        //     return next(action);
        // }

        switch ((action as { type: string }).type) {
            case connect.type:
                if (websocketService) {
                    websocketService.disconnect();
                }

                websocketService = createWebSocketService(config);

                //Set up event handlers
                websocketService.on('open', () => {
                    console.log('Attempting to connect to WebSocket:', config.url);
                    dispatch(connectionOpened());
                });

                websocketService.on('close', (event: CloseEvent) => {
                    dispatch(connectionClosed(event));
                });

                websocketService.on('error', (error: Event) => {
                    dispatch(connectionError(error.toString()));
                });

                websocketService.on('message', (message:any) => {
                    dispatch(messageReceived({
                        id: Date.now().toString(),
                        type: message.type || 'message',
                        payload: message,
                        timestamp: Date.now()
                    }));
                });

                websocketService.on('reconnectAttempt', () => {
                    dispatch(reconnectAttempt());
                });

                // Attempt to connection after event handlers are set up
                websocketService.connect().catch((error: any) => {
                    dispatch(connectionError(error.toString()));
                });

                break;
            
            case disconnect.type:
                if (websocketService) {
                    websocketService.disconnect();
                    websocketService = null;
                }
                break;
            
            case sendMessage.type:
                if (websocketService && websocketService.isConnected) {
                    const messageAction = action as { payload: any };
                    websocketService.sendMessage(messageAction.payload);
                } else {
                    console.warn('WebSocket not conected, message not sent:', action);
                }
                break;
            
            default:
                break;
        }
        return next(action);
    };
};