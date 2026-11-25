import { useState, useContext } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { incrementItem, decrementItem, clearCart } from "../store/cartSlice";
import { createOrder } from "../services/orderService";
import { AuthContext } from "../context/AuthContext";

export default function CartPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const cart = useSelector((state) => state.cart);
  const [deliveryAddress, setDeliveryAddress] = useState(user?.address || "");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = cart.items.length > 0 ? 40 : 0;
  const tax = cart.items.length > 0 ? Math.round(subtotal * 0.05) : 0;
  const totalAmount = subtotal + deliveryFee + tax;

  const handleCheckout = async (e) => {
    e.preventDefault();
    setError("");

    if (!deliveryAddress.trim()) {
      setError("Please provide a delivery address");
      return;
    }

    if (!cart.items.length || !cart.restaurantId) {
      setError("Your cart is empty");
      return;
    }

    setLoading(true);

    try {
      const idempotencyKey = `${user?._id || "anon"}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const payload = {
        restaurantId: cart.restaurantId,
        items: cart.items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity
        })),
        deliveryAddress: deliveryAddress.trim(),
        specialInstructions: specialInstructions.trim(),
        idempotencyKey,
        customerName: user?.name || "Customer",
        customerEmail: user?.email || "",
        paymentMethod: "COD",
        subtotal,
        deliveryFee,
        tax,
        totalAmount
      };

      const res = await createOrder(payload);

      dispatch(clearCart());
      navigate(`/orders/${res.data._id}/track`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to place order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!cart.items.length) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <span className="text-6xl block mb-4">🛒</span>
        <h2 className="text-2xl font-black text-gray-900">Your Cart is Empty</h2>
        <p className="text-xs text-gray-500 mt-1 mb-6">
          Looks like you haven't added any dishes to your cart yet.
        </p>
        <Link
          to="/"
          className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md shadow-orange-200 transition"
        >
          Browse Restaurants
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-black text-gray-900 mb-2">Checkout & Review</h1>
      <p className="text-xs text-gray-500 mb-8">Review items, set instructions, and confirm your meal</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Items in Cart & Address Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cart Items List */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
            <div className="flex justify-between items-center pb-4 border-b border-gray-100 mb-4">
              <h3 className="font-black text-base text-gray-900">Ordered Dishes ({cart.items.length})</h3>
              <button
                onClick={() => dispatch(clearCart())}
                className="text-xs text-red-600 hover:underline font-semibold"
              >
                Clear Cart
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {cart.items.map((item) => (
                <div key={item.menuItemId} className="py-3 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-sm text-gray-900">{item.name}</h4>
                    <span className="text-xs text-gray-500">₹{item.price} each</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="inline-flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs font-bold text-gray-800">
                      <button
                        onClick={() => dispatch(decrementItem(item.menuItemId))}
                        className="text-gray-500 hover:text-black font-black text-sm"
                      >
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        onClick={() => dispatch(incrementItem(item.menuItemId))}
                        className="text-gray-500 hover:text-black font-black text-sm"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-black text-sm text-gray-900 w-16 text-right">
                      ₹{item.price * item.quantity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery & Special Instructions */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <h3 className="font-black text-base text-gray-900">Delivery Information</h3>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Full Delivery Address *
              </label>
              <textarea
                required
                rows="2"
                placeholder="House / Flat No, Street name, Landmark, City..."
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Special Delivery Instructions (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Please leave at door, don't ring bell, extra napkins..."
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Right: Payment Method & Total Price Card */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <h3 className="font-black text-base text-gray-900 pb-3 border-b border-gray-100">
              Payment Method
            </h3>
            <div className="p-3.5 bg-emerald-50 border-2 border-emerald-500 rounded-xl flex items-center gap-3">
              <span className="text-xl">💵</span>
              <div>
                <span className="text-xs font-black text-emerald-900 block">Cash on Delivery (COD)</span>
                <span className="text-[11px] text-emerald-700">Pay cash or scan QR when your meal arrives</span>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100 space-y-2 text-xs text-gray-600">
              <div className="flex justify-between">
                <span>Items Subtotal</span>
                <span className="font-semibold text-gray-900">₹{subtotal}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Partner Fee</span>
                <span className="font-semibold text-gray-900">₹{deliveryFee}</span>
              </div>
              <div className="flex justify-between">
                <span>Restaurant Taxes & Packaging (5%)</span>
                <span className="font-semibold text-gray-900">₹{tax}</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-gray-200 text-base font-black text-gray-900">
                <span>To Pay</span>
                <span>₹{totalAmount}</span>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium">
                {error}
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black py-3.5 rounded-xl shadow-lg shadow-orange-200 transition text-sm flex items-center justify-center gap-2"
            >
              {loading ? "Placing Order..." : `Place Order (₹${totalAmount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
