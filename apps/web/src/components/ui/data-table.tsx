'use client';

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { useState, useCallback, Fragment } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  SlidersHorizontal,
  Columns3,
  X,
} from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

interface DataTableProps<TData> {
  columns:             ColumnDef<TData, unknown>[];
  data:                TData[];
  searchPlaceholder?:  string;
  pageSize?:           number;
  /** Sağ üst köşede gösterilecek aksiyon düğmesi */
  action?:             React.ReactNode;
  /** Filtre satırı gösterilsin mi (varsayılan: true) */
  filterable?:         boolean;
  /** Üst araç çubuğunu (arama + filtreler + sütunlar) gizle (varsayılan: true) */
  showToolbar?:        boolean;
  /** Alt sayfalama çubuğunu gizle (varsayılan: true) */
  showFooter?:         boolean;
  /** Satır seçimi aktif mi */
  selectable?:         boolean;
  /** Seçili satırlar değiştiğinde çağrılır */
  onSelectionChange?:  (rows: TData[]) => void;
  // ─── Server-side pagination ───────────────────────────────────────────────
  /** Sağlandığında server-side sayfalama modu aktif olur */
  totalCount?:         number;
  /** Mevcut sayfa (1-indexed) */
  page?:               number;
  onPageChange?:       (page: number) => void;
  /** Sayfa başı kayıt (server-side modda) */
  serverLimit?:        number;
  onLimitChange?:      (limit: number) => void;
  /** Satır altında gösterilecek içerik — null/undefined döndürürse açılmaz */
  renderSubRow?:       (row: TData) => React.ReactNode;
}

const PAGE_SIZES = [10, 20, 50, 100];

/**
 * Observatory Dark — Gelişmiş Veri Tablosu
 *
 * Özellikler:
 *  - Global arama + sütun bazlı filtreler (toggle)
 *  - Çok sütunlu sıralama (Shift+Tıkla)
 *  - Sütun görünürlük paneli
 *  - Satır seçimi (checkbox)
 *  - Sayfa boyutu seçici
 *  - Sayfa navigasyonu (ilk/son + prev/next)
 */
