import React, { useState } from 'react';
import { ShoppingCart, Heart, ArrowLeft, Plus, Minus, Filter } from 'lucide-react';
import SearchableTable from '../../../components/general/SearchableTable';
import type { FilterConfig } from '../../../types/general/searchTable';

interface ShoppingItem {
  id: string;
  name: string;
  store: string;
  price: number;
  image: string;
  quantity: number;
  category: string;
}

interface CartItem extends ShoppingItem {
  quantity: number;
}

interface ShoppingTransaction {
  id: string;
  orderId: string;
  store: string;
  items: string;
  amount: number;
  fee: number;
  total: number;
  status: 'completed' | 'pending' | 'failed' | 'delivered';
  paymentMethod: 'card' | 'wallet' | 'bank_transfer';
  reference: string;
  paidAt: string;
  deliveryDate?: string;
  createdAt: string;
}

const Shopping: React.FC = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const availableItems: ShoppingItem[] = [
    {
      id: 'it1',
      name: 'Wireless Headphones',
      store: 'Amazon',
      price: 79.99,
      image: '🎧',
      quantity: 0,
      category: 'Electronics',
    },
    {
      id: 'it2',
      name: 'USB-C Cable',
      store: 'Best Buy',
      price: 19.99,
      image: '🔌',
      quantity: 0,
      category: 'Electronics',
    },
    {
      id: 'it3',
      name: 'Designer Watch',
      store: 'Fashion Hub',
      price: 199.99,
      image: '⌚',
      quantity: 0,
      category: 'Fashion',
    },
    {
      id: 'it4',
      name: 'Running Shoes',
      store: 'Sport Zone',
      price: 89.99,
      image: '👟',
      quantity: 0,
      category: 'Fashion',
    },
    {
      id: 'it5',
      name: 'Coffee Maker',
      store: 'Home Depot',
      price: 149.99,
      image: '☕',
      quantity: 0,
      category: 'Home',
    },
    {
      id: 'it6',
      name: 'Desk Lamp',
      store: 'IKEA',
      price: 34.99,
      image: '💡',
      quantity: 0,
      category: 'Home',
    },
  ];

  const handleAddToCart = (item: ShoppingItem) => {
    const existingItem = cart.find((c) => c.id === item.id);
    if (existingItem) {
      setCart(
        cart.map((c) =>
          c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      );
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
  };

  const handleUpdateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(cart.filter((c) => c.id !== id));
    } else {
      setCart(
        cart.map((c) =>
          c.id === id ? { ...c, quantity } : c
        )
      );
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = cartTotal > 0 ? 5.99 : 0;
  const tax = (cartTotal * 0.08).toFixed(2);

  const categories = ['All', 'Electronics', 'Fashion', 'Home'];

  // Mock shopping history data
  const shoppingHistory: ShoppingTransaction[] = [
    {
      id: '1',
      orderId: 'SHP-2025011501001',
      store: 'Amazon',
      items: 'Wireless Headphones',
      amount: 79.99,
      fee: 4.00,
      total: 83.99,
      status: 'delivered',
      paymentMethod: 'card',
      reference: 'AMZ-79991501',
      paidAt: '2025-01-15T10:30:00Z',
      deliveryDate: '2025-01-18',
      createdAt: '2025-01-15T10:30:00Z',
    },
    {
      id: '2',
      orderId: 'SHP-2025011402002',
      store: 'Best Buy',
      items: 'USB-C Cable',
      amount: 19.99,
      fee: 1.50,
      total: 21.49,
      status: 'delivered',
      paymentMethod: 'wallet',
      reference: 'BB-19991402',
      paidAt: '2025-01-14T14:15:00Z',
      deliveryDate: '2025-01-16',
      createdAt: '2025-01-14T14:15:00Z',
    },
    {
      id: '3',
      orderId: 'SHP-2025011301003',
      store: 'Fashion Hub',
      items: 'Designer Watch, Running Shoes',
      amount: 289.98,
      fee: 14.50,
      total: 304.48,
      status: 'completed',
      paymentMethod: 'card',
      reference: 'FH-28991301',
      paidAt: '2025-01-13T09:45:00Z',
      createdAt: '2025-01-13T09:45:00Z',
    },
    {
      id: '4',
      orderId: 'SHP-2025011201004',
      store: 'Home Depot',
      items: 'Coffee Maker',
      amount: 149.99,
      fee: 7.50,
      total: 157.49,
      status: 'pending',
      paymentMethod: 'card',
      reference: 'HD-14991201',
      paidAt: null,
      createdAt: '2025-01-12T11:20:00Z',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'card':
        return 'Credit Card';
      case 'wallet':
        return 'Wallet';
      case 'bank_transfer':
        return 'Bank Transfer';
      default:
        return method;
    }
  };

  const columns = [
    {
      header: 'Order',
      accessor: 'orderId',
      render: (_: any, record: ShoppingTransaction) => (
        <div>
          <p className="font-medium text-gray-900">{record.orderId}</p>
          <p className="text-xs text-gray-600">{record.store}</p>
        </div>
      ),
    },
    {
      header: 'Items',
      accessor: 'items',
      render: (_: any, record: ShoppingTransaction) => (
        <p className="text-gray-700 text-sm">{record.items}</p>
      ),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (_: any, record: ShoppingTransaction) => (
        <div>
          <p className="font-semibold text-gray-900">
            ${record.amount.toFixed(2)}
          </p>
          <p className="text-xs text-gray-600">Fee: ${record.fee.toFixed(2)}</p>
        </div>
      ),
    },
    {
      header: 'Total',
      accessor: 'total',
      render: (_: any, record: ShoppingTransaction) => (
        <span className="font-bold text-gray-900">
          ${record.total.toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Payment Method',
      accessor: 'paymentMethod',
      render: (_: any, record: ShoppingTransaction) => (
        <span className="text-gray-600">
          {getPaymentMethodLabel(record.paymentMethod)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (_: any, record: ShoppingTransaction) => (
        <span
          className={`px-3 py-1 rounded-full font-medium text-xs ${getStatusColor(
            record.status
          )}`}
        >
          {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
        </span>
      ),
    },
    {
      header: 'Date',
      accessor: 'paidAt',
      render: (_: any, record: ShoppingTransaction) => (
        <span className="text-gray-600">
          {new Date(record.paidAt || record.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Reference',
      accessor: 'reference',
      render: (_: any, record: ShoppingTransaction) => (
        <span className="text-xs font-mono text-gray-600">{record.reference}</span>
      ),
    },
  ];

  const filters: FilterConfig[] = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { label: 'All', value: '' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Completed', value: 'completed' },
        { label: 'Pending', value: 'pending' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      key: 'paymentMethod',
      label: 'Payment Method',
      options: [
        { label: 'All', value: '' },
        { label: 'Credit Card', value: 'card' },
        { label: 'Wallet', value: 'wallet' },
        { label: 'Bank Transfer', value: 'bank_transfer' },
      ],
    },
    {
      key: 'store',
      label: 'Store',
      options: [
        { label: 'All', value: '' },
        { label: 'Amazon', value: 'Amazon' },
        { label: 'Best Buy', value: 'Best Buy' },
        { label: 'Fashion Hub', value: 'Fashion Hub' },
        { label: 'Sport Zone', value: 'Sport Zone' },
        { label: 'Home Depot', value: 'Home Depot' },
        { label: 'IKEA', value: 'IKEA' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Online Shopping</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Filter className="w-5 h-5" />
              History
            </button>
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ShoppingCart className="w-5 h-5" />
              Cart
              {cart.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Payment History Section */}
        {showHistory && (
          <div className="mb-8">
            <SearchableTable
              data={shoppingHistory}
              columns={columns}
              filters={filters}
              searchPlaceholder="Search by order ID, store, or items..."
              title="Shopping Payment History"
              titleIcon={<Filter className="w-5 h-5 mr-2 text-gray-600" />}
              description="View all your online shopping transactions"
              actionButton={{
                label: 'Continue Shopping',
                onClick: () => setShowHistory(false),
                className:
                  'px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors',
              }}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Products */}
          <div className="lg:col-span-2">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Featured Items</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {availableItems.map((item) => {
                  const cartItem = cart.find((c) => c.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <div className="bg-gray-100 p-6 text-center">
                        <div className="text-6xl mb-2">{item.image}</div>
                        <span className="inline-block px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded-full">
                          {item.category}
                        </span>
                      </div>

                      <div className="p-4">
                        <h3 className="font-semibold text-gray-800">{item.name}</h3>
                        <p className="text-sm text-gray-600 mb-3">{item.store}</p>

                        <div className="mb-4">
                          <p className="text-2xl font-bold text-gray-800">
                            ${item.price.toFixed(2)}
                          </p>
                        </div>

                        {!cartItem ? (
                          <button
                            onClick={() => handleAddToCart(item)}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <ShoppingCart className="w-4 h-4" />
                            Add to Cart
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                            <button
                              onClick={() =>
                                handleUpdateQuantity(item.id, cartItem.quantity - 1)
                              }
                              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                              <Minus className="w-4 h-4 text-gray-700" />
                            </button>
                            <span className="flex-1 text-center font-semibold text-gray-800">
                              {cartItem.quantity}
                            </span>
                            <button
                              onClick={() =>
                                handleUpdateQuantity(item.id, cartItem.quantity + 1)
                              }
                              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                              <Plus className="w-4 h-4 text-gray-700" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cart Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 sticky top-24 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Order Summary</h2>

              {cart.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Your cart is empty</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between pb-3 border-b border-gray-200"
                      >
                        <div>
                          <p className="font-medium text-gray-800">{item.name}</p>
                          <p className="text-sm text-gray-600">
                            ${item.price.toFixed(2)} x {item.quantity}
                          </p>
                        </div>
                        <p className="font-semibold text-gray-800">
                          ${(item.price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 mb-6 pb-6 border-b border-gray-200">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>${cartTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Delivery Fee</span>
                      <span>${deliveryFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Tax (8%)</span>
                      <span>${tax}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mb-6">
                    <span className="font-semibold text-gray-800">Total</span>
                    <span className="text-2xl font-bold text-gray-800">
                      ${(cartTotal + deliveryFee + parseFloat(tax)).toFixed(2)}
                    </span>
                  </div>

                  <button className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors">
                    Checkout
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Shopping;
