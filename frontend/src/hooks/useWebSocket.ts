import { useDispatch, useSelector } from "react-redux";
import { useEffect, useCallback } from "react";
import type { RootState, AppDispatch } from "../redux/store";
import {
    connect,
    disconnect,
    sendMessage,
    clearMessages,
    clearError,
} from '../redux/slices/oauth-web-sockets/websocketSlice';
import type { WebSocketMessage } from "../types/auth-and-websocket/websocket";

export const useWebSocket = () => {
    const dispatch = useDispatch<AppDispatch>();
    const websocketState = useSelector((state: RootState) => state.websocket);

    const connectWebSocket = useCallback(() => {
        dispatch(connect());
    }, [dispatch]);

    const disconnectWebSocket = useCallback(() => {
        dispatch(disconnect());
    }, [dispatch]);

    // Send message through web socket
    const sendWebSocketMessage = useCallback((type: string, payload: any) => {
        const message: WebSocketMessage = {
            id: Date.now().toString(),
            type,
            payload,
            timestamp: Date.now()
        };
        dispatch(sendMessage(message));
    }, [dispatch]);

    // Clear all messages
    const clearAllMessages = useCallback(() => {
        dispatch(clearMessages());
    }, [dispatch]);

    // Clear error 
    const clearWebSocketError = useCallback(() => {
        dispatch(clearError());
    }, [dispatch]);

    // Auto-connect on mount
    useEffect(() => {
        connectWebSocket();

        // Clean up on unmount
        return () => {
            disconnectWebSocket();
        };
    }, [connectWebSocket, disconnectWebSocket]);

    return {
        // State
        isConnected: websocketState.isConnected,
        isConnecting: websocketState.isConnecting,
        error: websocketState.error,
        messages: websocketState.messages,
        reconnectAttempts: websocketState.reconnectAttempts,

        // Actions
        connect: connectWebSocket,
        disconnect: disconnectWebSocket,
        sendMessage: sendWebSocketMessage,
        clearMessages: clearAllMessages,
        clearError: clearWebSocketError
    };
};