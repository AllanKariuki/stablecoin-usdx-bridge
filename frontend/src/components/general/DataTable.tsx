
import React, { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

interface ActionDropdownItem {
    label: string;
    icon: React.ReactNode;
    onClick: (record: any) => void;
    className?: string;
    hidden?: (record: any) => boolean;
}

interface DataTableProps {
    records: any[];
    columns: any[];
    totalRecords: number;
    recordsPerPage: number;
    page: number;
    onPageChange: (page: number) => void;
    recordsPerPageOptions?: number[];
    onRecordsPerPageChange?: (recordsPerPage: number) => void;
    highlightOnHover?: boolean;
    className?: string;
    minHeight?: number;
    paginationText?: (paginationInfo: { from: number; to: number; totalRecords: number }) => string;
    selectable?: boolean;
    selectedRecords?: any[];
    onSelectionChange?: (selected: any[]) => void;
    actions?: ActionDropdownItem[];
    loading?: boolean;
    onRowClick?: (record: any, index: number) => void;
}

// Custom DataTable Component
const DataTable: React.FC<DataTableProps> = ({
  records = [],
  columns = [],
  totalRecords = 0,
  recordsPerPage = 10,
  page = 1,
  onPageChange,
  recordsPerPageOptions = [10, 25, 50],
  onRecordsPerPageChange,
  highlightOnHover = false,
  className = "",
  minHeight = 200,
  paginationText,
  selectable = false,
  selectedRecords =[],
  onSelectionChange,
  actions = [],
  loading = false,
  onRowClick
}) => {
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ [key: number]: 'top' | 'bottom' }>({});
  const startIndex = (page - 1) * recordsPerPage;
  const endIndex = Math.min(startIndex + recordsPerPage, totalRecords);
  const totalPages = Math.ceil(totalRecords / recordsPerPage);
  const dropdownRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const tableRef = useRef<HTMLDivElement>(null);

  // Calculate dropdown position to avoid clipping
  const calculateDropdownPosition = (rowElement: HTMLElement): 'top' | 'bottom' => {
    if (!tableRef.current) return 'bottom';
    
    const tableRect = tableRef.current.getBoundingClientRect();
    const rowRect = rowElement.getBoundingClientRect();
    const dropdownHeight = 200; // Estimated dropdown height
    const spaceBelow = tableRect.bottom - rowRect.bottom;
    const spaceAbove = rowRect.top - tableRect.top;
    
    // If there's not enough space below and there's more space above, position at top
    return spaceBelow < dropdownHeight && spaceAbove > dropdownHeight ? 'top' : 'bottom';
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    
    if (checked) {
        const allRecordIds = records.map(record => record.id || record);
        onSelectionChange([...new Set([...selectedRecords, ...allRecordIds])]);
    } else {
        const currentPageIds = records.map(record => record.id || record);
        onSelectionChange(selectedRecords.filter(id => !currentPageIds.includes(id)));
    }
  };

  const handleSelectRecord = (recordId: string, checked: boolean) => {
    if (!onSelectionChange) return;

    if (checked) {
        onSelectionChange([...selectedRecords, recordId]);
    } else {
        onSelectionChange(selectedRecords.filter(id => id !== recordId));
    }
  };

  const isAllSelected = selectable && records.length > 0 && records.every(record => selectedRecords.includes(record.id || record));
  const isIndeterminate = selectable && selectedRecords.length > 0 && !isAllSelected && records.some(record => selectedRecords.includes(record.id || record));

  return (
    <div className="space-y-4">
      {/* Table */}
      <div ref={tableRef} className="bg-white rounded-lg shadow-md overflow-hidden overflow-x-auto" style={{ minHeight }}>
        <table className={`w-full ${className}`}>
          <thead className="bg-white">
            <tr>
              {selectable && (
                <th className="px-6 py-3 text-left border-b border-gray-200 w-12">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={checkbox => {
                      if (checkbox) checkbox.indeterminate = isIndeterminate;
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </th>
              )}
              {columns.map((column, index) => (
                <th
                  key={index}
                  className="px-6 py-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200"
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.title || column.accessor}</span>
                    {column.sortable && (
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    )}
                  </div>
                </th>
              ))}
              {actions.length > 0 && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 w-12">
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0) + (actions.length > 0 ? 1 : 0)} className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span className="text-gray-500">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0) + (actions.length > 0 ? 1 : 0)} className="px-6 py-4 text-center text-gray-500">
                  No records found
                </td>
              </tr>
            ) : (
              records.map((record: any, recordIndex: number) => {
                const recordId = record.id || record;
                const isSelected = selectedRecords.includes(recordId);
                
                return (
                  <tr
                    key={recordIndex}
                    className={`${highlightOnHover ? 'hover:bg-gray-50' : ''} ${isSelected ? 'bg-blue-50' : ''} transition-colors duration-150 border-b border-gray-100 last:border-b-0`}
                    onClick={() => onRowClick?.(record, recordIndex)}
                  >
                    {selectable && (
                      <td className="px-6 py-5 whitespace-nowrap w-12">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectRecord(recordId, e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </td>
                    )}
                    {columns.map((column: any, colIndex: number) => (
                      <td key={colIndex} className="px-6 py-5 whitespace-nowrap text-sm text-gray-700">
                        {column.render ? column.render(record[column.accessor], record, recordIndex) : record[column.accessor]}
                      </td>
                    ))}
                    {actions.length > 0 && (
                      <td className="px-6 py-5 whitespace-nowrap text-right text-sm text-gray-400">
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openDropdownIndex === recordIndex) {
                                setOpenDropdownIndex(null);
                              } else {
                                const rowElement = e.currentTarget.closest('tr') as HTMLElement;
                                const position = calculateDropdownPosition(rowElement);
                                setDropdownPosition(prev => ({ ...prev, [recordIndex]: position }));
                                setOpenDropdownIndex(recordIndex);
                              }
                            }}                            
                            className="hover:text-gray-600 transition-colors p-1 cursor-pointer"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          
                          {openDropdownIndex === recordIndex && (
                            <div 
                              ref={el => { dropdownRefs.current[recordIndex] = el }}
                              className={`absolute right-0 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50 origin-top-right ${
                                dropdownPosition[recordIndex] === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
                              }`}
                              >
                              <div className="py-1">
                                {actions.map((action, actionIndex) => (
                                  <button
                                    key={actionIndex}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      action.onClick(record);
                                      setOpenDropdownIndex(null);
                                    }}
                                    className={`flex items-center space-x-2 w-full px-4 py-2 
                                      text-sm cursor-pointer text-left hover:bg-gray-50 transition-colors 
                                      ${action.className || 'text-gray-700'}
                                      ${action.hidden && action.hidden(record) ? 'hidden' : ''}
                                      `}
                                  >
                                    {action.icon}
                                    <span>{action.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
            
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-2 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <span className="font-medium">
              {paginationText 
                ? paginationText({ from: startIndex + 1, to: endIndex, totalRecords })
                : `Showing ${startIndex + 1} from ${endIndex} data`
              }
            </span>
          </div>
          
          {onRecordsPerPageChange && (
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-gray-600">Records per page:</span>
              <select
                value={recordsPerPage}
                onChange={(e) => onRecordsPerPageChange(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {recordsPerPageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {selectable && selectedRecords.length > 0 && (
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-blue-600 font-medium">
                {selectedRecords.length} selected
              </span>
              <button
                onClick={() => onSelectionChange?.([])}
                className="text-gray-500 hover:text-gray-700 underline"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => onPageChange?.(page - 1)}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 rounded-3xl hover:bg-blue-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          
          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNumber;
              if (totalPages <= 5) {
                pageNumber = i + 1;
              } else if (page <= 3) {
                pageNumber = i + 1;
              } else if (page >= totalPages - 2) {
                pageNumber = totalPages - 4 + i;
              } else {
                pageNumber = page - 2 + i;
              }
              
              return (
                <button
                  key={pageNumber}
                  onClick={() => onPageChange?.(pageNumber)}
                  className={`w-10 h-10 rounded-3xl px-6 flex items-center justify-center text-sm font-medium transition-colors ${
                    page === pageNumber
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {pageNumber}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => onPageChange?.(page + 1)}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-3xl hover:bg-blue-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};


export default DataTable;