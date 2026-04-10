"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FileText, Package, Settings, Users, CreditCard,
  Building2, Webhook, TrendingUp, LogOut, Boxes, UserCheck, DollarSign,
  CalendarDays, GitBranch, Activity, Landmark, Scale, BookOpen,
  ReceiptText, Key, Paintbrush, ShieldCheck, FileSpreadsheet, History,
  FileBarChart2, UsersRound, Layers, ShoppingCart, ShoppingBag, Factory,
  FolderKanban, Wallet, Receipt, Truck, Store, Bot, BarChart2, Globe, Shield, Command
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useI18n } from "@/hooks/use-i18n";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    labelKey: "nav.main",
    items: [
      {
        href: "/",
        labelKey: "nav.dashboard",
        icon: <LayoutDashboard size={15} />,
      },
    ],
  },
  {
    labelKey: "nav.finance",
    items: [
      {
        href: "/faturalar",
        labelKey: "nav.invoices",
        icon: <FileText size={15} />,
      },
      { href: "/ar-ap", labelKey: "nav.arAp", icon: <Scale size={15} /> },
      {
        href: "/muhasebe",
        labelKey: "nav.accounting",
        icon: <BookOpen size={15} />,
      },
      {
        href: "/edefter",
        labelKey: "nav.eLedger",
        icon: <ReceiptText size={15} />,
      },
      {
        href: "/muhasebe/babs",
        labelKey: "nav.babs",
        icon: <FileSpreadsheet size={15} />,
      },
      {
        href: "/duran-varlik",
        labelKey: "nav.fixedAssets",
        icon: <Layers size={15} />,
      },
      {
        href: "/proje",
        labelKey: "nav.projects",
        icon: <FolderKanban size={15} />,
      },
      { href: "/butce", labelKey: "nav.budget", icon: <Wallet size={15} /> },
      {
        href: "/kasa-banka",
        labelKey: "nav.treasury",
        icon: <Landmark size={15} />,
      },
      {
        href: "/raporlar",
        labelKey: "nav.reports",
        icon: <FileBarChart2 size={15} />,
      },
    ],
  },
  {
    labelKey: "nav.stockPurchases",
    items: [
      { href: "/stok", labelKey: "nav.stock", icon: <Package size={15} /> },
      { href: "/depo", labelKey: "nav.warehouses", icon: <Boxes size={15} /> },
      {
        href: "/stok/hareketler",
        labelKey: "nav.stockMovements",
        icon: <History size={15} />,
      },
      {
        href: "/satin-alma",
        labelKey: "nav.purchases",
        icon: <ShoppingCart size={15} />,
      },
      {
        href: "/siparis",
        labelKey: "nav.sales",
        icon: <ShoppingBag size={15} />,
      },
      {
        href: "/irsaliyeler",
        labelKey: "nav.waybills",
        icon: <FileText size={15} />,
      },
      {
        href: "/uretim",
        labelKey: "nav.manufacturing",
        icon: <Factory size={15} />,
      },
      {
        href: "/lojistik",
        labelKey: "nav.logistics",
        icon: <Truck size={15} />,
      },
      { href: "/filo", labelKey: "nav.fleet", icon: <Truck size={15} /> },
      {
        href: "/e-ticaret",
        labelKey: "nav.ecommerce",
        icon: <Store size={15} />,
      },
    ],
  },
  {
    labelKey: "nav.crm",
    items: [
      {
        href: "/musteri",
        labelKey: "nav.customers",
        icon: <Users size={15} />,
      },
      {
        href: "/pipeline",
        labelKey: "nav.pipeline",
        icon: <GitBranch size={15} />,
      },
      {
        href: "/aktiviteler",
        labelKey: "nav.activities",
        icon: <Activity size={15} />,
      },
    ],
  },
  {
    labelKey: "nav.hr",
    items: [
      {
        href: "/calisanlar",
        labelKey: "nav.employees",
        icon: <UserCheck size={15} />,
      },
      {
        href: "/bordro",
        labelKey: "nav.payroll",
        icon: <DollarSign size={15} />,
      },
      {
        href: "/izin",
        labelKey: "nav.leaves",
        icon: <CalendarDays size={15} />,
      },
      {
        href: "/masraf",
        labelKey: "nav.expenses",
        icon: <Receipt size={15} />,
      },
      { href: "/sgk", labelKey: "nav.sgk", icon: <ShieldCheck size={15} /> },
    ],
  },
  {
    labelKey: "nav.aiAnalytics",
    items: [
      {
        href: "/ai-asistan",
        labelKey: "nav.aiAssistant",
        icon: <Bot size={15} />,
      },
      { href: "/bi", labelKey: "nav.bi", icon: <BarChart2 size={15} /> },
      {
        href: "/analitik",
        labelKey: "nav.analytics",
        icon: <TrendingUp size={15} />,
      },
    ],
  },
  {
    labelKey: "nav.management",
    items: [
      {
        href: "/abonelik",
        labelKey: "nav.subscription",
        icon: <CreditCard size={15} />,
      },
      {
        href: "/webhooks",
        labelKey: "nav.webhooks",
        icon: <Webhook size={15} />,
      },
      {
        href: "/api-marketplace",
        labelKey: "nav.apiKeys",
        icon: <Key size={15} />,
      },
      {
        href: "/ayarlar/kullanicilar",
        labelKey: "nav.teamMembers",
        icon: <UsersRound size={15} />,
      },
      {
        href: "/ayarlar/white-label",
        labelKey: "nav.whiteLabel",
        icon: <Paintbrush size={15} />,
      },
      {
        href: "/ayarlar/doviz-kurlari",
        labelKey: "nav.currency",
        icon: <DollarSign size={15} />,
      },
      {
        href: "/ayarlar/uae-kdv",
        labelKey: "nav.uae",
        icon: <Globe size={15} />,
      },
      {
        href: "/ayarlar/ksa-zatca",
        labelKey: "nav.ksa",
        icon: <Shield size={15} />,
      },
      {
        href: "/ayarlar",
        labelKey: "nav.settings",
        icon: <Settings size={15} />,
      },
    ],
  },
];

export function Sidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { data: session } = useSession();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <ShadcnSidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Command className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold" style={{ fontFamily: "'Syne', sans-serif" }}>Enkap</span>
                  <span className="text-xs">ERP</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={t(item.labelKey)}
                      >
                        <Link href={item.href}>
                          {item.icon}
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {session?.isPlatformAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-amber-500/80">{t("nav.superAdmin")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { href: "/platform/tenantlar", labelKey: "platform.tenants.title", icon: <Building2 size={15} /> },
                  { href: "/platform/yasal-parametreler", labelKey: "platform.legalParams.title", icon: <FileText size={15} /> },
                  { href: "/platform/sistem-ayarlari", labelKey: "platform.systemSettings.title", icon: <Settings size={15} /> },
                ].map((item) => {
                  const active = isActive(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={t(item.labelKey)}
                        className={active ? "text-amber-600 bg-amber-500/10 hover:bg-amber-500/20" : "text-amber-600/60 hover:text-amber-600"}
                      >
                        <Link href={item.href}>
                          {item.icon}
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {session?.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-sky-500 text-white">
                        {session.user.email?.[0]?.toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{session.user.email}</span>
                      <span className="truncate text-xs">{(session.user as any).tenantTier ?? "starter"}</span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuItem asChild>
                    <Link href="/profil" className="cursor-pointer">
                      <Users className="mr-2 h-4 w-4" />
                      {t("nav.profile")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/giris" })} className="text-destructive cursor-pointer focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    {t("auth.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
