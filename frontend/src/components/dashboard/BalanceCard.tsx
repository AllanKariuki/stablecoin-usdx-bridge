import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Eye, EyeOff } from 'lucide-react';

interface BalanceCardProps {
  title: string;
  amount: string;
  info1: { label: string; value: string };
  info2: { label: string; value: string };
  name: string;
  color: string;
}

const BalanceCard: React.FC<BalanceCardProps> = ({ title, amount, info1, info2, name, color }) => {
  const [isBalanceVisible, setIsBalanceVisible] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleBalanceVisibility = () => {
    setIsBalanceVisible(!isBalanceVisible);
    setIsDropdownOpen(false);
  };

  const maskBalance = (value: string) => {
    // Replace digits with asterisks
    return value.replace(/\d/g, '*');
  };

  return (
    <div className={`${color} rounded-xl p-6 text-white relative overflow-hidden`}>
      <div className="flex justify-between items-start mb-8">
        <h3 className="text-sm opacity-90">{title}</h3>
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center hover:bg-opacity-30 transition-all"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 z-10">
              <button
                onClick={toggleBalanceVisibility}
                className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-3"
              >
                {isBalanceVisible ? (
                  <>
                    <EyeOff className="w-4 h-4" />
                    <span className="text-sm">Hide Balance</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    <span className="text-sm">Show Balance</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      <h2 className={`text-3xl font-bold mb-6 transition-all ${!isBalanceVisible ? 'blur-sm select-none' : ''}`}>
        {isBalanceVisible ? amount : maskBalance(amount)}
      </h2>
      <div className="flex justify-between text-sm opacity-90">
        <div>
          <p className="mb-1 text-xs uppercase">{info1.label}</p>
          <p className={`font-semibold ${!isBalanceVisible ? 'blur-sm select-none' : ''}`}>
            {isBalanceVisible ? info1.value : maskBalance(info1.value)}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase">{info2.label}</p>
          <p className={`font-semibold ${!isBalanceVisible ? 'blur-sm select-none' : ''}`}>
            {isBalanceVisible ? info2.value : maskBalance(info2.value)}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase">CARD HOLDER</p>
          <p className="font-semibold">{name}</p>
        </div>
      </div>
    </div>
  );
};

export default BalanceCard;
