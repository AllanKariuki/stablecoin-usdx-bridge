
// import React, { useState, useEffect, useRef } from 'react';
// import { Search, X, ChevronDown } from 'lucide-react';

// export interface SearchOption {
//     label: string;
//     value: string;
//     [key: string]: any; // For extra data
// };

// interface SearchInputProps {
//     options: SearchOption[];
//     value: SearchOption | null;
//     onSearch: (query: string) => void;
//     onSelect: (option: SearchOption) => void;
//     placeholder?: string;
//     isLoading?: boolean;
//     debounceMs?: number;
// };

// const SearchInput: React.FC<SearchInputProps> = ({ 
//   options = [], 
//   value,
//   onSearch,
//   onSelect, 
//   placeholder = "Search...",
//   isLoading = false,
//   debounceMs = 300 
// }) => {
//   const [query, setQuery] = useState('');
//   const [isOpen, setIsOpen] = useState(false);
//   const [selectedIndex, setSelectedIndex] = useState(-1);
  
//   const searchRef = useRef<HTMLInputElement>(null);
//   const dropdownRef = useRef<HTMLDivElement>(null);
//   const debounceRef = useRef<NodeJS.Timeout | null>(null);

//   // Debounced search function
//   const debouncedSearch = (searchQuery: string) => {
//     // Clear previous debounce
//     if (debounceRef.current) {
//       clearTimeout(debounceRef.current);
//     }

//     debounceRef.current = setTimeout(() => {
//       onSearch && onSearch(searchQuery);
//       setIsOpen(searchQuery.length > 0 && options.length > 0);
//       setSelectedIndex(-1);
//     }, debounceMs);
//   };

//   // Handle input change
//   const handleInputChange = (e) => {
//     const value = e.target.value;
//     setQuery(value);
    
//     if (value.trim()) {
//       debouncedSearch(value);
//     } else {
//       setIsOpen(false);
//     }
//   };

//   // Handle option selection
//   const handleOptionSelect = (option) => {
//     setQuery(option);
//     setIsOpen(false);
//   };

//   // Handle keyboard navigation
//   const handleKeyDown = (e) => {
//     if (!isOpen) return;

//     switch (e.key) {
//       case 'ArrowDown':
//         e.preventDefault();
//         setSelectedIndex(prev => 
//           prev < options.length - 1 ? prev + 1 : prev
//         );
//         break;
//       case 'ArrowUp':
//         e.preventDefault();
//         setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
//         break;
//       case 'Enter':
//         e.preventDefault();
//         if (selectedIndex >= 0) {
//           handleOptionSelect(options[selectedIndex]);
//         }
//         break;
//       case 'Escape':
//         setIsOpen(false);
//         setSelectedIndex(-1);
//         break;
//     }
//   };

//   // Clear search
//   const clearSearch = () => {
//     setQuery('');
//     setIsOpen(false);
//     searchRef.current?.focus();
//   };

//   // Close dropdown when clicking outside
//   useEffect(() => {
//     const handleClickOutside = (event) => {
//       if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
//         setIsOpen(false);
//         setSelectedIndex(-1);
//       }
//     };

//     document.addEventListener('mousedown', handleClickOutside);
//     return () => document.removeEventListener('mousedown', handleClickOutside);
//   }, []);

//   // Cleanup debounce on unmount
//   useEffect(() => {
//     return () => {
//       if (debounceRef.current) {
//         clearTimeout(debounceRef.current);
//       }
//     };
//   }, []);

//   return (
//     <div className="w-full max-w-md mx-auto p-6">
//       <div className="relative" ref={dropdownRef}>
//         {/* Search Input */}
//         <div className="relative">
//           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
//             <Search className="h-5 w-5 text-gray-400" />
//           </div>
          
//           <input
//             ref={searchRef}
//             type="text"
//             value={query}
//             onChange={handleInputChange}
//             onKeyDown={handleKeyDown}
//             placeholder={placeholder}
//             className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 bg-white shadow-sm"
//           />
          
//           <div className="absolute inset-y-0 right-0 flex items-center pr-3">
//             {query && (
//               <button
//                 onClick={clearSearch}
//                 className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
//               >
//                 <X className="h-4 w-4" />
//               </button>
//             )}
            
//             {isLoading && (
//               <div className="ml-2">
//                 <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
//               </div>
//             )}
//           </div>
//         </div>

