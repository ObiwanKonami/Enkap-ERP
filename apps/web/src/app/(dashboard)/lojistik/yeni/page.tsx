"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Truck, ArrowLeft, Save, AlertCircle, Package, MapPin, Phone, Mail } from "lucide-react";
import {
  logisticsApi,
  type CarrierCode,
  type PaymentType,
} from "@/services/logistics";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type NewShipmentForm = {
  orderReference: string;
  carrier: CarrierCode;
  paymentType: PaymentType;
  senderName: string;
  senderAddress: string;
  senderCity: string;
  senderPhone: string;
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientDistrict: string;
  recipientPhone: string;
  recipientEmail: string;
  weightKg: string;
  desi: string;
};

export default function YeniGonderiPage() {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState<NewShipmentForm>({
    orderReference: "",
    carrier: "aras",
    paymentType: "sender",
    senderName: "",
    senderAddress: "",
    senderCity: "",
    senderPhone: "",
    recipientName: "",
    recipientAddress: "",
    recipientCity: "",
    recipientDistrict: "",
    recipientPhone: "",
    recipientEmail: "",
    weightKg: "",
    desi: "",
  });

  const [error, setError] = useState("");

  const upd = (k: keyof NewShipmentForm) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));
  const updE = (k: keyof NewShipmentForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      logisticsApi.create({
        ...form,
        weightKg: parseFloat(form.weightKg) || 0,
        desi: form.desi ? parseFloat(form.desi) : undefined,
        recipientDistrict: form.recipientDistrict || undefined,
        recipientEmail: form.recipientEmail || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipments"] });
      router.push("/lojistik");
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Gönderi oluşturulurken hata oluştu");
    },
  });

  const canSubmit = !!form.orderReference && !!form.recipientName && !!form.weightKg;

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/lojistik"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} /> {t("common.back")}
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Truck size={20} className="text-primary" />
              {t("logistics.newShipment")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("logistics.createShipmentDesc")}
            </p>
          </div>
        </div>
        <Button
          onClick={() => {
            setError("");
            mutate();
          }}
          disabled={isPending || !canSubmit}
          isLoading={isPending}
          className="gap-1.5"
        >
          {!isPending && <Save size={14} />}
          {t("logistics.createShipment")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* Sol - Form */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("logistics.shipmentInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Sipariş Ref + Kargo + Ödeme + Ağırlık */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.orderRef")}</Label>
                  <Input
                    className="h-9"
                    placeholder="SO-2026-0042"
                    value={form.orderReference}
                    onChange={updE("orderReference")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.carrier")}</Label>
                  <Select
                    value={form.carrier}
                    onValueChange={(v) => upd("carrier")(v as CarrierCode)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aras">Aras Kargo</SelectItem>
                      <SelectItem value="yurtici">Yurtiçi Kargo</SelectItem>
                      <SelectItem value="ptt">PTT Kargo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.paymentType")}</Label>
                  <Select
                    value={form.paymentType}
                    onValueChange={(v) => upd("paymentType")(v as PaymentType)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sender">{t("logistics.senderPays")}</SelectItem>
                      <SelectItem value="recipient">{t("logistics.recipientPays")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.weight")}</Label>
                  <Input
                    className="h-9"
                    type="number"
                    step="0.1"
                    placeholder="2.5"
                    value={form.weightKg}
                    onChange={updE("weightKg")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.desi")}</Label>
                  <Input
                    className="h-9"
                    type="number"
                    step="0.1"
                    placeholder="10"
                    value={form.desi}
                    onChange={updE("desi")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Package size={14} />
                {t("logistics.senderInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.senderName")}</Label>
                  <Input
                    className="h-9"
                    value={form.senderName}
                    onChange={updE("senderName")}
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.address")}</Label>
                  <Input
                    className="h-9"
                    value={form.senderAddress}
                    onChange={updE("senderAddress")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.city")}</Label>
                  <Input
                    className="h-9"
                    value={form.senderCity}
                    onChange={updE("senderCity")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.phone")}</Label>
                  <Input
                    className="h-9"
                    placeholder="05xx xxx xx xx"
                    value={form.senderPhone}
                    onChange={updE("senderPhone")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <MapPin size={14} />
                {t("logistics.recipientInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.recipientName")}</Label>
                  <Input
                    className="h-9"
                    value={form.recipientName}
                    onChange={updE("recipientName")}
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.address")}</Label>
                  <Input
                    className="h-9"
                    value={form.recipientAddress}
                    onChange={updE("recipientAddress")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.city")}</Label>
                  <Input
                    className="h-9"
                    value={form.recipientCity}
                    onChange={updE("recipientCity")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.district")}</Label>
                  <Input
                    className="h-9"
                    value={form.recipientDistrict}
                    onChange={updE("recipientDistrict")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.phone")}</Label>
                  <Input
                    className="h-9"
                    placeholder="05xx xxx xx xx"
                    value={form.recipientPhone}
                    onChange={updE("recipientPhone")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("logistics.email")}</Label>
                  <Input
                    className="h-9"
                    type="email"
                    value={form.recipientEmail}
                    onChange={updE("recipientEmail")}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Sağ - Özet */}
        <div className="sticky top-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("common.summary")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("logistics.orderRef")}</span>
                <span className="text-foreground tabular-nums font-medium">
                  {form.orderReference || "—"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("logistics.carrier")}</span>
                <span className="text-primary tabular-nums">
                  {form.carrier === "aras"
                    ? "Aras Kargo"
                    : form.carrier === "yurtici"
                    ? "Yurtiçi Kargo"
                    : "PTT Kargo"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("logistics.paymentType")}</span>
                <span className="text-foreground">
                  {form.paymentType === "sender"
                    ? t("logistics.senderPays")
                    : t("logistics.recipientPays")}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("logistics.weight")}</span>
                <span className="text-foreground tabular-nums">
                  {form.weightKg ? `${form.weightKg} kg` : "—"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("logistics.desi")}</span>
                <span className="text-foreground tabular-nums">
                  {form.desi || "—"}
                </span>
              </div>

              <Separator className="my-2" />

              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("logistics.recipientName")}</span>
                <span className="text-foreground">
                  {form.recipientName || "—"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t("logistics.city")}</span>
                <span className="text-foreground">
                  {form.recipientCity || "—"}
                </span>
              </div>

              <Separator className="my-2" />

              <Button
                className="w-full gap-1.5"
                disabled={isPending || !canSubmit}
                onClick={() => {
                  setError("");
                  mutate();
                }}
                isLoading={isPending}
              >
                {!isPending && <Save size={14} />}
                {t("logistics.createShipment")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
