export interface FilterConfig {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
  icon?: React.ReactNode;
}

export interface SearchableTableProps {
  // Data props
  data: any[];
  columns: any[];
  actions?: any[];
  
  // Search configuration
  searchEndpoint?: string;
  searchAction?: (query: string) => any;
  searchResultsSelector?: (state: any) => any[];
  searchLoadingSelector?: (state: any) => boolean;
  searchErrorSelector?: (state: any) => string | null;
  clearSearchAction?: () => any;
  searchPlaceholder?: string;
  searchMinLength?: number;
  
  // Filter configuration
  filters?: FilterConfig[];
  
  // DataTable props
  highlightOnHover?: boolean;
  className?: string;
  minHeight?: number;
  paginationText?: (paginationInfo: { from: number; to: number; totalRecords: number }) => string;
  selectable?: boolean;
  selectedRecords?: any[];
  onSelectionChange?: (selected: any[]) => void;
  loading?: boolean;
  onRowClick?: (record: any, index: number) => void;
  
  // Additional table configuration
  recordsPerPageOptions?: number[];
  defaultRecordsPerPage?: number;
  
  // Header configuration
  title?: string;
  titleIcon?: React.ReactNode;
  description?: string;
  actionButton?: {
    label: string;
    onClick: () => void;
    className?: string;
  };
  
  // Error handling
  error?: string | null;
  fallbackMessage?: string;
  
  // Backend pagination
  totalRecords?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  useBackendPagination?: boolean;
  onFiltersChange?: (filters: Record<string, string>) => void;
}

export interface SearchableTableState {
  searchQuery: string;
  filterValues: Record<string, string>;
  filtersExpanded: boolean;
  page: number;
  pageSize: number;
  selectedRecords: any[];
}