/**
 * Conversion WebSocket Manager
 * Handles WebSocket connections for transaction monitoring
 */

import { getWebSocketInstance } from '../../../services/websocketService';
import type { WebSocketMessage } from '../../../types/auth-and-websocket/websocket';
import type { TransactionStatusUpdate } from '../../../types/conversion';
import type { AppDispatch } from '../../store';

let wsInstance: ReturnType<typeof getWebSocketInstance> | null = null;
let activeTransactionId: string | null = null;

/**
 * Setup WebSocket connection for transaction monitoring
 * Call this when a transaction is created or when you want to monitor a specific transaction
 * 
 * @param transactionId - The transaction ID to monitor
 * @param dispatch - Redux dispatch function
 * @param onUpdate - Callback function to handle transaction updates
 * @returns Cleanup function to disconnect WebSocket
 * 
 * @example
 * ```typescript
 * const unsubscribe = setupTransactionWebSocket(
 *   'tx-123',
 *   dispatch,
 *   (update) => dispatch(handleWebSocketTransactionUpdate(update))
 * );
 * 
 * // Later, cleanup
 * unsubscribe();
 * ```
 */
export const setupTransactionWebSocket = (
  transactionId: string,
  dispatch: AppDispatch,
  onUpdate: (update: TransactionStatusUpdate) => void
): (() => void) => {
  // If already monitoring this transaction, return no-op
  if (activeTransactionId === transactionId && wsInstance?.isConnected) {
    return () => {};
  }

  activeTransactionId = transactionId;

  // Get or create WebSocket instance
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
  wsInstance = getWebSocketInstance({
    url: `${wsUrl}/ws/transactions/${transactionId}`,
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
  });

  // Setup message handler for transaction updates
  const handleMessage = (message: WebSocketMessage) => {
    if (message.type === 'transaction_update' || message.type === 'status_update') {
      const update = message.payload as TransactionStatusUpdate;
      onUpdate(update);

      // Auto-disconnect when transaction is complete
      if (
        update.status === 'completed' ||
        update.status === 'failed' ||
        update.status === 'cancelled'
      ) {
        setTimeout(() => {
          if (wsInstance) {
            wsInstance.disconnect();
            wsInstance = null;
            activeTransactionId = null;
          }
        }, 2000); // Wait 2s before disconnecting
      }
    }
  };

  // Setup event handlers
  wsInstance.on('message', handleMessage);
  wsInstance.on('error', (error) => {
    console.error('Transaction WebSocket error:', error);
  });
  wsInstance.on('close', () => {
    console.log('Transaction WebSocket closed');
  });

  // Connect
  wsInstance.connect().catch((error) => {
    console.error('Failed to connect transaction WebSocket:', error);
  });

  // Return cleanup function
  return () => {
    if (wsInstance) {
      wsInstance.off('message');
      wsInstance.disconnect();
      wsInstance = null;
      activeTransactionId = null;
    }
  };
};

/**
 * Get the current WebSocket connection status
 */
export const getWebSocketStatus = () => ({
  isConnected: wsInstance?.isConnected ?? false,
  activeTransactionId,
});

/**
 * Manually disconnect the WebSocket
 */
export const disconnectTransactionWebSocket = () => {
  if (wsInstance) {
    wsInstance.disconnect();
    wsInstance = null;
    activeTransactionId = null;
  }
};
