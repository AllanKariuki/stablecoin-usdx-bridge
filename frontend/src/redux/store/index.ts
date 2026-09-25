import { configureStore } from '@reduxjs/toolkit';
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

// Websocket configuration
const websocketConfig = {
    url: import.meta.env.VITE_APP_WEBSOCKET_URL || 'ws://127.0.0.1:5000/ws',
    reconnectInterval: 5000,
    maxReconnectAttempts: 5
};

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
