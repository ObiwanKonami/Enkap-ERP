'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Bell, Check, CheckCheck, AlertTriangle,
  TrendingDown, FileText, CalendarDays,
  Package, ShieldAlert, Info, Loader2, RefreshCw, X
} from 'lucide-react';

import { notificationApi, type Notification, type NotifCategory, type NotifLevel } from '@/services/notification';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function timeAgo(ts: string | Date): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60)    return 'Az önce';
  if (diff < 3600)  return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  return `${Math.floor(diff / 86400)} gün önce`;
}

const LEVEL_META: Record<NotifLevel, { color: string; bg: string; border: string }> = {
  error:   { color: 'text-red-500',    bg: 'bg-red-500/10',    border: 'border-red-500/20' },
  warning: { color: 'text-amber-500',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  info:    { color: 'text-sky-500',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20' },
  success: { color: 'text-emerald-500',bg: 'bg-emerald-500/10',border: 'border-emerald-500/20' },
};

const CAT_ICON: Record<NotifCategory, React.ReactNode> = {
  finans: <FileText size={13}/>,
  stok:   <Package size={13}/>,
  ik:     <CalendarDays size={13}/>,
  sistem: <ShieldAlert size={13}/>,
};

const LEVEL_ICON: Record<NotifLevel, React.ReactNode> = {
  error:   <AlertTriangle size={12}/>,
  warning: <TrendingDown size={12}/>,
  info:    <Info size={12}/>,
  success: <Check size={12}/>,
};

// ─── NotifItem ────────────────────────────────────────────────────────────────

function NotifItem({
  n,
  onRead,
  onClosePanel
}: {
  n:      Notification;
  onRead: (id: string) => void;
  onClosePanel: () => void;
}) {
  const meta = LEVEL_META[n.level];

  const handleClick = () => {
    if (!n.isRead) onRead(n.id);
    if (n.href) {
      onClosePanel();
    }
  };

  const content = (
    <div
      onClick={handleClick}
      className={cn(
        "group relative flex gap-3 p-3 border-b transition-colors cursor-pointer",
        n.isRead ? "bg-transparent hover:bg-muted/50" : "bg-sky-500/5 hover:bg-muted"
      )}
    >
      {/* Okunmadı Noktası */}
      {!n.isRead && (
        <span className="absolute left-2.5 top-[18px] h-1.5 w-1.5 rounded-full bg-sky-500" />
      )}

      {/* İkon */}
      <div 
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border ml-2",
          meta.bg, meta.border, meta.color
        )}
      >
        {LEVEL_ICON[n.level]}
      </div>

      {/* İçerik */}
      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span 
            className={cn(
              "text-xs flex-1 truncate", 
              n.isRead ? "font-medium text-muted-foreground" : "font-semibold text-foreground"
            )}
          >
            {n.title}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
            {timeAgo(n.createdAt)}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
          {n.body}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={cn("opacity-80", meta.color)}>{CAT_ICON[n.category]}</span>
          <span className="text-[10px] text-muted-foreground capitalize">{n.category}</span>
        </div>
      </div>
    </div>
  );

  if (n.href) {
    return <Link href={n.href} className="block no-underline">{content}</Link>;
  }

  return content;
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

export function NotificationPanel() {
  const [open,    setOpen]    = useState(false);
  const [notifs,  setNotifs]  = useState<Notification[]>([]);
  const [unread,  setUnread]  = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await notificationApi.list({ limit: 50 });
      setNotifs(res.items ?? []);
      setUnread(res.unread ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadNotifications();
    }
  }, [open, loadNotifications]);

  useEffect(() => {
    const fetchUnread = () => {
      notificationApi.list({ limit: 1, unreadOnly: true })
        .then(r => setUnread(r.unread))
        .catch(() => { /* sessiz */ });
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60_000);
    return () => clearInterval(interval);
  }, []);

  const markRead = async (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
    try {
      await notificationApi.markRead(id);
    } catch {
      void loadNotifications();
    }
  };

  const markAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await notificationApi.markAllRead();
    } catch {
      void loadNotifications();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative w-9 h-9 rounded-full",
            open ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
          aria-label={`Bildirimler${unread > 0 ? ` (${unread} okunmadı)` : ''}`}
        >
          <Bell size={16} />
          {unread > 0 && (
            <Badge 
              variant="destructive" 
              className={cn(
                "absolute -top-0.5 -right-0.5 h-4 min-w-4 flex items-center justify-center p-0 text-[9px] font-bold rounded-full",
                unread > 3 ? "bg-red-500" : "bg-amber-500"
              )}
            >
              {unread > 9 ? '9+' : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent 
        className="w-[360px] p-0 rounded-xl overflow-hidden shadow-xl" 
        align="end" 
        sideOffset={8}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-sky-500" />
            <span className="text-[13px] font-semibold text-foreground">Bildirimler</span>
            {unread > 0 && (
              <Badge variant="secondary" className="bg-sky-500/15 text-sky-500 hover:bg-sky-500/25 px-1.5 py-0 h-4 text-[10px] items-center border-sky-500/20">
                {unread} yeni
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-sm text-muted-foreground hover:text-foreground"
              onClick={() => void loadNotifications()}
              disabled={loading}
              title="Yenile"
            >
              <RefreshCw size={12} className={cn(loading && "animate-spin")} />
            </Button>
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] rounded-sm text-muted-foreground hover:text-foreground"
                onClick={() => void markAllRead()}
                title="Tümünü okundu işaretle"
              >
                <CheckCheck size={12} className="mr-1.5" />
                Oku
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-sm text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <X size={14} />
            </Button>
          </div>
        </div>

        {/* Liste */}
        <ScrollArea className="h-[380px] w-full bg-background" style={{ scrollBehavior: 'smooth' }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 size={24} className="animate-spin mb-3 text-sky-500/80" />
              <span className="text-xs">Bildirimler yükleniyor...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertTriangle size={24} className="mb-3 text-red-500/80" />
              <span className="text-xs mb-2">Bildirimler yüklenemedi</span>
              <Button variant="link" size="sm" className="h-auto text-xs text-sky-500 p-0" onClick={() => void loadNotifications()}>
                Tekrar Dene
              </Button>
            </div>
          ) : notifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell size={28} className="mb-3 opacity-20" />
              <span className="text-xs">Henüz bildirim bulunmuyor</span>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifs.map(n => (
                <NotifItem 
                  key={n.id} 
                  n={n} 
                  onRead={id => void markRead(id)} 
                  onClosePanel={() => setOpen(false)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-2.5 border-t bg-muted/40 text-center">
          <span className="text-[10px] text-muted-foreground">
            {(notifs?.length ?? 0) > 0 ? `${notifs.length} bildirim gösteriliyor` : 'Son bildirimler gösteriliyor'}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
