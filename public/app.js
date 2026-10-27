
const CURRENCY = "TND";
const DELIVERY_FEE = 5;

let products = [];
const cart = new Map();

const productGrid = document.getElementById("product-grid");
const cartItems = document.getElementById("cart-items");
const orderForm = document.getElementById("order-form");
const formMessage = document.getElementById("form-message");
const placeOrderButton = document.getElementById("place-order");

document.getElementById("year").textContent =
  new Date().getFullYear();

function money(amount) {
  return `${Number(amount).toFixed(2)} ${CURRENCY}`;
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");

    if (!response.ok) {
      throw new Error("Could not load the menu.");
    }

    products = await response.json();
    renderProducts();
  } catch (error) {
    productGrid.textContent =
      "The menu could not load. Please refresh the page.";
  }
}

function renderProducts() {
  productGrid.replaceChildren();

  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "product-card";

    const image = document.createElement("img");
    image.className = "product-image";
    image.src = product.image;
    image.alt = product.name;
    image.loading = "lazy";

    const content = document.createElement("div");
    content.className = "product-content";

    const title = document.createElement("h3");
    title.textContent = product.name;

    const description = document.createElement("p");
    description.textContent = product.description;

    const bottom = document.createElement("div");
    bottom.className = "product-bottom";

    const price = document.createElement("span");
    price.className = "price";
    price.textContent = money(product.price);

    const addButton = document.createElement("button");
    addButton.className = "add-button";
    addButton.type = "button";
    addButton.textContent = "Add +";
    addButton.setAttribute("aria-label", `Add ${product.name} to cart`);

    addButton.addEventListener("click", () => {
      addToCart(product.id);
    });

    bottom.append(price, addButton);
    content.append(title, description, bottom);
    card.append(image, content);
    productGrid.append(card);
  });
}

function addToCart(productId) {
  const current = cart.get(productId) || 0;

  if (current >= 20) {
    alert("You can order up to 20 of each menu item.");
    return;
  }

  cart.set(productId, current + 1);
  renderCart();
}

function changeQuantity(productId, delta) {
  const next = (cart.get(productId) || 0) + delta;

  if (next <= 0) {
    cart.delete(productId);
  } else if (next <= 20) {
    cart.set(productId, next);
  }

  renderCart();
}

function renderCart() {
  cartItems.replaceChildren();

  let subtotal = 0;
  let itemCount = 0;

  cart.forEach((quantity, productId) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    subtotal += product.price * quantity;
    itemCount += quantity;

    const row = document.createElement("div");
    row.className = "cart-item";

    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "cart-item-name";
    name.textContent = product.name;

    const linePrice = document.createElement("span");
    linePrice.className = "muted";
    linePrice.textContent = money(product.price * quantity);

    info.append(name, linePrice);

    const controls = document.createElement("div");
    controls.className = "cart-controls";

    const minus = document.createElement("button");
    minus.className = "quantity-button";
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", `Remove one ${product.name}`);
    minus.addEventListener("click", () => {
      changeQuantity(productId, -1);
    });

    const quantityLabel = document.createElement("span");
    quantityLabel.textContent = String(quantity);

    const plus = document.createElement("button");
    plus.className = "quantity-button";
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", `Add one ${product.name}`);
    plus.addEventListener("click", () => {
      changeQuantity(productId, 1);
    });

    controls.append(minus, quantityLabel, plus);
    row.append(info, controls);
    cartItems.append(row);
  });

  if (itemCount === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Your basket is empty. Add something delicious!";
    cartItems.append(empty);
  }

  const delivery = itemCount > 0 ? DELIVERY_FEE : 0;

  document.getElementById("cart-count").textContent =
    String(itemCount);
  document.getElementById("subtotal").textContent = money(subtotal);
  document.getElementById("delivery-fee").textContent = money(delivery);
  document.getElementById("total").textContent =
    money(subtotal + delivery);
}

document.getElementById("use-location").addEventListener("click", () => {
  const message = document.getElementById("location-message");

  if (!navigator.geolocation) {
    message.textContent = "Location is not supported by this browser.";
    return;
  }

  message.textContent = "Requesting location permission...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      document.getElementById("coordinates").value =
        `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

      message.textContent =
        "Location added. Please also enter your street address.";
    },
    () => {
      message.textContent =
        "Location unavailable. Allow location access or enter the address manually.";
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
});

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  formMessage.textContent = "";
  formMessage.className = "";

  if (cart.size === 0 &&
      !document.getElementById("custom-request").value.trim()) {
    formMessage.textContent =
      "Add products to your basket or describe a custom order.";
    formMessage.className = "error-message";
    return;
  }

  if (!orderForm.reportValidity()) return;

  const paymentMethod = document.getElementById("payment").value;

  if (paymentMethod === "online") {
    formMessage.textContent =
      "Online payments are not activated yet. Please choose cash on delivery.";
    formMessage.className = "error-message";
    return;
  }

  const coordinatesText =
    document.getElementById("coordinates").value.trim();

  let coordinates = null;

  if (coordinatesText) {
    const parts = coordinatesText.split(",").map(Number);

    if (
      parts.length !== 2 ||
      !parts.every(Number.isFinite) ||
      parts[0] < -90 || parts[0] > 90 ||
      parts[1] < -180 || parts[1] > 180
    ) {
      formMessage.textContent =
        "Enter valid coordinates as latitude, longitude.";
      formMessage.className = "error-message";
      return;
    }

    coordinates = { latitude: parts[0], longitude: parts[1] };
  }

  const order = {
    customerName: document.getElementById("customer-name").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    address: document.getElementById("address").value.trim(),
    locationNotes: document.getElementById("location-notes").value.trim(),
    coordinates,
    paymentMethod,
    notes: document.getElementById("notes").value.trim(),
    customRequest: document.getElementById("custom-request").value.trim(),
    items: Array.from(cart, ([productId, quantity]) => ({
      productId,
      quantity
    }))
  };

  placeOrderButton.disabled = true;
  placeOrderButton.textContent = "Submitting order...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not place your order.");
    }

    formMessage.textContent =
      `Thank you! Your order number is ${result.order.id}. ` +
      `Total: ${money(result.order.total)}. ` +
      "The shop will confirm any custom requests.";
    formMessage.className = "success-message";

    cart.clear();
    orderForm.reset();
    renderCart();

    // Keep the confirmation visible and prevent accidental resubmission.
    placeOrderButton.textContent = "Order placed successfully";
  } catch (error) {
    formMessage.textContent =
      error.message || "Something went wrong. Please try again.";
    formMessage.className = "error-message";
    placeOrderButton.disabled = false;
    placeOrderButton.textContent = "Place my order";
  }
});

loadProducts();
renderCart();
