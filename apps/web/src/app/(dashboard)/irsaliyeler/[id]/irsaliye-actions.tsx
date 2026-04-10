"use client";

import { useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  X,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CountdownTimer } from "@/components/ui/countdown-timer";
import { useI18n } from "@/hooks/use-i18n";
import { apiClient } from "@/lib/api-client";
import type { Waybill, WaybillLine } from "@/services/waybill";

// ─── Zod Schemas ──────────────────────────────────────────────────────────

const PartialAcceptanceLineSchema = z.object({
  lineId: z.string(),
  acceptedQty: z
    .number()
    .min(0, "Miktar sıfırdan küçük olamaz")
    .default(0),
  rejectedQty: z
    .number()
    .min(0, "Miktar sıfırdan küçük olamaz")
    .default(0),
  rejectionReason: z.string().optional().default(""),
});

const PartialAcceptanceFormSchema = z
  .object({
    lines: z.array(PartialAcceptanceLineSchema),
    overallReason: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    // Validate each line: accepted + rejected = total
    data.lines.forEach((line, idx) => {
      const totalAcceptedRejected = line.acceptedQty + line.rejectedQty;
      // The validation will be done against the total passed from parent
      // This is just structural validation
    });
  });

type PartialAcceptanceForm = z.infer<typeof PartialAcceptanceFormSchema>;

// ─── Component ────────────────────────────────────────────────────────────

interface IrsaliyeActionsProps {
  waybill: Waybill;
  responseDeadline: string; // ISO date when 7 days expires
  onResponseSubmitted?: () => void;
}

