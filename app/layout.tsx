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
        {children}
      </body>
    </html>
  );
}
