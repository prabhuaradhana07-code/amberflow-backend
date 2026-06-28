import Link from 'next/link';
import Image from 'next/image';
import AddToCartBtn from '../components/AddToCartBtn';

const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=600&q=80',
  'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&q=80',
  'https://images.unsplash.com/photo-1571939228382-b2f2b585ce15?w=600&q=80',
];

const testimonials = [
  {
    name: 'Priya Sharma',
    quote: 'The wild forest honey is absolutely divine! You can taste the difference — pure, rich, and golden. My family loves it on everything.',
    rating: 5,
    location: 'Mumbai',
  },
  {
    name: 'Arjun Patel',
    quote: "Best honey I've ever had. It arrives beautifully packaged and the taste is incomparable to store-bought brands. True farm-to-table quality.",
    rating: 5,
    location: 'Bangalore',
  },
  {
    name: 'Meera Reddy',
    quote: 'I switched to AmberFlow for my morning routine and the difference is remarkable. Raw, unprocessed, and full of natural goodness.',
    rating: 5,
    location: 'Chennai',
  },
];

export default async function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  const getImageUrl = (url) => url && url.startsWith('/uploads/') ? `${apiUrl}${url}` : url;
  let products = [];
  try {
    const res = await fetch(`${apiUrl}/api/products`, { next: { revalidate: 60 } });
    products = res.ok ? await res.json() : [];
  } catch {
    products = [];
  }

  return (
    <div className="min-h-screen">

      {/* ─── HERO SECTION ──────────────────────────────────── */}
      <section className="relative w-full h-[90vh] min-h-[650px] flex items-center justify-center text-center overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1587049352847-81a56d773c16?w=1920&q=80"
          alt="Golden honey flowing in nature"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-amber-950/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-amber-900/20 via-transparent to-amber-900/20" />

        <div className="relative z-10 px-8 py-12 md:py-16 max-w-4xl mx-auto glass-panel rounded-3xl backdrop-blur-md shadow-2xl">
          <span className="inline-block text-amber-300 font-bold tracking-[0.35em] uppercase text-xs sm:text-sm mb-6 animate-fade-in-down">
            ✦ Directly from the Source ✦
          </span>
          <h1 className="text-5xl sm:text-6xl md:text-8xl font-serif text-white mb-6 drop-shadow-2xl leading-[1.1] animate-fade-in-up">
            Pure Nature,
            <br />
            <span className="text-amber-400">Bottled.</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-200/90 mb-10 font-light max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-200">
            Sustainably harvested from deep wild forests and sunlit paddy fields.
            100% organic, raw, and unfiltered — the way nature intended.
          </p>
          <a
            href="#shop"
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white font-bold px-10 py-4 rounded-full text-lg shadow-2xl shadow-amber-900/30 transition-all duration-300 hover:shadow-amber-500/40 hover:scale-105 animate-fade-in-up delay-400"
          >
            Shop Now
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </a>
        </div>

        {/* Decorative bottom wave - Removed for dark mesh continuity */}
      </section>

      {/* ─── TRUST BADGES ──────────────────────────────────── */}
      <section className="py-16 md:py-20 px-6">
        <div className="flex flex-wrap justify-center gap-8 md:gap-16 lg:gap-24 max-w-5xl mx-auto">
          {[
            { icon: '🐝', title: '100% Organic', desc: 'Ethically sourced from pristine natural environments with zero additives.' },
            { icon: '🍯', title: 'Raw & Unfiltered', desc: 'Retains all natural pollen, enzymes, and antioxidants for maximum benefit.' },
            { icon: '🌿', title: 'Farm to Table', desc: 'Directly from Indian beekeepers to your home within days of harvest.' },
          ].map((badge, i) => (
            <div key={i} className="glass-card flex flex-col items-center text-center p-8 max-w-[280px] group rounded-3xl transition-all duration-500 hover:-translate-y-3 hover:shadow-amber-lg cursor-default">
              <div className="w-20 h-20 bg-amber-100/50 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-5 group-hover:bg-amber-200 transition-colors duration-500 group-hover:scale-110 transform shadow-inner">
                <span className="text-4xl">{badge.icon}</span>
              </div>
              <h3 className="font-bold text-white text-lg mb-2">{badge.title}</h3>
              <p className="text-sm text-amber-100/70 leading-relaxed">{badge.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 max-w-xs mx-auto h-px bg-gradient-to-r from-transparent via-amber-300 to-transparent" />
      </section>

      {/* ─── PRODUCT GRID ──────────────────────────────────── */}
      <section id="shop" className="py-16 md:py-24 px-6 scroll-mt-20">
        <div className="text-center mb-16">
          <span className="text-amber-400 font-semibold tracking-widest text-xs uppercase">Curated Selection</span>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white mt-3 mb-6">
            Our Golden Collection
          </h2>
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-px bg-amber-300" />
            <div className="w-3 h-3 bg-amber-500 rounded-full" />
            <div className="w-12 h-px bg-amber-300" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10 max-w-7xl mx-auto">
          {products.map((product, idx) => (
            <div key={product.id} className="group relative">
              <Link href={`/product/${product.slug}`} className="block">
                <div className="bg-[#0a0a0a]/40 backdrop-blur-md rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-500 transform group-hover:-translate-y-3 border border-amber-500/20 flex flex-col h-full">
                  {/* Image */}
                  <div className="h-72 relative overflow-hidden bg-gradient-to-br from-neutral-900 to-neutral-800">
                    <Image
                      src={getImageUrl(product.image_url) || FALLBACK_IMAGES[idx % FALLBACK_IMAGES.length]}
                      alt={product.name}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-700"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    {/* Badge */}
                    {product.honey_type && (
                      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
                        {product.honey_type.replace(/_/g, ' ')}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-7 flex flex-col flex-grow">
                    <h3 className="text-xl font-serif font-bold text-white mb-2 group-hover:text-amber-400 transition-colors">
                      {product.name}
                    </h3>
                    <p className="text-gray-400 text-sm mb-6 line-clamp-2 flex-grow leading-relaxed">
                      {product.description}
                    </p>

                    <div className="flex justify-between items-center pt-5 border-t border-white/10">
                      <div>
                        <span className="text-2xl font-black text-amber-400">₹{product.price}</span>
                        <span className="text-xs text-gray-500 font-medium ml-1.5">/ {product.weight_g}g</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
              {/* Add to Cart — positioned outside the Link to prevent navigation */}
              <div className="absolute bottom-7 right-7">
                <AddToCartBtn product={product} />
              </div>
            </div>
          ))}
        </div>

        {products.length === 0 && (
          <div className="text-center py-20">
            <span className="text-6xl mb-6 block">🍯</span>
            <p className="text-amber-700 text-lg">Our collection is being prepared. Check back soon!</p>
          </div>
        )}
      </section>

      {/* ─── TESTIMONIALS ──────────────────────────────────── */}
      <section className="py-20 md:py-28 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-100/40 to-transparent" />
        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-amber-400 font-semibold tracking-widest text-xs uppercase">Testimonials</span>
            <h2 className="text-4xl md:text-5xl font-serif text-white mt-3">
              What Our Customers Say
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="glass-light rounded-3xl p-8 hover:shadow-xl hover:shadow-amber-200/30 transition-all duration-500 hover:-translate-y-2"
              >
                {/* Stars */}
                <div className="flex gap-1 mb-5">
                  {[...Array(t.rating)].map((_, j) => (
                    <svg key={j} className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-300 leading-relaxed mb-6 italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-bold text-sm">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">{t.name}</p>
                    <p className="text-xs text-amber-400/80">{t.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA SECTION ───────────────────────────────────── */}
      <section className="py-20 md:py-28 px-6">
        <div className="max-w-4xl mx-auto text-center bg-gradient-to-br from-amber-600 via-amber-500 to-yellow-500 rounded-[2.5rem] p-12 md:p-20 shadow-2xl shadow-amber-300/30 relative overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <span className="text-6xl mb-6 block animate-float">🍯</span>
            <h2 className="text-3xl md:text-5xl font-serif text-white mb-4 leading-tight">
              Experience the
              <br />
              <span className="text-amber-100">Golden Difference</span>
            </h2>
            <p className="text-amber-100/80 mb-10 max-w-lg mx-auto text-lg">
              Join thousands of families who have made the switch to pure, organic honey.
            </p>
            <Link
              href="#shop"
              className="inline-flex items-center gap-2 bg-white text-amber-700 font-bold px-10 py-4 rounded-full text-lg shadow-lg hover:shadow-xl hover:bg-amber-50 transition-all duration-300 hover:scale-105"
            >
              Shop Now
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Bottom spacer for footer */}
      <div className="h-8" />
    </div>
  );
}