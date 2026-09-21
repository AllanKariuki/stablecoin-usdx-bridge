import React from 'react';

interface MonthlyLimit {
  main: number;
  seconds: number;
  others: number;
}

interface CardDetailsProps {
  cardNumber: string;
  bankName: string;
  validDate: string;
  cardHolder: string;
  cardNumberMasked: string;
  monthlyLimit: MonthlyLimit;
}

const CardDetails: React.FC<CardDetailsProps> = ({
  cardNumber,
  bankName,
  validDate,
  cardHolder,
  cardNumberMasked,
  monthlyLimit
}) => {
  return (
    <div className="">
        <h2 className="text-lg font-semibold text-gray-600 mb-4">Card Details</h2>
        <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 flex flex-col space-y-2">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <p className="text-sm text-gray-400 font-medium mb-1">Card Name</p>
                            <p className="font-semibold text-gray-800">{cardNumber}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 font-medium mb-1">Bank Name</p>
                            <p className="font-semibold text-gray-800">{bankName}</p>
                        </div>
                        <div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <p className="text-sm text-gray-400 font-medium mb-1">Valid Date</p>
                            <p className="font-semibold text-gray-800">{validDate}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 font-medium mb-1">Card Holder</p>
                            <p className="font-semibold text-gray-800">{cardHolder}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <p className="text-sm text-gray-400 font-medium mb-1">Card Number</p>
                            <p className="font-semibold text-gray-800 mt-1">{cardNumberMasked}</p>
                        </div>
                    </div>
                </div>
                <div className="">
                    <p className="text-sm text-gray-400 font-medium mb-1">Monthly Limits</p>
                    <div className="flex items-center gap-2 mt-5">
                        <div className="flex flex-col items-center space-y-4">
                            <div className="relative w-16 h-16">
                                <svg className="w-16 h-16 transform -rotate-90">
                                <circle cx="32" cy="32" r="28" stroke="#e5e7eb" strokeWidth="6" fill="none" />
                                <circle 
                                    cx="32" cy="32" r="28" 
                                    stroke="#3b82f6" 
                                    strokeWidth="6" 
                                    fill="none"
                                    strokeDasharray={`${(monthlyLimit.main / 100) * 176} 176`}
                                />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-bold text-gray-800">{monthlyLimit.main}%</span>
                                </div>
                            </div>
                            <span className="text-xs text-gray-600">Main Limits</span>
                        </div>
                        <div className="flex flex-col items-center space-y-4">
                            <div className="relative w-16 h-16">
                                <svg className="w-16 h-16 transform -rotate-90">
                                <circle cx="32" cy="32" r="28" stroke="#e5e7eb" strokeWidth="6" fill="none" />
                                <circle 
                                    cx="32" cy="32" r="28" 
                                    stroke="#10b981" 
                                    strokeWidth="6" 
                                    fill="none"
                                    strokeDasharray={`${(monthlyLimit.seconds / 100) * 176} 176`}
                                />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-sm font-bold text-gray-800">{monthlyLimit.seconds}%</span>
                                </div>
                            </div>
                            <span className="text-xs text-gray-600">Seconds</span>
                        </div>
                        <div className="flex flex-col items-center space-y-4">
                            <div className="relative w-16 h-16">
                                <svg className="w-16 h-16 transform -rotate-90">
                                <circle cx="32" cy="32" r="28" stroke="#e5e7eb" strokeWidth="6" fill="none" />
                                <circle 
                                    cx="32" cy="32" r="28" 
                                    stroke="#ef4444" 
                                    strokeWidth="6" 
                                    fill="none"
                                    strokeDasharray={`${(monthlyLimit.others / 100) * 176} 176`}
                                />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm font-bold text-gray-800">{monthlyLimit.others}%</span>
                                </div>
                            </div>
                            <span className="text-xs text-gray-600">Others</span>
                        </div>
                    </div>
                </div>
            </div>
            
            </div>
    </div>
   
  );
};

export default CardDetails;
