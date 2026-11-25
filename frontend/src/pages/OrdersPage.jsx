import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyOrders, cancelOrder } from "../services/orderService";

function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const data = await getMyOrders();
      setOrders(data.data || []);
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCancel = async (id) => {
    if (!confirm("Are you sure you want to cancel this order?")) return;
    try {
      await cancelOrder(id);
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.message || "Could not cancel order.");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "RESTAURANT_PENDING":
        return <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">Pending Confirmation</span>;
      case "RESTAURANT_ACCEPTED":
      case "AGENT_ASSIGNMENT_PENDING":
        return <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full">Accepted by Kitchen</span>;
      case "PREPARING":
        return <span className="bg-orange-100 text-orange-800 text-xs font-bold px-2.5 py-1 rounded-full">Cooking in Kitchen</span>;
      case "READY_FOR_PICKUP":
      case "AGENT_ASSIGNED":
        return <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-1 rounded-full">Partner Assigned</span>;
      case "PICKED_UP":
      case "OUT_FOR_DELIVERY":
        return <span className="bg-cyan-100 text-cyan-800 text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">Out for Delivery 🛵</span>;
      case "DELIVERED":
        return <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full">✓ Delivered</span>;
      case "CANCELLED":
      case "DELIVERY_FAILED":
        return <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full">Cancelled</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 text-xs font-bold px-2.5 py-1 rounded-full">{status.replaceAll("_", " ")}</span>;
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-500">
        <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="font-semibold text-sm">Loading your orders...</p>
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <span className="text-5xl block mb-3">🛍️</span>
        <h2 className="text-2xl font-black text-gray-900">No orders yet</h2>
        <p className="text-gray-500 text-xs mt-1 mb-6">Discover top-rated restaurants and order delicious food right now.</p>
        <Link
          to="/"
          className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md shadow-orange-200 transition"
        >
          Explore Restaurants
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Your Orders</h1>
          <p className="text-xs text-gray-500 mt-1">Track live statuses and view your past meals</p>
        </div>
        <span className="bg-orange-50 text-orange-700 font-bold text-xs px-3 py-1.5 rounded-full border border-orange-200">
          {orders.length} Total Orders
        </span>
      </div>

      <div className="space-y-4">
        {orders.map((order) => {
          const isCancellable = order.status === "CREATED" || order.status === "RESTAURANT_PENDING";

          return (
            <div
              key={order._id}
              className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs hover:border-gray-300 transition"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-gray-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                      #{order._id.slice(-6)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(order.createdAt).toLocaleDateString()} at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h3 className="font-black text-lg text-gray-900 mt-1">
                    {order.restaurantName || "Restaurant Partner"}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Delivery: <span className="font-medium text-gray-700">{order.deliveryAddress}</span>
                  </p>
                </div>

                <div className="sm:text-right">
                  <span className="text-xs text-gray-400 uppercase font-semibold">Total</span>
                  <p className="text-xl font-black text-gray-900">₹{order.totalAmount}</p>
                  <div className="mt-1">{getStatusBadge(order.status)}</div>
                </div>
              </div>

              {/* Items summary */}
              <div className="py-3 text-xs text-gray-600 space-y-1">
                {order.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{it.quantity}x {it.name}</span>
                    <span className="font-semibold text-gray-800">₹{it.price * it.quantity}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end items-center gap-3">
                {isCancellable && (
                  <button
                    onClick={() => handleCancel(order._id)}
                    className="px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl border border-red-200 transition"
                  >
                    Cancel Order
                  </button>
                )}

                <Link
                  to={`/orders/${order._id}/track`}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md shadow-orange-200 transition flex items-center gap-1.5"
                >
                  <span>Track Live</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default OrdersPage;