//         {/* Dropdown Options */}
//         {isOpen && (
//           <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
//             {options.length > 0 ? (
//               <>
//                 {options.map((option, index) => (
//                   <button
//                     key={index}
//                     onClick={() => handleOptionSelect(option)}
//                     className={`w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 ${
//                       index === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
//                     }`}
//                   >
//                     <div className="flex items-center justify-between">
//                       <span className="font-medium">{option}</span>
//                       {index === selectedIndex && (
//                         <ChevronDown className="h-4 w-4 text-blue-500" />
//                       )}
//                     </div>
//                   </button>
//                 ))}
//               </>
//             ) : (
//               <div className="px-4 py-3 text-gray-500 text-center">
//                 {isLoading ? 'Searching...' : 'No results found'}
//               </div>
//             )}
//           </div>
//         )}
//       </div>

//       {/* Example Usage - Remove this in actual implementation */}
//       {query && !isOpen && (
//         <div className="mt-4 p-4 bg-gray-50 rounded-lg">
//           <p className="text-sm text-gray-600">
//             Selected: <span className="font-medium text-gray-900">{query}</span>
//           </p>
//         </div>
//       )}
//     </div>
//   );
// };

// export default SearchInput;




// import React, { useState, useEffect, useRef, useMemo } from 'react';
// import { Search, X, ChevronDown } from 'lucide-react';
// import { debounce } from 'lodash';

// export interface SearchOption {
//     label: string;
//     value: string;
//     [key: string]: any; // For extra data
// };

// interface SearchInputProps {
//     options: SearchOption[];
//     value: SearchOption | null;
//     onSearch: (query: string) => void;
//     onSelect: (option: SearchOption | null) => void;
//     placeholder?: string;
//     isLoading?: boolean;
//     debounceMs?: number;
// };

// const SearchInput: React.FC<SearchInputProps> = ({ 
//   options = [], 
//   value,
//   onSearch,
//   onSelect, 
//   placeholder = "Search...",
//   isLoading = false,
//   debounceMs = 300 
// }) => {
//   const [query, setQuery] = useState('');
//   const [isOpen, setIsOpen] = useState(false);
//   const [selectedIndex, setSelectedIndex] = useState(-1);
  
//   const searchRef = useRef<HTMLInputElement>(null);
//   const dropdownRef = useRef<HTMLDivElement>(null);

//   // Debounced search function
//     const debouncedSearch = useMemo(
//         () =>
//             debounce((searchQuery: string) => {
//             if (onSearch) onSearch(searchQuery);
//             setIsOpen(searchQuery.length > 0 && options.length > 0);
//             setSelectedIndex(-1);
//             }, debounceMs),
//         [onSearch, debounceMs, options.length]
//     );

//   // Handle input change
//   const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const value = e.target.value;
//     setQuery(value);
    
//     if (value.trim()) {
//       debouncedSearch(value);
//     } else {
//       setIsOpen(false);
//       onSelect(null);
//     }
//   };

//   // Handle option selection
//   const handleOptionSelect = (option: SearchOption) => {
//     setQuery(option.label);
//     setIsOpen(false);
//   };

//   // Handle keyboard navigation
//   const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
//     if (!isOpen) return;

//     switch (e.key) {
//       case 'ArrowDown':
//         e.preventDefault();
//         setSelectedIndex(prev => 
//           prev < options.length - 1 ? prev + 1 : prev
//         );
//         break;
//       case 'ArrowUp':
//         e.preventDefault();
//         setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
//         break;
//       case 'Enter':
//         e.preventDefault();
//         if (selectedIndex >= 0) {
//           handleOptionSelect(options[selectedIndex]);
//         }
//         break;
//       case 'Escape':
//         setIsOpen(false);
//         setSelectedIndex(-1);
//         break;
//     }
//   };

//   // Clear search
//   const clearSearch = () => {
//     setQuery('');
//     setIsOpen(false);
//     searchRef.current?.focus();
//     onSelect(null);
//   };

//   // Close dropdown when clicking outside
//   useEffect(() => {
//     const handleClickOutside = (event: MouseEvent) => {
//       if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
//         setIsOpen(false);
//         setSelectedIndex(-1);
//       }
//     };

//     document.addEventListener('mousedown', handleClickOutside);
//     return () => document.removeEventListener('mousedown', handleClickOutside);
//   }, []);

//   // Cleanup debounce on unmount
//   useEffect(() => {
//     return () => {
//         debouncedSearch.cancel();
//     //   if (debounceRef.current) {
//     //     clearTimeout(debounceRef.current);
//     //   }
//     };
//   }, [debouncedSearch]);

//   // Controlled value update
//   useEffect(() => {
//     setQuery(value?.label || '');
//   }, [value]);

