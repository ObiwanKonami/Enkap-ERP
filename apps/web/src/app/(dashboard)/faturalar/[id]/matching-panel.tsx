'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { financialApi } from '@/services/financial';
import { purchaseApi } from '@/services/purchase';
import { waybillApi } from '@/services/waybill';
import { formatCurrency, kurusToTl } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import type { InvoiceDetail } from './page';

interface PurchaseOrder {
  id: string;
  purchaseOrderNumber: string;
  vendorName: string;
  totalKurus: number;
}

interface Waybill {
  id: string;
  waybillNumber: string;
  totalKurus: number;
}

interface MatchingPanelProps {
  invoice: InvoiceDetail;
}

export function MatchingPanel({ invoice }: MatchingPanelProps) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [selectedGrnIds, setSelectedGrnIds] = useState<string[]>([]);

  // Fetch open purchase orders for this vendor
  const { data: posResponse, isLoading: posLoading } = useQuery<any>({
    queryKey: ['purchase-orders', invoice.vendorId, 'ONAYLANDI'],
    queryFn: async () => {
      const response = await purchaseApi.list({
        vendorId: invoice.vendorId,
        status: 'ONAYLANDI',
      });
      return response.data?.data ?? [];
    },
    enabled: !!invoice.vendorId,
  });

  const pos = (posResponse as PurchaseOrder[] | undefined) ?? [];

  // Fetch goods receipts for selected PO
  const { data: grnsResponse, isLoading: grnsLoading } = useQuery<any>({
    queryKey: ['goods-receipts', selectedPoId],
    queryFn: async () => {
      if (!selectedPoId) return [];
      const response = await waybillApi.list({ refId: selectedPoId });
      return response.data?.data ?? [];
    },
    enabled: !!selectedPoId,
  });

  const grns = (grnsResponse as Waybill[] | undefined) ?? [];

  // Match mutation
  const matchMutation = useMutation({
    mutationFn: () =>
      financialApi.invoices.matchOrder(invoice.id, {
        purchaseOrderId: selectedPoId,
        waybillId: selectedGrnIds[0],
      }),
    onSuccess: () => {
      toast.success(t('matching.matchSuccess'));
      qc.invalidateQueries({ queryKey: ['invoices', invoice.id] });
    },
    onError: (error: any) => {
      toast.error(error.message ?? t('matching.matchFailed'));
    },
  });

  const selectedPo = pos.find((p) => p.id === selectedPoId);
  const selectedGrnTotal = grns
    .filter((g) => selectedGrnIds.includes(g.id))
    .reduce((sum: number, g: Waybill) => sum + (g.totalKurus ?? 0), 0) ?? 0;

  // Tolerance calculation
  const poTotal = selectedPo?.totalKurus ?? 0;
  const invoiceTotal = invoice.totalKurus ?? 0;
  const diff = Math.abs(invoiceTotal - poTotal);
  const pct = poTotal > 0 ? diff / poTotal : 1;
  const toleranceStatus =
    diff === 0 ? 'match' : pct <= 0.01 ? 'warn' : 'mismatch';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Purchase Orders */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t('matching.po')}
          </h3>
          {posLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 bg-muted rounded animate-pulse"
                />
              ))}
            </div>
          ) : pos.length > 0 ? (
            <div className="space-y-2">
              {pos.map((po: PurchaseOrder) => (
                <button
                  key={po.id}
                  onClick={() => {
                    setSelectedPoId(po.id);
                    setSelectedGrnIds([]);
                  }}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    selectedPoId === po.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {po.purchaseOrderNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {po.vendorName}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {formatCurrency(kurusToTl(po.totalKurus))}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">
              {t('matching.noOpenPo')}
            </p>
          )}
        </div>

        {/* Right: Goods Receipts */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            {t('matching.grn')}
          </h3>
          {!selectedPoId ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {t('matching.selectPoFirst')}
            </p>
          ) : grnsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 bg-muted rounded animate-pulse"
                />
              ))}
            </div>
          ) : grns.length > 0 ? (
            <div className="space-y-2">
              {grns.map((grn: Waybill) => (
                <button
                  key={grn.id}
                  onClick={() => {
                    setSelectedGrnIds(
                      selectedGrnIds.includes(grn.id)
                        ? selectedGrnIds.filter((id) => id !== grn.id)
                        : [grn.id]
                    );
                  }}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    selectedGrnIds.includes(grn.id)
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {grn.waybillNumber}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {formatCurrency(kurusToTl(grn.totalKurus))}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">
              {t('matching.noGrn')}
            </p>
          )}
        </div>
      </div>

      {/* Tolerance Indicator */}
      {selectedPo && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-3 mb-3">
            {toleranceStatus === 'match' && (
              <CheckCircle2 size={20} className="text-primary" />
            )}
            {toleranceStatus === 'warn' && (
              <AlertTriangle size={20} className="text-amber-500" />
            )}
            {toleranceStatus === 'mismatch' && (
              <XCircle size={20} className="text-destructive" />
            )}
            <h3 className="text-sm font-semibold text-foreground">
              {t('matching.toleranceIndicator')}
            </h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t('invoice.invoiceAmount')}
              </span>
              <span className="text-foreground font-medium tabular-nums">
                {formatCurrency(kurusToTl(invoiceTotal))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('matching.poAmount')}</span>
              <span className="text-foreground font-medium tabular-nums">
                {formatCurrency(kurusToTl(poTotal))}
              </span>
            </div>
            {toleranceStatus !== 'match' && (
              <div className="flex justify-between pt-1 border-t border-border">
                <span className="text-muted-foreground">{t('matching.difference')}</span>
                <span
                  className={`font-medium tabular-nums ${
                    toleranceStatus === 'warn'
                      ? 'text-amber-600'
                      : 'text-destructive'
                  }`}
                >
                  {formatCurrency(kurusToTl(diff))} ({(pct * 100).toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Match Button */}
      <div className="flex gap-2">
        <Button
          onClick={() => matchMutation.mutate()}
          disabled={!selectedPoId || matchMutation.isPending}
          isLoading={matchMutation.isPending}
          className="flex-1"
        >
          {t('matching.matchBtn')}
        </Button>
      </div>

      {matchMutation.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(matchMutation.error as any).message ??
              t('matching.matchFailed')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
