import { FRONTEND_URL } from "../config/env.js";

// Shared helpers

function categoryText(items) {
    const hasKicks = items.some(i =>
        i.category?.toLowerCase().includes("kick") ||
        i.name?.toLowerCase().includes("kick")
    );
    return hasKicks ? "Castra Kicks" : "Castra Collection";
}

function itemsTableHtml(items) {
    return items.map(item => `
        <tr>
            <td style="width:52px;padding:10px 8px;border-bottom:1px solid #1f1f23;vertical-align:middle;">
                ${item.image
                    ? `<img src="${item.image}" alt="${item.name}" width="40" height="40" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid #27272a;display:block;" />`
                    : `<div style="width:40px;height:40px;border-radius:8px;background:#1c1c1f;border:1px solid #27272a;"></div>`}
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #1f1f23;vertical-align:middle;">
                <div style="font-size:13px;font-weight:600;color:#ffffff;">${item.name}</div>
                <div style="font-size:11px;color:#52525b;margin-top:2px;">Qty: ${item.quantity}</div>
            </td>
            <td style="padding:10px 8px;border-bottom:1px solid #1f1f23;vertical-align:middle;text-align:right;white-space:nowrap;font-size:13px;font-weight:700;color:#C6A16A;">
                KES ${(item.price * item.quantity).toLocaleString()}
            </td>
        </tr>
    `).join("");
}

function paymentStatusStyle(status) {
    switch ((status || "").toUpperCase()) {
        case "PAID":    return "color:#4ade80;";
        case "PENDING": return "color:#fbbf24;";
        case "FAILED":  return "color:#f87171;";
        default:        return "color:#e4e4e7;";
    }
}

// Shared layout primitives

const HEADER = (orderId, subtitle = "Households") => `
  <!-- Header -->
  <tr>
    <td style="background:#18181b;padding:24px 32px;border-bottom:1px solid #27272a;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="vertical-align:middle;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:12px;vertical-align:middle;">
                  <div style="width:40px;height:40px;border-radius:10px;background:#0A0A0A;border:1px solid rgba(198,161,106,0.4);text-align:center;line-height:40px;">
                    <img src="https://castrahouseholds.co.ke/branding/logo.png" alt="Castra" width="28" height="28" style="display:inline-block;vertical-align:middle;" />
                  </div>
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;line-height:1.1;">CASTRA</div>
                  <div style="font-size:9px;text-transform:uppercase;letter-spacing:3px;color:#C6A16A;font-weight:600;">${subtitle}</div>
                </td>
              </tr>
            </table>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <div style="font-size:12px;color:#52525b;font-weight:600;">#${orderId}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

const FOOTER = (note = "") => `
  <!-- Footer -->
  <tr>
    <td style="padding:20px 32px;border-top:1px solid #27272a;text-align:center;">
      <p style="margin:0;font-size:11px;color:#3f3f46;line-height:1.6;">
        ${note || `© ${new Date().getFullYear()} Castra Households. All rights reserved.`}
      </p>
    </td>
  </tr>`;

const ITEMS_TABLE = (items, total) => `
  <!-- Order items -->
  <tr>
    <td style="padding:0 32px 4px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr>
            <th style="width:52px;padding:10px 8px;border-bottom:1px solid #27272a;"></th>
            <th style="text-align:left;font-size:11px;color:#52525b;font-weight:600;padding:10px 8px;border-bottom:1px solid #27272a;text-transform:uppercase;letter-spacing:0.5px;">Item</th>
            <th style="text-align:right;font-size:11px;color:#52525b;font-weight:600;padding:10px 8px;border-bottom:1px solid #27272a;text-transform:uppercase;letter-spacing:0.5px;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsTableHtml(items)}
          <!-- Total row -->
          <tr>
            <td style="padding:14px 8px 4px;border-top:1px solid #27272a;"></td>
            <td style="padding:14px 8px 4px;border-top:1px solid #27272a;font-size:14px;font-weight:700;color:#ffffff;">Order Total</td>
            <td style="padding:14px 8px 4px;border-top:1px solid #27272a;text-align:right;font-size:15px;font-weight:700;color:#C6A16A;white-space:nowrap;">KES ${total.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
    </td>
  </tr>`;

function shell(subject, bodyRows) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#111111;border-radius:16px;border:1px solid #27272a;overflow:hidden;border-collapse:collapse;">
          ${bodyRows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

// USER order confirmed email

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
    const subject    = `Order Confirmed – #${orderId}`;

    const html = shell(subject, `
      ${HEADER(orderId)}

      <!-- Hero -->
      <tr>
        <td style="padding:32px 32px 24px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">You're all set, ${customerName}.</h1>
          <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.65;">
            Your order from the <strong style="color:#ffffff;">${collection}</strong> has been received and is being prepared.
            We'll reach out on WhatsApp to confirm delivery details.
          </p>
        </td>
      </tr>

      ${ITEMS_TABLE(items, total)}

      <!-- Message -->
      <tr>
        <td style="padding:20px 32px 8px;">
          <p style="margin:0 0 10px;font-size:13px;color:#a1a1aa;line-height:1.7;">
            Your order is confirmed. Delivery charges aren't included yet - we'll confirm them and
            coordinate the drop-off with you directly via WhatsApp shortly.
          </p>
          <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.7;">
            Want to check on your order anytime?
            <a href="${orderUrl}" style="color:#C6A16A;text-decoration:none;font-weight:600;">Track it here →</a>
          </p>
        </td>
      </tr>

      ${FOOTER()}
    `);

    const text = `You're all set, ${customerName}!

Your order from the ${collection} has been received.
Order: #${orderId}

${items.map(i => `  ${i.name} × ${i.quantity}  –  KES ${(i.price * i.quantity).toLocaleString()}`).join("\n")}

Order Total: KES ${total.toLocaleString()}

Your order is confirmed. Delivery charges will be confirmed via WhatsApp shortly.
Track your order: ${orderUrl}

© ${new Date().getFullYear()} Castra Households. All rights reserved.`;

    return { subject, text, html };
}

// ORDER STATUS UPDATE email 

const STATUS_COPY = {
    CONFIRMED: {
        heading: "Your order is confirmed.",
        body:    "We've locked in your order and are getting things moving. We'll reach out on WhatsApp shortly to sort out delivery.",
        emoji:   "✅",
    },
    PROCESSING: {
        heading: "We're processing your order.",
        body:    "Your order is being prepared and packed. Delivery details will be confirmed with you on WhatsApp soon.",
        emoji:   "📦",
    },
    DISPATCHED: {
        heading: "Your order is on its way!",
        body:    "Your items have left our hands and are headed to you. We'll follow up with delivery updates on WhatsApp.",
        emoji:   "🚚",
    },
    OUT_FOR_DELIVERY: {
        heading: "Out for delivery - almost there!",
        body:    "Your order is out for delivery right now. Expect it at your door very shortly.",
        emoji:   "📍",
    },
    DELIVERED: {
        heading: "Delivered! Enjoy your order.",
        body:    "Your order has been delivered. We hope everything arrived in perfect condition. Thank you for shopping with Castra!",
        emoji:   "🎉",
    },
};

/**
 * @param {Object} p
 * @param {string} p.customerName
 * @param {string} p.orderId
 * @param {string} p.orderStatus  CONFIRMED | PROCESSING | DISPATCHED | OUT_FOR_DELIVERY | DELIVERED
 * @param {Array}  p.items        [{ name, quantity, price, image?, category? }]
 * @param {number} p.total
 * @param {string} p.orderUrl
 */
export function buildOrderStatusEmail({ customerName = "there", orderId = "", orderStatus = "PROCESSING", items = [], total = 0, orderUrl = "" } = {}) {
    const copy    = STATUS_COPY[orderStatus] ?? STATUS_COPY.PROCESSING;
    const subject = `Order Update – #${orderId}`;

    const html = shell(subject, `
      ${HEADER(orderId)}

      <!-- Status icon + hero -->
      <tr>
        <td style="padding:32px 32px 24px;">
          <div style="width:56px;height:56px;border-radius:14px;background:rgba(198,161,106,0.12);border:1px solid rgba(198,161,106,0.25);margin:0 0 20px;text-align:center;font-size:26px;line-height:56px;">
            ${copy.emoji}
          </div>
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">${copy.heading}</h1>
          <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.65;">
            Hello <strong style="color:#ffffff;">${customerName}</strong>, ${copy.body}
          </p>
        </td>
      </tr>

      ${ITEMS_TABLE(items, total)}

      <!-- Message -->
      <tr>
        <td style="padding:20px 32px 8px;">
          <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.7;">
            You can follow your order's journey anytime -
            <a href="${orderUrl}" style="color:#C6A16A;text-decoration:none;font-weight:600;">track it here →</a>
          </p>
        </td>
      </tr>

      ${FOOTER()}
    `);

    const text = `Order Update – #${orderId}

Hello ${customerName}, ${copy.body}

Items:
${items.map(i => `  ${i.name} × ${i.quantity}  –  KES ${(i.price * i.quantity).toLocaleString()}`).join("\n")}

Order Total: KES ${total.toLocaleString()}

Track your order: ${orderUrl}

© ${new Date().getFullYear()} Castra Households. All rights reserved.`;

    return { subject, text, html };
}

// ADMIN new order email

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
    const subject     = `[New Order] #${orderId} – ${customerName} – Payment: ${paymentStatus}`;
    const methodLabel = paymentMethod === "MPESA_STK"    ? "M-Pesa STK Push"
                      : paymentMethod === "MPESA_MANUAL" ? "M-Pesa Manual (Paybill/Send Money)"
                      : paymentMethod;
    const statusStyle = paymentStatusStyle(paymentStatus);

    const infoRows = [
        ["Customer",       customerName],
        ["Email",          customerEmail || "–"],
        ["Phone",          customerPhone],
        ["Deliver to",     shippingAddress],
        ["Payment",        `${methodLabel}${stkPhone ? ` · ${stkPhone}` : ""}`],
        ["Payment status", `<span style="${statusStyle}font-weight:600;">${paymentStatus}</span>`],
        ["Order total",    `<span style="color:#C6A16A;font-weight:700;">KES ${total.toLocaleString()}</span>`],
    ].map(([label, value]) => `
        <tr>
          <td style="font-size:12px;color:#52525b;padding:8px 0;border-bottom:1px solid #1f1f23;width:130px;vertical-align:top;">${label}</td>
          <td style="font-size:13px;color:#e4e4e7;padding:8px 0;border-bottom:1px solid #1f1f23;font-weight:600;">${value}</td>
        </tr>
    `).join("");

    const html = shell(subject, `
      ${HEADER(orderId, "Households · Admin")}

      <!-- Hero -->
      <tr>
        <td style="padding:32px 32px 20px;">
          <div style="width:56px;height:56px;border-radius:14px;background:rgba(198,161,106,0.12);border:1px solid rgba(198,161,106,0.25);margin:0 0 20px;text-align:center;font-size:26px;line-height:56px;">
            🛒
          </div>
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">New order just dropped!</h1>
          <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.65;">
            <strong style="color:#ffffff;">${customerName}</strong> placed an order from the
            <strong style="color:#ffffff;">${collection}</strong>.
            Payment is currently <span style="${statusStyle}font-weight:600;">${paymentStatus}</span> - review and action below.
          </p>
        </td>
      </tr>

      <!-- Customer details -->
      <tr>
        <td style="padding:0 32px 20px;">
          <div style="background:#18181b;border-radius:10px;border:1px solid #27272a;padding:4px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${infoRows}
            </table>
          </div>
        </td>
      </tr>

      ${ITEMS_TABLE(items, total)}

      <!-- Message -->
      <tr>
        <td style="padding:20px 32px 8px;">
          <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.7;">
            Head over to the dashboard to process this order, confirm delivery charges, and coordinate with the customer via WhatsApp.
            <a href="${orderUrl}" style="color:#C6A16A;text-decoration:none;font-weight:600;">Open Admin Dashboard →</a>
          </p>
        </td>
      </tr>

      ${FOOTER(`© ${new Date().getFullYear()} Castra Households · Internal notification - do not forward.`)}
    `);

    const text = `[New Order] #${orderId} – Payment: ${paymentStatus}

Customer : ${customerName}
Email    : ${customerEmail || "–"}
Phone    : ${customerPhone}
Address  : ${shippingAddress}
Payment  : ${methodLabel}${stkPhone ? ` · ${stkPhone}` : ""}
Status   : ${paymentStatus}

Items:
${items.map(i => `  ${i.name} × ${i.quantity}  –  KES ${(i.price * i.quantity).toLocaleString()}`).join("\n")}

Order Total: KES ${total.toLocaleString()}

View order: ${orderUrl}

© ${new Date().getFullYear()} Castra Households · Internal notification.`;

    return { subject, text, html };
}

