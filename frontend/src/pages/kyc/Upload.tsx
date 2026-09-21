import { useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, File, X, RefreshCw } from 'lucide-react';

interface Document {
  id: string;
  type: 'id_card' | 'passport' | 'drivers_license' | 'utility_bill' | 'bank_statement' | 'selfie';
  status: 'pending' | 'approved' | 'rejected';
  fileName?: string;
  uploadedAt?: string;
  rejectionReason?: string;
}

interface DocumentType {
  type: Document['type'];
  label: string;
  description: string;
  hint: string;
  icon: React.ReactNode;
}

const KYCUpload = () => {
  const [documents, setDocuments] = useState<Document[]>([
    {
      id: '1',
      type: 'passport',
      status: 'approved',
      fileName: 'passport_scan.pdf',
      uploadedAt: '2024-01-10'
    },
    {
      id: '2',
      type: 'utility_bill',
      status: 'pending',
      fileName: 'electric_bill_jan_2024.pdf',
      uploadedAt: '2024-01-15'
    }
  ]);

  const [draggedOver, setDraggedOver] = useState<string | null>(null);

  const documentTypes: DocumentType[] = [
    {
      type: 'id_card',
      label: 'National ID Card',
      description: 'Front and back of your national ID',
      hint: 'Clear images of both sides',
      icon: '🪪'
    },
    {
      type: 'passport',
      label: 'Passport',
      description: 'Photo page of your passport',
      hint: 'Clearly visible personal information',
      icon: '📕'
    },
    {
      type: 'drivers_license',
      label: "Driver's License",
      description: 'Front and back of your license',
      hint: 'All security features visible',
      icon: '🔰'
    },
    {
      type: 'utility_bill',
      label: 'Proof of Address',
      description: 'Recent utility bill or bank statement',
      hint: 'Dated within last 3 months',
      icon: '📄'
    },
    {
      type: 'bank_statement',
      label: 'Bank Statement',
      description: 'Recent bank account statement',
      hint: 'Full statement with address',
      icon: '🏦'
    },
    {
      type: 'selfie',
      label: 'Selfie Verification',
      description: 'Clear photo of your face',
      hint: 'Good lighting, face clearly visible',
      icon: '📸'
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-800' };
      case 'pending':
        return { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800' };
      case 'rejected':
        return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800' };
      default:
        return { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-800' };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'pending':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'rejected':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  const handleDragOver = (e: React.DragEvent, docType: string) => {
    e.preventDefault();
    setDraggedOver(docType);
  };

  const handleDragLeave = () => {
    setDraggedOver(null);
  };

  const handleDrop = (e: React.DragEvent, docType: string) => {
    e.preventDefault();
    setDraggedOver(null);
    // Handle file upload
    console.log('Files dropped for:', docType);
  };

  const handleRemoveDocument = (id: string) => {
    setDocuments(documents.filter(doc => doc.id !== id));
  };

  const uploadedCount = documents.length;
  const approvedCount = documents.filter(d => d.status === 'approved').length;
  const totalRequired = documentTypes.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Upload Documents</h1>
          <p className="text-slate-600 mt-1">Submit required documents to verify your account</p>
        </div>

        {/* Progress Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-900">Upload Progress</h3>
              <span className="text-sm text-slate-600">
                {approvedCount}/{totalRequired} approved
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${(approvedCount / totalRequired) * 100}%` }}
              />
            </div>
            <p className="text-sm text-slate-600 mt-2">
              {approvedCount} of {totalRequired} documents verified
            </p>
          </div>

          {/* Document Status Grid */}
          <div className="grid md:grid-cols-3 gap-4">
            {documentTypes.map((docType) => {
              const doc = documents.find(d => d.type === docType.type);
              const colors = getStatusColor(doc?.status || 'pending');

              return (
                <div
                  key={docType.type}
                  className={`rounded-lg border ${colors.border} ${colors.bg} p-3 text-center`}
                >
                  <div className="text-3xl mb-2">{docType.icon}</div>
                  <p className="text-sm font-semibold text-slate-900">{docType.label}</p>
                  <div className="mt-2">
                    {doc ? (
                      <div className="flex items-center justify-center gap-1">
                        {getStatusIcon(doc.status)}
                        <span className={`text-xs font-medium ${colors.text}`}>
                          {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">Not uploaded</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Guidelines */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
          <h3 className="font-semibold text-blue-900 mb-4">Document Upload Guidelines</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p className="text-blue-900 font-medium">✓ Accepted Formats</p>
              <ul className="text-blue-800 space-y-1 ml-4">
                <li>• PDF files</li>
                <li>• JPEG/JPG images</li>
                <li>• PNG images</li>
                <li>• Maximum 10MB per file</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="text-blue-900 font-medium">✓ Quality Requirements</p>
              <ul className="text-blue-800 space-y-1 ml-4">
                <li>• Clear and legible</li>
                <li>• Good lighting</li>
                <li>• All edges visible</li>
                <li>• No glare or shadows</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Document Upload Areas */}
        <div className="space-y-4 mb-8">
          {documentTypes.map((docType) => {
            const doc = documents.find(d => d.type === docType.type);
            const colors = getStatusColor(doc?.status || 'pending');
            const isHovered = draggedOver === docType.type;

            return (
              <div key={docType.type} className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                      <span className="text-2xl">{docType.icon}</span>
                      {docType.label}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">{docType.description}</p>
                    <p className="text-xs text-slate-500 mt-1">{docType.hint}</p>
                  </div>
                  {doc && (
                    <div className={`px-3 py-1 rounded-full flex items-center gap-1 ${colors.bg} border ${colors.border}`}>
                      {getStatusIcon(doc.status)}
                      <span className={`text-xs font-semibold ${colors.text}`}>
                        {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                      </span>
                    </div>
                  )}
                </div>

                {!doc ? (
                  <div
                    onDragOver={(e) => handleDragOver(e, docType.type)}
                    onDragLeave={handleDragLeave}
                    onClick={() => document.getElementById(`upload-${docType.type}`)?.click()}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                      isHovered
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-300 bg-slate-50 hover:border-blue-400'
                    }`}
                    onDrop={(e) => handleDrop(e, docType.type)}
                  >
                    <Upload className={`w-8 h-8 mx-auto mb-3 ${isHovered ? 'text-blue-600' : 'text-slate-400'}`} />
                    <p className="font-semibold text-slate-900">Drag file here or click to browse</p>
                    <p className="text-sm text-slate-600 mt-1">Supported: PDF, JPEG, PNG (Max 10MB)</p>
                    <input
                      id={`upload-${docType.type}`}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                    />
                  </div>
                ) : (
                  <div className={`rounded-lg border ${colors.border} ${colors.bg} p-4`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <File className={`w-6 h-6 flex-shrink-0 ${colors.text}`} />
                        <div>
                          <p className="font-semibold text-slate-900">{doc.fileName}</p>
                          <p className={`text-sm mt-1 ${colors.text}`}>
                            Uploaded: {new Date(doc.uploadedAt!).toLocaleDateString()}
                          </p>
                          {doc.status === 'rejected' && doc.rejectionReason && (
                            <p className="text-sm text-red-700 mt-2">
                              Reason: {doc.rejectionReason}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRemoveDocument(doc.id)}
                          className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          <X className="w-5 h-5 text-slate-600" />
                        </button>
                        {doc.status === 'rejected' && (
                          <button
                            onClick={() => document.getElementById(`upload-${docType.type}`)?.click()}
                            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Resubmit
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Submit for Review
          </button>
          <button className="flex-1 px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">
            Save & Continue Later
          </button>
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-slate-50 rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Need Help?</h3>
          <p className="text-slate-600 text-sm mb-4">
            If you have questions about the document upload process or need assistance, please contact our support team.
          </p>
          <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
            Contact Support →
          </button>
        </div>
      </div>
    </div>
  );
};

export default KYCUpload;
