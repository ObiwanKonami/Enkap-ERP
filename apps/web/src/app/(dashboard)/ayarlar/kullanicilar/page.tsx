'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft, Users, UserPlus, Mail, Check, AlertCircle,
  ChevronDown, Crown, UserCog, User, Eye, Search,
  ChevronRight,
} from 'lucide-react';
import { tenantApi, type TenantMember, type MemberRole } from '@/services/tenant';
import { hrApi, type Employee } from '@/services/hr';
import { formatDate } from '@/lib/format';
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const ROLES: { value: MemberRole; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: 'ADMIN',    label: 'Yönetici', desc: 'Tüm ayarlara tam erişim',     icon: <Crown   size={13} /> },
  { value: 'MANAGER',  label: 'Müdür',    desc: 'Finans, CRM, stok modülleri', icon: <UserCog size={13} /> },
  { value: 'STAFF',    label: 'Personel', desc: 'Günlük operasyonlar',          icon: <User    size={13} /> },
  { value: 'READONLY', label: 'Salt Oku', desc: 'Yalnızca görüntüleme',         icon: <Eye     size={13} /> },
];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.value, r]));

const STATUS_MAP: Record<TenantMember['status'], {
  label: string;
  variant: 'outline' | 'secondary' | 'destructive';
  className?: string;
}> = {
  ACTIVE:   { label: 'Aktif',          variant: 'secondary', className: 'bg-primary/10 text-primary border-transparent' },
  PENDING:  { label: 'Davet Bekliyor', variant: 'outline' },
  INACTIVE: { label: 'Pasif',          variant: 'outline',   className: 'opacity-60' },
};

function avatarLetter(name?: string, email?: string) {
  return (name ?? email ?? '?')[0].toUpperCase();
}

// ─── Rol Dropdown ─────────────────────────────────────────────────────────────

