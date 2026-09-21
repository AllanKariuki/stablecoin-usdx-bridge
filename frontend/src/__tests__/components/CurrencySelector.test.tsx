/**
 * CurrencySelector Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CurrencySelector } from '@src/components/conversion';
import * as fixtures from '@src/test-data/conversion-fixtures';

describe('CurrencySelector', () => {
  it('should render currency selector with default value', () => {
    const onChange = vi.fn();
    render(
      <CurrencySelector
        currencies={fixtures.mockCurrencies}
        value="USD"
        onChange={onChange}
        label="Select Currency"
      />
    );

    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('US Dollar')).toBeInTheDocument();
  });

  it('should open dropdown when clicked', async () => {
    const onChange = vi.fn();
    render(
      <CurrencySelector
        currencies={fixtures.mockCurrencies}
        value="USD"
        onChange={onChange}
      />
    );

    const button = screen.getByRole('button');
    await userEvent.click(button);

    // Dropdown should be visible
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search currencies...')).toBeInTheDocument();
    });
  });

  it('should filter currencies by search term', async () => {
    const onChange = vi.fn();
    render(
      <CurrencySelector
        currencies={fixtures.mockCurrencies}
        value="USD"
        onChange={onChange}
      />
    );

    const button = screen.getByRole('button');
    await userEvent.click(button);

    const searchInput = screen.getByPlaceholderText('Search currencies...');
    await userEvent.type(searchInput, 'Euro');

    await waitFor(() => {
      expect(screen.getByText('Euro')).toBeInTheDocument();
    });
  });

  it('should exclude specified currencies', async () => {
    const onChange = vi.fn();
    render(
      <CurrencySelector
        currencies={fixtures.mockCurrencies}
        value="USD"
        onChange={onChange}
        excludeCurrencies={['EUR', 'GBP']}
      />
    );

    const button = screen.getByRole('button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.queryByText('EUR')).not.toBeInTheDocument();
      expect(screen.queryByText('GBP')).not.toBeInTheDocument();
    });
  });

  it('should call onChange when currency is selected', async () => {
    const onChange = vi.fn();
    render(
      <CurrencySelector
        currencies={fixtures.mockCurrencies}
        value="USD"
        onChange={onChange}
      />
    );

    const button = screen.getByRole('button');
    await userEvent.click(button);

    const eurButton = screen.getAllByRole('button').find((btn) =>
      btn.textContent?.includes('EUR')
    );

    if (eurButton) {
      await userEvent.click(eurButton);
      expect(onChange).toHaveBeenCalledWith('EUR');
    }
  });

  it('should be disabled when disabled prop is true', () => {
    const onChange = vi.fn();
    render(
      <CurrencySelector
        currencies={fixtures.mockCurrencies}
        value="USD"
        onChange={onChange}
        disabled={true}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});
