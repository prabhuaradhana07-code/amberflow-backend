const nodemailer = require('nodemailer');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

/**
 * AmberFlow Email Utility
 * -----------------------
 * Uses Gmail SMTP via Nodemailer.
 * Falls back to console logging when EMAIL_USER / EMAIL_PASS are not configured.
 */

// Build transporter lazily so the module loads even without env vars
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️  EMAIL_USER / EMAIL_PASS not set – emails will be logged to console.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: true,
    },
  });

  return transporter;
}

/**
 * Send a password-reset code to the user.
 * @param {string} email - Recipient address
 * @param {string} code  - 6-digit reset code
 */
async function sendPasswordResetCode(email, code) {
  const subject = 'AmberFlow – Password Reset Code';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e0c97f;border-radius:8px">
      <h2 style="color:#b8860b">🍯 AmberFlow Password Reset</h2>
      <p>You requested a password reset. Use the code below within <strong>15 minutes</strong>:</p>
      <div style="text-align:center;margin:24px 0">
        <span style="font-size:32px;letter-spacing:6px;font-weight:bold;color:#b8860b">${code}</span>
      </div>
      <p style="color:#888;font-size:13px">If you did not request this, please ignore this email.</p>
    </div>
  `;

  await _send(email, subject, html);
}

/**
 * Send an order confirmation email.
 * @param {string} email     - Recipient address
 * @param {object} orderData - Order details (id, total, items, shipping, tracking, etc.)
 */
async function sendOrderConfirmation(email, orderData) {
  const itemRows = (orderData.items || [])
    .map(
      (i) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee">${i.name || `Product #${i.product_id}`}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">₹${Number(i.price).toFixed(2)}</td>
        </tr>`
    )
    .join('');

  const subject = `AmberFlow – Order #${orderData.id} Confirmed!`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e0c97f;border-radius:8px">
      <h2 style="color:#b8860b">🍯 Order Confirmed!</h2>
      <p>Thank you for your order, <strong>${orderData.shipping_name || 'Customer'}</strong>.</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead><tr style="background:#fdf5e6">
          <th style="padding:8px 12px;text-align:left">Item</th>
          <th style="padding:8px 12px;text-align:center">Qty</th>
          <th style="padding:8px 12px;text-align:right">Price</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>

      ${orderData.discount > 0 ? `<p>Discount: <strong>-₹${Number(orderData.discount).toFixed(2)}</strong></p>` : ''}
      <p style="font-size:18px"><strong>Total: ₹${Number(orderData.total).toFixed(2)}</strong></p>

      <hr style="border:none;border-top:1px solid #e0c97f;margin:16px 0">
      <p><strong>Delivery Partner:</strong> ${orderData.delivery_partner}</p>
      <p><strong>Tracking ID:</strong> ${orderData.tracking_id}</p>
      <p><strong>Estimated Delivery:</strong> ${orderData.estimated_delivery}</p>
      <p><strong>Ship To:</strong> ${orderData.shipping_address}, ${orderData.shipping_city}, ${orderData.shipping_state} – ${orderData.shipping_pincode}</p>

      <p style="color:#888;font-size:13px;margin-top:24px">If you have any questions, just reply to this email.</p>
    </div>
  `;

  await _send(email, subject, html);
}

/**
 * Send an order status update email.
 * @param {string} email     - Recipient address
 * @param {object} orderData - Order details
 * @param {string} newStatus - Updated status string
 */
async function sendOrderStatusUpdate(email, orderData, newStatus) {
  const subject = `AmberFlow – Order #${orderData.id} is now "${newStatus}"`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e0c97f;border-radius:8px">
      <h2 style="color:#b8860b">🍯 Order Update</h2>
      <p>Your order <strong>#${orderData.id}</strong> status has been updated to:</p>
      <div style="text-align:center;margin:20px 0">
        <span style="display:inline-block;padding:10px 24px;background:#fdf5e6;border-radius:6px;font-size:18px;font-weight:bold;color:#b8860b">
          ${newStatus}
        </span>
      </div>
      ${orderData.tracking_id ? `<p><strong>Tracking ID:</strong> ${orderData.tracking_id}</p>` : ''}
      ${orderData.delivery_partner ? `<p><strong>Delivery Partner:</strong> ${orderData.delivery_partner}</p>` : ''}
      <p style="color:#888;font-size:13px;margin-top:24px">Thank you for shopping with AmberFlow!</p>
    </div>
  `;

  await _send(email, subject, html);
}

/* ── Internal helper ──────────────────────────────────────────── */

async function _send(to, subject, html) {
  const transport = getTransporter();

  if (!transport) {
    // Fallback: log to console when SMTP is not configured
    console.log('──────────────── EMAIL (console fallback) ────────────────');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    (HTML email – see raw below)`);
    console.log(html);
    console.log('──────────────────────────────────────────────────────────');
    return;
  }

  try {
    await transport.sendMail({
      from: `"AmberFlow 🍯" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`📧 Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
    // Do not throw – email failures should not break the request flow
  }
}

module.exports = {
  sendPasswordResetCode,
  sendOrderConfirmation,
  sendOrderStatusUpdate,
};
