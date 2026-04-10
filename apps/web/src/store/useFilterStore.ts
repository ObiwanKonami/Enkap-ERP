/**
 * Zustand Store: DataTable Filter Persistence
 *
 * Persists:
 * - dateRange: Start and end dates for filtering
 * - gibStatus: GIB submission status filter
 * - searchText: Invoice number or party name search
 * - pageSize: Records per page
 * - currentPage: Current pagination page
 *
 * Prevents filter loss when navigating away and returning.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InvoiceStatus } from '@enkap/shared-types';

interface DateRange {
  from: string | null;
  to: string | null;
}

interface FilterStoreState {
  dateRange: DateRange;
  gibStatus: InvoiceStatus | null;
  searchText: string;
  pageSize: number;
  currentPage: number;
}

interface FilterStoreActions {
  // Date range
  setDateRange: (range: DateRange) => void;
  clearDateRange: () => void;

  // GIB Status
  setGibStatus: (status: InvoiceStatus | null) => void;

  // Search
  setSearchText: (text: string) => void;

  // Pagination
  setPageSize: (size: number) => void;
  setCurrentPage: (page: number) => void;

  // Reset all
  resetFilters: () => void;
}

const INITIAL_STATE: FilterStoreState = {
  dateRange: { from: null, to: null },
  gibStatus: null,
  searchText: '',
  pageSize: 10,
  currentPage: 1,
};

export const useFilterStore = create<FilterStoreState & FilterStoreActions>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setDateRange: (range) =>
        set({ dateRange: range }),

      clearDateRange: () =>
        set({ dateRange: { from: null, to: null } }),

      setGibStatus: (status) =>
        set({ gibStatus: status }),

      setSearchText: (text) =>
        set({ searchText: text }),

      setPageSize: (size) =>
        set({ pageSize: size }),

      setCurrentPage: (page) =>
        set({ currentPage: page }),

      resetFilters: () =>
        set(INITIAL_STATE),
    }),
    {
      name: 'enkap-filter-store',
      version: 1,
    }
  )
);
