'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, FileText, Package, BarChart3,
  Settings, Zap, Users, User, CreditCard,
  Scale, BookOpen, ReceiptText, FileSpreadsheet, Boxes,
  UserCheck, DollarSign, CalendarDays, GitBranch, Activity,
  TrendingUp, Webhook, Key, Paintbrush, ShieldCheck,
  History, FileBarChart2, Plus, ArrowUpDown, Bell,
  FileCode2, Landmark, Truck, Store, Bot, BarChart2,
  ShoppingCart, ShoppingBag, Factory, FolderKanban,
  Wallet, Layers, Receipt, Globe, Shield,
} from 'lucide-react';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

interface AppCommand {
  id:        string;
  label:     string;
  sublabel?: string;
  icon:      React.ReactNode;
  action:    () => void;
  category:  string;
  keywords:  string[];
}

interface CommandPaletteProps {
  open:    boolean;
  onClose: () => void;
}

const RECENT_KEY = 'enkap-cmd-recent';
const MAX_RECENT = 5;

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); }
  catch { return []; }
}

function pushRecent(id: string) {
  try {
    const prev = getRecent().filter(r => r !== id);
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...prev].slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setRecent(getRecent());
    }
  }, [open]);

  const navigate = useCallback((path: string, id: string) => {
    pushRecent(id);
    setRecent(getRecent());
    onClose();
    router.push(path);
  }, [router, onClose]);

  const ALL_COMMANDS: AppCommand[] = useMemo(() => [
    // ── Navigasyon ──
    { id: 'dashboard',     label: 'Dashboard',            sublabel: 'Genel bakış, KPI, AI tahmin',   icon: <LayoutDashboard size={16} className="mr-2 shrink-0"/>, action: () => navigate('/', 'dashboard'),                  category: 'Navigasyon', keywords: ['ana', 'home', 'özet', 'kpi'] },
    { id: 'faturalar',     label: 'Faturalar',             sublabel: 'e-Fatura · e-Arşiv · Satın Alma', icon: <FileText size={16} className="mr-2 shrink-0"/>,     action: () => navigate('/faturalar', 'faturalar'),         category: 'Navigasyon', keywords: ['invoice', 'fatura', 'gib', 'efatura'] },
    { id: 'ar-ap',         label: 'Alacak / Borç',        sublabel: 'AR/AP yaşlandırma özeti',        icon: <Scale size={16} className="mr-2 shrink-0"/>,           action: () => navigate('/ar-ap', 'ar-ap'),                 category: 'Navigasyon', keywords: ['arap', 'alacak', 'borc', 'aging'] },
    { id: 'alacaklar',     label: 'Alacaklar',             sublabel: 'Vadesi geçmiş alacaklar',        icon: <Scale size={16} className="mr-2 shrink-0"/>,           action: () => navigate('/ar-ap/alacaklar', 'alacaklar'),   category: 'Navigasyon', keywords: ['alacak', 'receivable'] },
    { id: 'borclar',       label: 'Borçlar',               sublabel: 'Tedarikçi borç takibi',          icon: <Scale size={16} className="mr-2 shrink-0"/>,           action: () => navigate('/ar-ap/borclar', 'borclar'),       category: 'Navigasyon', keywords: ['borc', 'payable', 'tedarikci'] },
    { id: 'muhasebe',      label: 'Muhasebe',              sublabel: 'Mizan · Bilanço',                icon: <BookOpen size={16} className="mr-2 shrink-0"/>,        action: () => navigate('/muhasebe', 'muhasebe'),           category: 'Navigasyon', keywords: ['muhasebe', 'mizan', 'bilanco'] },
    { id: 'mizan',         label: 'Mizan Raporu',          sublabel: 'Hesap bazlı borç/alacak',        icon: <BookOpen size={16} className="mr-2 shrink-0"/>,        action: () => navigate('/muhasebe/mizan', 'mizan'),        category: 'Navigasyon', keywords: ['mizan', 'hesap', 'tdhp'] },
    { id: 'bilanco',       label: 'Bilanço',               sublabel: 'Aktif / Pasif',                  icon: <Landmark size={16} className="mr-2 shrink-0"/>,        action: () => navigate('/muhasebe/bilanco', 'bilanco'),    category: 'Navigasyon', keywords: ['bilanco', 'aktif', 'pasif'] },
    { id: 'edefter',       label: 'e-Defter',              sublabel: 'GİB e-Defter gönderim',          icon: <ReceiptText size={16} className="mr-2 shrink-0"/>,     action: () => navigate('/edefter', 'edefter'),             category: 'Navigasyon', keywords: ['edefter', 'gib', 'yevmiye'] },
    { id: 'babs',          label: 'BA/BS Formu',           sublabel: 'Aylık alış-satış bildirimi',     icon: <FileSpreadsheet size={16} className="mr-2 shrink-0"/>, action: () => navigate('/muhasebe/babs', 'babs'),          category: 'Navigasyon', keywords: ['babs', 'ba', 'bs', 'bildirim'] },
    { id: 'raporlar',      label: 'Raporlar',              sublabel: 'PDF · Excel · XML indirme',      icon: <FileBarChart2 size={16} className="mr-2 shrink-0"/>,   action: () => navigate('/raporlar', 'raporlar'),           category: 'Navigasyon', keywords: ['rapor', 'report', 'pdf', 'excel', 'indir'] },
    { id: 'stok',          label: 'Stok Ürünleri',         sublabel: 'Ürün listesi ve detayları',      icon: <Package size={16} className="mr-2 shrink-0"/>,         action: () => navigate('/stok', 'stok'),                   category: 'Navigasyon', keywords: ['stok', 'urun', 'product', 'barkod'] },
    { id: 'depo',          label: 'Depolar',               sublabel: 'Depo listesi ve dağılımı',       icon: <Boxes size={16} className="mr-2 shrink-0"/>,           action: () => navigate('/depo', 'depo'),                   category: 'Navigasyon', keywords: ['depo', 'warehouse'] },
    { id: 'hareketler',    label: 'Hareket Geçmişi',       sublabel: 'Tüm stok hareketleri',           icon: <History size={16} className="mr-2 shrink-0"/>,         action: () => navigate('/stok/hareketler', 'hareketler'),  category: 'Navigasyon', keywords: ['hareket', 'giris', 'cikis', 'transfer'] },
    { id: 'musteri',       label: 'Müşteriler',            sublabel: 'Müşteri ve tedarikçi listesi',   icon: <Users size={16} className="mr-2 shrink-0"/>,           action: () => navigate('/musteri', 'musteri'),             category: 'Navigasyon', keywords: ['musteri', 'customer', 'tedarikci', 'vkn'] },
    { id: 'pipeline',      label: 'Pipeline',              sublabel: 'Lead Kanban board',              icon: <GitBranch size={16} className="mr-2 shrink-0"/>,       action: () => navigate('/pipeline', 'pipeline'),           category: 'Navigasyon', keywords: ['pipeline', 'lead', 'kanban', 'firsat'] },
    { id: 'aktiviteler',   label: 'Aktiviteler',           sublabel: 'Müşteri aktivite takibi',        icon: <Activity size={16} className="mr-2 shrink-0"/>,        action: () => navigate('/aktiviteler', 'aktiviteler'),     category: 'Navigasyon', keywords: ['aktivite', 'gorev', 'toplanti'] },
    { id: 'calisanlar',    label: 'Çalışanlar',            sublabel: 'Personel listesi',               icon: <UserCheck size={16} className="mr-2 shrink-0"/>,       action: () => navigate('/calisanlar', 'calisanlar'),       category: 'Navigasyon', keywords: ['calisan', 'personel', 'employee', 'hr', 'ik'] },
    { id: 'bordro',        label: 'Bordro',                sublabel: 'Dönem bordro hesaplama',         icon: <DollarSign size={16} className="mr-2 shrink-0"/>,      action: () => navigate('/bordro', 'bordro'),               category: 'Navigasyon', keywords: ['bordro', 'maas', 'payroll', 'sgk'] },
    { id: 'izin',          label: 'İzin Talepleri',        sublabel: 'Onay bekleyen izinler',          icon: <CalendarDays size={16} className="mr-2 shrink-0"/>,    action: () => navigate('/izin', 'izin'),                   category: 'Navigasyon', keywords: ['izin', 'leave', 'tatil'] },
    { id: 'sgk',           label: 'SGK e-Bildirge',        sublabel: 'SGK XML indirme ve önizleme',    icon: <ShieldCheck size={16} className="mr-2 shrink-0"/>,     action: () => navigate('/sgk', 'sgk'),                     category: 'Navigasyon', keywords: ['sgk', 'bildirge', 'prim'] },
    { id: 'analitik',      label: 'Analitik',              sublabel: 'Platform genel bakış (admin)',   icon: <TrendingUp size={16} className="mr-2 shrink-0"/>,      action: () => navigate('/analitik', 'analitik'),           category: 'Navigasyon', keywords: ['analitik', 'cohort', 'mrr', 'arr'] },
    { id: 'abonelik',      label: 'Abonelik',              sublabel: 'Plan ve kullanım gösterimi',     icon: <CreditCard size={16} className="mr-2 shrink-0"/>,      action: () => navigate('/abonelik', 'abonelik'),           category: 'Navigasyon', keywords: ['abonelik', 'plan', 'fatura', 'billing'] },
    { id: 'webhooks',      label: 'Webhook Hub',           sublabel: 'Webhook abonelikleri',           icon: <Webhook size={16} className="mr-2 shrink-0"/>,         action: () => navigate('/webhooks', 'webhooks'),           category: 'Navigasyon', keywords: ['webhook', 'outbox', 'event'] },
    { id: 'api-market',    label: 'API Anahtarları',       sublabel: 'OAuth2 istemci yönetimi',        icon: <Key size={16} className="mr-2 shrink-0"/>,             action: () => navigate('/api-marketplace', 'api-market'), category: 'Navigasyon', keywords: ['api', 'key', 'oauth', 'token'] },
    { id: 'white-label',   label: 'White Label',           sublabel: 'Marka · subdomain · renkler',   icon: <Paintbrush size={16} className="mr-2 shrink-0"/>,      action: () => navigate('/ayarlar/white-label', 'white-label'), category: 'Navigasyon', keywords: ['marka', 'logo', 'white', 'label'] },
    { id: 'profil',        label: 'Profilim',              sublabel: 'Hesap bilgileri · şifre değiştir', icon: <User size={16} className="mr-2 shrink-0"/>,           action: () => navigate('/profil', 'profil'),               category: 'Navigasyon', keywords: ['profil', 'hesap', 'sifre', 'kullanici'] },
    { id: 'ayarlar',       label: 'Ayarlar',               sublabel: 'Şirket profili · fatura prefix', icon: <Settings size={16} className="mr-2 shrink-0"/>,       action: () => navigate('/ayarlar', 'ayarlar'),             category: 'Navigasyon', keywords: ['ayar', 'settings', 'profil', 'sirket'] },
    
    // ── Sprint 4-5 ──
    { id: 'satin-alma',    label: 'Satın Alma (PO)',       sublabel: 'Satın alma siparişleri',          icon: <ShoppingCart size={16} className="mr-2 shrink-0"/>,   action: () => navigate('/satin-alma', 'satin-alma'),       category: 'Navigasyon', keywords: ['satin', 'alma', 'purchase', 'po', 'tedarik'] },
    { id: 'siparis',       label: 'Satış Siparişi',        sublabel: 'Müşteri sipariş yönetimi',        icon: <ShoppingBag size={16} className="mr-2 shrink-0"/>,    action: () => navigate('/siparis', 'siparis'),             category: 'Navigasyon', keywords: ['siparis', 'satis', 'order', 'sevkiyat'] },
    { id: 'uretim',        label: 'Üretim / İş Emri',      sublabel: 'BOM, MRP ve iş emirleri',         icon: <Factory size={16} className="mr-2 shrink-0"/>,        action: () => navigate('/uretim', 'uretim'),               category: 'Navigasyon', keywords: ['uretim', 'is', 'emri', 'bom', 'mrp', 'manufacturing'] },
    { id: 'proje',         label: 'Projeler',              sublabel: 'Proje K/Z ve bütçe takibi',       icon: <FolderKanban size={16} className="mr-2 shrink-0"/>,   action: () => navigate('/proje', 'proje'),                 category: 'Navigasyon', keywords: ['proje', 'project', 'kaz', 'butce'] },
    { id: 'duran-varlik',  label: 'Duran Varlıklar',       sublabel: 'Amortisman ve varlık yönetimi',   icon: <Layers size={16} className="mr-2 shrink-0"/>,         action: () => navigate('/duran-varlik', 'duran-varlik'),   category: 'Navigasyon', keywords: ['duran', 'varlik', 'asset', 'amortisman'] },
    { id: 'butce',         label: 'Bütçe',                 sublabel: 'Bütçe planlama ve varyans',       icon: <Wallet size={16} className="mr-2 shrink-0"/>,         action: () => navigate('/butce', 'butce'),                 category: 'Navigasyon', keywords: ['butce', 'budget', 'varyans', 'plan'] },
    { id: 'kasa-banka',    label: 'Kasa & Banka',          sublabel: 'Nakit, banka ve transferler',     icon: <Landmark size={16} className="mr-2 shrink-0"/>,       action: () => navigate('/kasa-banka', 'kasa-banka'),       category: 'Navigasyon', keywords: ['kasa', 'banka', 'nakit', 'tahsilat', 'odeme', 'treasury'] },
    { id: 'masraf',        label: 'Masraf Raporları',       sublabel: 'Çalışan masraf ve onay akışı',    icon: <Receipt size={16} className="mr-2 shrink-0"/>,        action: () => navigate('/masraf', 'masraf'),               category: 'Navigasyon', keywords: ['masraf', 'expense', 'harcama', 'fiş'] },
    
    // ── Sprint 6-7 ──
    { id: 'lojistik',      label: 'Lojistik / Kargo',      sublabel: 'Gönderi takibi, Aras/Yurtiçi/PTT', icon: <Truck size={16} className="mr-2 shrink-0"/>,         action: () => navigate('/lojistik', 'lojistik'),           category: 'Navigasyon', keywords: ['lojistik', 'kargo', 'gonderı', 'takip', 'aras', 'yurtici'] },
    { id: 'e-ticaret',     label: 'e-Ticaret',             sublabel: 'WooCommerce · Shopify · Ticimax',  icon: <Store size={16} className="mr-2 shrink-0"/>,          action: () => navigate('/e-ticaret', 'e-ticaret'),         category: 'Navigasyon', keywords: ['eticaret', 'woocommerce', 'shopify', 'ticimax', 'ideasoft', 'magaza'] },
    { id: 'ai-asistan',    label: 'AI Asistan',            sublabel: 'Türkçe muhasebe asistanı',        icon: <Bot size={16} className="mr-2 shrink-0"/>,            action: () => navigate('/ai-asistan', 'ai-asistan'),       category: 'Navigasyon', keywords: ['ai', 'asistan', 'gpt', 'chat', 'llm', 'yapay', 'zeka'] },
    { id: 'bi',            label: 'BI & Raporlama',        sublabel: 'Dashboard builder, cron rapor',   icon: <BarChart2 size={16} className="mr-2 shrink-0"/>,      action: () => navigate('/bi', 'bi'),                       category: 'Navigasyon', keywords: ['bi', 'dashboard', 'rapor', 'widget', 'analiz'] },
    { id: 'doviz',         label: 'Döviz Kurları',         sublabel: 'TCMB kurları ve çoklu para',      icon: <DollarSign size={16} className="mr-2 shrink-0"/>,     action: () => navigate('/ayarlar/doviz-kurlari', 'doviz'), category: 'Navigasyon', keywords: ['doviz', 'kur', 'currency', 'usd', 'eur', 'tcmb'] },
    { id: 'uae-kdv',       label: 'UAE KDV (FTA)',         sublabel: 'BAE vergi sistemi ayarları',      icon: <Globe size={16} className="mr-2 shrink-0"/>,          action: () => navigate('/ayarlar/uae-kdv', 'uae-kdv'),     category: 'Navigasyon', keywords: ['uae', 'bae', 'kdv', 'fta', 'trn', 'dubai'] },
    { id: 'ksa-zatca',     label: 'KSA ZATCA',             sublabel: 'Suudi Arabistan e-Fatura',        icon: <Shield size={16} className="mr-2 shrink-0"/>,         action: () => navigate('/ayarlar/ksa-zatca', 'ksa-zatca'), category: 'Navigasyon', keywords: ['ksa', 'zatca', 'suudi', 'arabistan', 'zakat', 'csid'] },
    { id: 'ekip',          label: 'Ekip Üyeleri',          sublabel: 'Kullanıcı ve rol yönetimi',       icon: <Users size={16} className="mr-2 shrink-0"/>,          action: () => navigate('/ayarlar/kullanicilar', 'ekip'),   category: 'Navigasyon', keywords: ['ekip', 'kullanici', 'rol', 'davet', 'team'] },

    // ── Hızlı İşlemler ──
    { id: 'yeni-fatura',   label: 'Yeni Fatura Oluştur',   sublabel: 'e-Fatura / e-Arşiv',            icon: <Zap size={16} className="mr-2 shrink-0"/>,             action: () => navigate('/faturalar/yeni', 'yeni-fatura'), category: 'Hızlı İşlem', keywords: ['yeni', 'fatura', 'olustur', 'ekle'] },
    { id: 'yeni-musteri',  label: 'Yeni Müşteri Ekle',     sublabel: 'VKN / TCKN ile kayıt',          icon: <Plus size={16} className="mr-2 shrink-0"/>,            action: () => navigate('/musteri/yeni', 'yeni-musteri'),  category: 'Hızlı İşlem', keywords: ['yeni', 'musteri', 'ekle', 'vkn'] },
    { id: 'yeni-calisan',  label: 'Yeni Çalışan Ekle',     sublabel: 'Personel kaydı',                 icon: <Plus size={16} className="mr-2 shrink-0"/>,            action: () => navigate('/calisanlar/yeni', 'yeni-calisan'), category: 'Hızlı İşlem', keywords: ['yeni', 'calisan', 'personel', 'ekle'] },
    { id: 'yeni-urun',     label: 'Yeni Ürün Ekle',        sublabel: 'Stok ürünü oluştur',             icon: <Plus size={16} className="mr-2 shrink-0"/>,            action: () => navigate('/stok/yeni', 'yeni-urun'),        category: 'Hızlı İşlem', keywords: ['yeni', 'urun', 'stok', 'ekle'] },
    { id: 'stok-hareket',  label: 'Stok Hareketi Gir',     sublabel: 'Giriş · Çıkış · Transfer',      icon: <ArrowUpDown size={16} className="mr-2 shrink-0"/>,     action: () => navigate('/stok/hareket', 'stok-hareket'),  category: 'Hızlı İşlem', keywords: ['hareket', 'stok', 'giris', 'cikis', 'transfer'] },
    { id: 'stok-import',   label: 'Toplu Ürün İçe Aktar',  sublabel: 'Excel/CSV import',               icon: <FileCode2 size={16} className="mr-2 shrink-0"/>,       action: () => navigate('/stok/import', 'stok-import'),    category: 'Hızlı İşlem', keywords: ['import', 'excel', 'toplu', 'yukle'] },
    { id: 'raporlar-indir',label: 'Rapor İndir',            sublabel: 'PDF · Excel · XML',              icon: <BarChart3 size={16} className="mr-2 shrink-0"/>,       action: () => navigate('/raporlar', 'raporlar-indir'),    category: 'Hızlı İşlem', keywords: ['rapor', 'indir', 'pdf', 'excel'] },
    { id: 'bildirimler',   label: 'Bildirimler',            sublabel: 'Sistem uyarıları',               icon: <Bell size={16} className="mr-2 shrink-0"/>,            action: () => { onClose(); },                             category: 'Hızlı İşlem', keywords: ['bildirim', 'uyari', 'notification'] },
  ], [navigate, onClose]);

  const recentCommands = useMemo(() => {
    return recent
      .map(id => ALL_COMMANDS.find(c => c.id === id))
      .filter((c): c is AppCommand => !!c);
  }, [recent, ALL_COMMANDS]);

  const navs = ALL_COMMANDS.filter(c => c.category === 'Navigasyon');
  const quicks = ALL_COMMANDS.filter(c => c.category === 'Hızlı İşlem');

  return (
    <CommandDialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <Command>
        <CommandInput placeholder="Sayfa veya komut arayın..." />
        <CommandList>
          <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
          
          {recentCommands.length > 0 && (
            <CommandGroup heading="Son Kullanılanlar">
              {recentCommands.map(cmd => (
                <CommandItem
                  key={cmd.id}
                  value={`${cmd.label} ${cmd.keywords.join(' ')}`}
                  onSelect={() => cmd.action()}
                >
                  {cmd.icon}
                  <div className="flex flex-col ml-1">
                    <span>{cmd.label}</span>
                    {cmd.sublabel && <span className="text-xs text-muted-foreground">{cmd.sublabel}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          
          {recentCommands.length > 0 && <CommandSeparator />}

          <CommandGroup heading="Navigasyon">
            {navs.map(cmd => (
              <CommandItem
                key={cmd.id}
                value={`${cmd.label} ${cmd.category} ${cmd.keywords.join(' ')}`}
                onSelect={() => cmd.action()}
              >
                {cmd.icon}
                <div className="flex flex-col ml-1">
                  <span>{cmd.label}</span>
                  {cmd.sublabel && <span className="text-xs text-muted-foreground">{cmd.sublabel}</span>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Hızlı İşlemler">
            {quicks.map(cmd => (
              <CommandItem
                key={cmd.id}
                value={`${cmd.label} ${cmd.category} ${cmd.keywords.join(' ')}`}
                onSelect={() => cmd.action()}
              >
                {cmd.icon}
                <div className="flex flex-col ml-1">
                  <span>{cmd.label}</span>
                  {cmd.sublabel && <span className="text-xs text-muted-foreground">{cmd.sublabel}</span>}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>

        </CommandList>
      </Command>
    </CommandDialog>
  );
}
