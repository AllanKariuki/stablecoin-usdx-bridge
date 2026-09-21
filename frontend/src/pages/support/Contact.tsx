import { useState } from 'react';
import { MessageCircle, Mail, Phone, MapPin, Clock, Send } from 'lucide-react';

const ContactSupport = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    category: '',
    priority: 'medium',
    message: ''
  });

  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log('Form submitted:', formData);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: '', email: '', subject: '', category: '', priority: 'medium', message: '' });
    }, 3000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const contactChannels = [
    {
      icon: MessageCircle,
      title: 'Live Chat',
      description: 'Chat with our support team in real-time',
      availability: 'Available 24/7',
      action: 'Start Chat',
      color: 'blue'
    },
    {
      icon: Mail,
      title: 'Email Support',
      description: 'Send us an email and we\'ll respond within 24 hours',
      availability: 'support@damp.com',
      action: 'Send Email',
      color: 'green'
    },
    {
      icon: Phone,
      title: 'Phone Support',
      description: 'Call our support team for immediate assistance',
      availability: '+1 (800) 123-4567',
      action: 'Call Now',
      color: 'purple'
    },
    {
      icon: MessageCircle,
      title: 'WhatsApp',
      description: 'Message us on WhatsApp for quick responses',
      availability: '+1 (800) 123-4567',
      action: 'Message',
      color: 'emerald'
    }
  ];

  const faqs = [
    { q: 'What are your support hours?', a: 'We provide 24/7 support via live chat and email. Phone support is available Mon-Fri 9AM-6PM EST.' },
    { q: 'How quickly will I get a response?', a: 'Live chat: Immediate, Email: Within 24 hours, Phone: Varies by call volume.' },
    { q: 'Can I submit attachments with my support request?', a: 'Yes, you can attach screenshots, documents, and other files up to 10MB per file.' },
    { q: 'What information should I include in my request?', a: 'Include your account email, transaction reference (if applicable), and a detailed description of your issue.' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-900">Contact Support</h1>
          <p className="text-slate-600 mt-2 text-lg">We're here to help. Choose your preferred way to reach us.</p>
        </div>

        {/* Contact Channels */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {contactChannels.map((channel, idx) => {
            const Icon = channel.icon;
            const colorClasses = {
              blue: 'bg-blue-50 border-blue-200 hover:border-blue-400',
              green: 'bg-green-50 border-green-200 hover:border-green-400',
              purple: 'bg-purple-50 border-purple-200 hover:border-purple-400',
              emerald: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400'
            };

            return (
              <div
                key={idx}
                className={`rounded-xl border p-6 transition-all hover:shadow-md cursor-pointer ${colorClasses[channel.color as keyof typeof colorClasses]}`}
              >
                <Icon className="w-8 h-8 mb-3" style={{
                  color: channel.color === 'blue' ? '#2563eb' : channel.color === 'green' ? '#16a34a' : channel.color === 'purple' ? '#9333ea' : '#059669'
                }} />
                <h3 className="font-bold text-slate-900 mb-1">{channel.title}</h3>
                <p className="text-sm text-slate-600 mb-3">{channel.description}</p>
                <p className="text-xs font-semibold text-slate-700 mb-4">{channel.availability}</p>
                <button className={`w-full px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                  channel.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' :
                  channel.color === 'green' ? 'bg-green-600 hover:bg-green-700' :
                  channel.color === 'purple' ? 'bg-purple-600 hover:bg-purple-700' :
                  'bg-emerald-600 hover:bg-emerald-700'
                }`}>
                  {channel.action}
                </button>
              </div>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Send us a Message</h2>
              <p className="text-slate-600 mb-6">Fill out the form below and we'll get back to you as soon as possible.</p>

              {submitted ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Send className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="font-bold text-green-900 text-lg mb-1">Message Sent!</h3>
                  <p className="text-green-700">Thank you for contacting us. We'll respond as soon as possible.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select a category</option>
                        <option value="technical">Technical Issue</option>
                        <option value="billing">Billing</option>
                        <option value="account">Account</option>
                        <option value="security">Security</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Priority</label>
                      <select
                        name="priority"
                        value={formData.priority}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Subject</label>
                    <input
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Brief subject of your issue"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Message</label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      rows={6}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="Describe your issue in detail..."
                    />
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="submit"
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Send Message
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Sidebar Information */}
          <div className="lg:col-span-1 space-y-6">
            {/* Office Hours */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900">Office Hours</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Monday - Friday</span>
                  <span className="text-slate-900 font-semibold">9:00 AM - 6:00 PM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Saturday</span>
                  <span className="text-slate-900 font-semibold">10:00 AM - 4:00 PM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Sunday</span>
                  <span className="text-slate-900 font-semibold">Closed</span>
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-4">EST (Eastern Standard Time)</p>
            </div>

            {/* Contact Info */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-bold text-slate-900 mb-4">Contact Information</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Email</p>
                    <a href="mailto:support@damp.com" className="text-sm text-blue-600 hover:text-blue-700">
                      support@damp.com
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Phone</p>
                    <a href="tel:+18001234567" className="text-sm text-blue-600 hover:text-blue-700">
                      +1 (800) 123-4567
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Address</p>
                    <p className="text-sm text-slate-600">
                      123 Financial Street<br />
                      New York, NY 10001<br />
                      United States
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="font-bold text-slate-900 mb-4">Quick Links</h3>
              <div className="space-y-2">
                <a href="#" className="block text-sm text-blue-600 hover:text-blue-700 font-medium">
                  → Help Center
                </a>
                <a href="#" className="block text-sm text-blue-600 hover:text-blue-700 font-medium">
                  → FAQ
                </a>
                <a href="#" className="block text-sm text-blue-600 hover:text-blue-700 font-medium">
                  → Community Forum
                </a>
                <a href="#" className="block text-sm text-blue-600 hover:text-blue-700 font-medium">
                  → Status Page
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* FAQs Section */}
        <div className="mt-12 bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Common Questions</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {faqs.map((faq, idx) => (
              <div key={idx} className="pb-6 border-b border-slate-200 last:border-b-0">
                <h4 className="font-semibold text-slate-900 mb-2">{faq.q}</h4>
                <p className="text-slate-600 text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactSupport;
