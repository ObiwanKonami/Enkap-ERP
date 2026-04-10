'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate, formatCurrency, kurusToTl, fmtQty } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import { purchaseApi, type PurchaseOrder } from '@/services/purchase';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';

interface GoodsReceiptItem {
  lineId: string;
  productName: string;
  sku?: string;
  orderedQty: number;
  previouslyReceivedQty: number;
  receivingQty: number;
  warehouseId: string;
  warehouseName: string;
  unitCostKurus: number;
}

interface GoodsReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: PurchaseOrder;
  warehouses: Array<{ id: string; name: string }>;
}

export function GoodsReceiptModal({
  open,
  onOpenChange,
  order,
  warehouses,
}: GoodsReceiptModalProps) {
  const { t } = useI18n();
  const qc = useQueryClient();

  // Initialize items from order lines
  const [items, setItems] = useState<GoodsReceiptItem[]>(
    order.lines.map((line) => ({
      lineId: line.id,
      productName: line.productName,
      sku: line.sku,
      orderedQty: line.quantity,
      previouslyReceivedQty: line.receivedQty ?? 0,
      receivingQty: 0,
      warehouseId: line.warehouseId,
      warehouseName: line.warehouseName || '',
      unitCostKurus: line.unitPriceTl ? Math.round(line.unitPriceTl * 100) : 0,
    }))
  );

  const [receiptDate, setReceiptDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');

  const mutation = useMutation({
    mutationFn: async () => {
      // Validate: each item must have qty > 0 and <= remaining
      for (const item of items) {
        const remaining = item.orderedQty - item.previouslyReceivedQty;
        if (item.receivingQty < 0 || item.receivingQty > remaining) {
          throw new Error(
            `${item.productName}: ${t('goodsReceipt.quantity')} ${t('validation.invalidRange')}`
          );
        }
      }

      // Filter out items with 0 receiving qty
      const receipts = items
        .filter((item) => item.receivingQty > 0)
        .map((item) => ({
          lineId: item.lineId,
          receivedQty: item.receivingQty,
          warehouseId: item.warehouseId,
          unitCostKurus: item.unitCostKurus,
        }));

      if (receipts.length === 0) {
        throw new Error(t('goodsReceipt.noItemsReceived'));
      }

      await purchaseApi.goodsReceipt(order.id, {
        items: receipts,
        receiptDate,
        notes,
      });
    },
    onSuccess: () => {
      toast.success(t('goodsReceipt.success'));
      qc.invalidateQueries({ queryKey: ['po', order.id] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    },
  });

  const handleItemChange = (
    lineId: string,
    field: 'receivingQty' | 'warehouseId' | 'unitCostKurus',
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((item) =>
        item.lineId === lineId
          ? {
              ...item,
              [field]: field === 'unitCostKurus' ? Math.round((value as number) * 100) : value,
            }
          : item
      )
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('goodsReceipt.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Info */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('purchase.vendor')}
                  </Label>
                  <p className="font-medium">{order.vendorName}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {t('goodsReceipt.receiptDate')}
                  </Label>
                  <DateInput
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items Table */}
          <div>
            <Label className="text-sm font-semibold">{t('purchase.lines')}</Label>
            <div className="border rounded-md overflow-hidden mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="w-[20%]">{t('common.product')}</TableHead>
                    <TableHead className="w-[10%] text-right">
                      {t('purchase.orderedQty')}
                    </TableHead>
                    <TableHead className="w-[10%] text-right">
                      {t('goodsReceipt.received')}
                    </TableHead>
                    <TableHead className="w-[10%] text-right">
                      {t('goodsReceipt.remaining')}
                    </TableHead>
                    <TableHead className="w-[15%]">{t('goodsReceipt.quantity')}</TableHead>
                    <TableHead className="w-[15%]">{t('goodsReceipt.warehouse')}</TableHead>
                    <TableHead className="w-[10%]">{t('goodsReceipt.unitCost')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const remaining = item.orderedQty - item.previouslyReceivedQty;
                    return (
                      <TableRow key={item.lineId}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{item.productName}</p>
                            {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{fmtQty(item.orderedQty)}</TableCell>
                        <TableCell className="text-right">
                          {fmtQty(item.previouslyReceivedQty)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-amber-600">
                          {fmtQty(remaining)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={remaining}
                            step="0.01"
                            value={item.receivingQty || ''}
                            onChange={(e) =>
                              handleItemChange(item.lineId, 'receivingQty', parseFloat(e.target.value) || 0)
                            }
                            className="w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.warehouseId}
                            onValueChange={(value) =>
                              handleItemChange(item.lineId, 'warehouseId', value)
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {warehouses.map((w) => (
                                <SelectItem key={w.id} value={w.id}>
                                  {w.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitCostKurus / 100}
                            onChange={(e) =>
                              handleItemChange(item.lineId, 'unitCostKurus', parseFloat(e.target.value) || 0)
                            }
                            className="w-full"
                            placeholder="0"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">{t('common.notes')}</Label>
            <Textarea
              id="notes"
              placeholder={t('common.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} isLoading={mutation.isPending}>
            {t('goodsReceipt.success')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
