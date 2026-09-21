import { useState } from 'react';
import { Plus, MessageSquare, Clock, CheckCircle2, AlertCircle, Search, Filter, Send, Paperclip, X } from 'lucide-react';

interface TicketMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderType: 'customer' | 'agent';
  message: string;
  createdAt: string;
  attachments?: string[];
}

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  description: string;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
  assignedAgent?: string;
}

const SupportTickets = () => {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [newMessage, setNewMessage] = useState('');

  const [tickets, setTickets] = useState<Ticket[]>([
    {
      id: '1',
      ticketNumber: 'TKT-2024-001',
      subject: 'Unable to withdraw funds',
      category: 'Withdrawal',
      priority: 'high',
      status: 'in_progress',
      description: 'I am unable to withdraw funds from my account. The withdrawal button is not working.',
      createdAt: '2024-01-10T10:30:00Z',
      updatedAt: '2024-01-15T14:20:00Z',
      assignedAgent: 'John Smith',
      messages: [
        {
          id: '1',
          senderId: 'user1',
          senderName: 'You',
          senderType: 'customer',
          message: 'I am unable to withdraw funds from my account. The withdrawal button is not working.',
          createdAt: '2024-01-10T10:30:00Z'
        },
        {
          id: '2',
          senderId: 'agent1',
          senderName: 'John Smith',
          senderType: 'agent',
          message: 'Thank you for contacting us. I understand you are having issues with withdrawals. Let me check your account.',
          createdAt: '2024-01-10T10:45:00Z'
        },
        {
          id: '3',
          senderId: 'user1',
          senderName: 'You',
          senderType: 'customer',
          message: 'Thanks for the quick response. I have enough balance. Let me know what I can do.',
          createdAt: '2024-01-10T11:00:00Z'
        }
      ]
    },
    {
      id: '2',
      ticketNumber: 'TKT-2024-002',
      subject: 'Account verification status',
      category: 'Verification',
      priority: 'medium',
      status: 'waiting_customer',
      description: 'I uploaded my documents but still waiting for verification status.',
      createdAt: '2024-01-12T15:20:00Z',
      updatedAt: '2024-01-15T09:30:00Z',
      assignedAgent: 'Sarah Johnson',
      messages: [
        {
          id: '1',
          senderId: 'user1',
          senderName: 'You',
          senderType: 'customer',
          message: 'I uploaded my documents but still waiting for verification status.',
          createdAt: '2024-01-12T15:20:00Z'
        }
      ]
    },
    {
      id: '3',
      ticketNumber: 'TKT-2024-003',
      subject: 'Payment failed but amount was deducted',
      category: 'Payment',
      priority: 'urgent',
      status: 'open',
      description: 'My payment failed but the amount was deducted from my account.',
      createdAt: '2024-01-15T16:00:00Z',
      updatedAt: '2024-01-15T16:00:00Z',
      messages: [
        {
          id: '1',
          senderId: 'user1',
          senderName: 'You',
          senderType: 'customer',
          message: 'My payment failed but the amount was deducted from my account.',
          createdAt: '2024-01-15T16:00:00Z'
        }
      ]
    }
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-300', icon: AlertCircle };
      case 'in_progress':
        return { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-300', icon: Clock };
      case 'waiting_customer':
        return { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-300', icon: Clock };
      case 'resolved':
        return { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-300', icon: CheckCircle2 };
      case 'closed':
        return { bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-300', icon: CheckCircle2 };
      default:
        return { bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-300', icon: AlertCircle };
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedTicket) return;

    const updatedTickets = tickets.map(ticket => {
      if (ticket.id === selectedTicket.id) {
        return {
          ...ticket,
          messages: [
            ...ticket.messages,
            {
              id: Math.random().toString(),
              senderId: 'user1',
              senderName: 'You',
              senderType: 'customer' as const,
              message: newMessage,
              createdAt: new Date().toISOString()
            }
          ],
          updatedAt: new Date().toISOString()
        };
      }
      return ticket;
    });

    setTickets(updatedTickets);
    setSelectedTicket(updatedTickets.find(t => t.id === selectedTicket.id) || null);
    setNewMessage('');
  };

  const openTicketsCount = filteredTickets.filter(t => t.status === 'open').length;
  const inProgressCount = filteredTickets.filter(t => t.status === 'in_progress').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Support Tickets</h1>
            <p className="text-slate-600 mt-1">Manage and track your support requests</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            New Ticket
          </button>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="text-sm text-slate-600">Total Tickets</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{tickets.length}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="text-sm text-slate-600">Open</p>
            <p className="text-3xl font-bold text-blue-600 mt-1">{openTicketsCount}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="text-sm text-slate-600">In Progress</p>
            <p className="text-3xl font-bold text-yellow-600 mt-1">{inProgressCount}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="text-sm text-slate-600">Resolved</p>
            <p className="text-3xl font-bold text-green-600 mt-1">
              {tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length}
            </p>
          </div>
        </div>

        {/* Create Ticket Form */}
        {showCreateForm && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Create a New Ticket</h2>
              <button onClick={() => setShowCreateForm(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Subject</label>
                <input
                  type="text"
                  placeholder="Brief description of your issue"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                  <select className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option>Withdrawal</option>
                    <option>Deposit</option>
                    <option>Verification</option>
                    <option>Payment</option>
                    <option>Security</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Priority</label>
                  <select className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                <textarea
                  placeholder="Provide detailed information about your issue"
                  rows={4}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-4">
                <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">
                  Submit Ticket
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Tickets List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Search and Filter */}
              <div className="p-4 border-b border-slate-200 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search tickets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="waiting_customer">Waiting Customer</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              {/* Tickets List */}
              <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
                {filteredTickets.length > 0 ? (
                  filteredTickets.map(ticket => {
                    const statusColors = getStatusColor(ticket.status);
                    const StatusIcon = statusColors.icon;

                    return (
                      <button
                        key={ticket.id}
                        onClick={() => setSelectedTicket(ticket)}
                        className={`w-full p-4 text-left hover:bg-slate-50 transition-colors ${
                          selectedTicket?.id === ticket.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${statusColors.bg}`}>
                            <StatusIcon className={`w-4 h-4 ${statusColors.text}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 text-sm">{ticket.subject}</p>
                            <p className="text-xs text-slate-600 mt-1">{ticket.ticketNumber}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className={`text-xs px-2 py-1 rounded font-medium ${getPriorityColor(ticket.priority)}`}>
                                {ticket.priority}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${statusColors.bg} ${statusColors.text} font-medium`}>
                                {ticket.status.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-slate-600 text-sm">No tickets found</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ticket Details */}
          <div className="lg:col-span-2">
            {selectedTicket ? (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-96">
                {/* Ticket Header */}
                <div className="p-6 border-b border-slate-200">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{selectedTicket.subject}</h2>
                      <p className="text-sm text-slate-600 mt-1">{selectedTicket.ticketNumber}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-semibold ${getPriorityColor(selectedTicket.priority)}`}>
                      {selectedTicket.priority}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-600">Status</p>
                      <p className="font-semibold text-slate-900 mt-1 capitalize">{selectedTicket.status.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Category</p>
                      <p className="font-semibold text-slate-900 mt-1">{selectedTicket.category}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Created</p>
                      <p className="font-semibold text-slate-900 mt-1">
                        {new Date(selectedTicket.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-600">Assigned To</p>
                      <p className="font-semibold text-slate-900 mt-1">{selectedTicket.assignedAgent || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {selectedTicket.messages.map(message => (
                    <div
                      key={message.id}
                      className={`flex ${message.senderType === 'customer' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs px-4 py-3 rounded-lg ${
                          message.senderType === 'customer'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-900'
                        }`}
                      >
                        <p className={`text-xs font-semibold mb-1 ${
                          message.senderType === 'customer' ? 'text-blue-100' : 'text-slate-600'
                        }`}>
                          {message.senderName}
                        </p>
                        <p className="text-sm">{message.message}</p>
                        <p className={`text-xs mt-1 ${
                          message.senderType === 'customer' ? 'text-blue-100' : 'text-slate-600'
                        }`}>
                          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Message Input */}
                {selectedTicket.status !== 'closed' && (
                  <div className="border-t border-slate-200 p-4 bg-slate-50">
                    <div className="flex gap-2">
                      <button className="p-2 hover:bg-white rounded-lg transition-colors">
                        <Paperclip className="w-5 h-5 text-slate-600" />
                      </button>
                      <input
                        type="text"
                        placeholder="Type your message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim()}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex items-center justify-center h-96">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-600">Select a ticket to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportTickets;
