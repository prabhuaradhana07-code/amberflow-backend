'use client';

import { useCart } from '@/context/CartContext';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const PRODUCT_IMAGES = [
  'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=800&q=80',
  'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=800&q=80',
  'https://images.unsplash.com/photo-1571939228382-b2f2b585ce15?w=800&q=80',
];

function StarDisplay({ rating, size = 'w-5 h-5' }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`${size} ${star <= rating ? 'text-amber-500' : 'text-gray-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function StarSelector({ rating, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1 star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className="star"
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star)}
        >
          <svg
            className={`w-8 h-8 transition-colors ${
              star <= (hover || rating) ? 'text-amber-500' : 'text-gray-300'
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const router = useRouter();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [loading, setLoading] = useState(true);

  // Reviews
  const [reviews, setReviews] = useState([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/products/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setProduct(data);
        setLoading(false);
        // Fetch reviews
        if (data?.id) {
          fetch(`${API_URL}/api/reviews/product/${data.id}`)
            .then((r) => r.json())
            .then((revs) => setReviews(Array.isArray(revs) ? revs : []))
            .catch(() => setReviews([]));
        }
      })
      .catch(() => setLoading(false));
  }, [slug]);

  const handleAdd = () => {
    for (let i = 0; i < quantity; i++) {
      addToCart(product);
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewForm.comment.trim()) return;
    setSubmittingReview(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/api/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_id: product.id,
          rating: reviewForm.rating,
          comment: reviewForm.comment,
        }),
      });
      if (res.ok) {
        const newReview = await res.json();
        setReviews((prev) => [newReview, ...prev]);
        setReviewForm({ rating: 5, comment: '' });
      }
    } catch { /* silent */ }
    setSubmittingReview(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-float">🍯</div>
          <p className="text-amber-700 text-lg font-medium">Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-2xl font-bold text-amber-900 mb-4">Product not found</h2>
          <Link href="/" className="text-amber-600 hover:underline font-semibold">
            ← Back to Shop
          </Link>
        </div>
      </div>
    );
  }

  const getImageUrl = (url) => url && url.startsWith('/uploads/') ? `${API_URL}${url}` : url;
  const imageUrl = getImageUrl(product.image_url) || PRODUCT_IMAGES[product.id % PRODUCT_IMAGES.length];
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div className="min-h-screen pb-20">
      {/* ─── Breadcrumb ─── */}
      <div className="max-w-6xl mx-auto px-6 pt-6">
        <nav className="flex items-center gap-2 text-sm text-gray-400">
          <Link href="/" className="hover:text-amber-400 transition-colors">Home</Link>
          <span>/</span>
          <Link href="/#shop" className="hover:text-amber-400 transition-colors">Shop</Link>
          <span>/</span>
          <span className="text-white font-medium">{product.name}</span>
        </nav>
      </div>

      {/* ─── Product Detail ─── */}
      <div className="max-w-6xl mx-auto px-6 mt-8">
        <div className="glass-card rounded-[2rem] shadow-xl overflow-hidden">
          <div className="flex flex-col lg:flex-row">
            {/* Left: Image */}
            <div className="lg:w-1/2 relative bg-gradient-to-br from-neutral-900 to-neutral-800 min-h-[400px] lg:min-h-[600px]">
              <Image
                src={imageUrl}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
              {/* Overlay badge */}
              {product.honey_type && (
                <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-sm text-amber-800 text-xs font-bold px-4 py-2 rounded-full uppercase tracking-wider shadow-sm">
                  {product.honey_type.replace(/_/g, ' ')}
                </div>
              )}
            </div>

            {/* Right: Details */}
            <div className="lg:w-1/2 p-8 md:p-12 flex flex-col justify-center">
              {product.honey_type && (
                <span className="inline-block text-xs font-black text-amber-500 uppercase tracking-[0.2em] mb-3">
                  {product.honey_type.replace(/_/g, ' ')} Honey
                </span>
              )}

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white mb-4 leading-tight">
                {product.name}
              </h1>

              {avgRating && (
                <div className="flex items-center gap-2 mb-4">
                  <StarDisplay rating={Math.round(Number(avgRating))} />
                  <span className="text-sm text-gray-400">
                    {avgRating} ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
                  </span>
                </div>
              )}

              <p className="text-gray-300 mb-8 leading-relaxed text-base">
                {product.description}
              </p>

              <div className="flex items-end gap-4 mb-8 pb-8 border-b border-white/10">
                <span className="text-4xl md:text-5xl font-black text-amber-400">
                  ₹{product.price}
                </span>
                <span className="text-lg text-gray-500 mb-1 font-medium">
                  / {product.weight_g}g
                </span>
              </div>

              {/* Quantity Selector */}
              <div className="flex items-center gap-5 mb-8">
                <label className="font-semibold text-gray-300">Quantity:</label>
                <div className="flex items-center border border-white/20 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-12 h-12 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white font-bold text-lg transition-colors flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="w-14 h-12 flex items-center justify-center font-bold text-lg bg-black text-white">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    className="w-12 h-12 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white font-bold text-lg transition-colors flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Stock & Add to Cart */}
              {product.stock > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-sm text-green-700 font-medium">
                      In Stock ({product.stock} available)
                    </span>
                  </div>
                  <button
                    onClick={handleAdd}
                    className={`w-full font-bold text-lg py-5 rounded-2xl shadow-lg transition-all duration-300 ${
                      added
                        ? 'bg-green-500 text-white scale-[1.02]'
                        : 'bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white hover:shadow-2xl hover:shadow-amber-500/40 hover:-translate-y-1 active:scale-[0.98]'
                    }`}
                  >
                    {added ? '✓ Added to Cart!' : `Add to Cart — ₹${(parseFloat(product.price) * quantity).toFixed(0)}`}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2.5 h-2.5 bg-red-400 rounded-full" />
                    <span className="text-sm text-red-600 font-medium">Out of Stock</span>
                  </div>
                  <button
                    disabled
                    className="w-full bg-gray-200 text-gray-400 font-bold text-lg py-5 rounded-2xl cursor-not-allowed"
                  >
                    Out of Stock
                  </button>
                </>
              )}

              <Link
                href="/#shop"
                className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 font-semibold mt-6 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Shop
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Reviews Section ─── */}
      <div className="max-w-6xl mx-auto px-6 mt-12">
        <div className="bg-[#0a0a0a]/50 backdrop-blur-xl rounded-3xl shadow-lg border border-amber-500/20 p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-white mb-8">
            Customer Reviews
            {reviews.length > 0 && (
              <span className="text-lg text-gray-500 font-normal ml-3">({reviews.length})</span>
            )}
          </h2>

          {/* Review Form */}
          {user ? (
            <form onSubmit={handleReviewSubmit} className="mb-10 p-6 bg-[#151515] rounded-2xl border border-white/10">
              <h3 className="text-lg font-bold text-white mb-4">Write a Review</h3>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-400 mb-2">Your Rating</label>
                <StarSelector rating={reviewForm.rating} onChange={(r) => setReviewForm((f) => ({ ...f, rating: r }))} />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-400 mb-2">Your Review</label>
                <textarea
                  value={reviewForm.comment}
                  onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))}
                  placeholder="Share your experience with this honey..."
                  rows={4}
                  className="w-full border border-white/20 bg-black rounded-xl px-4 py-3 resize-none text-white placeholder:text-gray-600 focus:border-amber-500 focus:outline-none transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={submittingReview || !reviewForm.comment.trim()}
                className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold px-8 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed text-black shadow-lg shadow-amber-500/20"
              >
                {submittingReview ? 'Submitting...' : 'Submit Review'}
              </button>
            </form>
          ) : (
            <div className="mb-10 p-6 bg-[#151515] rounded-2xl border border-white/10 text-center">
              <p className="text-gray-400 mb-3">Want to share your thoughts?</p>
              <Link
                href="/login"
                className="inline-block bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 font-bold text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20"
              >
                Login to Leave a Review
              </Link>
            </div>
          )}

          {/* Reviews List */}
          {reviews.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl mb-3 block">💬</span>
              <p className="text-gray-500">No reviews yet. Be the first to review this honey!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {reviews.map((review, i) => (
                <div
                  key={review.id || i}
                  className="p-6 rounded-2xl border border-white/10 hover:border-amber-500/30 transition-colors bg-black/20"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-bold text-sm">
                        {(review.user_name || review.name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm">{review.user_name || review.name || 'Anonymous'}</p>
                        <StarDisplay rating={review.rating} size="w-4 h-4" />
                      </div>
                    </div>
                    {review.created_at && (
                      <span className="text-xs text-gray-500">
                        {new Date(review.created_at).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-300 leading-relaxed pl-13">{review.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}