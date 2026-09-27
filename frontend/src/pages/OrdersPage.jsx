import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getMyOrders, cancelOrder } from "../services/orderService";

function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      const data = await getMyOrders();
      setOrders(data.data);
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleCancel = async (id) => {
    try {
      await cancelOrder(id);
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.message || "Could not cancel order.");
    }
  };

  if (loading) {
    return <h1 className="p-10">Loading...</h1>;
  }

  if (!orders.length) {
    return <h1 className="p-10 text-xl">You haven't placed any orders yet.</h1>;
  }

  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold mb-6">Your Orders</h1>

      <div className="space-y-4">
        {orders.map((order) => (
          <div key={order._id} className="shadow p-5 rounded flex justify-between items-center">
            <div>
              <p className="font-semibold">Order #{order._id.slice(-6)}</p>
              <p className="text-gray-600">{order.status.replaceAll("_", " ")}</p>
              <p className="text-gray-500 text-sm">₹{order.totalAmount}</p>
            </div>

            <div className="flex gap-3">
              <Link to={`/orders/${order._id}/track`} className="bg-black text-white px-4 py-2 rounded">
                Track
              </Link>

              {order.status === "CREATED" && (
                <button onClick={() => handleCancel(order._id)} className="border px-4 py-2 rounded">
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default OrdersPage;
