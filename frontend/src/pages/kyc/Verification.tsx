import { useState } from 'react';
import { Upload, Check, Clock, AlertCircle, FileText, CheckCircle2, User } from 'lucide-react';
import type { KYCProfile, KYCStatus, DocumentType } from '../../types/financial';

const Verification = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([]);

  // Mock data
  const kycProfile: KYCProfile = {
    userId: 'user1',
    status: 'pending',
    level: 1,
    personalInfo: {
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      nationality: 'USA',
      idType: 'passport',
      idNumber: 'P123456789',
      phoneNumber: '+1234567890',
      email: 'john.doe@example.com'
    },
    address: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      country: 'USA',
      postalCode: '10001'
    },
    documents: [
      {
        id: '1',
        type: 'passport',
        status: 'approved',
        fileName: 'passport.pdf',
        fileUrl: 'https://example.com/passport.pdf',
        uploadedAt: '2024-01-10T10:00:00Z',
        reviewedAt: '2024-01-12T14:30:00Z'
      },
      {
        id: '2',
        type: 'utility_bill',
        status: 'pending',
        fileName: 'utility_bill.pdf',
        fileUrl: 'https://example.com/utility.pdf',
        uploadedAt: '2024-01-15T09:00:00Z'
      }
    ],
    updatedAt: '2024-01-15T09:00:00Z'
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'rejected':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  const steps = [
    { number: 1, title: 'Personal Info', description: 'Basic information' },
    { number: 2, title: 'Address', description: 'Proof of address' },
    { number: 3, title: 'Identity', description: 'Valid ID document' },
    { number: 4, title: 'Verification', description: 'Final confirmation' }
  ];

  const requiredDocuments: { type: DocumentType; label: string; description: string }[] = [
    {
      type: 'id_card',
      label: 'National ID Card',
      description: 'Front and back of your ID card'
    },
    {
      type: 'passport',
      label: 'Passport',
      description: 'Photo page of your passport'
    },
    {
      type: 'utility_bill',
      label: 'Proof of Address',
      description: 'Recent utility bill or bank statement'
    },
    {
      type: 'selfie',
      label: 'Selfie Verification',
      description: 'Clear photo of your face'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">KYC Verification</h1>
          <p className="text-gray-600 mt-1">Complete your identity verification</p>
        </div>

        {/* KYC Status Overview */}
        <div className="bg-white rounded-lg p-6 border border-gray-200 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Verification Status</h2>
              <p className="text-sm text-gray-600 mt-1">Level {kycProfile.level} of 3</p>
            </div>
            <div className={`px-4 py-2 rounded-full font-semibold text-sm flex items-center gap-2 ${getStatusColor(kycProfile.status)}`}>
              {getStatusIcon(kycProfile.status)}
              {kycProfile.status.charAt(0).toUpperCase() + kycProfile.status.slice(1)}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all"
              style={{ width: `${(kycProfile.documents.filter(d => d.status === 'approved').length / kycProfile.documents.length) * 100}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {kycProfile.documents.filter(d => d.status === 'approved').length} of {kycProfile.documents.length} documents verified
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {steps.map((step) => (
            <div
              key={step.number}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                currentStep === step.number
                  ? 'border-blue-600 bg-blue-50'
                  : currentStep > step.number
                  ? 'border-green-600 bg-green-50'
                  : 'border-gray-300 bg-white'
              }`}
              onClick={() => setCurrentStep(step.number)}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold mb-2 mx-auto">
                {currentStep > step.number ? <Check className="w-5 h-5" /> : step.number}
              </div>
              <p className="text-sm font-semibold text-gray-900 text-center">{step.title}</p>
              <p className="text-xs text-gray-600 text-center">{step.description}</p>
            </div>
          ))}
        </div>

        {/* Document Upload Section */}
        <div className="bg-white rounded-lg p-6 border border-gray-200 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Required Documents</h2>

          <div className="space-y-4">
            {requiredDocuments.map((doc) => {
              const uploaded = kycProfile.documents.find(d => d.type === doc.type);

              return (
                <div
                  key={doc.type}
                  className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                    uploaded
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-300 bg-white hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        {doc.label}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">{doc.description}</p>

                      {uploaded && (
                        <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${getStatusColor(uploaded.status)}`}>
                          {getStatusIcon(uploaded.status)}
                          <div>
                            <p className="text-sm font-semibold">{uploaded.fileName}</p>
                            <p className="text-xs">
                              Uploaded: {new Date(uploaded.uploadedAt).toLocaleDateString()}
                            </p>
                            {uploaded.status === 'approved' && (
                              <p className="text-xs">
                                Verified: {new Date(uploaded.reviewedAt!).toLocaleDateString()}
                              </p>
                            )}
                            {uploaded.status === 'rejected' && (
                              <p className="text-xs">Reason: {uploaded.rejectionReason}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {!uploaded && (
                      <label className="flex items-center justify-center w-12 h-12 rounded-lg border-2 border-blue-600 bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors">
                        <Upload className="w-6 h-6 text-blue-600" />
                        <input type="file" className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Personal Information Section */}
        <div className="bg-white rounded-lg p-6 border border-gray-200 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Personal Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">First Name</label>
              <input
                type="text"
                defaultValue={kycProfile.personalInfo.firstName}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name</label>
              <input
                type="text"
                defaultValue={kycProfile.personalInfo.lastName}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Date of Birth</label>
              <input
                type="date"
                defaultValue={kycProfile.personalInfo.dateOfBirth}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nationality</label>
              <input
                type="text"
                defaultValue={kycProfile.personalInfo.nationality}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                disabled
              />
            </div>
          </div>
        </div>

        {/* Address Information */}
        <div className="bg-white rounded-lg p-6 border border-gray-200 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Address Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Street Address</label>
              <input
                type="text"
                defaultValue={kycProfile.address.street}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
              <input
                type="text"
                defaultValue={kycProfile.address.city}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">State/Province</label>
              <input
                type="text"
                defaultValue={kycProfile.address.state}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Postal Code</label>
              <input
                type="text"
                defaultValue={kycProfile.address.postalCode}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                disabled
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {kycProfile.status === 'pending' && (
          <div className="flex gap-4">
            <button className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
              Complete Verification
            </button>
            <button className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold">
              Save & Continue Later
            </button>
          </div>
        )}

        {kycProfile.status === 'verified' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-green-900">Verification Complete</h3>
            <p className="text-green-700 mt-1">Your account has been successfully verified</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Verification;
