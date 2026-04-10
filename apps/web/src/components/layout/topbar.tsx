'use client';

import { useState, useEffect, Fragment } from 'react';
import { Search, Command, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { NotificationPanel } from './notification-panel';
import { usePathname } from 'next/navigation';
import { CommandPalette } from './command-palette';
import { LanguageSwitcher } from './language-switcher';
import { useI18n } from '@/hooks/use-i18n';

import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';

const ROUTE_LABELS: Record<string, string> = {
  '/':          'Dashboard',

  // Finans
  '/faturalar':          'Faturalar',
  '/faturalar/yeni':     'Yeni Fatura',
  '/muhasebe':           'Muhasebe',
  '/muhasebe/mizan':     'Mizan',
  '/muhasebe/bilanco':   'Bilanço',
  '/muhasebe/babs':      'BA/BS Formu',
  '/ar-ap':              'Alacak / Borç',
  '/ar-ap/alacaklar':    'Alacaklar',
  '/ar-ap/borclar':      'Borçlar',
  '/ar-ap/odeme-plani':  'Ödeme Planı',
  '/edefter':            'e-Defter',
  '/raporlar':           'Raporlar',

  // Stok & Depo
  '/stok':      'Stok Yönetimi',
  '/stok/hareketler': 'Stok Hareketleri',
  '/depo':      'Depolar',
  '/depo/yeni': 'Yeni Depo',
  '/duzenle':   'Düzenle',

  // Satın Alma & Sipariş (Sprint 4)
  '/satin-alma':        'Satın Alma',
  '/siparis':           'Satış Siparişleri',
  '/siparis/yeni':      'Yeni Sipariş',

  // Kasa & Banka (Sprint 4)
  '/kasa-banka':        'Kasa & Banka',

  // Duran Varlık (Sprint 4)
  '/duran-varlik':      'Duran Varlıklar',

  // Üretim & Proje (Sprint 5)
  '/uretim':            'Üretim',
  '/uretim/yeni':       'Yeni İş Emri',
  '/uretim/receteler':  'Reçeteler',
  '/uretim/receteler/yeni': 'Yeni Reçete',
  '/proje':             'Projeler',

  // Bütçe & Masraf (Sprint 5)
  '/butce':             'Bütçe',
  '/masraf':            'Masraf Yönetimi',

  // Filo
  '/filo':                  'Filo Yönetimi',
  '/filo/araclar':          'Araçlar',
  '/filo/araclar/yeni':     'Yeni Araç',
  '/filo/suruculer':        'Sürücüler',
  '/filo/suruculer/yeni':   'Yeni Sürücü',
  '/filo/seferler':         'Seferler',
  '/filo/seferler/yeni':    'Yeni Sefer',

  // Lojistik & e-Ticaret (Sprint 6)
  '/lojistik':          'Lojistik / Kargo',
  '/e-ticaret':         'e-Ticaret Entegrasyonları',

  // AI & BI (Sprint 6)
  '/ai-asistan':        'AI Muhasebe Asistanı',
  '/bi':                'BI Dashboard',

  // CRM
  '/musteri':   'Müşteriler',
  '/pipeline':  'Satış Pipeline',
  '/aktiviteler': 'Aktiviteler',

  // Stok alt sayfalar
  '/stok/yeni':       'Yeni Ürün',
  '/stok/hareket':    'Stok Hareketi Gir',
  '/stok/import':     'Toplu Ürün Aktarma',

  // Profil & Diğer
  '/profil':          'Profilim',
  '/sifre-sifirla':   'Şifre Sıfırlama',

  // İK
  '/calisanlar':      'Çalışanlar',
  '/calisanlar/yeni': 'Yeni Çalışan',
  '/bordro':          'Bordro',
  '/izin':            'İzin Yönetimi',
  '/sgk':             'SGK e-Bildirge',

  // Müşteri alt sayfalar
  '/musteri/yeni':    'Yeni Müşteri',

  // Sistem
  '/abonelik':  'Abonelik',
  '/analitik':  'Platform Analitiği',
  '/api-marketplace': 'API Marketplace',
  '/webhooks':  'Webhooklar',

  // Ayarlar
  '/ayarlar':                    'Ayarlar',
  '/ayarlar/kullanicilar':       'Ekip Üyeleri',
  '/ayarlar/white-label':        'White Label',
  '/ayarlar/doviz-kurlari':      'Döviz Kurları',
  '/ayarlar/uae-kdv':            'UAE FTA VAT',
  '/ayarlar/ksa-zatca':          'KSA ZATCA',
};

export function Topbar() {
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();
  const { t } = useI18n();
  
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === 'dark';
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const segments = pathname.split('/').filter(Boolean);
  const crumbs = [
    { label: 'Enkap', href: '/' },
    ...segments.map((seg, i) => ({
      label: ROUTE_LABELS['/' + segments.slice(0, i + 1).join('/')] ?? seg,
      href: '/' + segments.slice(0, i + 1).join('/'),
    })),
  ];

  return (
    <>
      <header className="h-16 sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-5 shrink-0 transition-[width,height] ease-linear">
        
        {/* Sol */}
        <div className="flex items-center gap-2">
          {/* Shadcn Sidebar trigger automatically handles toggle for mobile + desktop */}
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />

          <Breadcrumb>
            <BreadcrumbList>
              {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <Fragment key={crumb.href}>
                    <BreadcrumbItem>
                      {!isLast ? (
                        <BreadcrumbLink asChild>
                          <Link href={crumb.href} className="text-sm font-medium">
                            <span style={i === 0 ? { fontFamily: "'Syne', sans-serif" } : {}}>
                              {crumb.label}
                            </span>
                          </Link>
                        </BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage className="text-sm font-semibold">
                          {crumb.label}
                        </BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </Fragment>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Sağ */}
        <div className="flex items-center gap-2">
          {/* Arama */}
          <Button
            variant="outline"
            className="hidden sm:flex items-center gap-2 px-3 lg:w-64 h-9 text-muted-foreground justify-start rounded-md border-border bg-muted/40 hover:bg-muted"
            onClick={() => setCmdOpen(true)}
          >
            <Search size={14} className="shrink-0" />
            <span className="flex-1 text-left text-xs">{t("common.searchOrNavigate")}</span>
            <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded border border-border bg-background px-1.5 text-[10px] font-medium opacity-100">
              <span className="text-xs shrink-0">⌘</span>K
            </kbd>
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden w-9 h-9 text-muted-foreground"
            onClick={() => setCmdOpen(true)}
          >
            <Search size={16} />
          </Button>

          {/* Tema */}
          <Button
            variant="outline"
            size="icon"
            className="w-9 h-9 rounded-full bg-transparent border-transparent text-muted-foreground hover:text-foreground"
            onClick={toggleTheme}
            aria-label={t("common.toggleTheme")}
          >
            {mounted ? (isDark ? <Sun size={15} /> : <Moon size={15} />) : <Moon size={15} className="invisible" />}
          </Button>

          <LanguageSwitcher />
          
          <NotificationPanel />
        </div>
      </header>
      
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
