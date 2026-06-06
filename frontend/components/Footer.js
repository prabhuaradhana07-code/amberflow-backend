import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gradient-footer text-amber-100">
      {/* Decorative top border */}
      <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />

      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2 text-2xl font-bold text-white mb-4 hover:text-amber-300 transition-colors">
              <span className="text-3xl">🍯</span>
              <span style={{ fontFamily: 'var(--font-playfair), serif' }}>AmberFlow</span>
            </Link>
            <p className="text-amber-200/70 text-sm leading-relaxed mt-3">
              Crafted with care from the finest apiaries across India. Every jar tells a story of
              tradition, purity, and the golden essence of nature.
            </p>
            {/* Organic Badge */}
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-800/40 border border-amber-700/40">
              <span className="text-sm">🌿</span>
              <span className="text-xs font-medium text-amber-300 tracking-wide uppercase">
                100% Organic · Sustainably Harvested
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-5 flex items-center gap-2">
              <span className="w-6 h-px bg-amber-500 inline-block" />
              Quick Links
            </h3>
            <ul className="space-y-3">
              {[
                { href: '/', label: 'Shop All Honey' },
                { href: '/cart', label: 'Shopping Cart' },
                { href: '/login', label: 'Sign In' },
                { href: '/dashboard', label: 'My Dashboard' },
                { href: '/vendor/register', label: 'Become a Vendor' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-amber-200/70 hover:text-amber-300 transition-colors text-sm flex items-center gap-2 group"
                  >
                    <span className="text-amber-500/50 group-hover:text-amber-400 transition-colors text-xs">›</span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-5 flex items-center gap-2">
              <span className="w-6 h-px bg-amber-500 inline-block" />
              Contact Us
            </h3>
            <ul className="space-y-3 text-sm text-amber-200/70">
              <li className="flex items-start gap-3">
                <span className="mt-0.5">📍</span>
                <span>Sundarbans Honey Farm<br />West Bengal, India 743370</span>
              </li>
              <li className="flex items-center gap-3">
                <span>📧</span>
                <a href="mailto:hello@amberflow.com" className="hover:text-amber-300 transition-colors">
                  hello@amberflow.com
                </a>
              </li>
              <li className="flex items-center gap-3">
                <span>📞</span>
                <a href="tel:+919876543210" className="hover:text-amber-300 transition-colors">
                  +91 98765 43210
                </a>
              </li>
            </ul>
          </div>

          {/* Social & Newsletter */}
          <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-5 flex items-center gap-2">
              <span className="w-6 h-px bg-amber-500 inline-block" />
              Follow Us
            </h3>
            <p className="text-amber-200/70 text-sm mb-4">
              Join our hive for updates, recipes, and exclusive offers.
            </p>
            <div className="flex gap-3">
              {[
                { icon: '📘', label: 'Facebook', href: '#' },
                { icon: '📸', label: 'Instagram', href: '#' },
                { icon: '🐦', label: 'Twitter', href: '#' },
              ].map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="w-10 h-10 rounded-full bg-amber-800/50 border border-amber-700/40 flex items-center justify-center hover:bg-amber-700/60 hover:border-amber-600/50 hover:scale-110 transition-all duration-300"
                >
                  <span className="text-lg">{social.icon}</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-amber-800/40 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-amber-200/50 text-xs">
              © {currentYear} AmberFlow. All rights reserved. Crafted with 🤎 in India.
            </p>
            <div className="flex gap-6 text-xs text-amber-200/50">
              <a href="#" className="hover:text-amber-300 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-amber-300 transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-amber-300 transition-colors">Shipping Info</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
