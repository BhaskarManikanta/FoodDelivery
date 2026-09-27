const BASE_URL = "http://localhost:8080";

const AGENT_EMAIL = "agent@example.com";
const AGENT_PASSWORD = "password123";

const UPDATE_INTERVAL = 2000;

// Starting location.
// Change these coordinates if you want.
let latitude = 17.385044;
let longitude = 78.486671;

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function login() {
  console.log(`Logging in as ${AGENT_EMAIL}...`);

  const data = await request("/api/users/login", {
    method: "POST",
    body: JSON.stringify({
      email: AGENT_EMAIL,
      password: AGENT_PASSWORD,
    }),
  });

  const token =
    data.token ||
    data.accessToken ||
    data.data?.token ||
    data.data?.accessToken;

  if (!token) {
    throw new Error(
      `Login succeeded but JWT was not found in response: ${JSON.stringify(
        data
      )}`
    );
  }

  console.log("Agent login successful.");

  return token;
}

async function getAssignedOrders(token) {
  /*
   * Change this endpoint if your Order Service exposes
   * assigned orders under a different route.
   */
  const data = await request("/api/orders/agent/mine", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return (
    data.orders ||
    data.data?.orders ||
    data.data ||
    data ||
    []
  );
}

function getOrderId(order) {
  return order.orderId || order._id || order.id;
}

function isActiveOrder(order) {
  const status = String(order.status || "").toUpperCase();

  return ![
    "DELIVERED",
    "CANCELLED",
    "COMPLETED",
  ].includes(status);
}

async function sendLocation(token, orderId) {
  /*
   * Small movement to simulate a moving agent.
   */
  latitude += 0.00015;
  longitude += 0.00012;

  const payload = {
    orderId,
    latitude,
    longitude,
  };

  await request("/api/agents/location", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  console.log(
    `[${new Date().toISOString()}] ` +
      `order=${orderId} ` +
      `lat=${latitude.toFixed(6)} ` +
      `lng=${longitude.toFixed(6)}`
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  try {
    console.log("====================================");
    console.log(" Agent Live Location Simulator");
    console.log("====================================");

    const token = await login();

    console.log("Finding assigned orders...");

    const orders = await getAssignedOrders(token);

    if (!Array.isArray(orders)) {
      throw new Error(
        `Expected an array of orders, received: ${JSON.stringify(orders)}`
      );
    }

    const assignedOrder = orders.find(isActiveOrder);

    if (!assignedOrder) {
      console.log("No active assigned order found.");
      console.log("First create an order and have the restaurant accept it.");
      process.exit(0);
    }

    const orderId = getOrderId(assignedOrder);

    if (!orderId) {
      throw new Error(
        `Could not determine order ID: ${JSON.stringify(assignedOrder)}`
      );
    }

    console.log(`Tracking order: ${orderId}`);
    console.log(
      `Sending location every ${UPDATE_INTERVAL / 1000} seconds...`
    );
    console.log("Press Ctrl+C to stop.\n");

    while (true) {
      try {
        await sendLocation(token, orderId);
      } catch (error) {
        console.error("Location update failed:", error.message);
      }

      await sleep(UPDATE_INTERVAL);
    }
  } catch (error) {
    console.error("\nSimulator failed:");
    console.error(error.message);
    process.exit(1);
  }
}

main();