export function DataTable<TData>({
  columns,
  data,
  searchPlaceholder  = 'Ara...',
  pageSize           = 20,
  action,
  filterable         = true,
  showToolbar        = true,
  showFooter         = true,
  selectable         = false,
  onSelectionChange,
  totalCount,
  page               = 1,
  onPageChange,
  serverLimit,
  onLimitChange,
  renderSubRow,
}: DataTableProps<TData>) {
  // Server-side sayfalama aktif mi?
  const isServerPaged = totalCount !== undefined;
  const { t } = useI18n();
  const [sorting, setSorting]           = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showFilters, setShowFilters]   = useState(false);
  const [showColumns, setShowColumns]   = useState(false);

  // Checkbox sütununu başa ekle
  const allColumns: ColumnDef<TData, unknown>[] = selectable
    ? [
        {
          id: '__select__',
          header: ({ table }) => (
            <input
              type="checkbox"
              className="accent-sky-400 w-3.5 h-3.5 rounded cursor-pointer"
              checked={table.getIsAllPageRowsSelected()}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
            />
          ),
          cell: ({ row }) => (
            <input
              type="checkbox"
              className="accent-sky-400 w-3.5 h-3.5 rounded cursor-pointer"
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
            />
          ),
          enableSorting:       false,
          enableColumnFilter:  false,
          enableGlobalFilter:  false,
          size: 36,
        },
        ...columns,
      ]
    : columns;

  const effectiveLimit = serverLimit ?? pageSize;
  const serverPageCount = isServerPaged
    ? Math.max(1, Math.ceil(totalCount! / effectiveLimit))
    : 1;

  const table = useReactTable({
    data,
    columns: allColumns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      columnVisibility,
      rowSelection,
      // Server-side modda pagination durumu dışarıdan beslenir
      ...(isServerPaged && { pagination: { pageIndex: page - 1, pageSize: effectiveLimit } }),
    },
    enableMultiSort:            true,
    onSortingChange:            setSorting,
    onGlobalFilterChange:       setGlobalFilter,
    onColumnFiltersChange:      setColumnFilters,
    onColumnVisibilityChange:   setColumnVisibility,
    onRowSelectionChange: (updater) => {
      setRowSelection(updater);
      if (onSelectionChange) {
        const next = typeof updater === 'function' ? updater(rowSelection) : updater;
        const selected = Object.keys(next)
          .filter((k) => next[k])
          .map((k) => data[parseInt(k)]);
        onSelectionChange(selected);
      }
    },
    getCoreRowModel:       getCoreRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    getFilteredRowModel:   getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Server-side modda TanStack Table manuel sayfalama yapar
    ...(isServerPaged && {
      manualPagination: true,
      pageCount: serverPageCount,
    }),
    initialState: { pagination: { pageSize } },
  });

  const clearAllFilters = useCallback(() => {
    setGlobalFilter('');
    setColumnFilters([]);
  }, []);

  const hasActiveFilters = globalFilter.length > 0 || columnFilters.length > 0;

  const filteredCount  = isServerPaged ? totalCount! : table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize: currentPageSize } = table.getState().pagination;
  const activePageIndex = isServerPaged ? page - 1 : pageIndex;
  const activePageSize  = isServerPaged ? effectiveLimit : currentPageSize;
  const pageStart = activePageIndex * activePageSize + 1;
  const pageEnd   = Math.min((activePageIndex + 1) * activePageSize, filteredCount);
  const activePageCount = isServerPaged ? serverPageCount : table.getPageCount();

  const filterableColumns = table
    .getAllColumns()
    .filter((col) => col.getCanFilter() && col.id !== '__select__');

  const hidableColumns = table
    .getAllColumns()
    .filter((col) => col.id !== '__select__' && col.getCanHide());

  return (
    <div className="flex flex-col gap-3">

      {/* ─── Araç Çubuğu ─── */}
      {showToolbar && <div className="flex items-center gap-2 flex-wrap">

        {/* Global Arama */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
          />
          <input
            type="search"
            className="input w-full pl-8 pr-3 h-8 text-xs"
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
          {globalFilter && (
            <button
              onClick={() => setGlobalFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-1 transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filtreler butonu */}
        {filterable && filterableColumns.length > 0 && (
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`btn-ghost h-8 px-3 text-xs flex items-center gap-1.5 ${
              showFilters || columnFilters.length > 0
                ? 'text-sky-400 border-sky-500/30'
                : ''
            }`}
          >
            <SlidersHorizontal size={13} />
            {t('common.filters')}
            {columnFilters.length > 0 && (
              <span className="ml-0.5 bg-sky-500/20 text-sky-400 text-[10px] font-semibold px-1.5 py-px rounded-full">
                {columnFilters.length}
              </span>
            )}
          </button>
        )}

        {/* Sütun görünürlüğü */}
        <div className="relative">
          <button
            onClick={() => setShowColumns((v) => !v)}
            className="btn-ghost h-8 px-3 text-xs flex items-center gap-1.5"
          >
            <Columns3 size={13} />
            {t('common.columns')}
          </button>
          {showColumns && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowColumns(false)}
              />
              <div className="absolute right-0 top-10 z-20 glass rounded-lg border border-border-bright p-3 min-w-[160px] shadow-xl">
                <p className="text-[10px] text-text-3 uppercase tracking-wider font-semibold mb-2 px-1">
                  Görünür Sütunlar
                </p>
                {hidableColumns.map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-white/5 text-xs text-text-2"
                  >
                    <input
                      type="checkbox"
                      className="accent-sky-400 w-3 h-3 rounded"
                      checked={col.getIsVisible()}
                      onChange={col.getToggleVisibilityHandler()}
                    />
                    {typeof col.columnDef.header === 'string'
                      ? col.columnDef.header
                      : col.id}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Aktif filtre temizle */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="btn-ghost h-8 px-3 text-xs flex items-center gap-1.5 text-rose-400"
          >
            <X size={12} />
            Temizle
          </button>
        )}

        {/* Sağ aksiyon */}
        {action && <div className="ml-auto">{action}</div>}

      </div>}

      {/* ─── Sütun Filtreleri ─── */}
      {showToolbar && showFilters && filterableColumns.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-ink-700 border border-border">
          {filterableColumns.map((col) => (
            <div key={col.id} className="flex flex-col gap-1 min-w-[120px]">
              <span className="text-[10px] text-text-3 uppercase tracking-wider font-medium">
                {typeof col.columnDef.header === 'string'
                  ? col.columnDef.header
                  : col.id}
              </span>
              <input
                type="text"
                className="input h-7 text-xs px-2"
                placeholder="Filtrele..."
                value={(col.getFilterValue() as string) ?? ''}
                onChange={(e) => col.setFilterValue(e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ─── Tablo ─── */}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="bg-muted/50 hover:bg-muted/50">
              {hg.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider select-none"
                  style={{ width: header.column.columnDef.size }}
                >
                  {header.isPlaceholder ? null : (
                    <div
                      className={`flex items-center gap-1 ${
                        header.column.getCanSort()
                          ? 'cursor-pointer hover:text-foreground transition-colors'
                          : ''
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                      title={header.column.getCanSort() ? 'Shift+Tıkla: çoklu sıralama' : undefined}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span
                          className={
                            header.column.getIsSorted()
                              ? 'text-primary'
                              : 'text-muted-foreground opacity-50'
                          }
                        >
                          {header.column.getIsSorted() === 'asc' ? (
                            <ChevronUp size={12} />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ChevronDown size={12} />
                          ) : (
                            <ChevronsUpDown size={12} />
                          )}
                        </span>
                      )}
                      {(header.column.getSortIndex() ?? -1) > 0 && (
                        <span className="text-[9px] text-primary font-bold">
                          {header.column.getSortIndex() + 1}
                        </span>
                      )}
                    </div>
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={allColumns.length}
                className="px-4 py-14 text-center text-muted-foreground text-sm"
              >
                <div className="flex flex-col items-center gap-2">
                  <Search size={28} className="opacity-20" />
                  <span>Kayıt bulunamadı</span>
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="text-xs text-primary hover:underline"
                    >
                      Filtreleri temizle
                    </button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <Fragment key={row.id}>
                <TableRow
                  className="group"
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                {renderSubRow && (() => {
                  const sub = renderSubRow(row.original);
                  return sub ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={allColumns.length} className="p-0 border-b border-border">
                        {sub}
                      </TableCell>
                    </TableRow>
                  ) : null;
                })()}
              </Fragment>
            ))
          )}
        </TableBody>
      </Table>

      {/* ─── Sayfalama ─── */}
      {showFooter && <div className="flex items-center justify-between gap-4 flex-wrap">

        {/* Sol: kayıt özeti + seçim özeti */}
        <div className="flex items-center gap-3 text-xs text-text-3">
          <span>
            {filteredCount > 0
              ? `${pageStart}–${pageEnd} / ${filteredCount} kayıt`
              : '0 kayıt'}
            {!isServerPaged && data.length !== filteredCount && (
              <span className="ml-1 text-sky-400">
                (toplamda {data.length})
              </span>
            )}
          </span>
          {selectable && Object.values(rowSelection).some(Boolean) && (
            <span className="text-sky-400">
              {Object.values(rowSelection).filter(Boolean).length} seçili
            </span>
          )}
        </div>

        {/* Sağ: sayfa boyutu + navigasyon */}
        <div className="flex items-center gap-3">

          {/* Sayfa boyutu */}
          <div className="flex items-center gap-1.5 text-xs text-text-3">
            <span>Sayfa başı</span>
            <select
              className="input h-7 text-xs px-2 py-0 w-16"
              value={isServerPaged ? effectiveLimit : currentPageSize}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (isServerPaged) {
                  onLimitChange?.(val);
                  onPageChange?.(1);
                } else {
                  table.setPageSize(val);
                }
              }}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Sayfa numarası */}
          <span className="text-xs text-text-3">
            {isServerPaged ? page : pageIndex + 1} / {activePageCount}
          </span>

          {/* Navigasyon */}
          <div className="flex items-center gap-0.5">
            <PagBtn
              onClick={() => isServerPaged ? onPageChange?.(1) : table.setPageIndex(0)}
              disabled={isServerPaged ? page <= 1 : !table.getCanPreviousPage()}
              title="İlk sayfa"
            >
              <ChevronsLeft size={13} />
            </PagBtn>
            <PagBtn
              onClick={() => isServerPaged ? onPageChange?.(page - 1) : table.previousPage()}
              disabled={isServerPaged ? page <= 1 : !table.getCanPreviousPage()}
              title="Önceki"
            >
              <ChevronLeft size={13} />
            </PagBtn>
            <PagBtn
              onClick={() => isServerPaged ? onPageChange?.(page + 1) : table.nextPage()}
              disabled={isServerPaged ? page >= serverPageCount : !table.getCanNextPage()}
              title="Sonraki"
            >
              <ChevronRight size={13} />
            </PagBtn>
            <PagBtn
              onClick={() => isServerPaged ? onPageChange?.(serverPageCount) : table.setPageIndex(table.getPageCount() - 1)}
              disabled={isServerPaged ? page >= serverPageCount : !table.getCanNextPage()}
              title="Son sayfa"
            >
              <ChevronsRight size={13} />
            </PagBtn>
          </div>

        </div>
      </div>}
    </div>
  );
}

// ─── Sayfalama düğmesi yardımcısı ────────────────────────────────────────────

function PagBtn({
  children,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick:  () => void;
  title?:   string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="
        w-7 h-7 flex items-center justify-center rounded
        text-text-3 hover:text-text-1 hover:bg-ink-700
        disabled:opacity-30 disabled:cursor-not-allowed
        transition-colors duration-100
      "
    >
      {children}
    </button>
  );
}
