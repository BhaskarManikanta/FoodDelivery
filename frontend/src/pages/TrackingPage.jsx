import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { io } from "socket.io-client";
import { getOrderById } from "../services/orderService";
import { getAgentDetails } from "../services/agentService";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:8080";

function TrackingPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [agentLocation, setAgentLocation] = useState(null);
  const [agentInfo, setAgentInfo] = useState(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const socketRef = useRef(null);

  const fetchOrder = async () => {
    try {
      const data = await getOrderById(id);
      setOrder(data.data);
      if (data.data?.assignedAgentId) {
        getAgentDetails(data.data.assignedAgentId)
          .then((res) => setAgentInfo(res.data))
          .catch(() => {});
      }
    } catch (err) {
      console.log(err);
      setError(err.response?.data?.message || "Could not load this order.");
    }
  };

  useEffect(() => {
    fetchOrder();

    const interval = setInterval(fetchOrder, 15000);

    const token = localStorage.getItem("token");
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
        fetchOrder();
      }
    });

    return () => {
      clearInterval(interval);
      socketRef.current?.disconnect();
    };
  }, [id]);

  if (denied) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <span className="text-4xl block mb-2">🔒</span>
        <h2 className="text-xl font-bold text-red-600">Access Denied</h2>
        <p className="text-xs text-gray-500 mt-1 mb-4">You are not authorized to track this order.</p>
        <Link to="/orders" className="text-xs text-orange-600 font-bold hover:underline">
          ← Back to your orders
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <h2 className="text-xl font-bold text-red-600">{error}</h2>
        <Link to="/orders" className="text-xs text-orange-600 font-bold hover:underline mt-4 inline-block">
          ← Back to your orders
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center text-gray-500">
        <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="font-semibold text-sm">Connecting to live tracker...</p>
      </div>
    );
  }

  const ORDER_STEPS = [
    { key: "RESTAURANT_PENDING", label: "Order Placed" },
    { key: "RESTAURANT_ACCEPTED", label: "Accepted by Kitchen" },
    { key: "PREPARING", label: "Cooking in Kitchen" },
    { key: "AGENT_ASSIGNED", label: "Partner Assigned" },
    { key: "PICKED_UP", label: "Picked Up" },
    { key: "OUT_FOR_DELIVERY", label: "Out For Delivery" },
    { key: "DELIVERED", label: "Delivered" }
  ];

  const getStepProgress = () => {
    switch (order.status) {
      case "CREATED":
      case "RESTAURANT_PENDING":
        return 1;
      case "RESTAURANT_ACCEPTED":
      case "AGENT_ASSIGNMENT_PENDING":
        return 2;
      case "PREPARING":
        return 3;
      case "READY_FOR_PICKUP":
      case "AGENT_ASSIGNED":
        return 4;
      case "PICKED_UP":
        return 5;
      case "OUT_FOR_DELIVERY":
        return 6;
      case "DELIVERED":
        return 7;
      default:
        return 0;
    }
  };

  const currentStepNum = getStepProgress();
  const isCancelled = order.status === "CANCELLED" || order.status === "DELIVERY_FAILED";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link to="/orders" className="text-xs font-bold text-gray-500 hover:text-orange-600 mb-4 inline-block">
        ← Back to Orders
      </Link>

      {/* Main Status Header Card */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-xl p-6 sm:p-8 mb-6 overflow-hidden relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-black bg-orange-100 text-orange-800 px-2.5 py-1 rounded-md">
                ORDER #{order._id.slice(-6)}
              </span>
              <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                Live Connected
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">
              {isCancelled ? "Order Cancelled" : order.status.replaceAll("_", " ")}
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Estimated Delivery: <span className="font-bold text-gray-800">{order.estimatedPrepTime ? `${order.estimatedPrepTime} mins` : "25-35 mins"}</span>
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-xs text-gray-400 uppercase font-semibold">Total Amount</span>
            <p className="text-2xl font-black text-gray-900">₹{order.totalAmount}</p>
            <span className="text-xs text-gray-500 font-medium">Payment: {order.paymentMethod || "Cash on Delivery"}</span>
          </div>
        </div>

        {/* Visual Progress Bar (if not cancelled) */}
        {!isCancelled ? (
          <div className="pt-6">
            <div className="relative mb-6">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-600 transition-all duration-500"
                  style={{ width: `${(currentStepNum / 7) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-bold text-gray-600">
              <span className={currentStepNum >= 1 ? "text-orange-600" : "text-gray-300"}>1. Order Placed</span>
              <span className={currentStepNum >= 2 ? "text-orange-600" : "text-gray-300"}>2. Kitchen Confirmed</span>
              <span className={currentStepNum >= 5 ? "text-orange-600" : "text-gray-300"}>3. In Transit 🛵</span>
              <span className={currentStepNum >= 7 ? "text-orange-600" : "text-gray-300"}>4. Delivered 🍽️</span>
            </div>
          </div>
        ) : (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold">
            Reason: {order.lastFailureReason || "Order was cancelled."}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Delivery Partner & Live Location */}
        <div className="space-y-6">
          {/* Delivery Agent Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <h3 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">
              Delivery Partner
            </h3>
            {order.assignedAgentId ? (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-2xl font-black shadow-xs">
                  🛵
                </div>
                <div>
                  <h4 className="font-black text-base text-gray-900">{agentInfo?.name || "Assigned Partner"}</h4>
                  <p className="text-xs text-gray-500">
                    Vehicle: <span className="uppercase font-semibold">{agentInfo?.vehicleType || "Bike"}</span> • Rating: ⭐ {agentInfo?.rating || "4.8"}
                  </p>
                  <p className="text-xs text-emerald-700 font-bold mt-1">📞 {agentInfo?.phone || "+91 98765 43210"}</p>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center">
                <span className="text-2xl block mb-1">🔍</span>
                <p className="text-xs font-bold text-gray-700">Assigning nearest delivery agent...</p>
                <p className="text-[11px] text-gray-400 mt-0.5">As soon as the kitchen accepts, dispatch assigns nearest driver.</p>
              </div>
            )}
          </div>

          {/* Live Agent Coordinates Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <h3 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">
              Live Agent Location (GPS)
            </h3>
            {agentLocation ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <p className="text-sm font-mono font-bold text-gray-900">
                    Lat: {agentLocation.latitude.toFixed(4)}, Lng: {agentLocation.longitude.toFixed(4)}
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  Last ping received at: {new Date(agentLocation.updatedAt).toLocaleTimeString()}
                </p>
                <div className="p-3 bg-emerald-50 rounded-xl text-emerald-800 text-xs font-medium border border-emerald-200 mt-2">
                  Delivery partner coordinates streaming live via Redis Pub/Sub & WebSocket.
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-gray-400 text-xs">
                <span>Waiting for driver GPS location broadcast...</span>
              </div>
            )}
          </div>

          {/* Restaurant & Destination Details */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <div>
              <span className="text-[11px] uppercase font-bold text-gray-400 block mb-1">Restaurant</span>
              <h4 className="font-black text-sm text-gray-900">{order.restaurantName || "Restaurant Partner"}</h4>
              <p className="text-xs text-gray-500">{order.restaurantAddress || "Restaurant location"}</p>
            </div>
            <div className="pt-3 border-t border-gray-100">
              <span className="text-[11px] uppercase font-bold text-gray-400 block mb-1">Your Delivery Address</span>
              <p className="text-xs font-medium text-gray-800">{order.deliveryAddress}</p>
            </div>
          </div>
        </div>

        {/* Right Column: Status History & Items Summary */}
        <div className="space-y-6">
          {/* Status Timeline */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <h3 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-4">
              Status Progression Timeline
            </h3>
            <ol className="relative border-l-2 border-orange-500 ml-2 space-y-4">
              {order.statusHistory?.map((entry, idx) => (
                <li key={idx} className="ml-4">
                  <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-orange-600 border-2 border-white"></span>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-black text-gray-900">
                      {entry.status.replaceAll("_", " ")}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {entry.at ? new Date(entry.at).toLocaleTimeString() : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Ordered Food Items */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <h3 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">
              Order Receipt
            </h3>
            <div className="divide-y divide-gray-100 text-xs">
              {order.items?.map((it, idx) => (
                <div key={idx} className="py-2.5 flex justify-between">
                  <span className="text-gray-800 font-medium">{it.quantity}x {it.name}</span>
                  <span className="font-bold text-gray-900">₹{it.price * it.quantity}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-200 mt-2 space-y-1 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{order.subtotal || order.totalAmount}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Fee</span>
                <span>₹{order.deliveryFee ?? 40}</span>
              </div>
              <div className="flex justify-between">
                <span>Taxes & Charges</span>
                <span>₹{order.tax ?? 0}</span>
              </div>
              <div className="flex justify-between font-black text-sm text-gray-900 pt-2 border-t border-gray-100 mt-2">
                <span>Total Paid via COD</span>
                <span>₹{order.totalAmount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrackingPage;

