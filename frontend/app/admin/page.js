'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const STATUS_CONFIG = {
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700' },
  packed: { label: 'Packed', color: 'bg-amber-100 text-amber-700' },
  shipped: { label: 'Shipped', color: 'bg-purple-100 text-purple-700' },
  out_for_delivery: { label: 'Out for Delivery', color: 'bg-orange-100 text-orange-700' },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700' },
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [activeTab, setActiveTab] = useState('orders');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    
    if (!userStr) {
      router.push('/login');
      return;
    }

    const user = JSON.parse(userStr);
    if (user.role !== 'admin') {
      router.push('/');
      return;
    }

    Promise.all([
      fetch(`${API_URL}/api/orders/all`, { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/auth/vendors`, { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/products`, { cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/auth/users`, { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : []).catch(() => [])
    ])
    .then(([ordersData, vendorsData, productsData, usersData]) => {
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setVendors(Array.isArray(vendorsData) ? vendorsData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
    })
    .catch(err => {
      showToast('Failed to fetch admin data.', 'error');
    })
    .finally(() => {
      setLoading(false);
    });
  }, [router]);

  const handleUpdateStatus = async (orderId, newStatus) => {
    setUpdating(orderId);
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
        showToast(`Order #${orderId} marked as ${newStatus}`, 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to update status', 'error');
      }
    } catch (err) {
      showToast('Network error while updating status', 'error');
    }
    setUpdating(null);
  };

  const handleApproveVendor = async (vendorId) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/vendors/${vendorId}/approve`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_approved_vendor: true }),
      });
      if (res.ok) {
        setVendors((prev) => prev.map((v) => (v.id === vendorId ? { ...v, is_approved_vendor: true } : v)));
        showToast(`Vendor approved successfully!`, 'success');
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to approve vendor', 'error');
      }
    } catch (err) {
      showToast('Network error while approving vendor', 'error');
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const res = await fetch(`${API_URL}/api/products/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== id));
        showToast('Product deleted successfully', 'success');
      } else {
        showToast('Failed to delete product', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  };

  const getImageUrl = (url) => url && url.startsWith('/uploads/') ? `${API_URL}${url}` : url;

  const handleDownloadCSV = () => {
    if (orders.length === 0) {
      showToast('No orders to export', 'error');
      return;
    }
    const headers = ['Order ID', 'Customer Name', 'Customer Email', 'City', 'State', 'Amount (INR)', 'Date', 'Status', 'UPI Ref'];
    const rows = orders.map(o => [
      o.id,
      `"${(o.user_name || o.shipping_name || '').replace(/"/g, '""')}"`,
      `"${(o.user_email || '').replace(/"/g, '""')}"`,
      `"${(o.shipping_city || '').replace(/"/g, '""')}"`,
      `"${(o.shipping_state || '').replace(/"/g, '""')}"`,
      o.total,
      new Date(o.created_at).toLocaleDateString('en-IN'),
      o.status,
      o.upi_ref || ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `amberflow_orders_backup_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Orders backup downloaded successfully!', 'success');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFAEF]">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-float">🛡️</div>
          <p className="text-amber-700 text-lg font-medium">Loading Admin Dashboard...</p>
        </div>
      </div>
    );
  }

  const pendingOrders = orders.filter((o) => o.status !== 'delivered');
  const revenue = orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
  const totalDelivery = orders.reduce((sum, o) => sum + parseFloat(o.delivery_charge || 0), 0);
  const totalPackaging = orders.reduce((sum, o) => sum + parseFloat(o.packaging_charge || 0), 0);
  const totalGst = orders.reduce((sum, o) => sum + parseFloat(o.gst || 0), 0);
  const netProfit = revenue - totalDelivery - totalPackaging - totalGst; // Simplified P&L model

  return (
    <div className="bg-[#FFFAEF] min-h-screen pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">🛡️</span>
                <h1 className="text-3xl md:text-4xl font-serif font-bold">Admin Portal</h1>
              </div>
              <p className="text-gray-400">Manage customers, vendors, and platform statistics securely.</p>
            </div>
            <Link href="/" className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 font-semibold px-6 py-3 rounded-xl transition-all self-start md:self-auto">
              ← Back to Store
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 -mt-6">
        
        {/* P&L Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg border border-amber-100 p-6">
            <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-1">Total Revenue</p>
            <p className="text-3xl font-black text-gray-900">₹{revenue.toFixed(0)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-amber-100 p-6">
            <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-1">Total Delivery Cost</p>
            <p className="text-3xl font-black text-orange-600">₹{totalDelivery.toFixed(0)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-amber-100 p-6">
            <p className="text-sm text-gray-500 font-bold uppercase tracking-wider mb-1">Total Packaging Cost</p>
            <p className="text-3xl font-black text-purple-600">₹{totalPackaging.toFixed(0)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-amber-100 p-6 border-l-4 border-l-green-500">
            <p className="text-sm text-green-600 font-bold uppercase tracking-wider mb-1">Net Platform Profit</p>
            <p className="text-3xl font-black text-green-700">₹{netProfit.toFixed(0)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'orders' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200/50' : 'bg-white text-gray-600 hover:bg-amber-50 border border-amber-100'
            }`}
          >
            📦 Manage Orders
          </button>
          <button
            onClick={() => setActiveTab('vendors')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'vendors' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200/50' : 'bg-white text-gray-600 hover:bg-amber-50 border border-amber-100'
            }`}
          >
            🏪 Vendor Approvals
            {vendors.filter(v => !v.is_approved_vendor).length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {vendors.filter(v => !v.is_approved_vendor).length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'products' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200/50' : 'bg-white text-gray-600 hover:bg-amber-50 border border-amber-100'
            }`}
          >
            🍯 Manage Products
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'users' ? 'bg-amber-600 text-white shadow-lg shadow-amber-200/50' : 'bg-white text-gray-600 hover:bg-amber-50 border border-amber-100'
            }`}
          >
            👥 Customers
          </button>
        </div>

        {activeTab === 'orders' && (
          <div className="bg-white rounded-2xl shadow-xl border border-amber-100 overflow-hidden">
            <div className="p-6 md:p-8 border-b border-amber-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h2 className="text-2xl font-bold text-gray-900">All Customer Orders</h2>
              <button
                onClick={handleDownloadCSV}
                className="bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-2.5 rounded-lg text-sm shadow flex items-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV Backup
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-amber-50/50 text-amber-900 text-sm uppercase tracking-wide">
                    <th className="p-4 font-bold border-b border-amber-100">Order ID</th>
                    <th className="p-4 font-bold border-b border-amber-100">Customer</th>
                    <th className="p-4 font-bold border-b border-amber-100">Amount (UPI Ref)</th>
                    <th className="p-4 font-bold border-b border-amber-100">Date</th>
                    <th className="p-4 font-bold border-b border-amber-100">Status</th>
                    <th className="p-4 font-bold border-b border-amber-100">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {orders.length === 0 ? (
                    <tr><td colSpan="6" className="p-8 text-center text-gray-500">No orders found.</td></tr>
                  ) : (
                    orders.map((order) => {
                      const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.confirmed;
                      return (
                        <tr key={order.id} className="hover:bg-amber-50/30 transition-colors">
                          <td className="p-4 font-mono font-bold text-gray-700">#{order.id}</td>
                          <td className="p-4">
                            <p className="font-bold text-gray-900">{order.user_name || order.shipping_name}</p>
                            <p className="text-xs text-gray-500">{order.user_email}</p>
                            <p className="text-xs text-gray-400">{order.shipping_city}, {order.shipping_state}</p>
                          </td>
                          <td className="p-4">
                            <p className="font-bold text-green-700">₹{parseFloat(order.total).toFixed(0)}</p>
                            {order.upi_ref && <p className="text-xs text-gray-500 mt-1">UPI: {order.upi_ref}</p>}
                          </td>
                          <td className="p-4 text-sm text-gray-600">
                            {new Date(order.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${statusConfig.color}`}>
                              {statusConfig.label}
                            </span>
                          </td>
                          <td className="p-4 flex gap-2">
                            <select
                              disabled={updating === order.id}
                              value={order.status}
                              onChange={(e) => handleUpdateStatus(order.id, e.target.value)}
                              className="text-sm bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 outline-none disabled:opacity-50 font-medium"
                            >
                              <option value="confirmed">Confirmed</option>
                              <option value="packed">Packed</option>
                              <option value="shipped">Shipped</option>
                              <option value="out_for_delivery">Out for Delivery</option>
                              <option value="delivered">Delivered</option>
                            </select>
                            <Link href={`/admin/invoice/${order.id}`} target="_blank" className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors">
                              Invoice
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'vendors' && (
          <div className="bg-white rounded-2xl shadow-xl border border-amber-100 overflow-hidden">
            <div className="p-6 md:p-8 border-b border-amber-100 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Vendor Approvals</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-amber-50/50 text-amber-900 text-sm uppercase tracking-wide">
                    <th className="p-4 font-bold border-b border-amber-100">Vendor Info</th>
                    <th className="p-4 font-bold border-b border-amber-100">Documents</th>
                    <th className="p-4 font-bold border-b border-amber-100">IP Address</th>
                    <th className="p-4 font-bold border-b border-amber-100">Status</th>
                    <th className="p-4 font-bold border-b border-amber-100">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {vendors.length === 0 ? (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-500">No vendors registered yet.</td></tr>
                  ) : (
                    vendors.map((vendor) => (
                      <tr key={vendor.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-gray-900">{vendor.name}</p>
                          <p className="text-xs text-gray-500">{vendor.email}</p>
                          <p className="text-xs text-gray-500">Phone: {vendor.phone}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-xs text-gray-700"><b>Aadhaar:</b> {vendor.aadhaar_number}</p>
                          {vendor.aadhaar_doc_url && <a href={`${API_URL}${vendor.aadhaar_doc_url}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View Aadhaar</a>}
                          <p className="text-xs text-gray-700 mt-2"><b>PAN:</b> {vendor.pan_number}</p>
                          {vendor.pan_doc_url && <a href={`${API_URL}${vendor.pan_doc_url}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View PAN</a>}
                        </td>
                        <td className="p-4 text-sm font-mono text-gray-500">{vendor.ip_address || 'Unknown'}</td>
                        <td className="p-4">
                          {vendor.is_approved_vendor ? (
                            <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full uppercase">Approved</span>
                          ) : (
                            <span className="bg-red-100 text-red-800 text-xs font-bold px-3 py-1 rounded-full uppercase">Pending</span>
                          )}
                        </td>
                        <td className="p-4">
                          {!vendor.is_approved_vendor && (
                            <button
                              onClick={() => handleApproveVendor(vendor.id)}
                              className="bg-amber-600 text-white font-bold px-4 py-2 rounded-lg text-sm shadow hover:bg-amber-700 transition-colors"
                            >
                              Approve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="bg-white rounded-2xl shadow-xl border border-amber-100 overflow-hidden">
            <div className="p-6 md:p-8 border-b border-amber-100 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Manage Platform Products</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-amber-50/50 text-amber-900 text-sm uppercase tracking-wide">
                    <th className="p-4 font-bold border-b border-amber-100">Image</th>
                    <th className="p-4 font-bold border-b border-amber-100">Product Info</th>
                    <th className="p-4 font-bold border-b border-amber-100">Price & Stock</th>
                    <th className="p-4 font-bold border-b border-amber-100">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {products.length === 0 ? (
                    <tr><td colSpan="4" className="p-8 text-center text-gray-500">No products available.</td></tr>
                  ) : (
                    products.map((product) => (
                      <tr key={product.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="p-4">
                          {product.image_url ? (
                            <img src={getImageUrl(product.image_url)} alt={product.name} className="w-16 h-16 rounded-lg object-cover shadow-sm" />
                          ) : (
                            <div className="w-16 h-16 bg-amber-100 rounded-lg flex items-center justify-center text-2xl">🍯</div>
                          )}
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-gray-900 text-lg">{product.name}</p>
                          <p className="text-sm text-amber-700 font-semibold">{product.honey_type || 'Standard'} Honey</p>
                          <p className="text-xs text-gray-500 line-clamp-1 max-w-xs">{product.description}</p>
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-gray-900">₹{product.price}</p>
                          <p className="text-xs text-gray-500">Stock: {product.stock}</p>
                          <p className="text-xs text-gray-500">Weight: {product.weight_g}g</p>
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => handleDeleteProduct(product.id)}
                            className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors shadow-sm"
                          >
                            Delete Product
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-white rounded-2xl shadow-xl border border-amber-100 overflow-hidden">
            <div className="p-6 md:p-8 border-b border-amber-100 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Registered Customers</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-amber-50/50 text-amber-900 text-sm uppercase tracking-wide">
                    <th className="p-4 font-bold border-b border-amber-100">Customer</th>
                    <th className="p-4 font-bold border-b border-amber-100">Location</th>
                    <th className="p-4 font-bold border-b border-amber-100">Registered On</th>
                    <th className="p-4 font-bold border-b border-amber-100">Total Orders</th>
                    <th className="p-4 font-bold border-b border-amber-100">Total Spent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {users.length === 0 ? (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-500">No customers registered yet.</td></tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-gray-900">{u.name}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                          <p className="text-xs text-gray-500">{u.phone || 'No phone'}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-sm text-gray-700">{(u.city || u.state) ? `${u.city || ''}, ${u.state || ''}` : 'Unknown'}</p>
                        </td>
                        <td className="p-4 text-sm text-gray-600">
                          {new Date(u.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="p-4">
                          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">{u.total_orders}</span>
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-green-700">₹{parseFloat(u.total_spent).toFixed(0)}</p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
