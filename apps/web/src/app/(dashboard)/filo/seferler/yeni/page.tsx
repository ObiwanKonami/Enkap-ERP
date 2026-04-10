'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Route, ArrowLeft, Save, AlertTriangle, ChevronRight, Warehouse, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fleetApi, VEHICLE_TYPE_LABELS } from '@/services/fleet';
import { stockApi } from '@/services/stock';
import { crmApi } from '@/services/crm';
import { useI18n } from '@/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function YeniSeferPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState({
    vehicleId:        '',
    driverId:         '',
    origin:           '',   /* Depo adı string olarak kaydedilir */
    destination:      '',   /* Müşteri/BOTH kontakt adı string olarak kaydedilir */
    plannedDeparture: new Date().toISOString().slice(0, 16),
    plannedArrival:   '',
    notes:            '',
  });
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  /* ── Araç & Sürücü ── */
  const { data: vehiclesData } = useQuery({
    queryKey: ['fleet-vehicles'],
    queryFn:  () => fleetApi.vehicles.list({ limit: 200 }).then(r => r.data),
  });
  const { data: driversData } = useQuery({
    queryKey: ['fleet-drivers'],
    queryFn:  () => fleetApi.drivers.list({ limit: 200 }).then(r => r.data),
  });
  const { data: tripsData } = useQuery({
    queryKey: ['fleet-trips'],
    queryFn:  () => fleetApi.trips.list({ limit: 200 }).then(r => r.data),
  });

  /* ── Depolar (Nereden) ── */
  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn:  () => stockApi.warehouses.list().then(r => r.data),
  });

  /* ── Müşteri + BOTH kontaklar (Nereye) ── */
  const { data: customersData } = useQuery({
    queryKey: ['crm-contacts-customer'],
    queryFn:  () => crmApi.contacts.list({ type: 'CUSTOMER', limit: 200 }).then(r => r.data),
  });
  const { data: bothData } = useQuery({
    queryKey: ['crm-contacts-both'],
    queryFn:  () => crmApi.contacts.list({ type: 'BOTH', limit: 200 }).then(r => r.data),
  });

  const vehicles   = vehiclesData?.data ?? [];
  const drivers    = driversData?.data  ?? [];
  const warehouses = Array.isArray(warehousesData) ? warehousesData : [];
  /* Müşteri ve hem-müşteri-hem-tedarikçi kontakları birleştir, tekrar yok et */
  const destinations = [
    ...(customersData?.data ?? []),
    ...(bothData?.data ?? []),
  ].filter((c, idx, arr) => arr.findIndex(x => x.id === c.id) === idx);

  /* Aktif seferde olan araç/sürücüler */
  const busyVehicleIds = new Set(
    (tripsData?.data ?? [])
      .filter(t => t.status === 'YOLDA' || t.status === 'PLANLANMIS')
      .map(t => t.vehicleId),
  );
  const busyDriverIds = new Set(
    (tripsData?.data ?? [])
      .filter(t => t.status === 'YOLDA' || t.status === 'PLANLANMIS')
      .map(t => t.driverId),
  );

  const availableVehicles = vehicles.filter(v => v.status === 'AKTIF' && !busyVehicleIds.has(v.id));
  const busyVehicles      = vehicles.filter(v => v.status === 'AKTIF' &&  busyVehicleIds.has(v.id));
  const availableDrivers  = drivers.filter(d => d.status === 'AKTIF' && !busyDriverIds.has(d.id));
  const busyDrivers       = drivers.filter(d => d.status === 'AKTIF' &&  busyDriverIds.has(d.id));

  const selectedVehicle = vehicles.find(v => v.id === form.vehicleId);
  const selectedDriver  = drivers.find(d => d.id === form.driverId);

  const mutation = useMutation({
    mutationFn: () => fleetApi.trips.create({
      ...form,
      plannedArrival: form.plannedArrival || undefined,
      notes:          form.notes          || undefined,
    }),
    onSuccess: () => router.push('/filo/seferler'),
  });

  const canSave = form.vehicleId && form.driverId && form.origin && form.destination && form.plannedDeparture;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/filo/seferler" className="flex items-center gap-1.5 text-xs bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-muted-foreground no-underline hover:bg-muted">
          <ArrowLeft size={13}/> {t('fleet.trips')}
        </Link>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Route size={20} className="text-violet-500"/> {t('fleet.newTrip')}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="flex flex-col gap-4">

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t('fleet.vehicleDriver')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vehicle">Araç <span className="text-destructive">*</span></Label>
                {busyVehicles.length > 0 && (
                  <div className="text-xs text-amber-500 flex items-center gap-1">
                    <AlertTriangle size={10}/>{busyVehicles.length} araç aktif seferde
                  </div>
                )}
                <Select value={form.vehicleId} onValueChange={v => f('vehicleId', v)}>
                  <SelectTrigger id="vehicle">
                    <SelectValue placeholder="Araç seç…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVehicles.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.plate} — {v.brand} {v.model} ({VEHICLE_TYPE_LABELS[v.type]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver">Sürücü <span className="text-destructive">*</span></Label>
                {busyDrivers.length > 0 && (
                  <div className="text-xs text-amber-500 flex items-center gap-1">
                    <AlertTriangle size={10}/>{busyDrivers.length} sürücü görevde
                  </div>
                )}
                <Select value={form.driverId} onValueChange={v => f('driverId', v)}>
                  <SelectTrigger id="driver">
                    <SelectValue placeholder="Sürücü seç…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDrivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.firstName} {d.lastName} (Sınıf {d.licenseClass})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t('fleet.routeTiming')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="origin">Nereden (Depo) <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Warehouse className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13}/>
                  <Select value={form.origin} onValueChange={v => f('origin', v)}>
                    <SelectTrigger id="origin" className="pl-9">
                      <SelectValue placeholder="Depo seç…" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.filter((w: { id: string; name: string; code: string; city?: string }) => w.name).map((w: { id: string; name: string; code: string; city?: string }) => (
                        <SelectItem key={w.id} value={w.name}>
                          {w.name} {w.city ? `· ${w.city}` : ''} ({w.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {warehouses.length === 0 && (
                  <p className="text-xs text-muted-foreground">Henüz depo tanımlanmamış.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">Nereye (Müşteri) <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={13}/>
                  <Select value={form.destination} onValueChange={v => f('destination', v)}>
                    <SelectTrigger id="destination" className="pl-9">
                      <SelectValue placeholder="Müşteri seç…" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinations.filter(c => c.name).map(c => (
                        <SelectItem key={c.id} value={c.name}>
                          {c.name}{c.city ? ` · ${c.city}` : ''}{c.type === 'BOTH' ? ' (M+T)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {destinations.length === 0 && (
                  <p className="text-xs text-muted-foreground">Müşteri kaydı bulunamadı.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="plannedDeparture">Planlanan Çıkış <span className="text-destructive">*</span></Label>
                <Input
                  id="plannedDeparture"
                  type="datetime-local"
                  value={form.plannedDeparture}
                  onChange={e => f('plannedDeparture', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plannedArrival">Planlanan Varış</Label>
                <Input
                  id="plannedArrival"
                  type="datetime-local"
                  value={form.plannedArrival}
                  onChange={e => f('plannedArrival', e.target.value)}
                />
              </div>

              <div className="col-span-full space-y-2">
                <Label htmlFor="notes">Notlar</Label>
                <Textarea
                  id="notes"
                  placeholder="Sefer ile ilgili notlar…"
                  value={form.notes}
                  onChange={e => f('notes', e.target.value)}
                  className="min-h-[72px] resize-y"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t('common.summary')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(form.origin || form.destination) && (
              <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex-1 text-right">
                    {form.origin ? (
                      <>
                        <div className="text-xs text-muted-foreground">DEPO</div>
                        <div className="font-semibold text-foreground">{form.origin}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-violet-500 shrink-0"/>
                  <div className="flex-1">
                    {form.destination ? (
                      <>
                        <div className="text-xs text-muted-foreground">MÜŞTERİ</div>
                        <div className="font-semibold text-foreground">{form.destination}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground shrink-0">Araç</span>
                <span className="font-medium text-foreground text-right break-words">
                  {selectedVehicle ? `${selectedVehicle.plate} · ${selectedVehicle.brand} ${selectedVehicle.model}` : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground shrink-0">Sürücü</span>
                <span className="font-medium text-foreground text-right break-words">
                  {selectedDriver ? `${selectedDriver.firstName} ${selectedDriver.lastName}` : '—'}
                </span>
              </div>
            </div>

            {mutation.error && (
              <div className="p-2 bg-destructive/10 rounded-md text-sm text-destructive">
                {t('fleet.createTripError')}
              </div>
            )}

            <Button
              className="w-full"
              onClick={() => mutation.mutate()}
              disabled={!canSave || mutation.isPending}
              isLoading={mutation.isPending}
            >
              <Save size={14} className="mr-2"/>
              {mutation.isPending ? t('common.saving') : t('fleet.createTrip')}
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link href="/filo/seferler">
                {t('common.cancel')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