// PAYMENT STATUS email

const PAYMENT_COPY = {
    PAID: {
        heading: "Payment confirmed. You're good to go.",
        body:    "We've received your payment and your order is now fully confirmed. We'll be in touch on WhatsApp to coordinate delivery.",
        emoji:   "💳",
    },
    PENDING: {
        heading: "Payment is pending.",
        body:    "Your payment is still being processed. If you haven't completed the M-Pesa prompt, please do so - or reach out to us on WhatsApp and we'll sort it out.",
        emoji:   "⏳",
    },
    FAILED: {
        heading: "Payment was not completed.",
        body:    "We weren't able to confirm your payment. Don't worry - your order is still held. Please reach out to us on WhatsApp and we'll help you complete the payment.",
        emoji:   "⚠️",
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
    const subject = `Payment ${paymentStatus === "PAID" ? "Confirmed" : "Update"} – #${orderId}`;

    const receiptBlock = receiptNumber ? `
      <tr>
        <td style="padding:0 32px 16px;">
          <div style="background:#18181b;border-radius:8px;border:1px solid #27272a;padding:12px 16px;">
            <p style="margin:0;font-size:12px;color:#52525b;">M-Pesa Receipt</p>
            <p style="margin:4px 0 0;font-size:14px;font-weight:700;color:#C6A16A;">${receiptNumber}</p>
          </div>
        </td>
      </tr>` : "";

    const html = shell(subject, `
      ${HEADER(orderId)}

      <!-- Hero -->
      <tr>
        <td style="padding:32px 32px 24px;">
          <div style="width:56px;height:56px;border-radius:14px;background:rgba(198,161,106,0.12);border:1px solid rgba(198,161,106,0.25);margin:0 0 20px;text-align:center;font-size:26px;line-height:56px;">
            ${copy.emoji}
          </div>
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">${copy.heading}</h1>
          <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.65;">
            Hello <strong style="color:#ffffff;">${customerName}</strong>, ${copy.body}
          </p>
        </td>
      </tr>

      ${receiptBlock}

      ${ITEMS_TABLE(items, total)}

      <!-- Message -->
      <tr>
        <td style="padding:20px 32px 8px;">
          <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.7;">
            Track your order anytime -
            <a href="${orderUrl}" style="color:#C6A16A;text-decoration:none;font-weight:600;">visit here →</a>
          </p>
        </td>
      </tr>

      ${FOOTER()}
    `);

    const text = `Payment ${paymentStatus === "PAID" ? "Confirmed" : "Update"} – #${orderId}

Hello ${customerName}, ${copy.body}
${receiptNumber ? `\nM-Pesa Receipt: ${receiptNumber}` : ""}
Items:
${items.map(i => `  ${i.name} × ${i.quantity}  –  KES ${(i.price * i.quantity).toLocaleString()}`).join("\n")}

Order Total: KES ${total.toLocaleString()}

Track your order: ${orderUrl}

© ${new Date().getFullYear()} Castra Households. All rights reserved.`;

    return { subject, text, html };
}