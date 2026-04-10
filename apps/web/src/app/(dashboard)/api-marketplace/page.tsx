'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Key, Plus, Trash2, Copy, Check, AlertTriangle, Eye, EyeOff,
  RefreshCw, Clock, Shield, ChevronDown, Info,
} from 'lucide-react';
import { oauthApi, API_SCOPES, type ApiClientItem, type CreatedApiClient } from '@/services/oauth';
import { formatDateTime } from '@/lib/format';
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// ─── Scope Tag ───────────────────────────────────────────────────────────────

function ScopeTag({ scope }: { scope: string }) {
  const isWrite = scope.includes('write');
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 px-2 text-[10px] shadow-none",
        isWrite
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : "bg-muted text-muted-foreground"
      )}
    >
      {scope}
    </Badge>
  );
}

// ─── Scope Seçici ────────────────────────────────────────────────────────────

function ScopeSelector({ selected, onChange }: { selected: string[]; onChange: (s: string[]) => void }) {
  const groups = Array.from(new Set(API_SCOPES.map((s) => s.group)));
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val]);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group} className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group}
          </p>
          <div className="flex flex-wrap gap-2">
            {API_SCOPES.filter((s) => s.group === group).map((scope) => {
              const active = selected.includes(scope.value);
              return (
                <Button
                  key={scope.value}
                  variant="outline"
                  size="sm"
                  onClick={() => toggle(scope.value)}
                  className={cn(
                    "h-8 px-3 text-[11px] rounded-lg shadow-none transition-colors",
                    active
                      ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {active && <Check size={10} className="mr-1.5" strokeWidth={3} />}
                  {scope.label}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Yeni İstemci Modal ───────────────────────────────────────────────────────

function CreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (result: CreatedApiClient) => void }) {
  const [name,    setName   ] = useState('');
  const [scopes,  setScopes ] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState('');

  const handleSubmit = async () => {
    if (!name.trim())        { setError('İstemci adı zorunludur.'); return; }
    if (scopes.length === 0) { setError('En az bir yetki seçmelisiniz.'); return; }
    setLoading(true); setError('');
    try {
      const res = await oauthApi.createClient({ name: name.trim(), scopes });
      onCreated((res as { data?: CreatedApiClient }).data ?? res as unknown as CreatedApiClient);
    } catch {
      setError('API istemcisi oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center w-fit text-muted-foreground mb-2">
            <Plus size={20} />
          </div>
          <DialogTitle>Yeni API İstemcisi</DialogTitle>
          <DialogDescription>
            Dış entegrasyonlar için OAuth2 anahtarı oluşturun
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-6 py-2">
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">İstemci Adı *</Label>
              <Input
                placeholder="Örn: Trendyol Entegrasyonu"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label className="text-xs text-muted-foreground">Yetki Tanımları *</Label>
              <ScopeSelector selected={scopes} onChange={setScopes} />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle size={16} />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>İptal</Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || scopes.length === 0}
            isLoading={loading}
          >
            <Plus size={14} />
            İstemci Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Gizli Anahtar Gösterme ───────────────────────────────────────────────────

function SecretReveal({ result, open, onDone }: { result: CreatedApiClient; open: boolean; onDone: () => void }) {
  const [copied,  setCopied ] = useState(false);
  const [visible, setVisible] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(result.clientSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onDone()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <AlertTriangle size={18} />
            </div>
            <div>
              <DialogTitle>API Anahtarınızı Kaydedin</DialogTitle>
              <DialogDescription>Güvenlik Bilgilendirmesi</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Alert>
            <Info size={16} />
            <AlertDescription className="text-xs leading-relaxed">
              Bu anahtar <span className="underline decoration-2 underline-offset-2">yalnızca bir kez</span> gösterilir. Kaydetmeden bu pencereyi kapatmayın.
            </AlertDescription>
          </Alert>

          <Card className="shadow-sm">
            <CardContent className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">İstemci ID (Client ID)</Label>
                <code className="block text-sm text-foreground break-all">
                  {result.clientId}
                </code>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Gizli Anahtar (Client Secret)</Label>
                <div className="flex items-center gap-2">
                  <code className={cn(
                    "flex-1 text-sm text-foreground break-all transition-all duration-300",
                    !visible && "blur-sm select-none opacity-30"
                  )}>
                    {result.clientSecret}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setVisible(v => !v)}
                  >
                    {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button
            onClick={copy}
            variant={copied ? "secondary" : "default"}
            className="flex-1 sm:flex-none gap-2"
          >
            {copied ? <><Check size={14} /> Kopyalandı!</> : <><Copy size={14} /> Anahtarı Kopyala</>}
          </Button>
          <Button variant="ghost" onClick={onDone}>Kapat</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── İstemci Satırı ──────────────────────────────────────────────────────────

function ClientRow({ client, onRevoke }: { client: ApiClientItem; onRevoke: (id: string) => void }) {
  const [expanded,   setExpanded  ] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading,    setLoading   ] = useState(false);

  const handleRevoke = async () => {
    setLoading(true);
    try {
      await oauthApi.revokeClient(client.client_id);
      onRevoke(client.client_id);
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  return (
    <Card className="shadow-sm overflow-hidden">
      <div
        className="flex items-center gap-4 px-6 py-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn(
          "shrink-0 size-2 rounded-full",
          client.status === 'active' ? "bg-primary" : "bg-muted-foreground/30"
        )} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{client.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {client.client_id}
          </p>
        </div>

        <div className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
          <Clock size={11} />
          {client.last_used_at ? formatDateTime(client.last_used_at) : 'Kullanılmadı'}
        </div>

        <Badge variant="outline" className={cn(
          "h-6 px-2.5 text-[10px] shadow-none shrink-0",
          client.status === 'active'
            ? "bg-primary/10 border-primary/30 text-primary"
            : "text-muted-foreground"
        )}>
          {client.status === 'active' ? 'Aktif' : 'İptal'}
        </Badge>

        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </div>

      {expanded && (
        <div className="px-6 pb-6 pt-2 flex flex-col gap-4 border-t border-border">
          <div className="flex flex-wrap gap-2 pt-2">
            {client.scopes.map((s) => <ScopeTag key={s} scope={s} />)}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              Oluşturulma: <span className="text-foreground">{formatDateTime(client.created_at)}</span>
            </p>

            {client.status === 'active' && (
              confirming ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-destructive">Emin misiniz?</span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => setConfirming(false)}
                    >
                      Vazgeç
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8"
                      disabled={loading}
                      isLoading={loading}
                      onClick={handleRevoke}
                    >
                      <Trash2 size={13} />
                      İptal Et
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 size={12} />
                  <span className="text-[10px]">Anahtarı İptal Et</span>
                </Button>
              )
            )}

            {client.status === 'revoked' && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Shield size={12} /> Bu anahtar geçersizdir
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function ApiMarketplacePage() {
  const [clients,    setClients   ] = useState<ApiClientItem[]>([]);
  const [loading,    setLoading   ] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newClient,  setNewClient ] = useState<CreatedApiClient | null>(null);
  const { t } = useI18n();

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await oauthApi.listClients();
      const items = (res as { data?: ApiClientItem[] }).data ?? res as unknown as ApiClientItem[];
      setClients(Array.isArray(items) ? items : []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadClients(); }, [loadClients]);

  const handleCreated = (result: CreatedApiClient) => {
    setShowCreate(false);
    setNewClient(result);
    void loadClients();
  };

  const handleRevoke = (clientId: string) => {
    setClients(prev => prev.map(c => c.client_id === clientId ? { ...c, status: 'revoked' as const } : c));
  };

  const activeCount  = clients.filter(c => c.status === 'active').length;
  const revokedCount = clients.filter(c => c.status === 'revoked').length;

  return (
    <div className="flex flex-col gap-8 w-full pb-12">
      {/* Başlık */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Key size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">API Marketplace</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              OAuth2 Client Management & Integration Hub
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus size={14} />
          Yeni API Anahtarı
        </Button>
      </div>

      {/* Üst Şerit: KPI'lar & cURL */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* KPI'lar */}
        <div className="xl:col-span-2 grid grid-cols-3 gap-4">
          {[
            { label: 'Toplam Anahtar', value: clients.length },
            { label: 'Aktif',          value: activeCount    },
            { label: 'İptal Edilmiş',  value: revokedCount   },
          ].map(({ label, value }) => (
            <Card key={label} className="shadow-sm">
              <CardContent className="p-4 flex flex-col gap-1">
                <p className="text-2xl font-bold tabular-nums text-foreground leading-none">{value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Hızlı Başlangıç */}
        <Card className="xl:col-span-3 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2 flex items-center justify-between border-b border-border">
            <div className="text-[10px] text-muted-foreground flex items-center gap-2 uppercase tracking-wider">
              <RefreshCw size={10} /> Erişim Tokenı Al
            </div>
            <Badge variant="outline" className="text-[9px]">oauth2 / token</Badge>
          </div>
          <div className="flex-1 bg-muted p-4">
            <ScrollArea>
              <pre className="text-[11px] leading-relaxed text-muted-foreground">
{`curl -X POST https://api.enkap.com.tr/api/v1/oauth/token \\
  -d '{
    "grant_type": "client_credentials",
    "client_id": "CLIENT_ID",
    "client_secret": "CLIENT_SECRET"
  }'`}
              </pre>
            </ScrollArea>
          </div>
        </Card>
      </div>

      {/* Liste Bölümü */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">API İstemcileri</p>
          <Badge variant="outline" className="text-[9px]">
            {clients.length} Kayıtlı İstemci
          </Badge>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map(i => (
              <Card key={i} className="h-[60px] animate-pulse bg-muted/50" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="py-24 flex flex-col items-center justify-center text-center gap-3">
              <div className="p-3 rounded-lg bg-muted flex items-center justify-center text-muted-foreground opacity-40">
                <Key size={28} />
              </div>
              <p className="text-sm font-medium text-foreground">Henüz API anahtarı yok</p>
              <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed">
                Uygulama entegrasyonlarınız için &quot;Yeni API Anahtarı&quot; butonunu kullanarak istemci oluşturun.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {clients.map(client => (
              <ClientRow key={client.client_id} client={client} onRevoke={handleRevoke} />
            ))}
          </div>
        )}
      </div>

      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      {newClient && (
        <SecretReveal
          result={newClient}
          open={!!newClient}
          onDone={() => setNewClient(null)}
        />
      )}
    </div>
  );
}
