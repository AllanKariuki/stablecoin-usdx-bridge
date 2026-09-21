import { useState } from "react";
import { Plus, Hash, DollarSign, Clock, CheckCircle } from "lucide-react";
import type { PaymentRequest } from "../../types/financial";
import SearchableTable from "../../components/general/SearchableTable";
import { useNavigate } from "react-router-dom";

const Request = () => {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    payerEmail: "",
    amount: "",
    currency: "USD",
    description: "",
    dueDate: "",
  });

  // Mock data
  const requests: PaymentRequest[] = [
    {
      id: "1",
      requesterId: "user1",
      requesterName: "You",
      payerName: "Alice Johnson",
      amount: 1500,
      currency: "USD",
      description: "Project completion payment",
      status: "pending",
      dueDate: "2024-01-25",
      paymentLink: "https://pay.example.com/req/p001",
      createdAt: "2024-01-12T10:00:00Z",
      expiresAt: "2024-02-12T10:00:00Z",
    },
    {
      id: "2",
      requesterId: "user1",
      requesterName: "You",
      payerName: "Bob Smith",
      amount: 500,
      currency: "USD",
      description: "Consulting services - January",
      status: "paid",
      dueDate: "2024-01-20",
      paymentLink: "https://pay.example.com/req/p002",
      paidAt: "2024-01-18T14:30:00Z",
      createdAt: "2024-01-10T09:00:00Z",
    },
    {
      id: "3",
      requesterId: "user1",
      requesterName: "You",
      payerName: "Carol White",
      amount: 2000,
      currency: "USD",
      description: "Design work - Website redesign",
      status: "pending",
      dueDate: "2024-01-30",
      paymentLink: "https://pay.example.com/req/p003",
      createdAt: "2024-01-08T11:00:00Z",
      expiresAt: "2024-02-08T11:00:00Z",
    },
    {
      id: "4",
      requesterId: "user1",
      requesterName: "You",
      payerName: "David Brown",
      amount: 750,
      currency: "USD",
      description: "Writing services",
      status: "expired",
      dueDate: "2024-01-10",
      paymentLink: "https://pay.example.com/req/p004",
      createdAt: "2024-01-05T08:00:00Z",
      expiresAt: "2024-01-12T08:00:00Z",
    },
    {
      id: "5",
      requesterId: "user1",
      requesterName: "You",
      payerName: "Eve Davis",
      amount: 1200,
      currency: "USD",
      description: "Development services - Q1 2024",
      status: "paid",
      dueDate: "2024-01-15",
      paymentLink: "https://pay.example.com/req/p005",
      paidAt: "2024-01-14T10:15:00Z",
      createdAt: "2024-01-01T09:00:00Z",
    },
  ];

  // Table configuration
  const columns = [
    {
      accessor: "payerName",
      title: "To",
      sortable: true,
      render: (value: string) => (
        <span className="font-medium text-gray-900">{value}</span>
      ),
    },
    {
      accessor: "amount",
      title: "Amount",
      sortable: true,
      render: (value: number, record: PaymentRequest) => (
        <span className="font-semibold text-gray-900">
          {value} {record.currency}
        </span>
      ),
    },
    {
      accessor: "description",
      title: "Description",
      sortable: true,
      render: (value: string) => <span className="text-gray-600">{value}</span>,
    },
    {
      accessor: "status",
      title: "Status",
      sortable: true,
      render: (value: string) => (
        <span
          className={`px-3 py-1 rounded-full font-medium text-xs ${getStatusColor(
            value
          )}`}
        >
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </span>
      ),
    },
    {
      accessor: "dueDate",
      title: "Due Date",
      sortable: true,
      render: (value: string) =>
        value ? new Date(value).toLocaleDateString() : "N/A",
    },
    {
      accessor: "createdAt",
      title: "Created",
      sortable: true,
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
  ];

  const tableActions = [
    {
      label: "View",
      icon: <span>👁️</span>,
      onClick: (record: PaymentRequest) => {
        // Handle view action
        console.log("View request:", record);
      },
      className: "text-blue-600 hover:text-blue-800 font-medium text-sm",
    },
  ];

  const filters = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "all", label: "All Status" },
        { value: "pending", label: "Pending" },
        { value: "paid", label: "Paid" },
        { value: "expired", label: "Expired" },
      ],
      defaultValue: "all",
    },
  ];

  const sortedRequests = [...requests].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle request submission
    setShowForm(false);
    setFormData({
      payerEmail: "",
      amount: "",
      currency: "USD",
      description: "",
      dueDate: "",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "expired":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const stats = {
    total: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    paid: requests.filter((r) => r.status === "paid").length,
    totalAmount: requests.reduce((sum, r) => sum + r.amount, 0),
  };

  return (
    <div className="bg-gray-50">
      <div className="flex gap-2 overflow-x-hidden text-sm mt-1 pl-6 mb-5">
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
          onClick={() => navigate('/dashboard')}
        >
          Home
        </button>
        <span className="text-gray-400">/</span>
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
        >
          Payments
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">
         Request Payment
        </span>
      </div>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Payment Requests Sent
            </h1>
            <p className="text-gray-600 mt-1">
              Track payment requests you've sent to others
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 font-medium flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Request
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Requests</p>
                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
                <p className="text-xs text-gray-500 mt-1">All requests</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Hash className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                <p className="text-xs text-gray-500 mt-1">{stats.total > 0 ? Math.round((stats.pending / stats.total) * 100) : 0}% of total</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Paid</p>
                <p className="text-2xl font-bold text-green-600">{stats.paid}</p>
                <p className="text-xs text-gray-500 mt-1">{stats.total > 0 ? Math.round((stats.paid / stats.total) * 100) : 0}% of total</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Amount</p>
                <p className="text-2xl font-bold text-purple-600">${stats.totalAmount.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Requested funds</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* New Request Form */}
        {showForm && (
          <div className="bg-white rounded-lg p-6 border border-gray-200 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-6">
              Send Payment Request
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Payer Email */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Payer Email
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.payerEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, payerEmail: e.target.value })
                    }
                    placeholder="payer@example.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Amount
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      required
                      value={formData.amount}
                      onChange={(e) =>
                        setFormData({ ...formData, amount: e.target.value })
                      }
                      placeholder="0.00"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={formData.currency}
                      onChange={(e) =>
                        setFormData({ ...formData, currency: e.target.value })
                      }
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option>USD</option>
                      <option>EUR</option>
                      <option>GBP</option>
                      <option>KES</option>
                      <option>NGN</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="e.g., Invoice #123, Services rendered"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Due Date */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Due Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) =>
                      setFormData({ ...formData, dueDate: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Send Request
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Searchable Table */}
        <SearchableTable
          data={sortedRequests}
          columns={columns}
          actions={tableActions}
          filters={filters}
          searchPlaceholder="Search by payer name or description..."
          searchMinLength={1}
          highlightOnHover={true}
          minHeight={400}
          selectable={false}
          recordsPerPageOptions={[5, 10, 25, 50]}
          defaultRecordsPerPage={10}
        />
      </div>
    </div>
  );
};

export default Request;
