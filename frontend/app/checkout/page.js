'use client';

import { useState, useEffect } from 'react';
import { useCart } from '@/context/CartContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function CheckoutPage() {
  const {
    cart,
    subtotal,
    discount,
    total,
    promoCode,
    clearCart,
  } = useCart();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    shipping_name: '',
    shipping_phone: '',
    shipping_address: '',
    shipping_city: '',
    shipping_state: '',
    shipping_pincode: '',
    upi_ref: '',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) {
      router.push('/login?redirect=checkout');
    } else {
      const parsed = JSON.parse(u);
      setUser(parsed);
      // Pre-fill name & phone if available
      setForm((f) => ({
        ...f,
        shipping_name: parsed.name || '',
        shipping_phone: parsed.phone || '',
        shipping_address: parsed.address || '',
      }));
    }
  }, [router]);

  const validate = () => {
    const errs = {};
    if (!form.shipping_name.trim()) errs.shipping_name = 'Name is required';
    if (!form.shipping_phone.trim()) errs.shipping_phone = 'Phone is required';
    if (!form.shipping_address.trim()) errs.shipping_address = 'Address is required';
    if (!form.shipping_city.trim()) errs.shipping_city = 'City is required';
    if (!form.shipping_state.trim()) errs.shipping_state = 'State is required';
    if (!form.shipping_pincode.trim()) errs.shipping_pincode = 'Pincode is required';
    if (!form.upi_ref.trim()) errs.upi_ref = 'UPI Transaction ID is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleOrder = async () => {
    if (!validate()) return;
    setLoading(true);
    setError('');
    const items = cart.map((i) => ({
      product_id: i.id,
      quantity: i.quantity,
      price: i.price,
    }));

    try {
      const res = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items,
          ...form,
          promo_code: promoCode || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.order?.id) {
        clearCart();
        router.push(`/order-success?id=${data.order.id}`);
      } else {
        setError(data.error || 'Failed to place order. Please try again.');
      }
    } catch {
      setError('Connection failed. Please check your internet and try again.');
    }
    setLoading(false);
  };

  // Fallback calculations (Note: Backend calculates exact GST & Shipping)
  const calcSubtotal = typeof subtotal === 'number' ? subtotal : cart.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);
  const calcDiscount = typeof discount === 'number' ? discount : 0;
  // Estimate GST (18%) and Shipping (50) + Packaging (20)
  const gstEstimate = (calcSubtotal - calcDiscount) * 0.18;
  const deliveryPackagingEstimate = 70;
  const calcTotal = (calcSubtotal - calcDiscount) + gstEstimate + deliveryPackagingEstimate;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin-slow">🍯</div>
          <p className="text-amber-700">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  const formFields = [
    { key: 'shipping_name', label: 'Full Name', type: 'text', icon: '👤' },
    { key: 'shipping_phone', label: 'Phone Number', type: 'tel', icon: '📱' },
    { key: 'shipping_address', label: 'Address', type: 'textarea', icon: '📍' },
    { key: 'shipping_city', label: 'City', type: 'text', icon: '🏙️' },
    { key: 'shipping_state', label: 'State', type: 'text', icon: '🗺️' },
    { key: 'shipping_pincode', label: 'Pincode', type: 'text', icon: '📮' },
  ];

  return (
    <div className="bg-[#FFFAEF] min-h-screen pb-20">
      <div className="max-w-6xl mx-auto px-6 pt-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/cart" className="text-amber-600 hover:text-amber-800 text-sm font-medium transition-colors">
            ← Back to Cart
          </Link>
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-amber-950 mt-3">
            Checkout
          </h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl mb-6 flex items-center gap-3 animate-fade-in">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left: Shipping Form */}
          <div className="lg:w-3/5">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-amber-100/80">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Shipping Details
              </h2>

              <div className="space-y-4">
                {formFields.map(({ key, label, type, icon }) => (
                  <div key={key}>
                    <label className="block text-sm font-semibold text-gray-600 mb-1.5">
                      {label} <span className="text-red-400">*</span>
                    </label>
                    {type === 'textarea' ? (
                      <textarea
                        value={form[key]}
                        onChange={(e) => {
                          setForm({ ...form, [key]: e.target.value });
                          setErrors({ ...errors, [key]: '' });
                        }}
                        placeholder={`Enter your ${label.toLowerCase()}`}
                        rows={3}
                        className={`w-full border-2 rounded-xl px-4 py-3 resize-none transition-all ${
                          errors[key] ? 'border-red-300 bg-red-50/50' : 'border-amber-200'
                        }`}
                      />
                    ) : (
                      <input
                        type={type}
                        value={form[key]}
                        onChange={(e) => {
                          setForm({ ...form, [key]: e.target.value });
                          setErrors({ ...errors, [key]: '' });
                        }}
                        placeholder={`Enter your ${label.toLowerCase()}`}
                        className={`w-full border-2 rounded-xl px-4 py-3 transition-all ${
                          errors[key] ? 'border-red-300 bg-red-50/50' : 'border-amber-200'
                        }`}
                      />
                    )}
                    {errors[key] && (
                      <p className="text-red-500 text-xs mt-1 font-medium">{errors[key]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Order Summary */}
          <div className="lg:w-2/5">
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-amber-100/80 lg:sticky lg:top-24">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Order Summary
              </h2>

              <div className="space-y-4 mb-6">
                {cart.map((item) => (
                  <div key={item.id} className="flex justify-between items-center py-3 border-b border-amber-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                        <span className="text-lg">🍯</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{item.name}</p>
                        <p className="text-xs text-gray-400">× {item.quantity}</p>
                      </div>
                    </div>
                    <span className="font-bold text-amber-900 text-sm">
                      ₹{(parseFloat(item.price) * item.quantity).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-amber-100 pt-4 space-y-3">
                <div className="flex justify-between text-gray-600 text-sm">
                  <span>Subtotal</span>
                  <span className="font-semibold">₹{calcSubtotal.toFixed(2)}</span>
                </div>
                {calcDiscount > 0 && (
                  <div className="flex justify-between text-green-600 text-sm">
                    <span className="flex items-center gap-1">
                      Discount
                      {promoCode && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                          {promoCode}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold">-₹{calcDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600 text-sm">
                  <span>GST (18% Est.)</span>
                  <span className="font-semibold">+₹{gstEstimate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600 text-sm">
                  <span>Shipping & Packaging (Est.)</span>
                  <span className="font-semibold text-gray-800">+₹{deliveryPackagingEstimate.toFixed(2)}</span>
                </div>
                <div className="border-t border-amber-100 pt-3 flex justify-between items-center">
                  <span className="text-lg font-bold text-gray-800">Total Amount</span>
                  <span className="text-2xl font-black text-amber-900">₹{calcTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Method - UPI Simulation */}
              <div className="mt-6 p-6 bg-amber-50 rounded-xl border border-amber-200">
                <h3 className="font-bold text-amber-900 mb-4 flex items-center gap-2">
                  <span className="text-xl">📱</span> Secure UPI Payment
                </h3>
                <div className="bg-white p-4 rounded-xl border border-amber-100 text-center mb-4">
                  <p className="text-sm text-gray-600 mb-1">Pay to our Official UPI ID:</p>
                  <p className="font-mono font-bold text-lg text-amber-800 select-all">amberflow@okaxis</p>
                  <p className="text-xs text-gray-400 mt-2">(Please scan or use your UPI app to pay ₹{calcTotal.toFixed(0)})</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Enter UPI Transaction ID <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.upi_ref}
                    onChange={(e) => {
                      setForm({ ...form, upi_ref: e.target.value });
                      setErrors({ ...errors, upi_ref: '' });
                    }}
                    placeholder="e.g. 123456789012"
                    className={`w-full border-2 rounded-xl px-4 py-3 transition-all ${
                      errors.upi_ref ? 'border-red-300 bg-red-50/50' : 'border-amber-200'
                    }`}
                  />
                  {errors.upi_ref && <p className="text-red-500 text-xs mt-1 font-medium">{errors.upi_ref}</p>}
                </div>
              </div>

              <div className="mt-6 bg-red-50 text-red-800 p-4 rounded-xl text-sm font-medium border border-red-100">
                <span className="font-bold">⚠️ Strict No Return Policy:</span> Once products are sold and delivered, they cannot be returned or refunded.
              </div>

              {/* Place Order Button */}
              <button
                onClick={handleOrder}
                disabled={loading || cart.length === 0}
                className="w-full mt-6 bg-amber-600 hover:bg-amber-700 text-white font-bold text-lg py-5 rounded-2xl shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-amber-200/50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Placing Order...
                  </>
                ) : (
                  <>
                    Place Order
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}