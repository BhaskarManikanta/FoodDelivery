import { useEffect, useState } from "react";
import { getAllOrdersAdmin } from "../services/orderService";
import { getMyRestaurants, updateRestaurant } from "../services/restaurantService";
import { getAllAgentsAdmin } from "../services/agentService";
import { getAllUsers, getUserStats, updateUserRole } from "../services/authService";

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState("overview"); // "overview", "orders", "restaurants", "agents", "users"
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [agents, setAgents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, ordersRes, restRes, agentsRes, usersRes] = await Promise.all([
        getUserStats().catch(() => ({ data: {} })),
        getAllOrdersAdmin(statusFilter).catch(() => ({ data: [] })),
        getMyRestaurants(true).catch(() => ({ data: [] })),
        getAllAgentsAdmin().catch(() => ({ data: [] })),
        getAllUsers({ search: userSearch }).catch(() => ({ data: [] }))
      ]);

      setStats(statsRes.data || {});
      setOrders(ordersRes.data || []);
      setRestaurants(restRes.data || []);
      setAgents(agentsRes.data || []);
      setUsers(usersRes.data || []);
    } catch (err) {
      console.error("Admin dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, userSearch]);

  const handleRoleChange = async (userId, newRole) => {
    try {
      await updateUserRole(userId, newRole);
      loadData();
    } catch (err) {
      alert("Failed to update user role");
    }
  };

  const handleToggleRestaurantOpen = async (restaurant) => {
    try {
      await updateRestaurant(restaurant._id, { isOpen: !restaurant.isOpen });
      loadData();
    } catch (err) {
      alert("Failed to toggle restaurant status");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Admin Top Header */}
      <div className="bg-purple-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-xs uppercase font-bold tracking-widest text-purple-300">Platform Command</span>
              <h1 className="text-3xl font-black mt-1">Admin Central</h1>
              <p className="text-xs text-purple-200 mt-0.5">Microservices platform monitoring & entity management</p>
            </div>
            <button
              onClick={loadData}
              className="bg-purple-800 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition border border-purple-600 shadow-xs"
            >
              ⟳ Refresh Live State
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <div className="bg-purple-800/80 p-4 rounded-xl border border-purple-700">
              <span className="text-xs font-semibold text-purple-300 uppercase">Total Orders</span>
              <p className="text-2xl font-black text-white mt-1">{orders.length}</p>
            </div>
            <div className="bg-purple-800/80 p-4 rounded-xl border border-purple-700">
              <span className="text-xs font-semibold text-purple-300 uppercase">Registered Restaurants</span>
              <p className="text-2xl font-black text-white mt-1">{restaurants.length}</p>
            </div>
            <div className="bg-purple-800/80 p-4 rounded-xl border border-purple-700">
              <span className="text-xs font-semibold text-purple-300 uppercase">Active Agents</span>
              <p className="text-2xl font-black text-white mt-1">
                {agents.filter(a => a.online).length} / {agents.length}
              </p>
            </div>
            <div className="bg-purple-800/80 p-4 rounded-xl border border-purple-700">
              <span className="text-xs font-semibold text-purple-300 uppercase">Total Users</span>
              <p className="text-2xl font-black text-white mt-1">{stats?.totalUsers || users.length}</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 mt-6 border-b border-purple-700">
            {["overview", "orders", "restaurants", "agents", "users"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                  activeTab === tab
                    ? "border-orange-400 text-orange-400"
                    : "border-transparent text-purple-200 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* TAB 1: SYSTEM OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
              <h3 className="font-black text-lg text-gray-900 mb-4">Architecture & Service Mesh Health</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h4 className="font-bold text-sm text-emerald-900">API Gateway :8080</h4>
                  </div>
                  <p className="text-xs text-emerald-800 mt-1">Reverse proxy, JWT verification & Socket.IO hub</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h4 className="font-bold text-sm text-emerald-900">Redis & GEO Engine</h4>
                  </div>
                  <p className="text-xs text-emerald-800 mt-1">Atomic Lua agent reservation & pub/sub distribution</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h4 className="font-bold text-sm text-emerald-900">Kafka (KRaft) Cluster</h4>
                  </div>
                  <p className="text-xs text-emerald-800 mt-1">Transactional outbox, saga events & DLQ retry</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
              <h3 className="font-black text-lg text-gray-900 mb-3">Live Order Stream</h3>
              <div className="divide-y divide-gray-100">
                {orders.slice(0, 5).map((o) => (
                  <div key={o._id} className="py-3 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-gray-900">Order #{o._id.slice(-6)}</span>
                      <span className="ml-2 text-gray-400">{o.restaurantName || "Restaurant"}</span>
                      <p className="text-gray-500 mt-0.5">{o.deliveryAddress}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-gray-900">₹{o.totalAmount}</span>
                      <span className="bg-purple-100 text-purple-800 font-semibold px-2 py-0.5 rounded-full">
                        {o.status.replaceAll("_", " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ALL ORDERS MONITOR */}
        {activeTab === "orders" && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h3 className="font-black text-base text-gray-900">Platform Orders ({orders.length})</h3>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-300 rounded-lg p-2 font-semibold"
              >
                <option value="">All Statuses</option>
                <option value="RESTAURANT_PENDING">Pending Restaurant</option>
                <option value="RESTAURANT_ACCEPTED">Restaurant Accepted</option>
                <option value="PREPARING">Preparing</option>
                <option value="READY_FOR_PICKUP">Ready For Pickup</option>
                <option value="AGENT_ASSIGNED">Agent Assigned</option>
                <option value="PICKED_UP">Picked Up</option>
                <option value="OUT_FOR_DELIVERY">Out For Delivery</option>
                <option value="DELIVERED">Delivered</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase font-bold border-b border-gray-200">
                  <tr>
                    <th className="p-3">Order ID</th>
                    <th className="p-3">Restaurant</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Items</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((o) => (
                    <tr key={o._id} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-gray-900">#{o._id.slice(-6)}</td>
                      <td className="p-3 font-medium text-gray-800">{o.restaurantName || "Restaurant"}</td>
                      <td className="p-3 text-gray-600">{o.customerName || o.userId}</td>
                      <td className="p-3 text-gray-600">{o.items?.map(i => `${i.quantity}x ${i.name}`).join(", ")}</td>
                      <td className="p-3 font-bold text-gray-900">₹{o.totalAmount}</td>
                      <td className="p-3">
                        <span className="bg-purple-100 text-purple-800 font-semibold px-2 py-0.5 rounded-full text-[11px]">
                          {o.status.replaceAll("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: RESTAURANTS */}
        {activeTab === "restaurants" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {restaurants.map((r) => (
              <div key={r._id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex justify-between items-center">
                <div>
                  <h4 className="font-black text-base text-gray-900">{r.name}</h4>
                  <p className="text-xs text-gray-500">{r.cuisine} Cuisine • {r.address}</p>
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Owner ID: {r.ownerId} • Menu items: {r.menu?.length || 0}
                  </span>
                </div>
                <button
                  onClick={() => handleToggleRestaurantOpen(r)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition ${
                    r.isOpen
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      : "bg-red-100 text-red-800 hover:bg-red-200"
                  }`}
                >
                  {r.isOpen ? "OPEN" : "CLOSED"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: DELIVERY AGENTS */}
        {activeTab === "agents" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((a) => (
              <div key={a._id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-black text-base text-gray-900">{a.name}</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    a.online ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                  }`}>
                    {a.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Phone: {a.phone || "Not set"}</p>
                <p className="text-xs text-gray-500">Vehicle: <span className="font-semibold uppercase">{a.vehicleType}</span></p>
                <p className="text-xs text-gray-500">Rating: ⭐ {a.rating || 5.0}</p>
                {a.currentOrderId && (
                  <span className="inline-block mt-2 bg-blue-50 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">
                    Active Order #{a.currentOrderId.slice(-6)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* TAB 5: USERS & ROLES */}
        {activeTab === "users" && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-black text-base text-gray-900">User Accounts</h3>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg p-2 w-64 focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase font-bold border-b border-gray-200">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Current Role</th>
                    <th className="p-3">Change Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-900">{u.name}</td>
                      <td className="p-3 text-gray-600">{u.email}</td>
                      <td className="p-3">
                        <span className="font-semibold px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-800">
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u._id, e.target.value)}
                          className="text-xs bg-white border border-gray-300 rounded-md p-1 font-semibold"
                        >
                          <option value="customer">customer</option>
                          <option value="restaurant">restaurant</option>
                          <option value="agent">agent</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
