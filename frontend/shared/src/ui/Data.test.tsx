import { fireEvent, render, screen } from '@testing-library/react';
import { DataTable, pageWindow } from './Data';

type Row = { id: string };
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `row-${i + 1}` }));
const columns = [{ key: 'id', header: 'Id', render: (r: Row) => r.id }];

describe('pageWindow', () => {
  it('lists every page up to seven', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('keeps the ends and the current page neighbours', () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, 5, 'gap', 10]);
    expect(pageWindow(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
    expect(pageWindow(10, 10)).toEqual([1, 'gap', 6, 7, 8, 9, 10]);
  });
});

describe('DataTable pagination', () => {
  it('renders every row when pageSize is not set', () => {
    render(<DataTable columns={columns} rows={rows(30)} rowKey={(r) => r.id} />);
    expect(screen.getByText('row-30')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('pages through rows', () => {
    render(<DataTable columns={columns} rows={rows(25)} rowKey={(r) => r.id} pageSize={10} />);
    expect(screen.getByText('row-10')).toBeInTheDocument();
    expect(screen.queryByText('row-11')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1–10 of 25');

    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(screen.getByText('row-25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
  });

  it('hides the footer when everything fits on one page', () => {
    render(<DataTable columns={columns} rows={rows(4)} rowKey={(r) => r.id} pageSize={10} />);
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('changes page size and goes back to page 1', () => {
    render(<DataTable columns={columns} rows={rows(60)} rowKey={(r) => r.id} pageSize={10} pageSizeOptions={[10, 25, 50]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '25' } });
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1–25 of 60');
  });

  it('resets to page 1 when resetKey changes and clamps when rows shrink', () => {
    const { rerender } = render(<DataTable columns={columns} rows={rows(30)} rowKey={(r) => r.id} pageSize={10} resetKey="a" />);
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    rerender(<DataTable columns={columns} rows={rows(15)} rowKey={(r) => r.id} pageSize={10} resetKey="a" />);
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 11–15 of 15');
    rerender(<DataTable columns={columns} rows={rows(15)} rowKey={(r) => r.id} pageSize={10} resetKey="b" />);
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1–10 of 15');
  });
});
