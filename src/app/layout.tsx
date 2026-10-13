import { ClerkProvider } from '@clerk/nextjs';
import { shadcn } from '@clerk/ui/themes';
import type { Metadata } from 'next';
import { Geist_Mono, Poppins } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Ticketera — Compra entradas para tus eventos favoritos',
  description:
    'Encuentra y compra entradas para conciertos, deportes, teatro y festivales cerca de ti.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="es"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider appearance={{ theme: shadcn }}><Providers>{children}</Providers></ClerkProvider>
      </body>
    </html>
  );
}
