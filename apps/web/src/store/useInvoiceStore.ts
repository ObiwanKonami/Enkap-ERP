/**
 * Zustand Store: Invoice State Management
 *
 * Manages:
 * - activeInvoice: Currently selected/displayed invoice
 * - selectedRows: Bulk operation row selection
 * - previewState: Invoice preview modal state
 */

import { create } from 'zustand';
import type { Invoice } from '@enkap/shared-types';

interface InvoiceStoreState {
  activeInvoice: Invoice | null;
  selectedRows: Set<string>;
  previewOpen: boolean;
}

interface InvoiceStoreActions {
  // Invoice selection
  setActiveInvoice: (invoice: Invoice | null) => void;

  // Bulk selection
  toggleRowSelection: (id: string) => void;
  setSelectedRows: (ids: string[]) => void;
  clearSelectedRows: () => void;
  isRowSelected: (id: string) => boolean;

  // Preview modal
  openPreview: () => void;
  closePreview: () => void;
}

export const useInvoiceStore = create<InvoiceStoreState & InvoiceStoreActions>(
  (set, get) => ({
    activeInvoice: null,
    selectedRows: new Set(),
    previewOpen: false,

    setActiveInvoice: (invoice) =>
      set({ activeInvoice: invoice }),

    toggleRowSelection: (id) =>
      set((state) => {
        const newSelection = new Set(state.selectedRows);
        if (newSelection.has(id)) {
          newSelection.delete(id);
        } else {
          newSelection.add(id);
        }
        return { selectedRows: newSelection };
      }),

    setSelectedRows: (ids) =>
      set({ selectedRows: new Set(ids) }),

    clearSelectedRows: () =>
      set({ selectedRows: new Set() }),

    isRowSelected: (id) =>
      get().selectedRows.has(id),

    openPreview: () =>
      set({ previewOpen: true }),

    closePreview: () =>
      set({ previewOpen: false }),
  })
);
