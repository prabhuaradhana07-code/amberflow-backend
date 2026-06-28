'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';

export default function Navbar() {
  const { count } = useCart();
  const [user, setUser] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [prevCount, setPrevCount] = useState(0);
  const [badgeAnimate, setBadgeAnimate] = useState(false);

  // Load user from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('user');
      if (saved) setUser(JSON.parse(saved));
    } catch (e) {
      console.warn('Failed to load user:', e);
    }

    const handleStorage = () => {
      try {
        const saved = localStorage.getItem('user');
        setUser(saved ? JSON.parse(saved) : null);
      } catch (e) {
        setUser(null);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Detect scroll for glassmorphism effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Animate badge when count changes
  useEffect(() => {
    if (count > prevCount && prevCount !== 0) {
      setBadgeAnimate(true);
      const timer = setTimeout(() => setBadgeAnimate(false), 300);
      return () => clearTimeout(timer);
    }
    setPrevCount(count);
  }, [count, prevCount]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
    setIsMenuOpen(false);
    window.location.href = '/';
  }, []);

  const navLinks = [
    { href: '/', label: 'Shop' },
    { href: '/cart', label: 'Cart', badge: count },
    { href: '/dashboard', label: 'Dashboard' },
  ];

  if (user && user.role === 'admin') {
    navLinks.push({ href: '/admin', label: 'Admin Panel' });
  }

  if (user && user.role === 'vendor') {
    navLinks.push({ href: '/vendor/dashboard', label: 'Vendor Panel' });
  }

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'glass-amber shadow-lg shadow-amber-900/10'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-18">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center gap-2 group"
              onClick={() => setIsMenuOpen(false)}
            >
              <span className="text-2xl lg:text-3xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12">
                🍯
              </span>
              <span
                className="text-xl lg:text-2xl font-bold text-gradient-amber"
                style={{ fontFamily: 'var(--font-playfair), serif' }}
              >
                AmberFlow
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="relative px-4 py-2 text-sm font-medium text-amber-100/80 hover:text-amber-400 rounded-lg hover:bg-white/5 transition-all duration-200"
                >
                  <span className="flex items-center gap-1.5">
                    {link.label}
                    {link.badge > 0 && (
                      <span
                        className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-amber-500 rounded-full shadow-sm ${
                          badgeAnimate ? 'animate-badge-pop' : ''
                        }`}
                      >
                        {link.badge}
                      </span>
                    )}
                  </span>
                </Link>
              ))}

              {/* Auth Section */}
              <div className="ml-2 pl-3 border-l border-white/10 flex items-center gap-2">
                {user ? (
                  <>
                    <span className="text-sm text-amber-100/60 hidden lg:inline">
                      Hi, <span className="font-semibold text-amber-400">{user.name || user.email}</span>
                    </span>
                    <button
                      onClick={handleLogout}
                      className="px-3 py-1.5 text-sm font-medium text-amber-400 hover:text-black hover:bg-amber-500 rounded-lg border border-amber-500/50 hover:border-amber-500 transition-all duration-200 cursor-pointer"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-amber-600 rounded-lg hover:from-amber-600 hover:to-amber-700 shadow-sm hover:shadow-md transition-all duration-200"
                  >
                    Login
                  </Link>
                )}
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden relative w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
            >
              <div className="w-5 h-4 flex flex-col justify-between">
                <span
                  className={`block h-0.5 bg-amber-400 rounded-full transition-all duration-300 origin-center ${
                    isMenuOpen ? 'rotate-45 translate-y-[7px]' : ''
                  }`}
                />
                <span
                  className={`block h-0.5 bg-amber-400 rounded-full transition-all duration-300 ${
                    isMenuOpen ? 'opacity-0 scale-x-0' : ''
                  }`}
                />
                <span
                  className={`block h-0.5 bg-amber-400 rounded-full transition-all duration-300 origin-center ${
                    isMenuOpen ? '-rotate-45 -translate-y-[7px]' : ''
                  }`}
                />
              </div>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Overlay */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-[#0a0a0a]/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-40 transform transition-transform duration-300 ease-out md:hidden ${
          isMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full pt-20 pb-8 px-6">
          {/* User info in mobile */}
          {user && (
            <div className="mb-6 pb-4 border-b border-white/10">
              <p className="text-xs text-amber-500 uppercase tracking-wider font-medium">Welcome back</p>
              <p className="text-lg font-semibold text-white mt-0.5">{user.name || user.email}</p>
            </div>
          )}

          {/* Mobile Nav Links */}
          <nav className="flex-1 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center justify-between px-4 py-3 text-amber-100/80 hover:text-amber-400 hover:bg-white/5 rounded-xl transition-all duration-200 font-medium"
              >
                <span>{link.label}</span>
                {link.badge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[22px] h-6 px-2 text-xs font-bold text-black bg-amber-500 rounded-full">
                    {link.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* Mobile Auth */}
          <div className="pt-4 border-t border-white/10">
            {user ? (
              <button
                onClick={handleLogout}
                className="block w-full text-center px-4 py-3 text-sm font-semibold text-amber-400 hover:bg-white/5 rounded-xl transition-all duration-200"
              >
                Logout
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setIsMenuOpen(false)}
                className="block w-full text-center px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl hover:from-amber-600 hover:to-amber-700 shadow-md transition-all duration-200"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Spacer to prevent content from hiding behind fixed navbar */}
      <div className="h-16 lg:h-18" />
    </>
  );
}