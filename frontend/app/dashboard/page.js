'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const STATUS_CONFIG = {
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700', icon: '📋' },
  packed: { label: 'Packed', color: 'bg-amber-100 text-amber-700', icon: '📦' },
  shipped: { label: 'Shipped', color: 'bg-purple-100 text-purple-700', icon: '🚚' },
  out_for_delivery: { label: 'Out for Delivery', color: 'bg-orange-100 text-orange-700', icon: '🏍️' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: '✅' },
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', city: '', state: '', pincode: '' });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('orders');

  // Rating Modal State
  const [ratingModal, setRatingModal] = useState({ isOpen: false, order: null });
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '', image: null });

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (!u) {
      router.push('/login');
      return;
    }
    setUser(JSON.parse(u));

    Promise.all([
      fetch(`${API_URL}/api/auth/profile`, { credentials: 'include', cache: 'no-store' }).then(r => r.json()),
      fetch(`${API_URL}/api/orders`, { credentials: 'include', cache: 'no-store' }).then(r => r.json())
    ]).then(([profileData, ordersData]) => {
      setProfile(profileData);
      setEditForm({
        name: profileData.name || '',
        phone: profileData.phone || '',
        address: profileData.address || '',
        city: profileData.city || '',
        state: profileData.state || '',
        pincode: profileData.pincode || '',
      });
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [router]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...storedUser, name: updated.name }));
        setEditing(false);
      }
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('rating', reviewForm.rating);
    fd.append('comment', reviewForm.comment);
    if (reviewForm.image) fd.append('image', reviewForm.image);
    
    // We can assume they are rating the whole order experience or the first product in the order
    // In a real app we'd map this to a specific product_id from the order. For now, general review:
    
    try {
      const res = await fetch(`${API_URL}/api/reviews`, {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
      if (res.ok) {
        alert('Review submitted successfully! Thank you for sharing your experience.');
        setRatingModal({ isOpen: false, order: null });
        setReviewForm({ rating: 5, comment: '', image: null });
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to submit review');
      }
    } catch (err) {
      alert('Network error while submitting review');
    }
  };

  const totalSpent = orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
  const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' }) : '—';

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FFFAEF]"><div className="text-6xl animate-float">🍯</div></div>;
  if (!user) return null;

  const initials = (profile?.name || user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="bg-[#FFFAEF] min-h-screen pb-20 relative">
      
      {/* Review Modal */}
      {ratingModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl relative animate-fade-in-up">
            <button onClick={() => setRatingModal({ isOpen: false, order: null })} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">✕</button>
            <h2 className="text-2xl font-bold text-amber-900 mb-2">Rate Your Experience 🍯</h2>
            <p className="text-gray-600 mb-6">How was your order? Share a picture to encourage others!</p>
            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Rating</label>
                <select value={reviewForm.rating} onChange={e => setReviewForm({...reviewForm, rating: e.target.value})} className="w-full border-2 border-amber-200 rounded-xl px-4 py-2">
                  <option value="5">⭐⭐⭐⭐⭐ (5/5)</option>
                  <option value="4">⭐⭐⭐⭐ (4/5)</option>
                  <option value="3">⭐⭐⭐ (3/5)</option>
                  <option value="2">⭐⭐ (2/5)</option>
                  <option value="1">⭐ (1/5)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Comment</label>
                <textarea value={reviewForm.comment} onChange={e => setReviewForm({...reviewForm, comment: e.target.value})} rows="3" className="w-full border-2 border-amber-200 rounded-xl px-4 py-2" placeholder="Tell us what you liked..."></textarea>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Upload Photo</label>
                <input type="file" accept="image/*" onChange={e => setReviewForm({...reviewForm, image: e.target.files[0]})} className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-amber-50 file:text-amber-700" />
              </div>
              <button type="submit" className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl transition-colors">Submit Review</button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-br from-amber-600 via-amber-500 to-yellow-500 text-white">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl font-bold border-4 border-white/30 shadow-xl">
              {initials}
            </div>
            <div className="text-center md:text-left">
              <h1 className="text-3xl md:text-4xl font-serif font-bold mb-1">{profile?.name || user.name}</h1>
              <p className="text-amber-100 text-lg">{profile?.email || user.email}</p>
              {profile?.phone && <p className="text-amber-200 text-sm mt-1">📞 {profile.phone}</p>}
            </div>
            <div className="md:ml-auto">
              <button
                onClick={() => {
                  setEditing(!editing);
                  if (!editing) setEditForm({
                    name: profile?.name || '', phone: profile?.phone || '', address: profile?.address || '',
                    city: profile?.city || '', state: profile?.state || '', pincode: profile?.pincode || ''
                  });
                }}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-semibold px-6 py-3 rounded-2xl transition-all border border-white/20"
              >
                {editing ? '✕ Cancel' : '✏️ Edit Profile'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 -mt-6">
        {editing && (
          <div className="bg-white rounded-2xl shadow-xl border border-amber-100 p-8 mb-8 animate-fade-in-up">
            <h2 className="text-xl font-bold text-amber-900 mb-6">Edit Profile</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2">Full Name</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full border-2 border-amber-200 rounded-xl px-4 py-3" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2">Phone</label>
                <input type="tel" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="w-full border-2 border-amber-200 rounded-xl px-4 py-3" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Street Address</label>
                <textarea value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} rows={2} className="w-full border-2 border-amber-200 rounded-xl px-4 py-3" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2">City</label>
                <input type="text" value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} className="w-full border-2 border-amber-200 rounded-xl px-4 py-3" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2">State</label>
                <input type="text" value={editForm.state} onChange={e => setEditForm({ ...editForm, state: e.target.value })} className="w-full border-2 border-amber-200 rounded-xl px-4 py-3" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2">Pincode</label>
                <input type="text" value={editForm.pincode} onChange={e => setEditForm({ ...editForm, pincode: e.target.value })} className="w-full border-2 border-amber-200 rounded-xl px-4 py-3" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSaveProfile} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-8 py-3 rounded-xl transition-all disabled:opacity-50">
                {saving ? 'Saving...' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-2xl">📦</div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Total Orders</p>
                <p className="text-3xl font-black text-amber-900">{orders.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center text-2xl">💰</div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Total Spent</p>
                <p className="text-3xl font-black text-green-700">₹{totalSpent.toFixed(0)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center text-2xl">🗓️</div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Member Since</p>
                <p className="text-lg font-bold text-purple-700">{memberSince}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setActiveTab('orders')} className={`px-6 py-3 rounded-xl font-semibold transition-all ${activeTab === 'orders' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200/50' : 'bg-white text-gray-600 border border-amber-100'}`}>📦 Order History</button>
          <button onClick={() => setActiveTab('profile')} className={`px-6 py-3 rounded-xl font-semibold transition-all ${activeTab === 'profile' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200/50' : 'bg-white text-gray-600 border border-amber-100'}`}>👤 Profile Details</button>
        </div>

        {activeTab === 'orders' && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="bg-white rounded-2xl p-16 text-center border border-amber-100">
                <div className="text-6xl mb-4">🛒</div>
                <h3 className="text-2xl font-bold text-amber-900 mb-2">No orders yet</h3>
                <Link href="/" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold px-8 py-4 rounded-2xl mt-4">Browse Honey 🍯</Link>
              </div>
            ) : (
              orders.map((order) => {
                const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.confirmed;
                return (
                  <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <Link href={`/order/${order.id}`} className="flex items-center gap-4 flex-grow group">
                        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-xl">{status.icon}</div>
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg group-hover:text-amber-600 transition-colors">Order #{order.id}</h3>
                          <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleDateString('en-IN')}</p>
                        </div>
                      </Link>
                      <div className="flex items-center gap-4 md:gap-6">
                        <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${status.color}`}>
                          {status.label}
                        </span>
                        <div className="text-right">
                          <p className="text-xl font-black text-amber-900">₹{parseFloat(order.total).toFixed(0)}</p>
                        </div>
                        {order.status === 'delivered' && (
                          <button 
                            onClick={(e) => { e.preventDefault(); setRatingModal({ isOpen: true, order }); }}
                            className="bg-amber-100 text-amber-800 hover:bg-amber-200 px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                          >
                            ⭐ Rate Product
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-8">
            <h2 className="text-2xl font-serif font-bold text-amber-900 mb-8">Profile Information</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-4 bg-amber-50/50 rounded-xl">
                <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">Full Name</p>
                <p className="text-lg font-semibold text-gray-900">{profile?.name || '—'}</p>
              </div>
              <div className="p-4 bg-amber-50/50 rounded-xl">
                <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">Email</p>
                <p className="text-lg font-semibold text-gray-900">{profile?.email || '—'}</p>
              </div>
              <div className="p-4 bg-amber-50/50 rounded-xl">
                <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">Phone</p>
                <p className="text-lg font-semibold text-gray-900">{profile?.phone || 'Not set'}</p>
              </div>
              <div className="p-4 bg-amber-50/50 rounded-xl">
                <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">City, State</p>
                <p className="text-lg font-semibold text-gray-900">{(profile?.city || profile?.state) ? `${profile.city}, ${profile.state}` : 'Not set'}</p>
              </div>
              <div className="p-4 bg-amber-50/50 rounded-xl md:col-span-2">
                <p className="text-xs uppercase tracking-wider text-amber-600 font-bold mb-1">Street Address</p>
                <p className="text-lg font-semibold text-gray-900">{profile?.address || 'Not set'} {profile?.pincode ? `(PIN: ${profile.pincode})` : ''}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
