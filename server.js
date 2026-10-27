
const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Demo storage only: orders disappear when the server restarts.
// Use a database for production.
const orders = new Map();

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const products = [
  {
    id: "croissant",
    name: "Butter Croissant",
    description: "Flaky, golden, buttery pastry.",
    price: 3.5,
    image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=700&q=80"
  },
  {
    id: "chocolate",
    name: "Chocolate Croissant",
    description: "A delicious pastry with rich chocolate.",
    price: 4.5,
    image: "https://images.unsplash.com/photo-1623334044303-241021148842?auto=format&fit=crop&w=700&q=80"
  },
  {
    id: "macaron",
    name: "French Macarons",
    description: "Delicate, colorful, sweet little treats.",
    price: 2.5,
    image: "https://images.unsplash.com/photo-1569864358642-9d1684040f43?auto=format&fit=crop&w=700&q=80"
  },
  {
    id: "cupcake",
    name: "Vanilla Cupcake",
    description: "Soft cake with creamy frosting.",
    price: 5,
    image: "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=700&q=80"
  },
  {
    id: "cake",
    name: "Chocolate Cake Slice",
    description: "Rich chocolate cake for chocolate lovers.",
    price: 7.5,
    image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=80"
  },
  {
    id: "cookie",
    name: "Chocolate Chip Cookies",
    description: "Freshly baked cookies with chocolate chips.",
    price: 2,
    image: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=700&q=80"
  }
];

const DELIVERY_FEE = 5;
const MAX_ITEMS = 20;

function isText(value, maxLength) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength;
}

function optionalText(value, maxLength) {
  return value === undefined ||
    value === null ||
    (typeof value === "string" && value.length <= maxLength);
}

function isValidCoordinates(coords) {
  if (coords === null || coords === undefined) return true;

  return (
    coords &&
    typeof coords === "object" &&
    !Array.isArray(coords) &&
    Number.isFinite(coords.latitude) &&
    Number.isFinite(coords.longitude) &&
    coords.latitude >= -90 &&
    coords.latitude <= 90 &&
    coords.longitude >= -180 &&
    coords.longitude <= 180
  );
}

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    return res.status(503).json({
      error: "Admin access is not configured."
    });
  }

  const supplied = req.get("Authorization") || "";
  const expectedHeader = `Bearer ${expected}`;

  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expectedHeader);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  next();
}

// Public menu
app.get("/api/products", (req, res) => {
  res.json(products);
});

// Create an order
app.post("/api/orders", (req, res) => {
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Invalid order." });
  }

  const {
    customerName,
    phone,
    address,
    locationNotes = "",
    coordinates = null,
    paymentMethod,
    notes = "",
    customRequest = "",
    items
  } = body;

  if (!isText(customerName, 100)) {
    return res.status(400).json({
      error: "Enter a valid customer name."
    });
  }

  if (!isText(phone, 30)) {
    return res.status(400).json({
      error: "Enter a valid phone number."
    });
  }

  if (!isText(address, 500)) {
    return res.status(400).json({
      error: "Enter a delivery address."
    });
  }

  if (
    !optionalText(locationNotes, 300) ||
    !optionalText(notes, 500) ||
    !optionalText(customRequest, 1000)
  ) {
    return res.status(400).json({
      error: "One of the text fields is too long."
    });
  }

  if (!isValidCoordinates(coordinates)) {
    return res.status(400).json({
      error: "Invalid delivery coordinates."
    });
  }

  if (paymentMethod !== "cash") {
    return res.status(400).json({
      error: "Online payments are not enabled. Choose cash on delivery."
    });
  }

  if (!Array.isArray(items) || items.length > products.length) {
    return res.status(400).json({
      error: "Invalid order items."
    });
  }

  if (
    items.some((item) =>
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof item.productId !== "string" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_ITEMS
    )
  ) {
    return res.status(400).json({
      error: "Each item must have a valid product and quantity."
    });
  }

  const ids = items.map((item) => item.productId);

  if (new Set(ids).size !== ids.length) {
    return res.status(400).json({
      error: "Duplicate products are not allowed. Combine quantities."
    });
  }

  const custom = customRequest.trim();

  if (items.length === 0 && !custom) {
    return res.status(400).json({
      error: "Add a menu item or describe your custom request."
    });
  }

  const orderItems = [];

  for (const item of items) {
    const product = products.find(
      (product) => product.id === item.productId
    );

    if (!product) {
      return res.status(400).json({
        error: `Unknown product: ${item.productId}`
      });
    }

    orderItems.push({
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: item.quantity,
      lineTotal: Number(
        (product.price * item.quantity).toFixed(2)
      )
    });
  }

  const subtotal = Number(
    orderItems.reduce((sum, item) => sum + item.lineTotal, 0)
      .toFixed(2)
  );

  const deliveryFee = orderItems.length > 0 ? DELIVERY_FEE : 0;
  const total = Number((subtotal + deliveryFee).toFixed(2));

  const now = new Date().toISOString();

  const order = {
    id: crypto.randomUUID(),
    customerName: customerName.trim(),
    phone: phone.trim(),
    address: address.trim(),
    locationNotes: locationNotes.trim(),
    coordinates,
    paymentMethod: "cash",
    paymentStatus: "unpaid",
    notes: notes.trim(),
    customRequest: custom,
    items: orderItems,
    subtotal,
    deliveryFee,
    total,
    currency: "TND",
    status: custom ? "pending_confirmation" : "received",
    createdAt: now,
    updatedAt: now
  };

  orders.set(order.id, order);

  return res.status(201).json({
    message: "Order received successfully.",
    order: {
      id: order.id,
      status: order.status,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      currency: order.currency,
      createdAt: order.createdAt
    }
  });
});

// Customer order status lookup.
// The random order ID is not a substitute for a full privacy system.
app.get("/api/orders/:id", (req, res) => {
  const order = orders.get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: "Order not found." });
  }

  res.json({
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  });
});

// Shop-owner endpoint: list all orders.
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  res.json(
    Array.from(orders.values()).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    )
  );
});

// Shop-owner endpoint: update order status.
app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const order = orders.get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: "Order not found." });
  }

  const allowedStatuses = [
    "received",
    "pending_confirmation",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "cancelled"
  ];

  const { status } = req.body || {};

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      error: "Invalid order status."
    });
  }

  order.status = status;
  order.updatedAt = new Date().toISOString();

  res.json({
    message: "Order status updated.",
    order: {
      id: order.id,
      status: order.status,
      updatedAt: order.updatedAt
    }
  });
});

// Return JSON for unexpected server errors without exposing internals.
app.use((err, req, res, next) => {
  console.error("Request failed:", err.message);

  if (res.headersSent) return next(err);

  res.status(err.status || 500).json({
    error: err.status === 413
      ? "Request is too large."
      : "Something went wrong on the server."
  });
});

app.listen(PORT, () => {
  console.log(`Sweet Crust is running at http://localhost:${PORT}`);
});
