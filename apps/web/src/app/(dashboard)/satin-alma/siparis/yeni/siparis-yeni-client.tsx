'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Package, Plus, Loader2 } from 'lucide-react';
import {
  purchaseOrderSchema,
  type PurchaseOrderFormValues,
  type PurchaseOrderLineFormValues,
  calculatePurchaseOrderTotals,
  calculateLineTotal,
} from '@/lib/validations/purchase-order.schema';
import { formatCurrency, kurusToTl } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import { purchaseApi } from '@/services/purchase';
import { stockApi } from '@/services/stock';
import { crm } from '@/services/crm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { DateInput } from '@/components/ui/date-input';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Form,
} from '@/components/ui/form';
import { toast } from 'sonner';

// ─── Product Picker Modal ───────────────────────────────────────────────────

interface ProductPickerProps {
  onSelect: (product: {
    id: string;
    name: string;
    sku?: string;
  }) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ProductPickerModal({
  onSelect,
  open,
  onOpenChange,
}: ProductPickerProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () =>
      stockApi.products.list({
        search: search || undefined,
        pageSize: 50,
      }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('common.selectProduct')}</DialogTitle>
          <DialogDescription>{t('common.searchAndSelect')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />

          <div className="max-h-96 overflow-y-auto border rounded-lg">
            {isLoading && (
              <div className="flex items-center justify-center p-8">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && products?.data.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">
                {t('common.noResults')}
              </div>
            )}

            {products?.data.map((product) => (
              <button
                key={product.id}
                onClick={() => {
                  onSelect({
                    id: product.id,
                    name: product.name,
                    sku: product.sku,
                  });
                  onOpenChange(false);
                  setSearch('');
                }}
                className="w-full text-left px-4 py-3 hover:bg-muted border-b last:border-b-0 transition-colors"
              >
                <div className="font-medium text-sm">{product.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  SKU: {product.sku || '—'} • {product.categoryName || '—'}
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Order Lines Table ──────────────────────────────────────────────────────

interface OrderLinesTableProps {
  form: ReturnType<typeof useForm<PurchaseOrderFormValues>>;
  fields: ReturnType<typeof useFieldArray>['fields'];
  append: ReturnType<typeof useFieldArray>['append'];
  remove: ReturnType<typeof useFieldArray>['remove'];
}

function OrderLinesTable({
  form,
  fields,
  append,
  remove,
}: OrderLinesTableProps) {
  const { t } = useI18n();
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => stockApi.warehouses.list(),
  });

  const handleProductSelect = (product: {
    id: string;
    name: string;
    sku?: string;
  }) => {
    if (selectedLineIndex !== null) {
      form.setValue(`lines.${selectedLineIndex}.productId`, product.id);
      form.setValue(`lines.${selectedLineIndex}.productName`, product.name);
      setSelectedLineIndex(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
        {/* Başlık Satırı */}
        <div className="grid grid-cols-12 gap-2 bg-muted p-3 text-xs font-semibold text-muted-foreground">
          <div className="col-span-2">{t('common.product')}</div>
          <div className="col-span-1">{t('common.quantity')}</div>
          <div className="col-span-2">{t('common.unitPrice')}</div>
          <div className="col-span-1">{t('common.kdv')}</div>
          <div className="col-span-2">{t('common.warehouse')}</div>
          <div className="col-span-2 text-right">{t('common.total')}</div>
          <div className="col-span-2 text-right">{t('common.actions')}</div>
        </div>

        {/* Veri Satırları */}
        {fields.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('purchaseOrder.noLines')}
          </div>
        ) : (
          fields.map((field, index) => {
            const line = form.watch(`lines.${index}`);
            const { subtotalKurus, kdvKurus, totalKurus } =
              calculateLineTotal(line);

            return (
              <div
                key={field.id}
                className="grid grid-cols-12 gap-2 p-3 border-t items-start"
              >
                {/* Ürün */}
                <div className="col-span-2">
                  <FormField
                    control={form.control}
                    name={`lines.${index}.productId`}
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormControl>
                          <div className="space-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLineIndex(index);
                                setProductPickerOpen(true);
                              }}
                              className="w-full px-2 py-1.5 text-xs border rounded bg-white hover:bg-muted transition-colors text-left flex items-center gap-1"
                            >
                              <Package size={12} />
                              <span className="truncate">
                                {line.productName || t('common.selectProduct')}
                              </span>
                            </button>
                            {fieldState.error && (
                              <p className="text-xs text-destructive">
                                {fieldState.error.message}
                              </p>
                            )}
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Miktar */}
                <div className="col-span-1">
                  <FormField
                    control={form.control}
                    name={`lines.${index}.quantity`}
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormControl>
                          <div className="space-y-1">
                            <Input
                              type="number"
                              placeholder="0"
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    ? parseInt(e.target.value, 10)
                                    : 0
                                )
                              }
                              className="h-8 text-xs"
                            />
                            {fieldState.error && (
                              <p className="text-xs text-destructive">
                                {fieldState.error.message}
                              </p>
                            )}
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Birim Fiyat (TL) */}
                <div className="col-span-2">
                  <FormField
                    control={form.control}
                    name={`lines.${index}.unitPriceTl`}
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormControl>
                          <div className="space-y-1">
                            <Input
                              type="number"
                              placeholder="0.00"
                              step="0.01"
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value ? parseFloat(e.target.value) : 0
                                )
                              }
                              className="h-8 text-xs"
                            />
                            {fieldState.error && (
                              <p className="text-xs text-destructive">
                                {fieldState.error.message}
                              </p>
                            )}
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* KDV Oranı */}
                <div className="col-span-1">
                  <FormField
                    control={form.control}
                    name={`lines.${index}.kdvRate`}
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormControl>
                          <div className="space-y-1">
                            <Select
                              value={field.value.toString()}
                              onValueChange={(v) =>
                                field.onChange(parseInt(v, 10))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">%0</SelectItem>
                                <SelectItem value="1">%1</SelectItem>
                                <SelectItem value="10">%10</SelectItem>
                                <SelectItem value="20">%20</SelectItem>
                              </SelectContent>
                            </Select>
                            {fieldState.error && (
                              <p className="text-xs text-destructive">
                                {fieldState.error.message}
                              </p>
                            )}
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Depo */}
                <div className="col-span-2">
                  <FormField
                    control={form.control}
                    name={`lines.${index}.warehouseId`}
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormControl>
                          <div className="space-y-1">
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder={t('common.warehouse')} />
                              </SelectTrigger>
                              <SelectContent>
                                {warehouses?.data.map((w) => (
                                  <SelectItem key={w.id} value={w.id}>
                                    {w.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {fieldState.error && (
                              <p className="text-xs text-destructive">
                                {fieldState.error.message}
                              </p>
                            )}
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Satır Toplam */}
                <div className="col-span-2 text-right">
                  <span className="text-xs font-mono">
                    {formatCurrency(kurusToTl(totalKurus))}
                  </span>
                </div>

                {/* Sil Butonu */}
                <div className="col-span-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    className="h-8 w-8 p-0"
                  >
                    <X size={14} />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Ürün Ekleme Butonu */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          append({
            productId: '',
            productName: '',
            sku: '',
            unitCode: 'C62',
            quantity: 1,
            unitPriceTl: 0,
            kdvRate: 20,
            warehouseId: '',
            warehouseName: '',
          });
        }}
        className="gap-2"
      >
        <Plus size={14} />
        {t('purchaseOrder.addLine')}
      </Button>

      {/* Ürün Seçici Modal */}
      <ProductPickerModal
        open={productPickerOpen}
        onOpenChange={setProductPickerOpen}
        onSelect={handleProductSelect}
      />
    </div>
  );
}

// ─── Main Client Component ──────────────────────────────────────────────────

export default function SipariYeniClientPage() {
  const { t } = useI18n();
  const router = useRouter();

  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      vendorId: '',
      vendorName: '',
      expectedDeliveryDate: '',
      currency: 'TRY',
      notes: '',
      lines: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ['vendors'],
    queryFn: () =>
      crm.contacts.list({
        contactType: 'SUPPLIER',
        pageSize: 100,
      }),
  });

