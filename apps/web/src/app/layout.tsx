import { Geist, Geist_Mono, Inter, Raleway } from "next/font/google"

import "./globals.css"
import { cn } from "@/lib/utils";
import { Metadata } from "next";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: { template: '%s · Enkap ERP', default: 'Enkap ERP' },
  description: 'Türkiye KOBİ\'leri için AI destekli ERP platformu',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Enkap ERP',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};


const ralewayHeading = Raleway({ subsets: ['latin'], variable: '--font-heading' });

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="tr"
      dir="ltr"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable, ralewayHeading.variable)}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