function RoleSelector({
  member, onChangeRole, disabled,
}: {
  member: TenantMember;
  onChangeRole: (memberId: string, role: MemberRole) => void;
  disabled: boolean;
}) {
  const cur = ROLE_MAP[member.role];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-7 px-2.5 gap-1.5 text-xs"
        >
          {cur.icon}
          <span>{cur.label}</span>
          {!disabled && <ChevronDown size={10} className="ml-0.5 opacity-60" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-1">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 py-2">
          Rol Ataması
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROLES.map(r => (
          <DropdownMenuItem
            key={r.value}
            onClick={() => onChangeRole(member.id, r.value)}
            className="flex items-center gap-3 p-2.5 cursor-pointer"
          >
            <div className="size-7 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
              {r.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">{r.label}</div>
              <div className="text-[10px] text-muted-foreground truncate">{r.desc}</div>
            </div>
            {member.role === r.value && <Check size={14} className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Davet Modal ──────────────────────────────────────────────────────────────

function InviteModal({
  open, onClose, onInvite, isPending, existingEmails,
}: {
  open:           boolean;
  onClose:        () => void;
  onInvite:       (email: string, role: MemberRole, name?: string) => void;
  isPending:      boolean;
  existingEmails: Set<string>;
}) {
  const [search,   setSearch  ] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [role,     setRole    ] = useState<MemberRole>('STAFF');
  const [err,      setErr     ] = useState('');

  const { data: empData, isLoading: empLoading, isError: empError } = useQuery({
    queryKey: ['employees-for-invite'],
    queryFn:  () => hrApi.employees.list({ limit: 500 }).then(r => r.data.data),
    staleTime: 60_000,
  });

  const employees = (empData ?? []).filter(e => e.status === 'ACTIVE' && !!e.email);
  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    if (!q) return true;
    const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
    return fullName.includes(q) || (e.email ?? '').toLowerCase().includes(q) || (e.department ?? '').toLowerCase().includes(q);
  });

  const submit = () => {
    if (!selected) { setErr('Listeden bir personel seçin.'); return; }
    if (!selected.email) { setErr('Seçilen personelin e-posta adresi kayıtlı değil.'); return; }
    setErr('');
    onInvite(selected.email, role, `${selected.firstName} ${selected.lastName}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[540px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center w-fit text-muted-foreground mb-3">
            <UserPlus size={20} />
          </div>
          <DialogTitle className="text-lg font-semibold">Ekibe Davet Et</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            HR Servisindeki aktif personeller arasından seçim yapın
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-4 pb-2">
          <Label className="text-xs text-muted-foreground block mb-2">Personel Ara</Label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="İsim, e-posta veya departman ara..."
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null); setErr(''); }}
              className="pl-9 h-9"
            />
          </div>
        </div>

        <ScrollArea className="max-h-[280px]">
          <div className="px-6 py-2">
            <div className="rounded-lg border overflow-hidden">
              {empLoading ? (
                <div className="h-28 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">Yükleniyor...</p>
                </div>
              ) : empError ? (
                <div className="h-28 flex flex-col items-center justify-center gap-2 text-destructive">
                  <AlertCircle size={20} />
                  <p className="text-xs">Liste yüklenemedi</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="h-28 flex flex-col items-center justify-center gap-2 text-muted-foreground/50">
                  <p className="text-sm">Sonuç bulunamadı</p>
                  <p className="text-xs text-center px-6">Eşleşen personel yok veya tüm aktif personeller zaten ekibe katılmış.</p>
                </div>
              ) : filtered.map((emp) => {
                const isSelected = selected?.id === emp.id;
                const alreadyIn  = !!emp.email && existingEmails.has(emp.email);
                return (
                  <button
                    key={emp.id}
                    disabled={alreadyIn}
                    onClick={() => { setSelected(emp); setErr(''); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b last:border-none",
                      isSelected ? "bg-muted" : "hover:bg-muted/50",
                      alreadyIn && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-muted text-xs font-medium">
                        {emp.firstName[0]}{emp.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                        <Mail size={10} className="shrink-0" /> {emp.email}
                        {emp.department && <span className="opacity-60">· {emp.department}</span>}
                      </div>
                    </div>
                    {isSelected ? (
                      <div className="size-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    ) : alreadyIn ? (
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wider">Aktif Üye</Badge>
                    ) : (
                      <ChevronRight size={14} className="text-muted-foreground opacity-40" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </ScrollArea>

        <div className="px-6 pt-4 pb-2">
          <Label className="text-xs text-muted-foreground block mb-3">Rol Ataması</Label>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map(r => (
              <Button
                key={r.value}
                variant={role === r.value ? "secondary" : "outline"}
                onClick={() => setRole(r.value)}
                className="h-auto flex-col items-start gap-1 p-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{r.icon}</span>
                  <span className="text-xs font-medium">{r.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground leading-tight block truncate w-full">{r.desc}</span>
              </Button>
            ))}
          </div>
        </div>

        {err && (
          <div className="px-6 pb-2">
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertDescription className="text-xs">{err}</AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter className="px-6 pb-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button
            onClick={submit}
            disabled={isPending || !selected}
            isLoading={isPending}
          >
            <UserPlus size={14} />
            Davet Gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function KullanicilarPage() {
  const { data: session } = useSession();
  const tenantId = (session?.user as { tenantId?: string })?.tenantId ?? '';
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const { t } = useI18n();

  const { data: members, isLoading } = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn:  () => tenantApi.listMembers(tenantId).then(r => r.data),
    enabled:  !!tenantId,
    select:   (raw) => (Array.isArray(raw) ? raw : []) as TenantMember[],
    staleTime: 30_000,
  });

  const displayMembers = members ?? [];
  const activeCount   = displayMembers.filter(m => m.status === 'ACTIVE').length;
  const pendingCount  = displayMembers.filter(m => m.status === 'PENDING').length;
  const inactiveCount = displayMembers.filter(m => m.status === 'INACTIVE').length;

  const { mutate: invite, isPending: inviting } = useMutation({
    mutationFn: ({ email, role, name }: { email: string; role: MemberRole; name?: string }) =>
      tenantApi.inviteMember(tenantId, { email, role, name }),
    onSuccess: () => {
      setShowInvite(false);
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] });
    },
  });

  const { mutate: changeRole } = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: MemberRole }) =>
      tenantApi.updateMemberRole(tenantId, memberId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] });
    },
  });

  const { mutate: deactivate } = useMutation({
    mutationFn: (memberId: string) => tenantApi.deactivateMember(tenantId, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] });
    },
  });

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Başlık */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="size-9 shrink-0" asChild>
            <Link href="/ayarlar">
              <ArrowLeft size={16} />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <Users size={18} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Ekip Üyeleri</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Organizasyon yetki ve üye yönetimi</p>
            </div>
          </div>
        </div>
        <Button onClick={() => setShowInvite(true)} className="gap-2">
          <UserPlus size={14} />
          Ekibe Davet Et
        </Button>
      </div>

      {/* KPI Kart Şeridi */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Toplam Üye', value: displayMembers.length },
          { label: 'Aktif',      value: activeCount },
          { label: 'Bekleyen',   value: pendingCount },
          { label: 'Pasif',      value: inactiveCount },
        ].map(k => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="pt-4">
              <p className="text-2xl font-bold tabular-nums text-foreground leading-none">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Üye Listesi */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="border-b px-6 py-3 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <Users size={14} />
            </div>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Kayıtlı Üyeler
            </CardTitle>
          </div>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {displayMembers.length} kayıt
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Yükleniyor...</p>
            </div>
          ) : displayMembers.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground/50">
              <Users size={32} strokeWidth={1} />
              <p className="text-sm">Üye bulunamadı</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Üye Bilgileri</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Rol</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Durum</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Son İşlem</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Katılım</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayMembers.map((m) => {
                  const statusInfo = STATUS_MAP[m.status];
                  return (
                    <TableRow
                      key={m.id}
                      className={cn("hover:bg-muted/50 transition-colors group", m.status === 'INACTIVE' && "opacity-50")}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                              {avatarLetter(m.name, m.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            {m.name && <div className="text-sm font-medium text-foreground">{m.name}</div>}
                            <div className="text-xs text-muted-foreground">{m.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <RoleSelector
                          member={m}
                          onChangeRole={(id, role) => changeRole({ memberId: id, role })}
                          disabled={m.status === 'INACTIVE'}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusInfo.variant}
                          className={cn("text-xs", statusInfo.className)}
                        >
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {m.status === 'PENDING'
                            ? m.invitedAt ? formatDate(m.invitedAt) : '—'
                            : m.lastLoginAt ? formatDate(m.lastLoginAt) : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {m.joinedAt ? formatDate(m.joinedAt) : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {m.status !== 'INACTIVE' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              if (window.confirm(`${m.name ?? m.email} adlı üyeyi pasif yapmak istediğinize emin misiniz?`))
                                deactivate(m.id);
                            }}
                          >
                            Pasif Yap
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Rol Tanımları Özeti */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
          Erişim Rolü Tanımları
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {ROLES.map(r => (
            <Card key={r.value} className="shadow-sm">
              <CardContent className="p-4 flex gap-3">
                <div className="p-2 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                  {r.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{r.label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{r.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onInvite={(email, role, name) => invite({ email, role, name })}
        isPending={inviting}
        existingEmails={new Set(displayMembers.map(m => m.email))}
      />
    </div>
  );
}
