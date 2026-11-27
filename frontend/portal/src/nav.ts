import { ArrowLeftRight, ArrowRightLeft, Bell, CheckSquare, Coins, FileText, Home, ReceiptText, ShieldCheck, Wallet } from 'lucide-react';
import type { NavGroup } from '@damp/web-shared/layout';

/**
 * Self-Service navigation. Each item names the permissions its screen needs;
 * AppShell drops the ones the signed-in user can't use, so nobody sees a
 * link that would 403.
 */
export const PORTAL_NAV: NavGroup[] = [
  {
    items: [
      { to: '/home', label: 'Home', icon: Home, end: true },
      { to: '/wallets', label: 'Wallets', icon: Wallet, anyOf: ['wallets:read:own'] },
      { to: '/transactions', label: 'Transactions', icon: ReceiptText, anyOf: ['transactions:read:own'] },
    ],
  },
  {
    label: 'Move money',
    items: [
      { to: '/convert', label: 'Convert', icon: ArrowRightLeft, anyOf: ['fx:convert'] },
      { to: '/move', label: 'Deposit & transfer', icon: ArrowLeftRight, anyOf: ['wallets:write:own'] },
      { to: '/usdx', label: 'USD-X', icon: Coins, anyOf: ['issuance:create', 'redemption:create'] },
      { to: '/payments', label: 'Payments', icon: FileText, anyOf: ['payments:read:own'] },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/approvals', label: 'Approvals', icon: CheckSquare, anyOf: ['approvals:propose', 'approvals:decide'] },
      { to: '/verification', label: 'Verification', icon: ShieldCheck, anyOf: ['kyc:submit'] },
      { to: '/notifications', label: 'Notifications', icon: Bell, anyOf: ['notifications:read:own'] },
    ],
  },
];