  // Toplamları hesapla
  const totals = useMemo(() => {
    return calculatePurchaseOrderTotals(form.watch('lines') || []);
  }, [form.watch('lines')]);

  // Sipariş oluşturma mutasyonu
  const { mutate: createOrder, isPending: isCreating } = useMutation({
    mutationFn: (data: PurchaseOrderFormValues) =>
      purchaseApi.create({
        vendorId: data.vendorId,
        expectedDeliveryDate: data.expectedDeliveryDate,
        currency: data.currency,
        notes: data.notes,
        lines: data.lines.map((line) => {
          const { subtotalKurus } = calculateLineTotal(line);
          return {
            productId: line.productId,
            quantity: line.quantity,
            unitPriceKurus: Math.round(line.unitPriceTl * 100),
            kdvRate: line.kdvRate,
            warehouseId: line.warehouseId,
          };
        }),
      }),
    onSuccess: (response) => {
      toast.success(t('purchaseOrder.createSuccess'));
      router.push(`/satin-alma/siparis/${response.id}`);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t('common.unknownError');
      toast.error(`${t('purchaseOrder.createError')}: ${message}`);
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    createOrder(data);
  });

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('purchaseOrder.newOrder')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('purchaseOrder.description')}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-6">
          {/* Başlık Kartı */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t('purchaseOrder.header')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Tedarikçi */}
                <FormField
                  control={form.control}
                  name="vendorId"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>{t('purchaseOrder.vendor')}</FormLabel>
                      <FormControl>
                        <div className="space-y-1">
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={vendorsLoading}
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={t('purchaseOrder.selectVendor')}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {vendors?.data.map((vendor) => (
                                <SelectItem key={vendor.id} value={vendor.id}>
                                  {vendor.companyName || vendor.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {fieldState.error && (
                            <FormMessage />
                          )}
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Beklenen Teslim Tarihi */}
                <FormField
                  control={form.control}
                  name="expectedDeliveryDate"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>{t('purchaseOrder.expectedDelivery')}</FormLabel>
                      <FormControl>
                        <DateInput
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      {fieldState.error && <FormMessage />}
                    </FormItem>
                  )}
                />

                {/* Para Birimi */}
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>{t('common.currency')}</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TRY">₺ TRY</SelectItem>
                            <SelectItem value="USD">$ USD</SelectItem>
                            <SelectItem value="EUR">€ EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      {fieldState.error && <FormMessage />}
                    </FormItem>
                  )}
                />
              </div>

              {/* Notlar */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t('common.notes')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('common.enterNotes')}
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    {fieldState.error && <FormMessage />}
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Separator />

          {/* Sipariş Satırları */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t('purchaseOrder.lines')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OrderLinesTable
                form={form}
                fields={fields}
                append={append}
                remove={remove}
              />
            </CardContent>
          </Card>

          {/* Toplam Kartı */}
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{t('purchaseOrder.subtotal')}</span>
                  <span className="font-mono">
                    {formatCurrency(kurusToTl(totals.subtotalKurus))}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{t('purchaseOrder.kdvTotal')}</span>
                  <span className="font-mono">
                    {formatCurrency(kurusToTl(totals.kdvTotalKurus))}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>{t('purchaseOrder.grandTotal')}</span>
                  <span className="font-mono">
                    {formatCurrency(kurusToTl(totals.grandTotalKurus))}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hata Gösterimi */}
          {form.formState.errors.lines && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
              {form.formState.errors.lines.message ||
                t('purchaseOrder.linesValidationError')}
            </div>
          )}

          {/* Eylem Butonları */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" isLoading={isCreating}>
              {t('purchaseOrder.create')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
