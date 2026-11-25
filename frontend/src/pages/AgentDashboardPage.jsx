import { useEffect, useState, useContext, useRef } from "react";
import { AuthContext } from "../context/AuthContext";
import { getAgentOrders, updateAgentOrderStatus } from "../services/orderService";
import {
  getMyAgentProfile,
  getMyAgentStatus,
  setAgentOnlineStatus,
  updateAgentLocation,
  updateAgentProfile
} from "../services/agentService";

export default function AgentDashboardPage() {
  const { user } = useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [online, setOnline] = useState(false);
  const [orders, setOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [gpsCoordinates, setGpsCoordinates] = useState({ lat: 17.385, lng: 78.4867 });
  const [gpsStatusMessage, setGpsStatusMessage] = useState("");

  const simulationIntervalRef = useRef(null);

  const fetchAgentData = async () => {
    try {
      setLoading(true);
      const [profileRes, statusRes, ordersRes] = await Promise.all([
        getMyAgentProfile().catch(() => ({ data: null })),
        getMyAgentStatus().catch(() => ({ data: { online: false } })),
        getAgentOrders().catch(() => ({ data: [] }))
      ]);

      setProfile(profileRes.data);
      setOnline(statusRes.data?.online ?? false);

      const allOrders = ordersRes.data || [];
      setOrders(allOrders);

      const active = allOrders.find(
        (o) => !["DELIVERED", "CANCELLED", "DELIVERY_FAILED"].includes(o.status)
      );
      setActiveOrder(active || null);
    } catch (err) {
      console.error("Failed to load agent dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentData();
    const interval = setInterval(fetchAgentData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleOnline = async () => {
    try {
      const next = !online;
      await setAgentOnlineStatus(next);
      setOnline(next);
      if (!next && isSimulating) {
        stopSimulation();
      }
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const handleStatusUpdate = async (newStatus) => {
    if (!activeOrder) return;
    try {
      await updateAgentOrderStatus(activeOrder._id, newStatus);
      fetchAgentData();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update order status");
    }
  };

  const sendLocationPing = async (lat, lng) => {
    try {
      await updateAgentLocation({
        latitude: lat,
        longitude: lng,
        orderId: activeOrder ? activeOrder._id : undefined
      });
      setGpsCoordinates({ lat, lng });
      setGpsStatusMessage(`GPS Ping Sent: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } catch (err) {
      console.error("GPS update error:", err);
    }
  };

  const startSimulation = () => {
    if (!activeOrder) {
      alert("No active delivery to simulate route for!");
      return;
    }
    setIsSimulating(true);

    let curLat = gpsCoordinates.lat;
    let curLng = gpsCoordinates.lng;
    const destLat = activeOrder.restaurantLocation?.lat || 17.412;
    const destLng = activeOrder.restaurantLocation?.lng || 78.448;

    simulationIntervalRef.current = setInterval(() => {
      // Step closer to destination
      curLat += (destLat - curLat) * 0.15 + (Math.random() - 0.5) * 0.001;
      curLng += (destLng - curLng) * 0.15 + (Math.random() - 0.5) * 0.001;

      sendLocationPing(curLat, curLng);
    }, 3000);
  };

  const stopSimulation = () => {
    setIsSimulating(false);
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopSimulation();
  }, []);

  const completedDeliveries = orders.filter((o) => o.status === "DELIVERED");

  return (
    <div className="min-h-screen bg-gray-100 pb-16">
      {/* Top Banner */}
      <div className="bg-emerald-800 text-white shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-emerald-300">Partner Delivery Hub</span>
              <h1 className="text-2xl font-black">{profile?.name || user?.name || "Delivery Partner"}</h1>
              <p className="text-xs text-emerald-200 mt-0.5">
                Vehicle: <span className="font-semibold uppercase">{profile?.vehicleType || "Bike"}</span> • Rating: ⭐ {profile?.rating || 4.9}
              </p>
            </div>

            {/* Online Toggle */}
            <div className="bg-emerald-900/80 p-3 rounded-2xl border border-emerald-700 flex items-center gap-3 w-full sm:w-auto justify-between">
              <div>
                <span className="text-xs font-bold block">Status:</span>
                <span className={`text-xs font-black ${online ? "text-emerald-300" : "text-gray-300"}`}>
                  {online ? "🟢 ONLINE & AVAILABLE" : "⚪ OFFLINE"}
                </span>
              </div>
              <button
                onClick={handleToggleOnline}
                className={`px-4 py-2 rounded-xl text-xs font-black transition shadow-xs ${
                  online ? "bg-red-500 hover:bg-red-600 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"
                }`}
              >
                {online ? "Go Offline" : "Go Online"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-6 space-y-6">
        {/* ACTIVE ASSIGNMENT CARD */}
        {activeOrder ? (
          <div className="bg-white rounded-2xl border-2 border-emerald-500 shadow-xl overflow-hidden">
            <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider bg-emerald-700 px-2 py-0.5 rounded">
                  Current Assignment
                </span>
                <h3 className="font-black text-lg mt-1">Order #{activeOrder._id.slice(-6)}</h3>
              </div>
              <span className="text-xs font-bold bg-white text-emerald-800 px-3 py-1 rounded-full shadow-xs">
                {activeOrder.status.replaceAll("_", " ")}
              </span>
            </div>

            <div className="p-6 space-y-6">
              {/* Pickup & Drop Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-xs font-bold text-amber-800 block mb-1">📍 1. Pick Up From:</span>
                  <h4 className="font-black text-sm text-gray-900">{activeOrder.restaurantName || "Restaurant"}</h4>
                  <p className="text-xs text-gray-600 mt-1">{activeOrder.restaurantAddress || "Restaurant location"}</p>
                </div>

                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-xs font-bold text-blue-800 block mb-1">🏠 2. Deliver To:</span>
                  <h4 className="font-black text-sm text-gray-900">{activeOrder.customerName || "Customer"}</h4>
                  <p className="text-xs text-gray-600 mt-1">{activeOrder.deliveryAddress}</p>
                  {activeOrder.specialInstructions && (
                    <p className="text-xs text-amber-900 mt-2 font-medium bg-amber-100 p-1.5 rounded">
                      Note: {activeOrder.specialInstructions}
                    </p>
                  )}
                </div>
              </div>

              {/* Items Summary & Payment */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="flex justify-between items-center pb-2 border-b border-gray-200 mb-2">
                  <span className="text-xs font-bold text-gray-500 uppercase">Items Checklist</span>
                  <span className="text-xs font-black text-gray-900">COD: ₹{activeOrder.totalAmount}</span>
                </div>
                <div className="space-y-1 text-xs text-gray-700">
                  {activeOrder.items?.map((it, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>• {it.quantity}x {it.name}</span>
                      <span className="font-semibold">₹{it.price * it.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* GPS Live Tracking Simulator Panel */}
              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h5 className="font-bold text-xs text-emerald-900 flex items-center gap-1">
                      <span>📡 Live GPS Broadcast:</span>
                      <span className="font-mono">{gpsCoordinates.lat.toFixed(4)}, {gpsCoordinates.lng.toFixed(4)}</span>
                    </h5>
                    <p className="text-[11px] text-gray-500">{gpsStatusMessage || "Location updates stream directly to customer live map"}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => sendLocationPing(gpsCoordinates.lat + 0.001, gpsCoordinates.lng + 0.001)}
                      className="text-xs bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-bold px-3 py-1.5 rounded-lg shadow-xs"
                    >
                      📍 Ping Location
                    </button>
                    <button
                      onClick={isSimulating ? stopSimulation : startSimulation}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition ${
                        isSimulating ? "bg-red-600 hover:bg-red-700 text-white animate-pulse" : "bg-emerald-600 hover:bg-emerald-700 text-white"
                      }`}
                    >
                      {isSimulating ? "⏹ Stop GPS Route" : "▶ Auto Simulate Drive"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Delivery Action Steps */}
              <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row gap-3">
                {activeOrder.status !== "PICKED_UP" && activeOrder.status !== "OUT_FOR_DELIVERY" && (
                  <button
                    onClick={() => handleStatusUpdate("PICKED_UP")}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-black text-sm py-3 rounded-xl shadow-md transition"
                  >
                    📦 1. Confirm Pickup from Kitchen
                  </button>
                )}

                {activeOrder.status === "PICKED_UP" && (
                  <button
                    onClick={() => handleStatusUpdate("OUT_FOR_DELIVERY")}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm py-3 rounded-xl shadow-md transition"
                  >
                    🛵 2. Mark Out for Delivery
                  </button>
                )}

                {(activeOrder.status === "PICKED_UP" || activeOrder.status === "OUT_FOR_DELIVERY") && (
                  <button
                    onClick={() => handleStatusUpdate("DELIVERED")}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm py-3 rounded-xl shadow-md transition"
                  >
                    ✓ 3. Complete Delivery (Collected ₹{activeOrder.totalAmount})
                  </button>
                )}

                <button
                  onClick={() => {
                    const r = prompt("Reason for failure (e.g. Customer unavailable, Address incorrect):");
                    if (r) handleStatusUpdate("DELIVERY_FAILED");
                  }}
                  className="px-4 py-3 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl border border-red-200 transition"
                >
                  Report Failure
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-xs">
            <span className="text-4xl block mb-2">🛵</span>
            <h3 className="text-lg font-black text-gray-900">
              {online ? "Waiting for Delivery Assignments..." : "You Are Currently Offline"}
            </h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              {online
                ? "Your Redis GEO coordinates are registered. When a restaurant accepts an order, the system dispatches nearest delivery agents automatically."
                : "Toggle your status to Online in the top banner to start receiving delivery orders."}
            </p>
          </div>
        )}

        {/* DELIVERIES HISTORY & STATS */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-black text-lg text-gray-900">Completed Deliveries</h3>
            <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
              {completedDeliveries.length} Delivered
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {completedDeliveries.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No completed deliveries yet.</p>
            ) : (
              completedDeliveries.map((d) => (
                <div key={d._id} className="py-3 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-black text-gray-800">Order #{d._id.slice(-6)}</span>
                    <span className="ml-2 text-gray-400">{new Date(d.createdAt).toLocaleDateString()}</span>
                    <p className="text-gray-500 mt-0.5">{d.deliveryAddress}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-gray-900">₹{d.totalAmount}</span>
                    <span className="block text-[10px] text-emerald-600 font-bold">✓ Delivered</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
