import { useEffect, useState, useContext, useRef } from "react";
import { io } from "socket.io-client";
import { AuthContext } from "../context/AuthContext";
import {
  getRestaurantOrders,
  restaurantDecision,
  restaurantUpdateStatus
} from "../services/orderService";
import {
  getMyRestaurants,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
  updateRestaurant
} from "../services/restaurantService";
import { getAgentDetails } from "../services/agentService";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:8080";

export default function RestaurantDashboardPage() {
  const { user } = useContext(AuthContext);
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [activeTab, setActiveTab] = useState("incoming"); // "incoming", "active", "completed", "menu", "settings"
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newOrderAlert, setNewOrderAlert] = useState(null);
  const [prepTimeSelection, setPrepTimeSelection] = useState({});
  const [rejectReason, setRejectReason] = useState({});
  const [agentCache, setAgentCache] = useState({});

  // Menu Form state
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "Main",
    isVeg: true,
    image: "",
    available: true
  });

  const socketRef = useRef(null);

  const fetchRestaurants = async () => {
    try {
      const res = await getMyRestaurants();
      const list = res.data || [];
      setRestaurants(list);
      if (list.length > 0 && !selectedRestaurant) {
        setSelectedRestaurant(list[0]);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load restaurant profile");
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await getRestaurantOrders();
      setOrders(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
    fetchOrders();

    const token = localStorage.getItem("token");
    socketRef.current = io(SOCKET_URL, {
      transports: ["websocket"],
      auth: { token }
    });

    socketRef.current.on("restaurant:new-order", (payload) => {
      setNewOrderAlert(payload);
      fetchOrders();
    });

    socketRef.current.on("order:status", () => {
      fetchOrders();
    });

    const interval = setInterval(fetchOrders, 15000);

    return () => {
      clearInterval(interval);
      socketRef.current?.disconnect();
    };
  }, []);

  // Fetch agent details for assigned orders
  useEffect(() => {
    orders.forEach((o) => {
      if (o.assignedAgentId && !agentCache[o.assignedAgentId]) {
        getAgentDetails(o.assignedAgentId)
          .then((res) => {
            if (res.data) {
              setAgentCache((prev) => ({ ...prev, [o.assignedAgentId]: res.data }));
            }
          })
          .catch(() => {});
      }
    });
  }, [orders]);

  const handleAccept = async (orderId) => {
    try {
      const prepTime = prepTimeSelection[orderId] || 25;
      await restaurantDecision(orderId, {
        action: "ACCEPT",
        estimatedPrepTime: Number(prepTime)
      });
      fetchOrders();
      setNewOrderAlert(null);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to accept order");
    }
  };

  const handleReject = async (orderId) => {
    try {
      const reason = rejectReason[orderId] || "Kitchen at full capacity";
      await restaurantDecision(orderId, {
        action: "REJECT",
        reason
      });
      fetchOrders();
      setNewOrderAlert(null);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to reject order");
    }
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    try {
      await restaurantUpdateStatus(orderId, newStatus);
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update order status");
    }
  };

  const handleToggleOpen = async () => {
    if (!selectedRestaurant) return;
    try {
      const updated = await updateRestaurant(selectedRestaurant._id, {
        isOpen: !selectedRestaurant.isOpen
      });
      setSelectedRestaurant(updated.data);
      fetchRestaurants();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to toggle restaurant status");
    }
  };

  const handleSaveMenuItem = async (e) => {
    e.preventDefault();
    if (!selectedRestaurant) return;

    try {
      const payload = {
        name: itemForm.name.trim(),
        description: itemForm.description.trim(),
        price: Number(itemForm.price),
        category: itemForm.category || "Main",
        isVeg: Boolean(itemForm.isVeg),
        image: itemForm.image.trim(),
        available: Boolean(itemForm.available)
      };

      if (editingItem) {
        await updateMenuItem(selectedRestaurant._id, editingItem._id, payload);
      } else {
        await addMenuItem(selectedRestaurant._id, payload);
      }

      setShowItemModal(false);
      setEditingItem(null);
      setItemForm({
        name: "",
        description: "",
        price: "",
        category: "Main",
        isVeg: true,
        image: "",
        available: true
      });
      fetchRestaurants();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to save menu item");
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!confirm("Are you sure you want to delete this menu item?")) return;
    try {
      await deleteMenuItem(selectedRestaurant._id, itemId);
      fetchRestaurants();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete item");
    }
  };

  const handleToggleItemAvailability = async (item) => {
    try {
      await updateMenuItem(selectedRestaurant._id, item._id, {
        available: !item.available
      });
      fetchRestaurants();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to toggle availability");
    }
  };

  const pendingOrders = orders.filter((o) => o.status === "RESTAURANT_PENDING");
  const activeOrders = orders.filter((o) =>
    ["RESTAURANT_ACCEPTED", "AGENT_ASSIGNMENT_PENDING", "AGENT_ASSIGNED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(o.status)
  );
  const completedOrders = orders.filter((o) =>
    ["DELIVERED", "CANCELLED", "DELIVERY_FAILED"].includes(o.status)
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Top Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-xs uppercase font-bold tracking-wider text-orange-600">Restaurant Partner Portal</span>
              <h1 className="text-3xl font-black text-gray-900 mt-1">
                {selectedRestaurant ? selectedRestaurant.name : "Restaurant Dashboard"}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {selectedRestaurant?.address || "Manage incoming orders, preparation, and menu"}
              </p>
            </div>

            {selectedRestaurant && (
              <div className="flex items-center gap-4 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                <span className="text-xs font-semibold text-gray-600">Operating Status:</span>
                <button
                  onClick={handleToggleOpen}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs ${
                    selectedRestaurant.isOpen
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedRestaurant.isOpen ? "bg-emerald-300" : "bg-red-300"} animate-pulse`}></span>
                  {selectedRestaurant.isOpen ? "Accepting Orders (OPEN)" : "Closed (NOT ACCEPTING)"}
                </button>
              </div>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <span className="text-xs font-semibold text-orange-700 uppercase">Incoming Pending</span>
              <p className="text-2xl font-black text-orange-900 mt-1">{pendingOrders.length}</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <span className="text-xs font-semibold text-blue-700 uppercase">Active Kitchen / In Transit</span>
              <p className="text-2xl font-black text-blue-900 mt-1">{activeOrders.length}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <span className="text-xs font-semibold text-emerald-700 uppercase">Completed Orders</span>
              <p className="text-2xl font-black text-emerald-900 mt-1">{completedOrders.filter(o => o.status === "DELIVERED").length}</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <span className="text-xs font-semibold text-purple-700 uppercase">Total Revenue</span>
              <p className="text-2xl font-black text-purple-900 mt-1">
                ₹{completedOrders.filter(o => o.status === "DELIVERED").reduce((sum, o) => sum + (o.totalAmount || 0), 0)}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 mt-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("incoming")}
              className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                activeTab === "incoming"
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              <span>Incoming Orders</span>
              {pendingOrders.length > 0 && (
                <span className="bg-orange-600 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-bounce">
                  {pendingOrders.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("active")}
              className={`px-4 py-3 text-sm font-bold border-b-2 transition flex items-center gap-2 ${
                activeTab === "active"
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              <span>Active Orders ({activeOrders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`px-4 py-3 text-sm font-bold border-b-2 transition ${
                activeTab === "completed"
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              Order History ({completedOrders.length})
            </button>
            <button
              onClick={() => setActiveTab("menu")}
              className={`px-4 py-3 text-sm font-bold border-b-2 transition ${
                activeTab === "menu"
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              Menu Management ({selectedRestaurant?.menu?.length || 0})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Real-Time Alert Banner */}
        {newOrderAlert && (
          <div className="mb-6 p-4 bg-orange-600 text-white rounded-xl shadow-lg flex justify-between items-center animate-pulse">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔔</span>
              <div>
                <h3 className="font-bold text-lg">New Incoming Order #{newOrderAlert.orderId.slice(-6)}!</h3>
                <p className="text-xs text-orange-100">Customer placed an order for ₹{newOrderAlert.totalAmount}. Review & accept below.</p>
              </div>
            </div>
            <button
              onClick={() => setNewOrderAlert(null)}
              className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: INCOMING PENDING ORDERS */}
        {activeTab === "incoming" && (
          <div>
            {pendingOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <span className="text-4xl block mb-2">🍽️</span>
                <h3 className="text-lg font-bold text-gray-900">No Pending Orders</h3>
                <p className="text-sm text-gray-500 mt-1">Incoming orders will pop up here in real time as customers order.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {pendingOrders.map((order) => (
                  <div
                    key={order._id}
                    className="bg-white rounded-2xl border-2 border-orange-200 shadow-md p-6 hover:border-orange-400 transition"
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-gray-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="bg-orange-100 text-orange-800 text-xs font-black px-2.5 py-1 rounded-md">
                            ORDER #{order._id.slice(-6)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <h4 className="font-bold text-gray-900 text-base mt-1">
                          Customer: {order.customerName || "Customer"} {order.customerPhone ? `(${order.customerPhone})` : ""}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Delivery Address: <span className="font-medium text-gray-700">{order.deliveryAddress}</span>
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-gray-400 uppercase font-semibold">Total Amount</span>
                        <p className="text-2xl font-black text-gray-900">₹{order.totalAmount}</p>
                        <span className="text-[11px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded border border-emerald-200">
                          Cash On Delivery (COD)
                        </span>
                      </div>
                    </div>

                    {/* Ordered Items */}
                    <div className="py-4">
                      <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Items Ordered:</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                            <span className="text-sm font-semibold text-gray-800">
                              {item.quantity}x {item.name}
                            </span>
                            <span className="text-sm font-medium text-gray-600">
                              ₹{item.price * item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>

                      {order.specialInstructions && (
                        <div className="mt-3 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                          <span className="text-xs font-bold text-amber-800">Special Instructions:</span>
                          <p className="text-xs text-amber-900 mt-0.5">{order.specialInstructions}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions: Accept / Reject */}
                    <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 -mx-6 -mb-6 p-4 rounded-b-2xl">
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <label className="text-xs font-bold text-gray-600 whitespace-nowrap">Est. Prep Time:</label>
                        <select
                          value={prepTimeSelection[order._id] || "25"}
                          onChange={(e) => setPrepTimeSelection({ ...prepTimeSelection, [order._id]: e.target.value })}
                          className="text-xs font-semibold bg-white border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="15">15 mins</option>
                          <option value="25">25 mins</option>
                          <option value="35">35 mins</option>
                          <option value="45">45 mins</option>
                          <option value="60">60 mins</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <button
                          onClick={() => handleReject(order._id)}
                          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl border border-red-200 transition"
                        >
                          Decline Order
                        </button>
                        <button
                          onClick={() => handleAccept(order._id)}
                          className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-md shadow-orange-200 transition"
                        >
                          ✓ Accept & Start Prep
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ACTIVE KITCHEN & IN TRANSIT ORDERS */}
        {activeTab === "active" && (
          <div>
            {activeOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <span className="text-4xl block mb-2">👨‍🍳</span>
                <h3 className="text-lg font-bold text-gray-900">No Active Kitchen Orders</h3>
                <p className="text-sm text-gray-500 mt-1">Accepted orders being cooked or out for delivery will show here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {activeOrders.map((order) => {
                  const agent = order.assignedAgentId ? agentCache[order.assignedAgentId] : null;

                  return (
                    <div key={order._id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start pb-3 border-b border-gray-100">
                          <div>
                            <span className="text-xs font-black text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                              #{order._id.slice(-6)}
                            </span>
                            <span className="ml-2 text-xs text-gray-400">
                              {new Date(order.createdAt).toLocaleTimeString()}
                            </span>
                            <h4 className="font-bold text-sm text-gray-800 mt-1">
                              {order.customerName || "Customer"}
                            </h4>
                          </div>
                          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full">
                            {order.status.replaceAll("_", " ")}
                          </span>
                        </div>

                        {/* Items */}
                        <div className="py-3 text-xs space-y-1">
                          {order.items?.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-gray-700">
                              <span>{item.quantity}x {item.name}</span>
                              <span className="font-medium">₹{item.price * item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        {/* Assigned Agent Card */}
                        <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 mt-2 mb-4">
                          <span className="text-[11px] font-bold uppercase text-gray-500 block mb-1">
                            🛵 Assigned Delivery Partner:
                          </span>
                          {order.assignedAgentId ? (
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-gray-900">{agent?.name || "Delivery Partner"}</span>
                              <span className="text-gray-500">📞 {agent?.phone || "+91 98765 43210"}</span>
                              <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-semibold text-[10px]">
                                {agent?.vehicleType || "bike"}
                              </span>
                            </div>
                          ) : (
                            <p className="text-xs text-orange-600 font-medium animate-pulse">
                              ⏳ Searching for nearby delivery agent...
                            </p>
                          )}
                        </div>
                      </div>

                      {/* State Advancement Buttons */}
                      <div className="pt-3 border-t border-gray-100 flex gap-2">
                        {order.status !== "PREPARING" && order.status !== "READY_FOR_PICKUP" && order.status !== "PICKED_UP" && order.status !== "OUT_FOR_DELIVERY" && (
                          <button
                            onClick={() => handleStatusUpdate(order._id, "PREPARING")}
                            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 rounded-lg transition"
                          >
                            🍳 Mark Preparing
                          </button>
                        )}

                        {order.status === "PREPARING" && (
                          <button
                            onClick={() => handleStatusUpdate(order._id, "READY_FOR_PICKUP")}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-lg transition"
                          >
                            📦 Mark Ready for Pickup
                          </button>
                        )}

                        {order.status === "READY_FOR_PICKUP" && (
                          <span className="w-full text-center py-2 bg-emerald-50 text-emerald-800 font-bold text-xs rounded-lg border border-emerald-200">
                            Waiting for Agent Pickup
                          </span>
                        )}

                        {(order.status === "PICKED_UP" || order.status === "OUT_FOR_DELIVERY") && (
                          <span className="w-full text-center py-2 bg-blue-50 text-blue-800 font-bold text-xs rounded-lg border border-blue-200">
                            🛵 In Transit with Delivery Partner
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ORDER HISTORY */}
        {activeTab === "completed" && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-gray-100 font-bold text-gray-900">
              Completed & Cancelled Orders ({completedOrders.length})
            </div>
            <div className="divide-y divide-gray-100">
              {completedOrders.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No past orders.</div>
              ) : (
                completedOrders.map((o) => (
                  <div key={o._id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <span className="font-black text-xs text-gray-900">#{o._id.slice(-6)}</span>
                      <span className="ml-2 text-xs text-gray-400">{new Date(o.createdAt).toLocaleDateString()}</span>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {o.items?.map(i => `${i.quantity}x ${i.name}`).join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm text-gray-900">₹{o.totalAmount}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        o.status === "DELIVERED" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}>
                        {o.status.replaceAll("_", " ")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: MENU MANAGEMENT */}
        {activeTab === "menu" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-gray-900">Menu Catalog</h3>
                <p className="text-xs text-gray-500">Manage your dishes, pricing, and stock availability</p>
              </div>
              <button
                onClick={() => {
                  setEditingItem(null);
                  setItemForm({
                    name: "",
                    description: "",
                    price: "",
                    category: "Main",
                    isVeg: true,
                    image: "",
                    available: true
                  });
                  setShowItemModal(true);
                }}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-orange-200 transition flex items-center gap-1.5"
              >
                <span>+ Add New Dish</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {selectedRestaurant?.menu?.map((item) => (
                <div key={item._id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs flex flex-col justify-between">
                  <div>
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-40 object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <div className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center ${
                            item.isVeg ? "border-green-600" : "border-red-600"
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-600"}`}></span>
                          </span>
                          <h4 className="font-bold text-gray-900 text-base">{item.name}</h4>
                        </div>
                        <span className="font-black text-gray-900">₹{item.price}</span>
                      </div>

                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description || "Freshly cooked to order"}</p>
                      <span className="inline-block mt-2 bg-gray-100 text-gray-600 text-[10px] font-semibold px-2 py-0.5 rounded">
                        {item.category || "General"}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 pt-0 border-t border-gray-100 flex justify-between items-center mt-3">
                    <button
                      onClick={() => handleToggleItemAvailability(item)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg transition ${
                        item.available
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {item.available ? "● In Stock" : "○ Out of Stock"}
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setItemForm({
                            name: item.name,
                            description: item.description || "",
                            price: item.price,
                            category: item.category || "Main",
                            isVeg: item.isVeg ?? true,
                            image: item.image || "",
                            available: item.available ?? true
                          });
                          setShowItemModal(true);
                        }}
                        className="text-xs text-blue-600 hover:underline font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item._id)}
                        className="text-xs text-red-600 hover:underline font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Menu Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-black text-gray-900 mb-4">
              {editingItem ? "Edit Menu Dish" : "Add New Dish"}
            </h3>

            <form onSubmit={handleSaveMenuItem} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Dish Name *</label>
                <input
                  type="text"
                  required
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g. Butter Chicken"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                    placeholder="250"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Category</label>
                  <input
                    type="text"
                    value={itemForm.category}
                    onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                    placeholder="Main, Starter, Dessert..."
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Description</label>
                <textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                  rows="2"
                  placeholder="Brief description of ingredients or style..."
                ></textarea>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Image URL</label>
                <input
                  type="url"
                  value={itemForm.image}
                  onChange={(e) => setItemForm({ ...itemForm, image: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-orange-500"
                  placeholder="https://..."
                />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={itemForm.isVeg}
                    onChange={(e) => setItemForm({ ...itemForm, isVeg: e.target.checked })}
                    className="rounded text-orange-600 focus:ring-orange-500 h-4 w-4"
                  />
                  <span className="text-xs font-bold text-gray-700">Pure Veg</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={itemForm.available}
                    onChange={(e) => setItemForm({ ...itemForm, available: e.target.checked })}
                    className="rounded text-orange-600 focus:ring-orange-500 h-4 w-4"
                  />
                  <span className="text-xs font-bold text-gray-700">Available In Stock</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-200"
                >
                  Save Dish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
