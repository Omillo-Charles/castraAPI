import { FRONTEND_URL } from "../config/env.js";

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #000000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    color: #ffffff;
    line-height: 1.5;
  }
  .container { max-width: 600px; margin: 0 auto; background: #000000; }

  /* navbar */
  .navbar {
    padding: 20px 24px;
    border-bottom: 1px solid #27272a;
    display: table;
    width: 100%;
  }
  .navbar-left { display: table-cell; vertical-align: middle; }
  .navbar-right { display: table-cell; vertical-align: middle; text-align: right; }
  .logo-text { font-size: 18px; font-weight: 700; color: #ffffff; }
  .logo-sub { font-size: 11px; color: #71717a; margin-top: 2px; }
  .order-ref { font-size: 13px; color: #a1a1aa; }

  /* hero */
  .hero { padding: 24px 24px 20px; }
  .hero-heading { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 8px; line-height: 1.35; }
  .hero-sub { font-size: 13px; color: #a1a1aa; line-height: 1.65; }

  /* admin info block */
  .info-block { padding: 0 24px 4px; }
  .info-row { display: table; width: 100%; padding: 7px 0; border-bottom: 1px solid #18181b; }
  .info-row:last-child { border-bottom: none; }
  .info-label { display: table-cell; font-size: 12px; color: #52525b; width: 120px; }
  .info-value { display: table-cell; font-size: 13px; color: #e4e4e7; font-weight: 600; }
  .info-value.gold { color: #c6a16a; }
  .info-value.green { color: #4ade80; }
  .info-value.yellow { color: #fbbf24; }
  .info-value.red { color: #f87171; }

  /* table */
  .table-wrap { padding: 0 24px; }
  .order-table { width: 100%; border-collapse: collapse; }
  .order-table th {
    text-align: left; font-size: 11px; color: #52525b;
    font-weight: 600; padding: 10px 8px;
    border-bottom: 1px solid #27272a; text-transform: uppercase;
  }
  .order-table td { padding: 12px 8px; border-bottom: 1px solid #18181b; font-size: 13px; color: #e4e4e7; vertical-align: middle; }
  .order-table tr:last-child td { border-bottom: none; }
  .product-img { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; background: #18181b; border: 1px solid #27272a; display: block; }
  .product-img-placeholder { width: 40px; height: 40px; border-radius: 6px; background: #18181b; border: 1px solid #27272a; display: block; }
  .product-name { color: #ffffff; font-weight: 600; }
  .product-qty { font-size: 11px; color: #71717a; margin-top: 2px; }
  .price { color: #c6a16a; font-weight: 700; text-align: right; white-space: nowrap; }
  .total-row td { padding-top: 14px; border-top: 1px solid #27272a; }

  /* message */
  .message { padding: 20px 24px 4px; }
  .message-text { font-size: 13px; color: #a1a1aa; line-height: 1.7; margin-bottom: 10px; }
  .track-link { color: #c6a16a; text-decoration: none; font-weight: 600; }

  /* divider & footer */
  .divider { height: 1px; background: #27272a; margin: 20px 24px 0; }
  .footer { padding: 14px 24px 28px; text-align: center; font-size: 11px; color: #3f3f46; }
`;

// helpers

function categoryText(items) {
    const hasKicks = items.some(i =>
        i.category?.toLowerCase().includes("kick") ||
        i.name?.toLowerCase().includes("kick")
    );
    return hasKicks ? "Castra Kicks" : "Castra Collection";
}

function itemsTableHtml(items) {
    const rows = items.map(item => `
        <tr>
            <td style="width:52px;">
                ${item.image
                    ? `<img src="${item.image}" alt="${item.name}" class="product-img" />`
                    : `<div class="product-img-placeholder"></div>`}
            </td>
            <td>
                <div class="product-name">${item.name}</div>
                <div class="product-qty">Qty: ${item.quantity}</div>
            </td>
            <td class="price">KES ${(item.price * item.quantity).toLocaleString()}</td>
        </tr>
    `).join('');

    return rows;
}

function paymentStatusClass(status) {
    if (!status) return '';
    switch (status.toUpperCase()) {
        case 'PAID':    return 'green';
        case 'PENDING': return 'yellow';
        case 'FAILED':  return 'red';
        default:        return '';
    }
}

// USER email

/**
 * @param {Object} p
 * @param {string} p.customerName
 * @param {string} p.orderId
 * @param {Array}  p.items  [{ name, quantity, price, image?, category? }]
 * @param {number} p.total
 * @param {string} p.orderUrl
 */
export function buildUserOrderEmail({ customerName = "there", orderId = "", items = [], total = 0, orderUrl = "" } = {}) {
    const collection = categoryText(items);
    const subject    = `Order Confirmed - #${orderId}`;

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${subject}</title>
  <style>${css}</style>
</head>
<body>
<div class="container">

  <div class="navbar">
    <div class="navbar-left">
      <div class="logo-text">CASTRA</div>
      <div class="logo-sub">Households</div>
    </div>
    <div class="navbar-right">
      <div class="order-ref">#${orderId}</div>
    </div>
  </div>

  <div class="hero">
    <div class="hero-heading">You're all set, ${customerName}.</div>
    <div class="hero-sub">
      Your order from the <strong style="color:#ffffff;">${collection}</strong> has been received and is being prepared.
      We'll reach out on WhatsApp to confirm delivery details.
    </div>
  </div>

  <div class="table-wrap">
    <table class="order-table">
      <thead>
        <tr>
          <th style="width:52px;"></th>
          <th>Item</th>
          <th style="text-align:right;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsTableHtml(items)}
        <tr class="total-row">
          <td></td>
          <td style="font-weight:700;color:#ffffff;font-size:14px;">Order Total</td>
          <td class="price" style="font-size:15px;">KES ${total.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="message">
    <p class="message-text">
      Your order is confirmed. Delivery charges aren't included yet - we'll confirm them and
      coordinate the drop-off with you directly via WhatsApp shortly.
    </p>
    <p class="message-text">
      Want to check on your order anytime? <a href="${orderUrl}" class="track-link">Track it here</a>.
    </p>
  </div>

  <div class="divider"></div>
  <div class="footer">© ${new Date().getFullYear()} Castra Households. All rights reserved.</div>

</div>
</body>
</html>`.trim();

    const text = `You're all set, ${customerName}!

Your order from the ${collection} has been received.
Order: #${orderId}

${items.map(i => `  ${i.name} × ${i.quantity}  -  KES ${(i.price * i.quantity).toLocaleString()}`).join('\n')}

Order Total: KES ${total.toLocaleString()}

Your order is confirmed. Delivery charges will be confirmed via WhatsApp shortly.
Track your order: ${orderUrl}

© ${new Date().getFullYear()} Castra Households. All rights reserved.`.trim();

    return { subject, text, html };
}

// ORDER STATUS UPDATE email

const STATUS_COPY = {
    CONFIRMED: {
        heading: "Your order is confirmed.",
        body:    "We've locked in your order and are getting things moving. We'll reach out on WhatsApp shortly to sort out delivery.",
    },
    PROCESSING: {
        heading: "We're processing your order.",
        body:    "Your order is being prepared and packed. Delivery details will be confirmed with you on WhatsApp soon.",
    },
    DISPATCHED: {
        heading: "Your order is on its way!",
        body:    "Your items have left our hands and are headed to you. We'll follow up with delivery updates on WhatsApp.",
    },
    OUT_FOR_DELIVERY: {
        heading: "Out for delivery - almost there!",
        body:    "Your order is out for delivery right now. Expect it at your door very shortly.",
    },
    DELIVERED: {
        heading: "Delivered! Enjoy your order.",
        body:    "Your order has been delivered. We hope everything arrived in perfect condition. Thank you for shopping with Castra!",
    },
};

/**
 * @param {Object} p
 * @param {string} p.customerName
 * @param {string} p.orderId
 * @param {string} p.orderStatus  One of: CONFIRMED | PROCESSING | DISPATCHED | OUT_FOR_DELIVERY | DELIVERED
 * @param {Array}  p.items        [{ name, quantity, price, image?, category? }]
 * @param {number} p.total
 * @param {string} p.orderUrl
 */
export function buildOrderStatusEmail({ customerName = "there", orderId = "", orderStatus = "PROCESSING", items = [], total = 0, orderUrl = "" } = {}) {
    const copy    = STATUS_COPY[orderStatus] ?? STATUS_COPY.PROCESSING;
    const subject = `Order Update - #${orderId}`;

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${subject}</title>
  <style>${css}</style>
</head>
<body>
<div class="container">

  <div class="navbar">
    <div class="navbar-left">
      <div class="logo-text">CASTRA</div>
      <div class="logo-sub">Households</div>
    </div>
    <div class="navbar-right">
      <div class="order-ref">#${orderId}</div>
    </div>
  </div>

  <div class="hero">
    <div class="hero-heading">${copy.heading}</div>
    <div class="hero-sub">Hello <strong style="color:#ffffff;">${customerName}</strong>, ${copy.body}</div>
  </div>

  <div class="table-wrap">
    <table class="order-table">
      <thead>
        <tr>
          <th style="width:52px;"></th>
          <th>Item</th>
          <th style="text-align:right;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsTableHtml(items)}
        <tr class="total-row">
          <td></td>
          <td style="font-weight:700;color:#ffffff;font-size:14px;">Order Total</td>
          <td class="price" style="font-size:15px;">KES ${total.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="message">
    <p class="message-text">
      You can follow your order's journey anytime - <a href="${orderUrl}" class="track-link">track it here</a>.
    </p>
  </div>

  <div class="divider"></div>
  <div class="footer">© ${new Date().getFullYear()} Castra Households. All rights reserved.</div>

</div>
</body>
</html>`.trim();

    const text = `Order Update - #${orderId}

Hello ${customerName}, ${copy.body}

Items:
${items.map(i => `  ${i.name} × ${i.quantity}  -  KES ${(i.price * i.quantity).toLocaleString()}`).join('\n')}

Order Total: KES ${total.toLocaleString()}

Track your order: ${orderUrl}

© ${new Date().getFullYear()} Castra Households. All rights reserved.`.trim();

    return { subject, text, html };
}

// ADMIN email

/**
 * @param {Object} p
 * @param {string} p.customerName
 * @param {string} p.customerEmail
 * @param {string} p.customerPhone
 * @param {string} p.orderId
 * @param {Array}  p.items  [{ name, quantity, price, image?, category? }]
 * @param {number} p.subtotal
 * @param {number} p.total
 * @param {string} p.shippingAddress
 * @param {string} p.paymentMethod
 * @param {string} p.paymentStatus   PENDING | PAID | FAILED
 * @param {string} p.stkPhone
 * @param {string} p.orderUrl
 */
export function buildAdminOrderEmail({
    customerName    = "",
    customerEmail   = "",
    customerPhone   = "",
    orderId         = "",
    items           = [],
    subtotal        = 0,
    total           = 0,
    shippingAddress = "",
    paymentMethod   = "MPESA_STK",
    paymentStatus   = "PENDING",
    stkPhone        = "",
    orderUrl        = "",
} = {}) {
    const collection  = categoryText(items);
    const statusClass = paymentStatusClass(paymentStatus);
    const subject     = `[New Order] #${orderId} - ${customerName} - Payment: ${paymentStatus}`;

    const methodLabel = paymentMethod === "MPESA_STK" ? "M-Pesa STK Push" : paymentMethod;

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${subject}</title>
  <style>${css}</style>
</head>
<body>
<div class="container">

  <div class="navbar">
    <div class="navbar-left">
      <div class="logo-text">CASTRA</div>
      <div class="logo-sub">Households · Admin</div>
    </div>
    <div class="navbar-right">
      <div class="order-ref">#${orderId}</div>
    </div>
  </div>

  <div class="hero">
    <div class="hero-heading">New order just dropped!!</div>
    <div class="hero-sub">
      <strong style="color:#ffffff;">${customerName}</strong> placed an order from the <strong style="color:#ffffff;">${collection}</strong>.
      Payment is currently <strong class="${statusClass}" style="color:${statusClass === 'green' ? '#4ade80' : statusClass === 'yellow' ? '#fbbf24' : statusClass === 'red' ? '#f87171' : '#e4e4e7'};">${paymentStatus}</strong> - review and action below.
    </div>
  </div>

  <div class="info-block">
    <div class="info-row">
      <span class="info-label">Customer</span>
      <span class="info-value">${customerName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Email</span>
      <span class="info-value">${customerEmail || '-'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Phone</span>
      <span class="info-value">${customerPhone}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Deliver to</span>
      <span class="info-value">${shippingAddress}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Payment</span>
      <span class="info-value">${methodLabel}${stkPhone ? ` · ${stkPhone}` : ''}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Payment status</span>
      <span class="info-value ${statusClass}">${paymentStatus}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Order total</span>
      <span class="info-value gold">KES ${total.toLocaleString()}</span>
    </div>
  </div>

  <div class="table-wrap" style="margin-top:16px;">
    <table class="order-table">
      <thead>
        <tr>
          <th style="width:52px;"></th>
          <th>Item</th>
          <th style="text-align:right;">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsTableHtml(items)}
        <tr class="total-row">
          <td></td>
          <td style="font-weight:700;color:#ffffff;font-size:14px;">Order Total</td>
          <td class="price" style="font-size:15px;">KES ${total.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="message">
    <p class="message-text">
      Head over to the dashboard to process this order, confirm delivery charges, and coordinate with the customer via WhatsApp.
      <a href="${orderUrl}" class="track-link">View order in dashboard →</a>
    </p>
  </div>

  <div class="divider"></div>
  <div class="footer">© ${new Date().getFullYear()} Castra Households · Internal notification - do not forward.</div>

</div>
</body>
</html>`.trim();

    const text = `[New Order] #${orderId} - Payment: ${paymentStatus}

Customer : ${customerName}
Email    : ${customerEmail || '-'}
Phone    : ${customerPhone}
Address  : ${shippingAddress}
Payment  : ${methodLabel}${stkPhone ? ` · ${stkPhone}` : ''}
Status   : ${paymentStatus}

Items:
${items.map(i => `  ${i.name} × ${i.quantity}  -  KES ${(i.price * i.quantity).toLocaleString()}`).join('\n')}

Order Total: KES ${total.toLocaleString()}

View order: ${orderUrl}

© ${new Date().getFullYear()} Castra Households · Internal notification.`.trim();

    return { subject, text, html };
}

// PAYMENT STATUS email 

const PAYMENT_COPY = {
    PAID: {
        heading: "Payment confirmed. You're good to go.",
        body:    "We've received your payment and your order is now fully confirmed. We'll be in touch on WhatsApp to coordinate delivery.",
    },
    PENDING: {
        heading: "Payment is pending.",
        body:    "Your payment is still being processed. If you haven't completed the M-Pesa prompt, please do so or reach out to us on WhatsApp and we'll sort it out.",
    },
    FAILED: {
        heading: "Payment was not completed.",
        body:    "We weren't able to confirm your payment. Don't worry - your order is still held. Please reach out to us on WhatsApp and we'll help you complete the payment.",
    },
};

/**
 * @param {Object} p
 * @param {string} p.customerName
 * @param {string} p.orderId
 * @param {string} p.paymentStatus   PAID | PENDING | FAILED
 * @param {string} [p.receiptNumber] M-Pesa receipt number, shown when PAID
 * @param {Array}  p.items           [{ name, quantity, price, image? }]
 * @param {number} p.total
 * @param {string} p.orderUrl
 */
export function buildPaymentStatusEmail({ customerName = "there", orderId = "", paymentStatus = "PAID", receiptNumber = "", items = [], total = 0, orderUrl = "" } = {}) {
    const copy    = PAYMENT_COPY[paymentStatus] ?? PAYMENT_COPY.PENDING;
    const subject = `Payment ${paymentStatus === "PAID" ? "Confirmed" : "Update"} - #${orderId}`;

    const receiptRow = receiptNumber ? `
      <div class="message" style="padding-top:4px;padding-bottom:4px;">
        <p class="message-text" style="color:#e4e4e7;">
          M-Pesa Receipt: <strong style="color:#c6a16a;">${receiptNumber}</strong>
        </p>
      </div>` : "";

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${subject}</title>
  <style>${css}</style>
</head>
<body>
<div class="container">

  <div class="navbar">
    <div class="navbar-left">
      <div class="logo-text">CASTRA</div>
      <div class="logo-sub">Households</div>
    </div>
    <div class="navbar-right">
      <div class="order-ref">#${orderId}</div>
    </div>
  </div>

  <div class="hero">
    <div class="hero-heading">${copy.heading}</div>
    <div class="hero-sub">Hello <strong style="color:#ffffff;">${customerName}</strong>, ${copy.body}</div>
  </div>

  ${receiptRow}

  <div class="table-wrap">
    <table class="order-table">
      <thead>
        <tr>
          <th style="width:52px;"></th>
          <th>Item</th>
          <th style="text-align:right;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${itemsTableHtml(items)}
        <tr class="total-row">
          <td></td>
          <td style="font-weight:700;color:#ffffff;font-size:14px;">Order Total</td>
          <td class="price" style="font-size:15px;">KES ${total.toLocaleString()}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="message">
    <p class="message-text">
      Track your order anytime - <a href="${orderUrl}" class="track-link">visit here</a>.
    </p>
  </div>

  <div class="divider"></div>
  <div class="footer">© ${new Date().getFullYear()} Castra Households. All rights reserved.</div>

</div>
</body>
</html>`.trim();

    const text = `Payment ${paymentStatus === "PAID" ? "Confirmed" : "Update"} - #${orderId}

Hello ${customerName}, ${copy.body}
${receiptNumber ? `\nM-Pesa Receipt: ${receiptNumber}` : ""}
Items:
${items.map(i => `  ${i.name} × ${i.quantity}  -  KES ${(i.price * i.quantity).toLocaleString()}`).join('\n')}

Order Total: KES ${total.toLocaleString()}

Track your order: ${orderUrl}

© ${new Date().getFullYear()} Castra Households. All rights reserved.`.trim();

    return { subject, text, html };
}
