import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AttentionStrip } from '../components/AttentionStrip';

const strip = (items: Parameters<typeof AttentionStrip>[0]['items']) =>
  render(
    <MemoryRouter>
      <AttentionStrip items={items} />
    </MemoryRouter>,
  );

describe('attention strip', () => {
  it('links only the items that have something waiting', () => {
    strip([
      { key: 'kyc', label: 'KYC waiting', to: '/kyc', count: 4, loading: false },
      { key: 'alerts', label: 'open alerts', to: '/alerts', count: 0, loading: false },
    ]);
    expect(screen.getByRole('link', { name: /4\s*KYC waiting/ })).toHaveAttribute('href', '/kyc');
    expect(screen.queryByText('open alerts')).not.toBeInTheDocument();
  });

  it('says all clear when everything is loaded and zero', () => {
    strip([{ key: 'kyc', label: 'KYC waiting', to: '/kyc', count: 0, loading: false }]);
    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
  });
});
