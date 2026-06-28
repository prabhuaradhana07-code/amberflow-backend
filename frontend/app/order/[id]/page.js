'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const TRACKING_STEPS = [
  { key: 'confirmed', label: 'Order Confirmed', icon: '📋', desc: 'Your order has been placed and confirmed.' },
  { key: 'packed', label: 'Packed', icon: '📦', desc: 'Your items have been carefully packed.' },
  { key: 'shipped', label: 'Shipped', icon: '🚚', desc: 'Your package is on its way.' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🏍️', desc: 'Your package is out for delivery.' },
  { key: 'delivered', label: 'Delivered', icon: '✅', desc: 'Your package has been delivered!' },
];

export default function OrderTrackingPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }

    fetch(`${API_URL}/api/orders/${id}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((r) => {
        if (!r.ok) throw new Error('Order not found');
        return r.json();
      })
      .then((data) => {
        if (data.order) {
          setOrder({ ...data.order, items: data.items || [] });
        } else {
          setOrder(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFAEF]">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-float">📦</div>
          <p className="text-amber-700 text-lg font-medium">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFAEF]">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-2xl font-bold text-amber-900 mb-4">{error || 'Order not found'}</h2>
          <Link href="/dashboard" className="text-amber-600 hover:underline font-semibold">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const currentStepIndex = TRACKING_STEPS.findIndex((s) => s.key === order.status?.toLowerCase());
  const items = order.items || [];

  return (
    <div className="bg-[#FFFAEF] min-h-screen pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-amber-600 via-amber-500 to-yellow-500 text-white">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-amber-100 hover:text-white font-medium mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold">Order #{order.id}</h1>
              <p className="text-amber-100 mt-1">
                Placed on{' '}
                {new Date(order.created_at).toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wide ${
                  order.status === 'delivered'
                    ? 'bg-green-100 text-green-700'
                    : order.status === 'shipped' || order.status === 'out_for_delivery'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {TRACKING_STEPS.find((s) => s.key === order.status)?.label || order.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 -mt-6">
        {/* Tracking Timeline */}
        <div className="bg-white rounded-2xl shadow-xl border border-amber-100 p-8 md:p-10 mb-8">
          <h2 className="text-xl font-bold text-amber-900 mb-8">📍 Order Tracking</h2>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-amber-100" />

            <div className="space-y-0">
              {TRACKING_STEPS.map((step, index) => {
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const isFuture = index > currentStepIndex;

                return (
                  <div key={step.key} className="relative flex gap-5 pb-8 last:pb-0">
                    {/* Dot */}
                    <div
                      className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 transition-all duration-500 ${
                        isCurrent
                          ? 'bg-amber-500 shadow-lg shadow-amber-200/60 scale-110 ring-4 ring-amber-100'
                          : isCompleted
                          ? 'bg-green-500 shadow-md'
                          : 'bg-gray-100 border-2 border-gray-200'
                      }`}
                    >
                      {isCompleted && !isCurrent ? (
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className={isFuture ? 'grayscale opacity-40' : ''}>{step.icon}</span>
                      )}
                    </div>

                    {/* Content */}
                    <div className={`pt-2 ${isFuture ? 'opacity-40' : ''}`}>
                      <h3
                        className={`font-bold text-lg ${
                          isCurrent ? 'text-amber-800' : isCompleted ? 'text-green-700' : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                        {isCurrent && (
                          <span className="ml-3 text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-bold uppercase tracking-wide animate-pulse">
                            Current
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">{step.desc}</p>

                      {/* Delivery partner info */}
                      {(step.key === 'shipped' || step.key === 'out_for_delivery') &&
                        isCompleted &&
                        order.delivery_partner && (
                          <div className="mt-3 bg-purple-50 rounded-xl p-4 border border-purple-100">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <div>
                                <p className="text-xs text-purple-600 font-bold uppercase tracking-wide">Delivery Partner</p>
                                <p className="text-purple-900 font-semibold">{order.delivery_partner}</p>
                              </div>
                              {order.tracking_id && (
                                <div className="sm:ml-8">
                                  <p className="text-xs text-purple-600 font-bold uppercase tracking-wide">Tracking ID</p>
                                  <p className="text-purple-900 font-mono font-semibold">{order.tracking_id}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Estimated Delivery */}
          {order.estimated_delivery && order.status !== 'delivered' && (
            <div className="mt-8 p-5 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border border-amber-200 flex items-center gap-4">
              <span className="text-3xl">📅</span>
              <div>
                <p className="text-sm text-amber-600 font-bold uppercase tracking-wide">Estimated Delivery</p>
                <p className="text-xl font-bold text-amber-900">
                  {new Date(order.estimated_delivery).toLocaleDateString('en-IN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Order Items */}
          <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-8">
            <h2 className="text-xl font-bold text-amber-900 mb-6">🛒 Order Items</h2>
            <div className="space-y-4">
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-amber-50/50 transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-2xl flex-shrink-0">
                    🍯
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{item.product_name || item.name || `Product #${item.product_id}`}</p>
                    <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                  </div>
                  <p className="font-bold text-amber-900 flex-shrink-0">
                    ₹{(parseFloat(item.price) * item.quantity).toFixed(0)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-amber-100 space-y-2">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span className="font-semibold">₹{parseFloat(order.subtotal).toFixed(0)}</span>
              </div>
              {parseFloat(order.discount) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount {order.promo_code && `(${order.promo_code})`}</span>
                  <span className="font-semibold">-₹{parseFloat(order.discount).toFixed(0)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-black text-amber-900 pt-2 border-t border-amber-100">
                <span>Total</span>
                <span>₹{parseFloat(order.total).toFixed(0)}</span>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-8">
            <h2 className="text-xl font-bold text-amber-900 mb-6">📍 Shipping Address</h2>
            <div className="space-y-4 text-gray-700">
              <div className="p-4 bg-amber-50/50 rounded-xl">
                <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">Name</p>
                <p className="font-semibold">{order.shipping_name || '—'}</p>
              </div>
              <div className="p-4 bg-amber-50/50 rounded-xl">
                <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">Phone</p>
                <p className="font-semibold">{order.shipping_phone || '—'}</p>
              </div>
              <div className="p-4 bg-amber-50/50 rounded-xl">
                <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">Address</p>
                <p className="font-semibold">{order.shipping_address || '—'}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-amber-50/50 rounded-xl">
                  <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">City</p>
                  <p className="font-semibold text-sm">{order.shipping_city || '—'}</p>
                </div>
                <div className="p-4 bg-amber-50/50 rounded-xl">
                  <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">State</p>
                  <p className="font-semibold text-sm">{order.shipping_state || '—'}</p>
                </div>
                <div className="p-4 bg-amber-50/50 rounded-xl">
                  <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">Pincode</p>
                  <p className="font-semibold text-sm">{order.shipping_pincode || '—'}</p>
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-100">
              <p className="text-xs uppercase tracking-wider text-green-600 font-bold mb-1">Payment Method</p>
              <p className="font-semibold text-green-800">💵 Cash on Delivery</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
