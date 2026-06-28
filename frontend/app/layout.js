import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/context/CartContext';
import { ToastProvider } from '@/components/Toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import FloatingChat from '@/components/FloatingChat';
import Script from 'next/script';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' });

export const metadata = {
  metadataBase: new URL('https://amberflow.in'),
  title: {
    default: 'AmberFlow | Premium Organic Honey',
    template: '%s | AmberFlow',
  },
  description: 'Discover the finest organic honey, sustainably harvested from Indian farms. Pure, raw, and full of nature\'s golden goodness.',
  openGraph: {
    title: 'AmberFlow | Premium Organic Honey',
    description: 'Discover the finest organic honey, sustainably harvested from Indian farms. Pure, raw, and full of nature\'s golden goodness.',
    url: 'https://amberflow.in',
    siteName: 'AmberFlow',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1587049352847-81a56d773c16?w=1200&q=80',
        width: 1200,
        height: 630,
        alt: 'AmberFlow Organic Honey',
      },
    ],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AmberFlow | Premium Organic Honey',
    description: 'Discover the finest organic honey, sustainably harvested from Indian farms.',
    images: ['https://images.unsplash.com/photo-1587049352847-81a56d773c16?w=1200&q=80'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="scroll-smooth" data-scroll-behavior="smooth">
      <body
        className={`${inter.variable} ${playfair.variable} font-sans mesh-bg text-gray-100 antialiased`}
      >
        <ToastProvider>
          <CartProvider>
            <Navbar />
            <main className="min-h-screen">
              {children}
            </main>
            <FloatingChat />
            <Footer />
          </CartProvider>
        </ToastProvider>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-0L8ZEZP3Q7" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-0L8ZEZP3Q7');
          `}
        </Script>
      </body>
    </html>
  );
}