import { Route, Routes } from 'react-router-dom';
import { NotFoundPage } from '@damp/web-shared/pages';
import { NavTabs, PageHeader } from '@damp/web-shared/ui';
import PaymentActivity from './payments/PaymentActivity';
import InvoicesTab from './payments/InvoicesTab';
import BankAccountsTab from './payments/BankAccountsTab';
import PayeesTab from './payments/PayeesTab';

export default function PaymentsPage() {
  return (
    <>
      <PageHeader eyebrow="Payments" title="Payments" description="Move money to and from banks and mobile money, pay people, and send invoices." />
      <NavTabs
        tabs={[
          { to: '/payments', label: 'Activity', end: true },
          { to: '/payments/invoices', label: 'Invoices' },
          { to: '/payments/banks', label: 'Banks & mobile money' },
          { to: '/payments/payees', label: 'Payees' },
        ]}
      />
      <Routes>
        <Route index element={<PaymentActivity />} />
        <Route path="invoices" element={<InvoicesTab />} />
        <Route path="banks" element={<BankAccountsTab />} />
        <Route path="payees" element={<PayeesTab />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
