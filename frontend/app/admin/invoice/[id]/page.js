'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function InvoicePage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.push('/login');
      return;
    }

    fetch(`${API_URL}/api/orders/${params.id}`, {
      credentials: 'include'
    })
    .then(r => r.json())
    .then(resData => {
      if (resData.error) {
        alert(resData.error);
        router.push('/admin');
      } else {
        setData(resData);
      }
    })
    .catch(() => alert('Failed to fetch invoice data'))
    .finally(() => setLoading(false));
  }, [params.id, router]);

  if (loading) return <div className="p-10 text-center">Loading Invoice...</div>;
  if (!data) return <div className="p-10 text-center">Invoice not found.</div>;

  const { order, items } = data;

  return (
    <div className="bg-gray-100 min-h-screen p-8 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto bg-white p-10 rounded-xl shadow-xl print:shadow-none print:rounded-none">
        
        {/* Actions (Hidden in Print) */}
        <div className="flex justify-between items-center mb-8 print:hidden">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 font-bold">← Back</button>
          <button onClick={() => window.print()} className="bg-amber-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-amber-700">
            Print Invoice 🖨️
          </button>
        </div>

        {/* Invoice Header */}
        <div className="flex justify-between items-start border-b-2 border-gray-200 pb-8 mb-8">
          <div>
            <h1 className="text-4xl font-serif font-black text-amber-900 mb-2">AmberFlow</h1>
            <p className="text-gray-500 text-sm">Premium Quality Honey</p>
            <p className="text-gray-500 text-sm">123 Beehive Avenue, Nature Park</p>
            <p className="text-gray-500 text-sm">support@amberflow.com</p>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">INVOICE</h2>
            <p className="text-gray-600 font-medium">Invoice No: <span className="font-mono text-gray-900">INV-{order.id.toString().padStart(6, '0')}</span></p>
            <p className="text-gray-600 font-medium">Date: <span className="text-gray-900">{new Date(order.created_at).toLocaleDateString('en-IN')}</span></p>
            {order.upi_ref && <p className="text-gray-600 font-medium">UPI Ref: <span className="text-gray-900 font-mono">{order.upi_ref}</span></p>}
          </div>
        </div>

        {/* Bill To & Ship To */}
        <div className="flex justify-between mb-8">
          <div className="w-1/2 pr-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-2">Bill To</h3>
            <p className="font-bold text-gray-800">{order.shipping_name}</p>
            <p className="text-gray-600">{order.shipping_address}</p>
            <p className="text-gray-600">{order.shipping_city}, {order.shipping_state}</p>
            <p className="text-gray-600">PIN: {order.shipping_pincode}</p>
            <p className="text-gray-600 mt-1">Phone: {order.shipping_phone}</p>
          </div>
          <div className="w-1/2 pl-4 border-l border-gray-200">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-2">Shipping Details</h3>
            <p className="font-medium text-gray-800">Partner: {order.delivery_partner}</p>
            <p className="font-medium text-gray-800">Tracking: {order.tracking_id}</p>
            <p className="font-medium text-gray-800 mt-2">Status: <span className="uppercase text-amber-700">{order.status}</span></p>
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full text-left mb-8">
          <thead>
            <tr className="border-b-2 border-gray-800 text-gray-800">
              <th className="py-3 font-bold uppercase text-sm">Item Description</th>
              <th className="py-3 font-bold uppercase text-sm text-center">Qty</th>
              <th className="py-3 font-bold uppercase text-sm text-right">Unit Price</th>
              <th className="py-3 font-bold uppercase text-sm text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-4 text-gray-800 font-medium">{item.product_name || 'Deleted Product'}</td>
                <td className="py-4 text-center text-gray-600">{item.quantity}</td>
                <td className="py-4 text-right text-gray-600">₹{parseFloat(item.price).toFixed(2)}</td>
                <td className="py-4 text-right text-gray-800 font-bold">₹{(item.quantity * item.price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-1/2 max-w-sm space-y-3">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal:</span>
              <span>₹{parseFloat(order.subtotal).toFixed(2)}</span>
            </div>
            {parseFloat(order.discount) > 0 && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>Discount ({order.promo_code}):</span>
                <span>- ₹{parseFloat(order.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>Delivery Charge:</span>
              <span>+ ₹{parseFloat(order.delivery_charge || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Packaging Charge:</span>
              <span>+ ₹{parseFloat(order.packaging_charge || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>GST (18%):</span>
              <span>+ ₹{parseFloat(order.gst || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xl font-black text-amber-900 border-t-2 border-amber-900 pt-3">
              <span>Grand Total:</span>
              <span>₹{parseFloat(order.total).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p className="font-bold mb-1">Thank you for your business!</p>
          <p>Once sold and delivered, items cannot be returned (No Return Policy).</p>
        </div>

      </div>
    </div>
  );
}
