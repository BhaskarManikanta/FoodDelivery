import { useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

import { incrementItem, decrementItem, clearCart } from "../store/cartSlice";
import { createOrder } from "../services/orderService";

function CartPage() {
  const cart = useSelector((state) => state.cart);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [address, setAddress] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  // BUG-020/BUG-030: generated once per cart session and re-sent on any
  // retry of the same checkout attempt. Order Service treats a repeat of
  // this exact key (for this user) as "same order, return it" instead of
  // creating a duplicate — covers a double-click or a network retry after
  // the first request actually succeeded server-side.
  const idempotencyKey = useMemo(
    () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    [cart.restaurantId]
  );

  // BUG-030: this is a convenience estimate for the customer's own
  // reference only — Order Service ignores any price/total the client
  // sends and always recomputes the real charge itself from the
  // restaurant's actual menu at order time.
  const estimatedTotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handlePlaceOrder = async () => {
    if (!address.trim()) {
      setError("Enter a delivery address.");
      return;
    }

    setPlacing(true);
    setError("");

    try {
      const payload = {
        restaurantId: cart.restaurantId,
        items: cart.items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity
        })),
        deliveryAddress: address,
        idempotencyKey
      };

      const { data } = await createOrder(payload);

      dispatch(clearCart());
      navigate(`/orders/${data._id}/track`);
    } catch (err) {
      console.log(err);
      setError(err.response?.data?.message || "Could not place order.");
    } finally {
      setPlacing(false);
    }
  };

  if (!cart.items.length) {
    return <h1 className="p-10 text-xl">Your cart is empty.</h1>;
  }

  return (
    <div className="p-10 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Your Cart</h1>

      <div className="space-y-4 mb-8">
        {cart.items.map((item) => (
          <div key={item.menuItemId} className="flex justify-between items-center shadow p-4 rounded">
            <div>
              <p className="font-semibold">{item.name}</p>
              <p className="text-gray-500">
                ₹{item.price} x {item.quantity}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => dispatch(decrementItem(item.menuItemId))}
                className="px-3 py-1 border rounded"
              >
                -
              </button>
              <span>{item.quantity}</span>
              <button
                onClick={() => dispatch(incrementItem(item.menuItemId))}
                className="px-3 py-1 border rounded"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xl font-bold mb-1">Estimated total: ₹{estimatedTotal}</p>
      <p className="text-gray-500 text-sm mb-4">Final price is confirmed by the restaurant at checkout.</p>

      <input
        type="text"
        placeholder="Delivery address"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        className="border p-3 rounded w-full mb-4"
      />

      {error && <p className="text-red-600 mb-4">{error}</p>}

      <button
        onClick={handlePlaceOrder}
        disabled={placing}
        className="bg-black text-white px-6 py-3 rounded w-full disabled:opacity-50"
      >
        {placing ? "Placing order..." : "Place Order"}
      </button>
    </div>
  );
}

export default CartPage;
