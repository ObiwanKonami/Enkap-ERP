'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle, XCircle, FileDown } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useI18n } from '@/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CountdownTimer } from '@/components/ui/countdown-timer';
import { RejectionModal } from '@/components/invoices/rejection-modal';
import { IptalModal } from '@/components/invoices/iptal-modal';

interface FaturaActionsProps {
  invoiceId: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'ACCEPTED' | 'REJECTED';
  direction?: 'OUT' | 'IN';
  invoiceType?: 'E_FATURA' | 'E_ARSIV' | 'PROFORMA' | 'PURCHASE' | 'TICARIFATURA';
  gibStatus?: 'PENDING' | 'SUCCESS' | 'REJECTED';
  receivedAt?: string;
}

const EIGHT_DAYS_MS = 192 * 60 * 60 * 1000; // 192 hours

export function FaturaActions({
  invoiceId,
  status,
  direction,
  invoiceType,
  gibStatus,
  receivedAt,
}: FaturaActionsProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [iptalModalOpen, setIptalModalOpen] = useState(false);

  // Check if incoming invoice within 8-day response window
  const isIncomingWithinDeadline = useMemo(() => {
    if (direction !== 'IN' || !receivedAt || invoiceType !== 'TICARIFATURA' || gibStatus !== 'SUCCESS') {
      return false;
    }

    const receivedDate = new Date(receivedAt);
    const deadlineDate = new Date(receivedDate.getTime() + EIGHT_DAYS_MS);
    const now = new Date();

    return now < deadlineDate;
  }, [direction, receivedAt, invoiceType, gibStatus]);

  // Check if 8-day deadline has expired
  const isDeadlineExpired = useMemo(() => {
    if (direction !== 'IN' || !receivedAt || invoiceType !== 'TICARIFATURA' || gibStatus !== 'SUCCESS') {
      return false;
    }

    const receivedDate = new Date(receivedAt);
    const deadlineDate = new Date(receivedDate.getTime() + EIGHT_DAYS_MS);
    const now = new Date();

    return now >= deadlineDate;
  }, [direction, receivedAt, invoiceType, gibStatus]);

  // Calculate deadline for countdown timer
  const deadlineDate = useMemo(() => {
    if (!receivedAt) return null;
    const received = new Date(receivedAt);
    return new Date(received.getTime() + EIGHT_DAYS_MS);
  }, [receivedAt]);

  // Approve (accept) incoming invoice
  const { mutate: handleAccept, isPending: isAcceptPending } = useMutation({
    mutationFn: async () => {
      setError(null);
      await apiClient.post(`/financial/invoices/${invoiceId}/accept`);
    },
    onSuccess: () => {
      router.refresh();
    },
    onError: () => {
      setError('Fatura kabul edilemedi');
    },
  });

  // Approve (issue) outgoing invoice
  const { mutate: handleApprove, isPending: isApprovePending } = useMutation({
    mutationFn: async () => {
      setError(null);
      await apiClient.post(`/financial/invoices/${invoiceId}/approve`, { invoiceId });
    },
    onSuccess: () => {
      router.refresh();
    },
    onError: () => {
      setError(t('invoice.approveFailed'));
    },
  });

  // Cancel outgoing invoice
  const { mutate: handleCancel, isPending: isCancelPending } = useMutation({
    mutationFn: async () => {
      setError(null);
      const confirmed = window.confirm(t('invoice.cancelConfirm'));
      if (!confirmed) throw new Error('Cancelled by user');
      await apiClient.post(`/financial/invoices/${invoiceId}/cancel`, {
        invoiceId,
        reason: t('invoice.cancelReason'),
      });
    },
    onSuccess: () => {
      router.refresh();
    },
    onError: (err) => {
      if (err.message !== 'Cancelled by user') {
        setError(t('invoice.cancelFailed'));
      }
    },
  });

  const isLoading = isAcceptPending || isApprovePending || isCancelPending;

  // Determine which actions are available
  const canApproveDraft = status === 'DRAFT';
  const canCancelOutgoing = direction === 'OUT' && status !== 'CANCELLED' && status !== 'PAID';
  const canAcceptIncoming = isIncomingWithinDeadline && status !== 'ACCEPTED' && status !== 'REJECTED';
  const canRejectIncoming = isIncomingWithinDeadline && status !== 'ACCEPTED' && status !== 'REJECTED';
  const canMarkPortalCancelled =
    direction === 'OUT' &&
    (invoiceType === 'E_FATURA' || invoiceType === 'E_ARSIV') &&
    status !== 'CANCELLED';

  return (
    <div className="flex flex-col gap-3">
      {/* Yasal 8-gün süresi dolmuş uyarısı */}
      {isDeadlineExpired && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs font-semibold">
            ⚠️ Yasal 8 günlük yanıt süresi dolmuştur. Sistem üzerinden işlem yapılamaz.
          </AlertDescription>
        </Alert>
      )}

      {/* Genel hata mesajı */}
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Countdown Timer — incoming within 8 days */}
      {isIncomingWithinDeadline && deadlineDate && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Yanıt süresi:</span>
          <CountdownTimer deadline={deadlineDate} showLabel={true} />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {/* PDF İndir */}
        <Button variant="ghost" size="sm" asChild>
          <a
            href={`/api/financial/reports/fatura/pdf?invoiceId=${invoiceId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileDown size={13} />
            {t('invoice.downloadPdf')}
          </a>
        </Button>

        {/* Outgoing: İptal Et */}
        {canCancelOutgoing && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleCancel()}
            isLoading={isCancelPending}
            disabled={isLoading}
          >
            <XCircle size={13} />
            {t('invoice.cancelBtn')}
          </Button>
        )}

        {/* Outgoing: Onayla (Draft → Issued) */}
        {canApproveDraft && (
          <Button
            size="sm"
            onClick={() => handleApprove()}
            isLoading={isApprovePending}
            disabled={isLoading}
          >
            <CheckCircle size={13} />
            {t('invoice.approveBtn')}
          </Button>
        )}

        {/* Incoming: Kabul Et */}
        {canAcceptIncoming && (
          <Button
            size="sm"
            onClick={() => handleAccept()}
            isLoading={isAcceptPending}
            disabled={isLoading || isDeadlineExpired}
          >
            <CheckCircle size={13} />
            Kabul Et
          </Button>
        )}

        {/* Incoming: Reddet (opens modal) */}
        {canRejectIncoming && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setRejectionModalOpen(true)}
            disabled={isLoading || isDeadlineExpired}
          >
            <XCircle size={13} />
            Reddet
          </Button>
        )}

        {/* Outgoing: GİB Portalında İptal */}
        {canMarkPortalCancelled && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIptalModalOpen(true)}
            disabled={isLoading}
          >
            GİB Portalında İptal
          </Button>
        )}
      </div>

      {/* Rejection Modal */}
      <RejectionModal
        isOpen={rejectionModalOpen}
        onOpenChange={setRejectionModalOpen}
        invoiceId={invoiceId}
        onSuccess={() => router.refresh()}
      />

      {/* Portal Cancellation Modal */}
      <IptalModal
        isOpen={iptalModalOpen}
        onOpenChange={setIptalModalOpen}
        invoiceId={invoiceId}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
