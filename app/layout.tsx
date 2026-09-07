import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://cicero-travel-companion.hiddenstat.chatgpt.site'),
  title: 'Cicero — il viaggio, in conversazione',
  description: 'Un compagno di viaggio che conosce il contesto, ricorda le tue preferenze e modifica il percorso mentre ne parlate.',
  applicationName: 'Cicero',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  openGraph: {
    title: 'Cicero — il viaggio, in conversazione',
    description: 'Contesto reale, memoria e un itinerario che cambia mentre ne parlate.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Cicero — Il viaggio, in conversazione.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cicero — il viaggio, in conversazione',
    description: 'Contesto reale, memoria e un itinerario che cambia mentre ne parlate.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Splash screen: server-rendered with inline styles so it covers the page before the stylesheet and the map arrive. */}
        <div id="app-splash" aria-live="polite" aria-busy="true" aria-label="Cicero si sta caricando">
          <style>{`
            #app-splash{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#f7f1e6;color:#3d2c22;font-family:var(--font-geist-sans),system-ui,sans-serif;transition:opacity .35s ease}
            #app-splash.is-hidden{opacity:0;pointer-events:none}
            #app-splash svg{width:72px;height:72px;border-radius:22px;box-shadow:0 12px 32px rgba(167,91,63,.28)}
            #app-splash strong{font-size:22px;letter-spacing:-.01em}
            #app-splash small{color:#7a6a5f;font-size:13px}
            #app-splash .app-splash-bar{width:120px;height:4px;border-radius:999px;background:rgba(167,91,63,.18);overflow:hidden}
            #app-splash .app-splash-bar i{display:block;width:40%;height:100%;border-radius:999px;background:#a75b3f;animation:app-splash-slide 1.1s ease-in-out infinite}
            @keyframes app-splash-slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
          `}</style>
          <svg viewBox="0 0 512 512" width={72} height={72} aria-hidden="true">
            <rect width="512" height="512" rx="128" fill="#a75b3f" />
            <path d="M160 352 235 140c7-19 34-19 41 0l76 212c7 21-16 38-34 25l-62-45-62 45c-18 13-41-4-34-25Z" fill="#fff8ec" />
            <circle cx="256" cy="269" r="28" fill="#738168" />
          </svg>
          <strong>Cicero</strong>
          <span className="app-splash-bar" aria-hidden="true"><i /></span>
          <small>Preparo mappa e conversazione…</small>
        </div>
        {children}
      </body>
    </html>
  );
}
