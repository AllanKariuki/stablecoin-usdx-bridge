import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { TrendingUp, TrendingDown } from 'lucide-react';
import SearchableTable from '../../components/general/SearchableTable';
import StockDetailView from '../../components/investments/StockDetailView';
import {
  fetchStocks,
  selectStocks,
  selectInvestmentsLoading,
  selectInvestmentsError,
  selectStock,
} from '../../redux/slices/investments/investmentsSlice';

export default function InvestmentsStocks() {
  const dispatch = useDispatch();
  const stocks = useSelector(selectStocks);
  const loading = useSelector(selectInvestmentsLoading);
  const error = useSelector(selectInvestmentsError);
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Fetch stocks on component mount
  useEffect(() => {
    dispatch(fetchStocks() as any);
  }, [dispatch]);

  const handleRowClick = (stock: any) => {
    setSelectedStock(stock);
    setShowDetail(true);
    dispatch(selectStock(stock) as any);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
    setTimeout(() => setSelectedStock(null), 300);
  };

  // Define table columns
  const columns = [
    {
      accessor: 'symbol',
      title: 'Symbol',
      sortable: true,
      render: (_: any, record: any) => (
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white ${
              record.symbol === 'AAPL'
                ? 'bg-blue-500'
                : record.symbol === 'GOOGL'
                  ? 'bg-red-500'
                  : record.symbol === 'MSFT'
                    ? 'bg-cyan-500'
                    : 'bg-purple-500'
            }`}
          >
            {record.symbol}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-gray-900">{record.symbol}</span>
            <span className="text-xs text-gray-500">{record.name}</span>
          </div>
        </div>
      ),
    },
    {
      accessor: 'quantity',
      title: 'Quantity',
      sortable: true,
      textAlignment: 'center' as const,
      render: (_: any, record: any) => (
        <span className="text-sm text-gray-700">{record.quantity} shares</span>
      ),
    },
    {
      accessor: 'currentPrice',
      title: 'Current Price',
      sortable: true,
      textAlignment: 'right' as const,
      render: (_: any, record: any) => (
        <span className="text-sm font-medium text-gray-900">
          ${record.currentPrice.toFixed(2)}
        </span>
      ),
    },
    {
      accessor: 'totalValue',
      title: 'Total Value',
      sortable: true,
      textAlignment: 'right' as const,
      render: (_: any, record: any) => (
        <span className="text-sm font-semibold text-gray-900">
          ${record.totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      accessor: 'gainLossPercent',
      title: 'Change',
      sortable: true,
      textAlignment: 'right' as const,
      render: (_: any, record: any) => (
        <div className="flex items-center justify-end gap-2">
          {record.gainLossPercent >= 0 ? (
            <TrendingUp className="w-4 h-4 text-green-600" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-600" />
          )}
          <span
            className={`text-sm font-semibold ${
              record.gainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {record.gainLossPercent >= 0 ? '+' : ''}
            {record.gainLossPercent.toFixed(2)}%
          </span>
        </div>
      ),
    },
    {
      accessor: 'gainLoss',
      title: 'Gain/Loss',
      sortable: true,
      textAlignment: 'right' as const,
      render: (_: any, record: any) => (
        <span
          className={`text-sm font-medium ${
            record.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {record.gainLoss >= 0 ? '+' : ''}
          ${Math.abs(record.gainLoss).toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Stocks</h1>
        <p className="text-gray-600 mt-2">
          Browse and manage your stock investments
        </p>
      </div>

      {/* Stock List Table */}
      <SearchableTable
        title="My Stock Holdings"
        description="Search for stocks, view market data, and manage your equity investments."
        data={stocks}
        columns={columns}
        loading={loading}
        error={error}
        onRowClick={handleRowClick}
        searchPlaceholder="Search by symbol or company name..."
        minHeight={300}
        defaultRecordsPerPage={10}
        highlightOnHover={true}
      />

      {/* Stock Detail View Modal/Drawer */}
      {showDetail && selectedStock && (
        <StockDetailView
          stock={selectedStock}
          isOpen={showDetail}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}
