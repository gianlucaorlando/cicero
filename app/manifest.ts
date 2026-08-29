import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cicero — il viaggio, in conversazione',
    short_name: 'Cicero',
    description: 'Il compagno di viaggio che conosce il contesto e modifica il percorso mentre ne parlate.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f1e6',
    theme_color: '#a75b3f',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  };
}
