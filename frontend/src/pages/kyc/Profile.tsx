import { useState } from 'react';
import { Camera, Edit2, CheckCircle2, AlertCircle, Lock, Mail, Phone, MapPin, Calendar } from 'lucide-react';

interface UserProfile {
  id: string;
  profileImage?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  kycStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  verificationLevel: number;
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  verificationDate?: string;
  createdAt: string;
}

const KYCProfile = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    id: 'user123',
    firstName: 'William',
    lastName: 'Fancyson',
    email: 'william.fancyson@example.com',
    phoneNumber: '+1 (234) 567-8900',
    dateOfBirth: '1990-05-15',
    profileImage: 'https://via.placeholder.com/150',
    kycStatus: 'verified',
    verificationLevel: 3,
    address: {
      street: '123 Main Street, Apt 4B',
      city: 'New York',
      state: 'NY',
      country: 'United States',
      postalCode: '10001'
    },
    verificationDate: '2024-01-15',
    createdAt: '2023-03-24'
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
        return { bg: 'bg-green-50', text: 'text-green-800', badge: 'bg-green-100 text-green-800', border: 'border-green-300' };
      case 'pending':
        return { bg: 'bg-yellow-50', text: 'text-yellow-800', badge: 'bg-yellow-100 text-yellow-800', border: 'border-yellow-300' };
      case 'rejected':
        return { bg: 'bg-red-50', text: 'text-red-800', badge: 'bg-red-100 text-red-800', border: 'border-red-300' };
      default:
        return { bg: 'bg-gray-50', text: 'text-gray-800', badge: 'bg-gray-100 text-gray-800', border: 'border-gray-300' };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle2 className="w-6 h-6 text-green-600" />;
      case 'pending':
        return <AlertCircle className="w-6 h-6 text-yellow-600" />;
      case 'rejected':
        return <AlertCircle className="w-6 h-6 text-red-600" />;
      default:
        return null;
    }
  };

  const colors = getStatusColor(profile.kycStatus);

  const levelBenefits = [
    { level: 1, title: 'Basic', limit: '$1,000/day', features: ['Basic transactions', 'Limited features'] },
    { level: 2, title: 'Intermediate', limit: '$10,000/day', features: ['All Level 1 features', 'Bill payments', 'Investments'] },
    { level: 3, title: 'Advanced', limit: 'Unlimited', features: ['All Level 2 features', 'High-value transactions', 'Premium support'] }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">My Profile</h1>
            <p className="text-slate-600 mt-1">Manage your account information and verification status</p>
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Edit2 className="w-4 h-4" />
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </button>
        </div>

        {/* Profile Header Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Profile Image */}
            <div className="relative">
              <img
                src={profile.profileImage}
                alt={`${profile.firstName} ${profile.lastName}`}
                className="w-24 h-24 rounded-full object-cover border-4 border-blue-100"
              />
              {isEditing && (
                <label className="absolute bottom-0 right-0 bg-blue-600 p-2 rounded-full cursor-pointer hover:bg-blue-700 transition-colors">
                  <Camera className="w-4 h-4 text-white" />
                  <input type="file" className="hidden" accept="image/*" />
                </label>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {profile.firstName} {profile.lastName}
                  </h2>
                  <p className="text-slate-600">Member since {new Date(profile.createdAt).toLocaleDateString()}</p>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold ${colors.badge}`}>
                  {getStatusIcon(profile.kycStatus)}
                  <span className="capitalize">{profile.kycStatus}</span>
                </div>
              </div>

              {/* Verification Level */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-600" />
                  <span className="text-sm text-slate-600">Verification Level</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3].map((level) => (
                    <div
                      key={level}
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs ${
                        level <= profile.verificationLevel
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-300 text-slate-600'
                      }`}
                    >
                      {level}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Verification Status */}
        <div className={`rounded-xl border ${colors.border} ${colors.bg} p-6 mb-6`}>
          <div className="flex items-start gap-4">
            {getStatusIcon(profile.kycStatus)}
            <div className="flex-1">
              <h3 className={`text-lg font-bold capitalize ${colors.text}`}>
                Verification {profile.kycStatus}
              </h3>
              {profile.kycStatus === 'verified' && profile.verificationDate && (
                <p className={`text-sm mt-1 ${colors.text}`}>
                  Verified on {new Date(profile.verificationDate).toLocaleDateString()}
                </p>
              )}
              {profile.kycStatus === 'pending' && (
                <p className={`text-sm mt-1 ${colors.text}`}>
                  Your verification is being reviewed. This may take 1-3 business days.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Verification Level Benefits */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Verification Levels & Benefits</h3>
          <div className="grid md:grid-cols-3 gap-4">
            {levelBenefits.map((level) => (
              <div
                key={level.level}
                className={`rounded-lg p-4 border-2 transition-all ${
                  profile.verificationLevel >= level.level
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-slate-900">{level.title}</h4>
                  {profile.verificationLevel >= level.level && (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  )}
                </div>
                <p className="text-sm font-semibold text-blue-600 mb-3">{level.limit}</p>
                <ul className="space-y-2">
                  {level.features.map((feature, idx) => (
                    <li key={idx} className="text-sm text-slate-600 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Personal Information */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Personal Information</h3>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Email */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Mail className="w-4 h-4" />
                Email Address
              </label>
              {isEditing ? (
                <input
                  type="email"
                  defaultValue={profile.email}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-900 font-medium">{profile.email}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Phone className="w-4 h-4" />
                Phone Number
              </label>
              {isEditing ? (
                <input
                  type="tel"
                  defaultValue={profile.phoneNumber}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-900 font-medium">{profile.phoneNumber}</p>
              )}
            </div>

            {/* Date of Birth */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Calendar className="w-4 h-4" />
                Date of Birth
              </label>
              {isEditing ? (
                <input
                  type="date"
                  defaultValue={profile.dateOfBirth}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-900 font-medium">{new Date(profile.dateOfBirth).toLocaleDateString()}</p>
              )}
            </div>

            {/* First Name */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block">First Name</label>
              {isEditing ? (
                <input
                  type="text"
                  defaultValue={profile.firstName}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-900 font-medium">{profile.firstName}</p>
              )}
            </div>

            {/* Last Name */}
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block">Last Name</label>
              {isEditing ? (
                <input
                  type="text"
                  defaultValue={profile.lastName}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-900 font-medium">{profile.lastName}</p>
              )}
            </div>
          </div>
        </div>

        {/* Address Information */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 mb-6">
            <MapPin className="w-5 h-5" />
            Address Information
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-700 mb-2 block">Street Address</label>
              {isEditing ? (
                <input
                  type="text"
                  defaultValue={profile.address.street}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-900 font-medium">{profile.address.street}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block">City</label>
              {isEditing ? (
                <input
                  type="text"
                  defaultValue={profile.address.city}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-900 font-medium">{profile.address.city}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block">State/Province</label>
              {isEditing ? (
                <input
                  type="text"
                  defaultValue={profile.address.state}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-900 font-medium">{profile.address.state}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block">Postal Code</label>
              {isEditing ? (
                <input
                  type="text"
                  defaultValue={profile.address.postalCode}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-900 font-medium">{profile.address.postalCode}</p>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 mb-2 block">Country</label>
              {isEditing ? (
                <input
                  type="text"
                  defaultValue={profile.address.country}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-slate-900 font-medium">{profile.address.country}</p>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {isEditing && (
          <div className="flex gap-4">
            <button className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors">
              Save Changes
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default KYCProfile;
