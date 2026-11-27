import { NavTabs } from '@damp/web-shared/ui';

/** The deposit / withdraw / transfer tabs, shared across the move pages so
 * switching rails never strands the user without the cross-links. */
export default function MoveNav() {
  return (
    <NavTabs
      tabs={[
        { to: '/move/deposit', label: 'Deposit' },
        { to: '/move/withdraw', label: 'Withdraw' },
        { to: '/move/transfer', label: 'Transfer' },
      ]}
    />
  );
}