//   return (
//     <div className="w-full max-w-md mx-auto p-6">
//       <div className="relative" ref={dropdownRef}>
//         {/* Search Input */}
//         <div className="relative">
//           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
//             <Search className="h-5 w-5 text-gray-400" />
//           </div>
          
//           <input
//             ref={searchRef}
//             type="text"
//             value={query}
//             onChange={handleInputChange}
//             onKeyDown={handleKeyDown}
//             placeholder={placeholder}
//             className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 bg-white shadow-sm"
//           />
          
//           <div className="absolute inset-y-0 right-0 flex items-center pr-3">
//             {query && (
//               <button
//                 onClick={clearSearch}
//                 className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
//               >
//                 <X className="h-4 w-4" />
//               </button>
//             )}
            
//             {isLoading && (
//               <div className="ml-2">
//                 <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
//               </div>
//             )}
//           </div>
//         </div>

//         {/* Dropdown Options */}
//         {isOpen && (
//           <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
//             {options.length > 0 ? (
//               <>
//                 {options.map((option, index) => (
//                   <button
//                     key={index}
//                     onClick={() => handleOptionSelect(option)}
//                     className={`w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 ${
//                       index === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
//                     }`}
//                   >
//                     <div className="flex items-center justify-between">
//                       <span className="font-medium">{option.label}</span>
//                       {index === selectedIndex && (
//                         <ChevronDown className="h-4 w-4 text-blue-500" />
//                       )}
//                     </div>
//                   </button>
//                 ))}
//               </>
//             ) : (
//               <div className="px-4 py-3 text-gray-500 text-center">
//                 {isLoading ? 'Searching...' : 'No results found'}
//               </div>
//             )}
//           </div>
//         )}
//       </div>

//     </div>
//   );
// };

// export default SearchInput;



import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { debounce } from 'lodash';

export interface SearchOption {
    label: string;
    value: string;
    [key: string]: any; // For extra data
};

interface SearchInputProps {
    options: SearchOption[];
    value: SearchOption | null;
    onSearch: (query: string) => void;
    onSelect: (option: SearchOption | null) => void;
    placeholder?: string;
    isLoading?: boolean;
    debounceMs?: number;
};

const SearchInput: React.FC<SearchInputProps> = ({ 
  options = [], 
  value,
  onSearch,
  onSelect, 
  placeholder = "Search...",
  isLoading = false,
  debounceMs = 300 
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search function
  const debouncedSearch = useMemo(
    () =>
      debounce((searchQuery: string) => {
        if (onSearch) onSearch(searchQuery);
      }, debounceMs),
    [onSearch, debounceMs]
  );

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setQuery(inputValue);
    
    if (inputValue.trim()) {
      debouncedSearch(inputValue);
      setIsOpen(true);
    } else {
      setIsOpen(false);
      onSelect(null);
    }
    setSelectedIndex(-1);
  };

  // Handle option selection
  const handleOptionSelect = (option: SearchOption) => {
    setQuery(option.label);
    setIsOpen(false);
    onSelect(option);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && options.length > 0) {
        e.preventDefault();
        setIsOpen(true);
        setSelectedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < options.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && options[selectedIndex]) {
          handleOptionSelect(options[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  // Clear search
  const clearSearch = () => {
    setQuery('');
    setIsOpen(false);
    searchRef.current?.focus();
    onSelect(null);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // Controlled value update
  useEffect(() => {
    if (value) {
      setQuery(value.label);
    } else if (!value && !isOpen) {
      setQuery('');
    }
  }, [value, isOpen]);

  // Show dropdown when options change
  useEffect(() => {
    if (query.trim() && options.length > 0 && !value) {
      setIsOpen(true);
    }
  }, [options, query, value]);

  return (
    <div className="w-full" ref={dropdownRef}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim() && options.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-10 py-2 border border-gray-300 rounded-4xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white shadow-sm text-sm"
        />
        
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {query && !isLoading && (
            <button
              onClick={clearSearch}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          
          {isLoading && (
            <div className="ml-2">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500 border-t-transparent"></div>
            </div>
          )}
        </div>
      </div>

      {/* Dropdown Options */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {options.length > 0 ? (
            <>
              {options.map((option, index) => (
                <button
                  key={`${option.value}-${index}`}
                  onClick={() => handleOptionSelect(option)}
                  className={`w-full px-4 py-2 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 text-sm ${
                    index === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{option.label}</span>
                    {index === selectedIndex && (
                      <ChevronDown className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                </button>
              ))}
            </>
          ) : (
            <div className="px-4 py-3 text-gray-500 text-center text-sm">
              {isLoading ? 'Searching...' : query.trim() ? 'No results found' : 'Start typing to search'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchInput;