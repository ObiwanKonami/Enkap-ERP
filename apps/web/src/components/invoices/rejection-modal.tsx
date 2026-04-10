'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useI18n } from '@/hooks/use-i18n';

// Zod validation schema
const rejectionSchema = z.object({
  reason: z
    .string()
    .min(10, { message: 'Red gerekçesi en az 10 karakter olmalıdır' })
    .max(500, { message: 'Red gerekçesi en fazla 500 karakter olmalıdır' }),
});

type RejectionFormData = z.infer<typeof rejectionSchema>;

interface RejectionModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onSuccess?: () => void;
}

export function RejectionModal({
  isOpen,
  onOpenChange,
  invoiceId,
  onSuccess,
}: RejectionModalProps) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      setErrors({});

      const validationResult = rejectionSchema.safeParse({ reason });
      if (!validationResult.success) {
        const errs: Record<string, string> = {};
        validationResult.error.errors.forEach((err) => {
          const path = err.path.join('.');
          errs[path] = err.message;
        });
        setErrors(errs);
        throw new Error('Validasyon hatası');
      }

      await apiClient.post(`/financial/invoices/${invoiceId}/reject`, {
        reason: validationResult.data.reason,
      });
    },
    onSuccess: () => {
      setReason('');
      setErrors({});
      onOpenChange(false);
      onSuccess?.();
    },
  });

  const handleSubmit = () => {
    mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Faturayı Reddet
          </DialogTitle>
          <DialogDescription className="text-xs">
            Faturayı reddetmek için gerekçesini belirtiniz.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="reason"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Red Gerekçesi
            </Label>
            <Textarea
              id="reason"
              placeholder="Faturayı neden reddettiğinizi açıklayınız..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="h-24 text-sm resize-none"
            />
            {errors.reason && (
              <div className="flex items-start gap-2 text-destructive text-xs">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>{errors.reason}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {reason.length}/500 karakter
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            İptal
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleSubmit}
            isLoading={isPending}
            disabled={!reason.trim()}
          >
            Faturayı Reddet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
