import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { debounce } from 'lodash';
import {
    performSearch,
    setQuery,
    clearResults,
    setIsOpen,
    addRecentSearch,
    selectSearchQuery,
    selectSearchResults,
    selectSearchError,
    selectRecentSearches,
    selectIsSearchLoading,
    selectIsSearchOpen,
} from '../../redux/slices/navigation/searchSlice';
import type { SearchResult } from '../../types/navigation/search';
import SearchResultComponent from './SearchResultComponent';

interface GlobalSearchProps {
    placeholder?: string;
    className?: string;
    showRecentSearches?: boolean;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({
    placeholder = "Search flights, aircraft, maintenance, users...",
    className = "",
    showRecentSearches = true,
}) => {

    const dispatch = useDispatch();
    const navigate = useNavigate();
    const searchRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const query = useSelector(selectSearchQuery);
    const results = useSelector(selectSearchResults);
    const isLoading = useSelector(selectIsSearchLoading);
    const error = useSelector(selectSearchError);
    const recentSearches = useSelector(selectRecentSearches);
    const isOpen = useSelector(selectIsSearchOpen);

    const [focusedIndex, setFocusedIndex] = useState(-1); // Index for keyboard navigation
    const [inputValue, setInputValue] = useState('');
    const [hasSearched, setHasSearched] = useState(false);

    // Simplified debounced search function - only needs query
    // const debouncedSearch = useCallback(
    //     debounce((searchQuery: string) => {
    //         if (searchQuery.trim().length >= 2) {
    //             setHasSearched(true);
    //             dispatch(performSearch(searchQuery) as any);
    //         } else {
    //             setHasSearched(false);
    //             dispatch(clearResults());
    //         }
    //     }, 300),
    //     [dispatch]
    // );
    const debouncedSearch = useRef(
        debounce((searchQuery: string) => {
            if (searchQuery.trim().length >= 2) {
            setHasSearched(true);
            dispatch(performSearch(searchQuery) as any);
            } else {
            setHasSearched(false);
            dispatch(clearResults());
            }
        }, 300)
    ).current;

        // Optionally, clean up the debounce on unmount
    useEffect(() => {
        return () => {
            debouncedSearch.cancel();
        };
    }, [debouncedSearch]);

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInputValue(value);
        dispatch(setQuery(value));
        
        // Reset hasSearched when user is typing
        if (value.length < 2) {
            setHasSearched(false);
        }

        debouncedSearch(value);

        if (!isOpen) {
            dispatch(setIsOpen(true));
        }
    };

    // Handle input focus
    const handleInputFocus = () => {
        dispatch(setIsOpen(true));
    };

    // Handle result click
    const handleResultClick = (result: SearchResult) => {
        dispatch(addRecentSearch(query));
        dispatch(setIsOpen(false));
        dispatch(setQuery(''));
        setInputValue('');
        if (result.route) {
            navigate(result.route);
        }
    };

    // Handle recent search click
    const handleRecentSearchClick = (recentQuery: string) => {
        setInputValue(recentQuery);
        dispatch(setQuery(recentQuery));
        dispatch(performSearch(recentQuery) as any);
        inputRef.current?.focus();
    };

    // Handle clear
    const handleClear = () => {
        setInputValue('');
        dispatch(setQuery(''));
        dispatch(clearResults());
        inputRef.current?.focus();
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        const totalItems = results.length + (showRecentSearches && !query ? recentSearches.length : 0);

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIndex(prev => (prev < totalItems - 1 ? prev + 1 : prev));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIndex(prev => (prev > 0 ? prev - 1 : -1));
                break;
            case 'Enter':
                e.preventDefault();
                if (focusedIndex >= 0) {
                    if (focusedIndex < results.length) {
                        handleResultClick(results[focusedIndex]);
                    } else if (showRecentSearches && !query) {
                        const recentIndex = focusedIndex - results.length;
                        if (recentIndex < recentSearches.length) {
                            handleRecentSearchClick(recentSearches[recentIndex]);
                        }
                    }
                }
                break;
            case 'Escape':
                dispatch(setIsOpen(false));
                inputRef.current?.blur();
                break;
        }
    };

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                dispatch(setIsOpen(false));
                setFocusedIndex(-1);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [dispatch]);

    // Reset focused index when results change
    useEffect(() => {
        setFocusedIndex(-1);
    }, [results]);

    // Sync input value with query
    useEffect(() => {
        if (query !== inputValue) {
            setInputValue(query);
        }
    }, [inputValue, query]);

    const showRecentSearchesSection = showRecentSearches && !query && recentSearches.length > 0;
    // const showResults = results.length > 0 || isLoading || error;
    const showResults = results.length > 0 || isLoading || error || (hasSearched && query.length >= 2);
    
    return (
        <div ref={searchRef} className={`relative w-full max-w-md mx-auto`}>
            {/* Search Input */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={`w-full pl-10 pr-10 py-2 rounded-full ${className} outline-none`}
                    // className={`w-full pl-10 pr-10 py-2 border border-gray-300 rounded-full ${className} outline-none`}

                />
                {inputValue && (
                    <button
                        onClick={handleClear}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                        <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Search Results Dropdown */}
            {isOpen && (inputValue || showRecentSearchesSection || isLoading) && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-hidden">
                    {isLoading && (
                        <div className="flex items-center justify-center p-4">
                            <svg className="animate-spin h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-gray-600">Searching...</span>
                        </div>
                    )}

                    {error && (
                        <div className="p-4 text-red-600 text-sm">
                            Error: {error}
                        </div>
                    )}

                    {showResults && !isLoading && !error && (
                        <div className="search-results">
                            <div className="p-2 border-b border-gray-100 bg-gray-50">
                                <span className="text-sm font-medium text-gray-700">
                                    Search Results ({results.length})
                                </span>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                {results.map((result: any, index: number) => (
                                    <SearchResultComponent
                                        key={result.id}
                                        result={result}
                                        isActive={index === focusedIndex}
                                        onClick={() => handleResultClick(result)}
                                    />
                                ))}
                                {results.length === 0 && query.length >= 2 && (
                                    <div className="p-4 text-gray-500 text-sm text-center">
                                        No results found for "{query}"
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {showRecentSearchesSection && (
                        <div className="recent-searches">
                            <div className="p-2 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700">Recent Searches</span>
                            </div>
                            <div className="max-h-40 overflow-y-auto">
                                {recentSearches.map((recentQuery: string, index: number) => (
                                    <div
                                        key={recentQuery}
                                        className={`flex items-center p-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                                            index + results.length === focusedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                                        }`}
                                        onClick={() => handleRecentSearchClick(recentQuery)}
                                    >
                                        <div className="mr-3 text-gray-400">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <span className="flex-1 text-sm text-gray-700">{recentQuery}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalSearch;

