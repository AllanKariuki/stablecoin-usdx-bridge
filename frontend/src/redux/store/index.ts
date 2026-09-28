import { configureStore } from '@reduxjs/toolkit';
import { getConfig } from '../../Config';
import { getToken } from '../../utils/authUtils';
import { enableMapSet } from 'immer';
import websocketReducer from '../slices/oauth-web-sockets/websocketSlice';
import { createWebSocketMiddleWare } from '../../services/websocketMiddleware';
import authReducer from '../slices/oauth-web-sockets/authSlice';
import notificationReducer from '../slices/oauth-web-sockets/notificationSlice';
import searchReducer from '../slices/navigation/searchSlice';
import sidebarReducer from '../slices/navigation/sidebarSlice';
import unifiedNotificationsReducer from '../slices/navigation/unifiedNotificationsSlice';
// import financialPlanningReducer from '../slices/financial-planning/financialPlanningSlice';
// import investmentsReducer from '../slices/investments/investmentsSlice';
// import insuranceReducer from '../slices/insurance/insuranceSlice';
// import loansReducer from '../slices/loans/loansSlice';
// import accountsReducer from '../slices/accounts/accountsSlice';
import paymentsReducer from '../slices/payments/paymentsSlice';
import transactionsReducer from '../slices/transactions/transactionsSlice';
import walletReducer from '../slices/wallet/walletSlice';
import dashboardReducer from '../slices/dashboard/dashboardSlice';
import conversionReducer from '../slices/conversion/conversionSlice';
import bankAccountsReducer from '../slices/bankAccountsSlice';

// Enable Map and Set support in Immer for Redux state
enableMapSet();

// Websocket configuration.
//
// The URL comes from runtime-config.js (ws://localhost:3000/ws), which is what
// services/notifications was built to answer on — the old fallback pointed at
// :5000, a port nothing in this platform has ever used.
//
// The token travels as a query parameter rather than a header because a
// browser cannot set headers on `new WebSocket()`. That is also why the
// upgrade is verified by the notifications service itself rather than by
// Traefik's ForwardAuth (see services/notifications/src/ws/ws.auth.ts).
const websocketConfig = {
    url: buildWebSocketUrl(),
    reconnectInterval: 5000,
    maxReconnectAttempts: 5
};

function buildWebSocketUrl(): string {
    const base = getConfig().VITE_APP_WEBSOCKET_URL || 'ws://localhost:3000/ws';
    const token = getToken();
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export const store = configureStore({
    reducer: {
        websocket: websocketReducer,
        auth: authReducer,
        notification: notificationReducer,
        search: searchReducer,
        sidebar: sidebarReducer,
        unifiedNotifications: unifiedNotificationsReducer,
        // financialPlanning: financialPlanningReducer,
        // investments: investmentsReducer,
        // insurance: insuranceReducer,
        // loans: loansReducer,
        // accounts: accountsReducer,
        payments: paymentsReducer,
        transactions: transactionsReducer,
        wallet: walletReducer,
        dashboard: dashboardReducer,
        conversion: conversionReducer,
        bankAccounts: bankAccountsReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                // Ignore websocket-related actions in serialization check
                ignoredActions: ['websocket/connectionClosed', 'websocket/connectionError', 'websocket/reconnectAttempt'],
                // Ignore these filed paths in all actions
                // ignoredActionPaths: ['[ayload.timestamp'],
                // // Ignore these paths in the state
                // ignoredPaths: ['websocket.messages'],
            },
        }).concat(createWebSocketMiddleWare(websocketConfig)),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
