import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";

import { getOrderById } from "../services/orderService";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:8080";

function TrackingPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [agentLocation, setAgentLocation] = useState(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const data = await getOrderById(id);
        setOrder(data.data);
      } catch (err) {
        console.log(err);
        setError(err.response?.data?.message || "Could not load this order.");
      }
    };

    fetchOrder();

    // BUG-027: the live 'order:status' push below is the primary way this
    // page learns about a status change now — this poll is just a
    // reconciliation fallback in case a push was ever missed (e.g. a
    // socket reconnect gap), so it can run much less often than before.
    const interval = setInterval(fetchOrder, 20000);

    const token = localStorage.getItem("token");

    // BUG-026: the socket used to connect with no credentials at all — the
    // gateway now requires a valid JWT on the handshake (see BUG-002) and
    // uses it again to check this user is actually allowed to see this
    // order (BUG-003) before letting the join succeed.
    socketRef.current = io(SOCKET_URL, {
      transports: ["websocket"],
      auth: { token }
    });

    socketRef.current.emit("join-order-room", id);

    socketRef.current.on("join-order-room:denied", (payload) => {
      if (payload.orderId === id) setDenied(true);
    });

    socketRef.current.on("tracking:update", (payload) => {
      if (payload.orderId === id) {
        setAgentLocation(payload);
      }
    });

    socketRef.current.on("order:status", (payload) => {
      if (payload.orderId === id) {
        setOrder((prev) =>
          prev
            ? {
                ...prev,
                status: payload.status,
                updatedAt: payload.updatedAt,
                statusHistory: [...(prev.statusHistory || []), { status: payload.status, at: payload.updatedAt }]
              }
            : prev
        );
      }
    });

    return () => {
      clearInterval(interval);
      socketRef.current?.disconnect();
    };
  }, [id]);

  if (denied) {
    return <h1 className="p-10 text-red-600">You don't have access to track this order.</h1>;
  }

  if (error) {
    return <h1 className="p-10 text-red-600">{error}</h1>;
  }

  if (!order) {
    return <h1 className="p-10">Loading...</h1>;
  }

  return (
    <div className="p-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-2">Tracking Order</h1>
      <p className="text-gray-600 mb-8">Order ID: {order._id}</p>

      <div className="shadow rounded p-5 mb-8">
        <h2 className="text-xl font-bold mb-3">
          Current status: {order.status.replaceAll("_", " ")}
        </h2>

        <ol className="border-l-2 border-gray-300 pl-4 space-y-2">
          {order.statusHistory?.map((entry, idx) => (
            <li key={idx}>
              <span className="font-semibold">{entry.status.replaceAll("_", " ")}</span>{" "}
              <span className="text-gray-500 text-sm">
                {entry.at ? new Date(entry.at).toLocaleTimeString() : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="shadow rounded p-5">
        <h2 className="text-xl font-bold mb-3">Delivery agent location</h2>
        {agentLocation ? (
          <p>
            Lat {agentLocation.latitude.toFixed(4)}, Lng {agentLocation.longitude.toFixed(4)} — updated{" "}
            {new Date(agentLocation.updatedAt).toLocaleTimeString()}
          </p>
        ) : (
          <p className="text-gray-500">Waiting for live location updates...</p>
        )}
      </div>
    </div>
  );
}

export default TrackingPage;
