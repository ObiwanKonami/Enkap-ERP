'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ShoppingCart,
  ClipboardList,
  Truck,
  AlertCircle,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  purchaseApi,
  PURCHASE_STATUS_LABELS,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '@/services/purchase';
import { stockApi } from '@/services/stock';
import { formatCurrency, kurusToTl, formatDate, fmtQty } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { GoodsReceiptModal } from './goods-receipt-modal';

function getStatusBadgeProps(status: PurchaseOrderStatus): {
  variant: 'outline' | 'secondary' | 'default' | 'destructive';
  className?: string;
} {
  const map: Record<
    PurchaseOrderStatus,
    { variant: 'outline' | 'secondary' | 'default' | 'destructive'; className?: string }
  > = {
    TASLAK: { variant: 'outline' },
    ONAY_BEKLIYOR: { variant: 'secondary' },
    ONAYLANDI: { variant: 'secondary', className: 'bg-primary/10 text-primary border-transparent' },
    KISMEN_TESLIM: { variant: 'secondary' },
    TAMAMLANDI: { variant: 'default' },
    IPTAL: { variant: 'destructive' },
  };
  return map[status] ?? { variant: 'outline' };
}

function StatusActions({ order }: { order: PurchaseOrder }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [goodsReceiptOpen, setGoodsReceiptOpen] = useState(false);

  const submit = useMutation({
    mutationFn: () => purchaseApi.submit(order.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['po', order.id] }),
  });
  const approve = useMutation({
    mutationFn: () => purchaseApi.approve(order.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['po', order.id] }),
  });
  const cancel = useMutation({
    mutationFn: () => purchaseApi.cancel(order.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['po', order.id] }),
  });

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {order.status === 'TASLAK' && (
          <Button onClick={() => submit.mutate()} isLoading={submit.isPending} className="gap-2">
            <Send size={13} /> {t('purchase.submitForApproval')}
          </Button>
        )}
        {order.status === 'ONAY_BEKLIYOR' && (
          <Button onClick={() => approve.mutate()} isLoading={approve.isPending} className="gap-2">
            <CheckCircle2 size={13} /> {t('purchase.approve')}
          </Button>
        )}
        {(order.status === 'ONAYLANDI' || order.status === 'KISMEN_TESLIM') && (
          <>
            <Button
              onClick={() => setGoodsReceiptOpen(true)}
              variant="outline"
              className="gap-2"
            >
              <Truck size={13} /> {t('purchase.goodsReceipt')}
            </Button>
          </>
        )}
        {order.status !== 'TAMAMLANDI' && order.status !== 'IPTAL' && (
          <Button
            onClick={() => cancel.mutate()}
            variant="destructive"
            isLoading={cancel.isPending}
            className="gap-2 ml-auto"
          >
            <XCircle size={13} /> {t('purchase.cancel')}
          </Button>
        )}
      </div>

      {/* Goods Receipt Modal */}
      {order.status === 'ONAYLANDI' || order.status === 'KISMEN_TESLIM' ? (
        <GoodsReceiptModal
          open={goodsReceiptOpen}
          onOpenChange={setGoodsReceiptOpen}
          order={order}
          warehouses={order.warehouses || []}
        />
      ) : null}
    </>
  );
}

interface OrderDetailsPageProps {
  warehouses: Array<{ id: string; name: string }>;
}

export function SipariDetayClientPage({ warehouses }: OrderDetailsPageProps) {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const orderId = params.id as string;

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['po', orderId],
    queryFn: () => purchaseApi.get(orderId),
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{t('purchase.loadFailed')}</AlertDescription>
      </Alert>
    );
  }

  const subtotalKurus = order.lines.reduce(
    (sum, line) => sum + line.quantity * (line.unitPriceTl ?? 0) * 100,
    0
  );
  const kdvTotalKurus = order.lines.reduce((sum, line) => {
    const lineSubtotal = line.quantity * (line.unitPriceTl ?? 0) * 100;
    return sum + Math.round(lineSubtotal * ((line.kdvRate ?? 0) / 100));
  }, 0);
  const grandTotalKurus = subtotalKurus + kdvTotalKurus;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold gap-3 flex items-center">
              {t('purchase.title')} #{order.purchaseOrderNumber}
              <Badge {...getStatusBadgeProps(order.status)}>
                {PURCHASE_STATUS_LABELS[order.status]}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDate(new Date(order.createdAt))}
            </p>
          </div>
        </div>
      </div>

      {/* Status Actions */}
      <Card>
        <CardContent className="pt-6">
          <StatusActions order={order} />
        </CardContent>
      </Card>

      {/* Order Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('purchase.vendor')}</p>
            <p className="font-semibold">{order.vendorName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('purchase.expectedDate')}</p>
            <p className="font-semibold">
              {order.expectedDeliveryDate ? formatDate(new Date(order.expectedDeliveryDate)) : '-'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('common.currency')}</p>
            <p className="font-semibold">{order.currency}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t('purchase.status')}</p>
            <p className="font-semibold">{PURCHASE_STATUS_LABELS[order.status]}</p>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList size={18} />
            {t('purchase.lines')} ({order.lines.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead className="w-[25%]">{t('common.product')}</TableHead>
                  <TableHead className="w-[12%] text-right">{t('purchase.orderedQty')}</TableHead>
                  <TableHead className="w-[12%] text-right">{t('purchase.receivedQty')}</TableHead>
                  <TableHead className="w-[12%] text-right">{t('purchase.unitPrice')}</TableHead>
                  <TableHead className="w-[10%] text-right">{t('purchase.kdv')}</TableHead>
                  <TableHead className="w-[15%] text-right">{t('purchase.lineTotal')}</TableHead>
                  <TableHead className="w-[14%]">{t('purchase.warehouse')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => {
                  const lineSubtotal = line.quantity * (line.unitPriceTl ?? 0) * 100;
                  const lineKdv = Math.round(lineSubtotal * ((line.kdvRate ?? 0) / 100));
                  const lineTotal = lineSubtotal + lineKdv;

                  return (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">
                        <div>
                          <p>{line.productName}</p>
                          {line.sku && (
                            <p className="text-xs text-muted-foreground">{line.sku}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{fmtQty(line.quantity)}</TableCell>
                      <TableCell className="text-right">
                        {fmtQty(line.receivedQty ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(kurusToTl(line.unitPriceTl ? Math.round(line.unitPriceTl * 100) : 0))}
                      </TableCell>
                      <TableCell className="text-right">%{line.kdvRate}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(kurusToTl(lineTotal))}
                      </TableCell>
                      <TableCell>{line.warehouseName || '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="text-right">
                    {t('purchase.subtotal')}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(kurusToTl(subtotalKurus))}
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} className="text-right">
                    {t('purchase.kdvTotal')}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(kurusToTl(kdvTotalKurus))}
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow className="bg-primary/5 font-bold">
                  <TableCell colSpan={5} className="text-right">
                    {t('purchase.grandTotal')}
                  </TableCell>
                  <TableCell className="text-right text-lg">
                    {formatCurrency(kurusToTl(grandTotalKurus))}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText size={18} />
              {t('common.notes')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
