/**
 * UI Store
 * 
 * Manages client-side UI state:
 * - Theme preference (light/dark)
 * - Modal open/close states
 * - Selected trading pair
 * - Sidebar collapsed state
 * - Active navigation item
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface UIState {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  
  // Trading
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
  chartInterval: string;
  setChartInterval: (interval: string) => void;
  
  // Layout
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  
  // Modals
  modals: {
    deposit: boolean;
    withdraw: boolean;
    orderConfirmation: boolean;
    kyc: boolean;
  };
  openModal: (modal: keyof UIState['modals']) => void;
  closeModal: (modal: keyof UIState['modals']) => void;
  closeAllModals: () => void;
  
  // Mobile
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(