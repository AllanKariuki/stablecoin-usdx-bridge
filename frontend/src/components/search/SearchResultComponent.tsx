import React from 'react';
import type { SearchResultItem } from '../../types/navigation/search';

interface SearchResultItemProps {
    result: SearchResultItem;
    isActive: boolean;
    onClick: () => void;
};

const IconComponent: React.FC<{ name: string; className?: string }> = ({ name, className = 'w-4 h-4'}) => {
    const icons: Record<string, React.ReactNode> = {
        plane: (
            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
        ),
        'map-pin': (
            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        ),
        calendar: (
            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        ),
    }
    return icons[name] || icons.plane;
};

const SearchResultComponent: React.FC<SearchResultItemProps> = ({ result, isActive, onClick }) => {

  return (
    <div
        onClick={onClick}
        className={`flex items-center p-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
            isActive ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
            }`}
    >
        <div className='mr-3 text-gray-500'>
            <IconComponent name={result.title || 'plane'} />
        </div>
        <div className="flex-1 min-w-0">
            <h4 className="text-sm text-gray-900 truncate">
                {result.title}
            </h4>
            {/* <p className="text-sm text-gray-600 truncate">{result.details}</p> */}
        </div>
    </div>
  );
};

export default SearchResultComponent;
