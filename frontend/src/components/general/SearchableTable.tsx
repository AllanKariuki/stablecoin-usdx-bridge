import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Search, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import DataTable from './DataTable';
import type { SearchableTableProps } from '../../types/general/searchTable';

const SearchableTable: React.FC<SearchableTableProps> = ({
  data = [],
  columns = [],
  actions = [],
  searchAction,
  searchResultsSelector,
  searchLoadingSelector,
  searchErrorSelector,
  clearSearchAction,
  searchPlaceholder = "Search...",
  searchMinLength = 2,
  filters = [],
  highlightOnHover = true,
  className = "",
  minHeight = 200,
  paginationText,
  selectable = false,
  selectedRecords: externalSelectedRecords,
  onSelectionChange: externalOnSelectionChange,
  loading = false,
  onRowClick,
  recordsPerPageOptions = [5, 10, 25, 50],
  defaultRecordsPerPage = 10,
  title,
  titleIcon,
  description,
  actionButton,
  error,
  fallbackMessage = "Showing local data due to search error",
  totalRecords,
  onPageChange: externalOnPageChange,
  onPageSizeChange: externalOnPageSizeChange,
  useBackendPagination = false,
  onFiltersChange
}) => {
  const dispatch = useDispatch();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    const initialFilters: Record<string, string> = {};
    filters.forEach(filter => {
      initialFilters[filter.key] = filter.defaultValue || 'all';
    });
    return initialFilters;
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultRecordsPerPage);
  const [internalSelectedRecords, setInternalSelectedRecords] = useState<any[]>([]);
  
  // Redux selectors
  const searchResults = useSelector(searchResultsSelector || (() => []));
  const isSearchLoading = useSelector(searchLoadingSelector || (() => false));
  const searchError = useSelector(searchErrorSelector || (() => null));
  
  // Use external or internal selected records
  const selectedRecords = externalSelectedRecords ?? internalSelectedRecords;
  const onSelectionChange = externalOnSelectionChange ?? setInternalSelectedRecords;
  
  // Handle search query changes with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchAction) {
        if (searchQuery.trim().length >= searchMinLength) {
          dispatch(searchAction(searchQuery));
        } else if (searchQuery.trim().length === 0 && clearSearchAction) {
          dispatch(clearSearchAction());
        }
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, dispatch, searchAction, clearSearchAction, searchMinLength]);
  
  // Reset page when search or filters change
  useEffect(() => {
    setPage(1);
    // Trigger filter callback when filters change and using backend pagination
    if (useBackendPagination && onFiltersChange) {
      onFiltersChange(filterValues);
    }
  }, [searchQuery, filterValues, useBackendPagination, onFiltersChange]);

  // Handle page changes - trigger backend fetch if using backend pagination
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    if (useBackendPagination && externalOnPageChange) {
      externalOnPageChange(newPage);
    }
  };

  // Handle page size changes - trigger backend fetch if using backend pagination
  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1); // Reset to first page when changing page size
    if (useBackendPagination && externalOnPageSizeChange) {
      externalOnPageSizeChange(newPageSize);
    }
  };
  
  // Get the appropriate data source
  const sourceData = useMemo(() => {
    return searchQuery.trim().length >= searchMinLength ? searchResults : data;
  }, [searchQuery, searchMinLength, searchResults, data]);
  
  // Apply filters to data
  const filteredData = useMemo(() => {
    if (filters.length === 0) return sourceData;
    
    return sourceData.filter(item => {
      return filters.every(filter => {
        const filterValue = filterValues[filter.key];
        if (!filterValue || filterValue === 'all') return true;
        
        const itemValue = item[filter.key];
        return itemValue === filterValue;
      });
    });
  }, [sourceData, filterValues, filters]);
  
  // Get unique filter options from data
  const getFilterOptions = useCallback((filterKey: string) => {
    const values = new Set(data.map(item => item[filterKey]).filter(Boolean));
    return Array.from(values).map(value => ({ value, label: value }));
  }, [data]);
  
  // Handle filter changes
  const handleFilterChange = (filterKey: string, value: string) => {
    setFilterValues(prev => ({ ...prev, [filterKey]: value }));
  };
  
  // Clear all filters
  const clearAllFilters = () => {
    const clearedFilters: Record<string, string> = {};
    filters.forEach(filter => {
      clearedFilters[filter.key] = filter.defaultValue || 'all';
    });
    setFilterValues(clearedFilters);
  };
  
  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return filters.some(filter => {
      const value = filterValues[filter.key];
      const defaultValue = filter.defaultValue || 'all';
      return value !== defaultValue;
    });
  }, [filterValues, filters]);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      {(title || actionButton) && (
        <div className="flex items-center justify-between">
          {title && (
            <div>
              <div className="flex items-center mb-3">
                {titleIcon}
                <h1 className="text-2xl font-semibold">{title}</h1>
              </div>
              {description && (
                <p className="text-gray-600">{description}</p>
              )}
            </div>
          )}
          {actionButton && (
            <button
              className={actionButton.className || "px-4 py-2 bg-gray-800 text-white rounded-lg hover:shadow-md transition cursor-pointer"}
              onClick={actionButton.onClick}
            >
              {actionButton.label}
            </button>
          )}
        </div>
      )}
      
      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        {/* Always visible search bar */}
        <div className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-transparent"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Filter Toggle Button */}
            {filters.length > 0 && (
              <button
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                className={`flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg transition-colors cursor-pointer ${
                  filtersExpanded ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-50'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span className="text-sm font-medium">Filters</span>
                {filtersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Search Status */}
          {searchQuery.trim().length >= searchMinLength && (
            <div className="mt-3 text-sm text-gray-600">
              {isSearchLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Searching...
                </span>
              ) : (
                <span>Found {filteredData.length} results matching "{searchQuery}"</span>
              )}
            </div>
          )}

          {/* Search Error */}
          {searchError && (
            <div className="mt-3 text-sm text-red-600">
              Search error: {searchError}
              {fallbackMessage && <span className="block mt-1 text-gray-600">{fallbackMessage}</span>}
            </div>
          )}
        </div>

        {/* Collapsible Filters Section */}
        {filtersExpanded && filters.length > 0 && (
          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <div className="flex flex-col lg:flex-row gap-4">
              {filters.map(filter => (
                <div key={filter.key} className="lg:w-48">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {filter.label}
                  </label>
                  <div className="relative">
                    {filter.icon && (
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                        {filter.icon}
                      </div>
                    )}
                    <select
                      value={filterValues[filter.key]}
                      onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                      className={`w-full ${filter.icon ? 'pl-10' : 'pl-4'} pr-4 py-2 border border-gray-300 rounded-lg outline-none cursor-pointer appearance-none bg-white`}
                    >
                      {/* <option value="all">All {filter.label}s</option> */}
                      {(filter.options.length > 0 ? filter.options : getFilterOptions(filter.key)).map((option: { value: string; label: string }) => (
                        <option key={option.value} value={option.value} className='cursor-pointer'>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}

              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <div className="flex items-end">
                  <button
                    onClick={clearAllFilters}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 underline cursor-pointer"
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error: {error}</p>
        </div>
      )}
      
      {/* Data Table */}
      <DataTable
        highlightOnHover={highlightOnHover}
        className={className}
        records={useBackendPagination ? data : filteredData}
        columns={columns}
        totalRecords={useBackendPagination ? (totalRecords || 0) : filteredData.length}
        recordsPerPage={pageSize}
        page={page}
        onPageChange={handlePageChange}
        recordsPerPageOptions={recordsPerPageOptions}
        onRecordsPerPageChange={handlePageSizeChange}
        minHeight={minHeight}
        paginationText={paginationText}
        selectable={selectable}
        selectedRecords={selectedRecords}
        onSelectionChange={onSelectionChange}
        actions={actions}
        loading={loading || isSearchLoading}
        onRowClick={onRowClick}
      />
    </div>
  );
};

export default SearchableTable;