export function IrsaliyeActions({
  waybill,
  responseDeadline,
  onResponseSubmitted,
}: IrsaliyeActionsProps) {
  const { t } = useI18n();
  const qc = useQueryClient();

  // ─── State ────────────────────────────────────────────────────────────

  const [showAcceptanceModal, setShowAcceptanceModal] = useState(false);
  const [acceptanceMode, setAcceptanceMode] = useState<
    "FULL_ACCEPT" | "FULL_REJECT" | "PARTIAL" | null
  >(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(
    null
  );

  const [expandedLines, setExpandedLines] = useState<Set<string>>(
    new Set(waybill.lines?.map((l) => l.id) ?? [])
  );

  // ─── API Calls ────────────────────────────────────────────────────────

  const { mutate: submitFullAccept, isPending: acceptingFull } = useMutation({
    mutationFn: () =>
      apiClient.post(`/waybill/waybills/${waybill.id}/receipt-advice`, {
        mode: "FULL_ACCEPT",
      }),
    onSuccess: () => {
      setShowAcceptanceModal(false);
      setAcceptanceMode(null);
      qc.invalidateQueries({ queryKey: ["waybill", waybill.id] });
      showToast(t("waybill.acceptanceSubmitted"), true);
      onResponseSubmitted?.();
    },
    onError: (e: Error) => showToast(e.message, false),
  });

  const { mutate: submitFullReject, isPending: rejectingFull } = useMutation({
    mutationFn: () =>
      apiClient.post(`/waybill/waybills/${waybill.id}/receipt-advice`, {
        mode: "FULL_REJECT",
      }),
    onSuccess: () => {
      setShowAcceptanceModal(false);
      setAcceptanceMode(null);
      qc.invalidateQueries({ queryKey: ["waybill", waybill.id] });
      showToast(t("waybill.rejectionSubmitted"), true);
      onResponseSubmitted?.();
    },
    onError: (e: Error) => showToast(e.message, false),
  });

  const { mutate: submitPartial, isPending: submittingPartial } = useMutation({
    mutationFn: (data: PartialAcceptanceForm) =>
      apiClient.post(`/waybill/waybills/${waybill.id}/receipt-advice`, {
        mode: "PARTIAL",
        lines: data.lines.map((line) => ({
          lineId: line.lineId,
          acceptedQty: line.acceptedQty,
          rejectedQty: line.rejectedQty,
          rejectionReason: line.rejectionReason || null,
        })),
        overallReason: data.overallReason || null,
      }),
    onSuccess: () => {
      setShowAcceptanceModal(false);
      setAcceptanceMode(null);
      form.reset();
      qc.invalidateQueries({ queryKey: ["waybill", waybill.id] });
      showToast(t("waybill.partialAcceptanceSubmitted"), true);
      onResponseSubmitted?.();
    },
    onError: (e: Error) => showToast(e.message, false),
  });

  // ─── Form Setup ───────────────────────────────────────────────────────

  const form = useForm<PartialAcceptanceForm>({
    resolver: zodResolver(PartialAcceptanceFormSchema),
    defaultValues: {
      lines:
        waybill.lines?.map((line) => ({
          lineId: line.id,
          acceptedQty: line.quantity,
          rejectedQty: 0,
          rejectionReason: "",
        })) ?? [],
      overallReason: "",
    },
  });

  const { fields } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const toggleLineExpanded = (lineId: string) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  };

  // ─── Countdown Logic ──────────────────────────────────────────────────

  const isResponseWindow = new Date(responseDeadline) > new Date();
  const canRespond = isResponseWindow;

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <>
      {/* Response Window Alert */}
      {!isResponseWindow && (
        <Alert variant="destructive">
          <AlertCircle size={14} />
          <AlertDescription>
            {t("waybill.responseWindowClosed")}
          </AlertDescription>
        </Alert>
      )}

      {canRespond && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              {t("waybill.responseRequired")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("waybill.respondByDate")} {new Date(responseDeadline).toLocaleDateString("tr-TR")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <CountdownTimer
              deadline={responseDeadline}
              format="compact"
              size="sm"
            />
            <Button
              size="sm"
              onClick={() => setShowAcceptanceModal(true)}
              className="whitespace-nowrap"
            >
              {t("waybill.respondNow")}
            </Button>
          </div>
        </div>
      )}

      {/* Response Modal */}
      <Dialog open={showAcceptanceModal} onOpenChange={setShowAcceptanceModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {!acceptanceMode ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("waybill.selectResponseMode")}</DialogTitle>
                <DialogDescription>
                  {t("waybill.responseWindowInfo")} {Math.ceil(
                    (new Date(responseDeadline).getTime() -
                      new Date().getTime()) /
                      (1000 * 60 * 60 * 24)
                  )} {t("common.days")}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-3">
                {/* Full Accept */}
                <button
                  onClick={() => setAcceptanceMode("FULL_ACCEPT")}
                  className="p-4 border-2 border-transparent rounded-lg hover:border-green-500 hover:bg-green-50/50 dark:hover:bg-green-950/20 transition-colors text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2.5 mt-0.5">
                      <Check size={16} className="text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {t("waybill.fullAccept")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("waybill.acceptAllItemsDesc")}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Partial Accept */}
                <button
                  onClick={() => setAcceptanceMode("PARTIAL")}
                  className="p-4 border-2 border-transparent rounded-lg hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-2.5 mt-0.5">
                      <AlertCircle size={16} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {t("waybill.partialAccept")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("waybill.acceptSomeItemsDesc")}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Full Reject */}
                <button
                  onClick={() => setAcceptanceMode("FULL_REJECT")}
                  className="p-4 border-2 border-transparent rounded-lg hover:border-red-500 hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-colors text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-2.5 mt-0.5">
                      <X size={16} className="text-red-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {t("waybill.fullReject")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("waybill.rejectAllItemsDesc")}
                      </p>
                    </div>
                  </div>
                </button>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowAcceptanceModal(false)}
                >
                  {t("common.cancel")}
                </Button>
              </DialogFooter>
            </>
          ) : acceptanceMode === "FULL_ACCEPT" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check size={16} className="text-green-600" />
                  {t("waybill.fullAccept")}
                </DialogTitle>
                <DialogDescription>
                  {t("waybill.confirmAcceptAllItems")} {waybill.lines?.length ?? 0} {t("waybill.items")}
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAcceptanceMode(null)}
                >
                  {t("waybill.goBack")}
                </Button>
                <Button
                  onClick={() => submitFullAccept()}
                  isLoading={acceptingFull}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {t("waybill.confirmAccept")}
                </Button>
              </DialogFooter>
            </>
          ) : acceptanceMode === "FULL_REJECT" ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <X size={16} className="text-red-600" />
                  {t("waybill.fullReject")}
                </DialogTitle>
                <DialogDescription>
                  {t("waybill.confirmRejectAllItems")} {waybill.lines?.length ?? 0} {t("waybill.items")}
                </DialogDescription>
              </DialogHeader>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAcceptanceMode(null)}
                >
                  {t("waybill.goBack")}
                </Button>
                <Button
                  onClick={() => submitFullReject()}
                  isLoading={rejectingFull}
                  variant="destructive"
                >
                  {t("waybill.confirmReject")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            // ─── Partial Acceptance Form ──────────────────────────────────
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-amber-600" />
                  {t("waybill.partialAccept")}
                </DialogTitle>
                <DialogDescription>
                  {t("waybill.partialAcceptDesc")}
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit((data) => submitPartial(data))}
                  className="space-y-4"
                >
                  {/* Line Items */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">
                      {t("waybill.items")}
                    </label>
                    <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                      {fields.map((field, idx) => {
                        const originalLine = waybill.lines?.[idx];
                        const isExpanded = expandedLines.has(field.id);
                        const acceptedQty =
                          form.watch(`lines.${idx}.acceptedQty`) ?? 0;
                        const rejectedQty =
                          form.watch(`lines.${idx}.rejectedQty`) ?? 0;
                        const total = originalLine?.quantity ?? 0;
                        const sum = acceptedQty + rejectedQty;
                        const isValid = Math.abs(sum - total) < 0.01;

                        return (
                          <div key={field.id} className="border-t first:border-t-0">
                            {/* Summary Row */}
                            <button
                              type="button"
                              onClick={() => toggleLineExpanded(field.id)}
                              className="w-full px-4 py-3 hover:bg-muted/50 flex items-center gap-3 transition-colors"
                            >
                              <div className="flex-1 text-left flex items-center gap-3">
                                <div className="text-sm font-medium text-foreground flex-1">
                                  {originalLine?.productName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Total: {total.toLocaleString("tr-TR")}
                                  {originalLine?.unitCode &&
                                    ` ${originalLine.unitCode}`}
                                </div>
                              </div>
                              <div
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  isValid
                                    ? "bg-green-100/50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                    : "bg-red-100/50 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                }`}
                              >
                                {sum.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")}
                              </div>
                              {isExpanded ? (
                                <ChevronUp size={16} className="text-muted-foreground" />
                              ) : (
                                <ChevronDown size={16} className="text-muted-foreground" />
                              )}
                            </button>

                            {/* Expanded Fields */}
                            {isExpanded && (
                              <div className="px-4 py-3 bg-muted/20 space-y-3 border-t">
                                <div className="grid grid-cols-2 gap-3">
                                  <FormField
                                    control={form.control}
                                    name={`lines.${idx}.acceptedQty`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs">
                                          {t("waybill.acceptedQty")}
                                        </FormLabel>
                                        <FormControl>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max={total}
                                            {...field}
                                            onChange={(e) =>
                                              field.onChange(
                                                parseFloat(e.target.value) ||
                                                  0
                                              )
                                            }
                                            className="h-8"
                                          />
                                        </FormControl>
                                        <FormMessage className="text-[10px]" />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name={`lines.${idx}.rejectedQty`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="text-xs">
                                          {t("waybill.rejectedQty")}
                                        </FormLabel>
                                        <FormControl>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max={total}
                                            {...field}
                                            onChange={(e) =>
                                              field.onChange(
                                                parseFloat(e.target.value) ||
                                                  0
                                              )
                                            }
                                            className="h-8"
                                          />
                                        </FormControl>
                                        <FormMessage className="text-[10px]" />
                                      </FormItem>
                                    )}
                                  />
                                </div>

                                <FormField
                                  control={form.control}
                                  name={`lines.${idx}.rejectionReason`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-xs">
                                        {t("waybill.rejectionReasonOptional")}
                                      </FormLabel>
                                      <FormControl>
                                        <Textarea
                                          placeholder={t(
                                            "waybill.rejectionReasonPlaceholder"
                                          )}
                                          {...field}
                                          className="h-16 text-sm"
                                        />
                                      </FormControl>
                                      <FormMessage className="text-[10px]" />
                                    </FormItem>
                                  )}
                                />

                                {!isValid && (
                                  <Alert variant="destructive">
                                    <AlertCircle size={12} />
                                    <AlertDescription className="text-xs">
                                      {t("waybill.qtyMustEqual")} {total.toLocaleString("tr-TR")}
                                    </AlertDescription>
                                  </Alert>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Overall Reason */}
                  <FormField
                    control={form.control}
                    name="overallReason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">
                          {t("waybill.overallReason")}
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t("waybill.overallReasonPlaceholder")}
                            {...field}
                            className="min-h-[80px]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAcceptanceMode(null)}
                    >
                      {t("waybill.goBack")}
                    </Button>
                    <Button
                      type="submit"
                      isLoading={submittingPartial}
                      disabled={
                        !fields.every((_, idx) => {
                          const accepted =
                            form.watch(`lines.${idx}.acceptedQty`) ?? 0;
                          const rejected =
                            form.watch(`lines.${idx}.rejectedQty`) ?? 0;
                          const total = waybill.lines?.[idx]?.quantity ?? 0;
                          return Math.abs(accepted + rejected - total) < 0.01;
                        })
                      }
                    >
                      {t("waybill.submitResponse")}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm ${
            toast.ok
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          {toast.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{toast.text}</span>
        </div>
      )}
    </>
  );
}
