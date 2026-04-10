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
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useI18n } from '@/hooks/use-i18n';
import { formatDate } from '@/lib/format';

// Zod validation schema
const portalCancellationSchema = z.object({
  gibCancellationRefNo: z
    .string()
    .regex(/^[A-Za-z0-9]+$/, {
      message: 'Referans numarası sadece harfler ve rakamlardan oluşmalıdır',
    })
    .min(1, { message: 'GİB İptal Referans Numarası gereklidir' })
    .max(50, { message: 'Referans numarası çok uzun' }),
  cancellationDate: z
    .string()
    .date({ message: 'Geçersiz tarih formatı' })
    .refine(
      (date) => new Date(date) <= new Date(),
      { message: 'İptal tarihi bugünden ileri tarihli olamaz' }
    ),
  cancellationReason: z
    .string()
    .max(500, { message: 'İptal gerekçesi en fazla 500 karakter olmalıdır' })
    .optional()
    .or(z.literal('')),
});

type PortalCancellationData = z.infer<typeof portalCancellationSchema>;

interface IptalModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onSuccess?: () => void;
}

export function IptalModal({
  isOpen,
  onOpenChange,
  invoiceId,
  onSuccess,
}: IptalModalProps) {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    gibCancellationRefNo: '',
    cancellationDate: formatDate(new Date()),
    cancellationReason: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      setErrors({});

      const validationResult = portalCancellationSchema.safeParse(formData);
      if (!validationResult.success) {
        const errs: Record<string, string> = {};
        validationResult.error.errors.forEach((err) => {
          const path = err.path.join('.');
          errs[path] = err.message;
        });
        setErrors(errs);
        throw new Error('Validasyon hatası');
      }

      await apiClient.patch(
        `/financial/invoices/${invoiceId}/mark-cancelled-on-portal`,
        {
          gibCancellationRefNo: validationResult.data.gibCancellationRefNo,
          cancellationDate: validationResult.data.cancellationDate,
          cancellationReason: validationResult.data.cancellationReason || null,
        }
      );
    },
    onSuccess: () => {
      setFormData({
        gibCancellationRefNo: '',
        cancellationDate: formatDate(new Date()),
        cancellationReason: '',
      });
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
            GİB Portalında İptal Edildi Olarak İşaretle
          </DialogTitle>
          <DialogDescription className="text-xs">
            Faturanın GİB portalında iptal edilmiş olduğunu kaydediniz.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* GIB Cancellation Reference No */}
          <div className="space-y-2">
            <Label
              htmlFor="gibRefNo"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              GİB İptal Referans Numarası
            </Label>
            <Input
              id="gibRefNo"
              className="h-9 font-mono text-sm bg-muted/40"
              placeholder="Örn: GIB2026000123"
              value={formData.gibCancellationRefNo}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  gibCancellationRefNo: e.target.value.toUpperCase(),
                })
              }
            />
            {errors.gibCancellationRefNo && (
              <div className="flex items-start gap-2 text-destructive text-xs">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>{errors.gibCancellationRefNo}</span>
              </div>
            )}
          </div>

          {/* Cancellation Date */}
          <div className="space-y-2">
            <Label
              htmlFor="cancellationDate"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              İptal Tarihi
            </Label>
            <DateInput
              id="cancellationDate"
              className="h-9 text-sm bg-muted/40"
              value={formData.cancellationDate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  cancellationDate: e.target.value,
                })
              }
            />
            {errors.cancellationDate && (
              <div className="flex items-start gap-2 text-destructive text-xs">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>{errors.cancellationDate}</span>
              </div>
            )}
          </div>

          {/* Cancellation Reason (Optional) */}
          <div className="space-y-2">
            <Label
              htmlFor="reason"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              İptal Gerekçesi (Opsiyonel)
            </Label>
            <Textarea
              id="reason"
              placeholder="İptal nedeni..."
              value={formData.cancellationReason}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  cancellationReason: e.target.value,
                })
              }
              rows={3}
              className="h-20 text-sm resize-none"
            />
            {errors.cancellationReason && (
              <div className="flex items-start gap-2 text-destructive text-xs">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>{errors.cancellationReason}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {formData.cancellationReason.length}/500 karakter
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
            size="sm"
            onClick={handleSubmit}
            isLoading={isPending}
            disabled={!formData.gibCancellationRefNo.trim()}
          >
            İşaretle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
