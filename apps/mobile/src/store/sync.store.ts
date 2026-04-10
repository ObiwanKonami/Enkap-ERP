import { create } from 'zustand';
import { syncDatabase, type SyncResult } from '../database/sync';

interface SyncState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  lastError: string | null;
  sync: () => Promise<SyncResult>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  lastSyncAt: null,
  lastError: null,

  sync: async () => {
    if (get().isSyncing) return { success: false, reason: 'Zaten senkronize ediliyor' };

    set({ isSyncing: true, lastError: null });
    try {
      const result = await syncDatabase();
      if (result.success) {
        set({ lastSyncAt: new Date(), isSyncing: false });
      } else {
        set({ lastError: result.reason ?? 'Bilinmeyen hata', isSyncing: false });
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ lastError: msg, isSyncing: false });
      return { success: false, reason: msg };
    }
  },
}));
