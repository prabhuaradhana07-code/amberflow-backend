'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function FloatingChat() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Show after 2 seconds for a nice entrance effect
    const timer = setTimeout(() => setIsVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (pathname?.startsWith('/project1')) return null;
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
      {/* Chat window */}
      <div 
        className={`bg-white rounded-2xl shadow-2xl border border-amber-100 w-72 mb-4 overflow-hidden transition-all duration-300 origin-bottom-right pointer-events-auto ${
          isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-4 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-xl">
              👩‍💼
            </div>
            <div>
              <h4 className="font-bold">AmberFlow Support</h4>
              <p className="text-xs text-amber-100">Usually replies in minutes</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-amber-50/30 h-48 flex flex-col justify-end">
          <div className="bg-white p-3 rounded-xl rounded-tl-sm shadow-sm border border-amber-100 text-sm text-gray-700 mb-2 max-w-[85%]">
            Hi there! 👋 Looking for the perfect honey? Let me know if you need help!
          </div>
        </div>
        <div className="p-3 border-t border-gray-100 bg-white">
          <button 
            onClick={() => alert("This is a demo! In a real app, this would open WhatsApp or a live chat.")}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 rounded-xl transition-colors text-sm"
          >
            Start Chat
          </button>
        </div>
      </div>

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 bg-gradient-to-r from-amber-500 to-amber-600 rounded-full shadow-xl flex items-center justify-center text-2xl hover:scale-110 transition-transform duration-300 hover:shadow-amber-500/50 pointer-events-auto ${isOpen ? 'rotate-90' : 'animate-bounce-slow'}`}
        aria-label="Chat with us"
      >
        {isOpen ? '✕' : '💬'}
      </button>
    </div>
  );
}
