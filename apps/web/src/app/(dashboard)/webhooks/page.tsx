'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { webhookApi, WEBHOOK_EVENT_TYPES, type WebhookSubscription, type CreateWebhookResponse } from '@/services/webhook';
import { useSession } from 'next-auth/react';
import { Webhook, Plus, Trash2, Copy, Check, Eye, EyeOff, ChevronDown, AlertTriangle, Info } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// ─── Yardımcı ────────────────────────────────────────────────────────────────

function tarih(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function groupedEvents() {
  const groups: Record<string, typeof WEBHOOK_EVENT_TYPES[number][]> = {};
  for (const e of WEBHOOK_EVENT_TYPES) {
    if (!groups[e.group]) groups[e.group] = [];
    groups[e.group].push(e);
  }
  return groups;
}

// ─── Secret Reveal Modal ─────────────────────────────────────────────────────

function SecretRevealModal({
  data,
  open,
  onClose,
}: {
  data: CreateWebhookResponse;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(data.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Webhook Secret</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Bu secret yalnızca şimdi görüntülenebilir
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Alert>
            <Info size={14} />
            <AlertDescription className="text-xs leading-relaxed">
              Bu secret bir daha gösterilmeyecek. Güvenli bir yerde saklayın.
              İstekler <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] mx-1">X-Enkap-Signature</code> başlığı ile HMAC-SHA256 imzalanarak iletilir.
            </AlertDescription>
          </Alert>

          {/* Secret */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">HMAC Secret</Label>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border">
              <code className={cn(
                "flex-1 text-sm text-foreground tracking-wider break-all transition-all duration-300",
                !visible && "blur-sm select-none opacity-40"
              )}>
                {data.secret}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setVisible(v => !v)}
              >
                {visible ? <EyeOff size={14}/> : <Eye size={14}/>}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8 transition-colors",
                  copied ? "text-primary bg-primary/10" : ""
                )}
                onClick={copy}
              >
                {copied ? <Check size={14}/> : <Copy size={14}/>}
              </Button>
            </div>
          </div>

          {/* Webhook Bilgileri */}
          <Card className="shadow-none">
            <CardContent className="p-4 flex flex-col gap-3">
              {[
                { label: 'URL', value: data.url },
                { label: 'Olaylar', value: data.eventTypes.join(', ') },
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-4 items-start">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground w-16 pt-0.5 shrink-0">{label}</span>
                  <span className="text-xs text-foreground break-all leading-snug">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            Anladım, Devam Et
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Oluştur Modal ────────────────────────────────────────────────────────────

function CreateModal({
  tenantId,
  open,
  onClose,
  onCreated,
}: {
  tenantId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (data: CreateWebhookResponse) => void;
}) {
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(['*']));
  const [error, setError] = useState('');

  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: () => webhookApi.create({ tenantId, url, eventTypes: Array.from(selected) }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['webhooks', tenantId] });
      onCreated(res.data);
    },
    onError: () => setError('Webhook oluşturulamadı. URL geçerli ve HTTPS olmalıdır.'),
  });

  const toggle = (v: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (v === '*') {
        return next.has('*') ? new Set() : new Set(['*']);
      }
      next.delete('*');
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  };

  const groups = groupedEvents();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
              <Webhook size={18} />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Yeni Webhook Aboneliği</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Gerçek zamanlı bildirim kanalı oluşturun
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-6 py-2">
            {/* URL */}
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">
                Endpoint URL <span className="text-destructive">*</span>
              </Label>
              <Input
                type="url"
                placeholder="https://sizin-sunucunuz.com/webhook"
                value={url}
                onChange={e => setUrl(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                <Info size={10} /> HTTPS zorunludur.
              </p>
            </div>

            {/* Olay Tipleri */}
            <div className="flex flex-col gap-4">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Dinlenecek Olaylar</Label>
              <div className="flex flex-col gap-5">
                {Object.entries(groups).map(([group, events]) => (
                  <div key={group} className="flex flex-col gap-2">
                    <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                      <span className="size-1 rounded-full bg-muted-foreground/40" />
                      {group}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {events.map(ev => {
                        const checked = selected.has(ev.value);
                        return (
                          <Button
                            key={ev.value}
                            variant="outline"
                            size="sm"
                            onClick={() => toggle(ev.value)}
                            className={cn(
                              "h-7 px-3 text-[11px] rounded-lg shadow-none transition-all",
                              checked
                                ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {checked && <Check size={10} className="mr-1.5" strokeWidth={3} />}
                            {ev.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle size={14} />
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose} className="text-xs">İptal</Button>
          <Button
            onClick={() => mutate()}
            disabled={isPending || !url || selected.size === 0}
            isLoading={isPending}
          >
            <Plus size={14} /> Webhook Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Webhook Satırı ───────────────────────────────────────────────────────────

function WebhookRow({
  sub,
  onDelete,
}: {
  sub: WebhookSubscription;
  tenantId: string;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const isWildcard = sub.eventTypes.includes('*');

  return (
    <Card className="shadow-sm overflow-hidden">
      {/* Ana satır */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="shrink-0 size-8 rounded-lg bg-muted border border-border flex items-center justify-center">
          <span className={cn(
            "size-2 rounded-full",
            sub.isActive ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
          )} />
        </div>

        <code className="flex-1 text-[13px] text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
          {sub.url}
        </code>

        <Badge variant="outline" className={cn(
          "text-[10px] uppercase tracking-wider h-6 px-2.5 shadow-none hidden sm:inline-flex",
          isWildcard ? "bg-primary/10 text-primary border-transparent" : ""
        )}>
          {isWildcard ? 'Tüm Olaylar' : `${sub.eventTypes.length} Olay`}
        </Badge>

        <span className="text-[11px] text-muted-foreground tabular-nums hidden md:inline shrink-0">
          {tarih(sub.createdAt)}
        </span>

        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </div>

      {/* Genişletilmiş bölüm */}
      {expanded && (
        <div className="px-5 pb-5 pt-3 flex flex-col gap-5 border-t border-border">
          {/* Olaylar */}
          {!isWildcard && (
            <div className="flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Dinlenen Olaylar</div>
              <div className="flex flex-wrap gap-2">
                {sub.eventTypes.map(ev => (
                  <Badge key={ev} variant="outline" className="text-[10px] h-6 px-2.5">
                    {ev}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Code Örneği */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">HMAC Doğrulama (Node.js)</div>
              <Badge variant="outline" className="text-[9px] uppercase tracking-wider">SHA-256</Badge>
            </div>
            <div className="rounded-lg border border-border bg-muted overflow-hidden">
              <ScrollArea>
                <pre className="p-4 text-[11px] leading-relaxed text-muted-foreground bg-transparent">
{`const crypto = require('crypto');
const sig = req.headers['x-enkap-signature'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', YOUR_SECRET)
  .update(JSON.stringify(req.body))
  .digest('hex');

if (sig !== expected) return res.status(401).end();`}
                </pre>
              </ScrollArea>
            </div>
          </div>

          {/* Aksiyonlar */}
          <div className="flex justify-end pt-2 border-t border-border">
            {confirming ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-destructive">Bu webhook silinsin mi?</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-4 text-xs"
                    onClick={() => setConfirming(false)}
                  >
                    İptal
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 px-4 text-xs"
                    onClick={() => { onDelete(sub.id); setConfirming(false); }}
                  >
                    Sil
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
              >
                <Trash2 size={13} />
                <span className="text-[10px] uppercase tracking-[0.2em]">Aboneliği Kaldır</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const { data: session } = useSession();
  const tenantId = (session?.user as { tenantId?: string })?.tenantId ?? '';
  const { t } = useI18n();

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['webhooks', tenantId],
    queryFn:  () => webhookApi.list(tenantId),
    enabled:  !!tenantId,
    select:   (r) => r.data,
    staleTime: 30_000,
  });

  const { mutate: deleteWebhook } = useMutation({
    mutationFn: (id: string) => webhookApi.delete(id, tenantId),
    onSuccess:  () => void qc.invalidateQueries({ queryKey: ['webhooks', tenantId] }),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [secretData, setSecretData] = useState<CreateWebhookResponse | null>(null);

  const subs    = data ?? [];
  const active  = subs.filter(s => s.isActive).length;
  const inactive = subs.filter(s => !s.isActive).length;

  return (
    <div className="flex flex-col gap-6 max-w-[900px]">
      {/* Başlık */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center">
            <Webhook size={18} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Webhook Hub</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gerçek zamanlı olay entegrasyonu
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus size={14} />
          Webhook Ekle
        </Button>
      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Toplam Abonelik', value: subs.length },
          { label: 'Aktif',           value: active },
          { label: 'Pasif',           value: inactive },
        ].map(({ label, value }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="pt-4 flex flex-col gap-1">
              <p className="text-3xl font-bold tabular-nums leading-none">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Nasıl Çalışır Alert */}
      <Alert>
        <Info size={14} />
        <AlertTitle className="text-sm font-semibold">Nasıl Çalışır?</AlertTitle>
        <AlertDescription className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1.5 mt-2">
          {[
            '1. Bir endpoint URL ekleyin (HTTPS zorunlu).',
            '2. Dinlemek istediğiniz olay tiplerini seçin.',
            '3. HMAC secret\'ı güvenli bir yerde saklayın.',
            '4. X-Enkap-Signature başlığını doğrulayın.',
          ].map(s => (
            <div key={s} className="text-xs text-muted-foreground flex items-center gap-2">
              <div className="size-1 rounded-full bg-muted-foreground/40 shrink-0" />
              {s}
            </div>
          ))}
        </AlertDescription>
      </Alert>

      {/* Liste */}
      <div className="flex flex-col gap-3 min-h-[300px]">
        <div className="flex items-center justify-between px-1">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Kayıtlı Abonelikler</div>
          <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-muted-foreground">
            {subs.length} Abonelik
          </Badge>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="h-[60px] animate-pulse bg-muted/20" />
            ))}
          </div>
        ) : subs.length === 0 ? (
          <Card className="py-20 flex flex-col items-center justify-center text-center border-dashed">
            <div className="p-4 rounded-2xl bg-muted flex items-center justify-center mb-4 opacity-30">
              <Webhook size={28} className="text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold mb-1">Henüz webhook aboneliği yok</h3>
            <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed">
              Gerçek zamanlı bildirim almak için yeni bir webhook ekleyin.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {subs.map(sub => (
              <WebhookRow
                key={sub.id}
                sub={sub}
                tenantId={tenantId}
                onDelete={(id) => deleteWebhook(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modaller */}
      <CreateModal
        tenantId={tenantId}
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(d) => { setShowCreate(false); setSecretData(d); }}
      />
      {secretData && (
        <SecretRevealModal
          data={secretData}
          open={!!secretData}
          onClose={() => setSecretData(null)}
        />
      )}
    </div>
  );
}
