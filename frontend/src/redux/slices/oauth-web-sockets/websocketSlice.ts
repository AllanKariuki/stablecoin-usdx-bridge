import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { WebSocketState, WebSocketMessage } from '../../../types/auth-and-websocket/websocket';

const initialState: WebSocketState = {
    isConnected: false,
    isConnecting: false,
    error: null,
    messages: [],
    reconnectAttempts: 0
};

const websocketSlice = createSlice({
    name: 'websocket',
    initialState,
    reducers: {
        connect: (state) => {
            state.isConnecting = true;
            state.error = null;
        },

        disconnect: (state) => {
            state.isConnecting = false;
            state.isConnected = false;
            state.reconnectAttempts = 0;
        },
        
        connectionOpened: (state) =>{
            state.isConnecting = false;
            state.isConnected = true;
            state.error = null;
            state.reconnectAttempts = 0;
        },

        connectionClosed: (state, action: PayloadAction<CloseEvent>) => {
            state.isConnected = false;
            state.isConnecting = false;
            if (action.payload.code !== 1000) { // 1000 is normal closure
                state.error = `Connection closed: ${action.payload.reason}`;
            }
        },

        connectionError: (state, action: PayloadAction<string>) => {
            state.isConnected = false;
            state.isConnecting = false;
            state.error = action.payload;
        },

        messageReceived: (state, action: PayloadAction<WebSocketMessage>) => {
            state.messages.push(action.payload);

            // Keep only last 100 messages to prevent memory issues
            if (state.messages.length > 100) {
                state.messages = state.messages.slice(-100);
            }
        },

        sendMessage: (_state, action: PayloadAction<WebSocketMessage>) => {
            // This action is typically handled by the websocket service, not the slice
            // But we can log or handle it here if needed
            console.log('Message sent:', action.payload);
        },

        reconnectAttempt: (state) => {
            state.reconnectAttempts += 1;
            state.isConnecting = true;
        },

        clearMessages: (state) => {
            state.messages = [];
        },

        clearError: (state) => {
            state.error = null;
        }
    }
});

export const {
  connect,
  disconnect,
  connectionOpened,
  connectionClosed,
  connectionError,
  messageReceived,
  sendMessage,
  reconnectAttempt,
  clearMessages,
  clearError
} = websocketSlice.actions;

export default websocketSlice.reducer;