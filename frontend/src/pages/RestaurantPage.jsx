import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { getRestaurantById } from "../services/restaurantService";
import { addItem, startNewCartForRestaurant, incrementItem, decrementItem } from "../store/cartSlice";

function RestaurantPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const cartRestaurantId = useSelector((state) => state.cart.restaurantId);
  const cartItems = useSelector((state) => state.cart.items);

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [vegOnly, setVegOnly] = useState(false);

  useEffect(() => {
    fetchRestaurant();
  }, [id]);

  const fetchRestaurant = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getRestaurantById(id);
      setRestaurant(data.data);
    } catch (err) {
      console.log(err);
      setError(err.response?.data?.message || "Could not load this restaurant.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = (item) => {
    if (cartRestaurantId && cartRestaurantId !== restaurant._id) {
      const confirmed = window.confirm(
        "Your cart has items from a different restaurant. Starting a new order here will clear it — continue?"
      );
      if (!confirmed) return;
      dispatch(startNewCartForRestaurant(restaurant._id));
    }

    dispatch(
      addItem({
        restaurantId: restaurant._id,
        item: {
          menuItemId: item._id,
          name: item.name,
          price: item.price
        }
      })
    );
  };

  const getItemQuantityInCart = (itemId) => {
    const found = cartItems.find((i) => i.menuItemId === itemId);
    return found ? found.quantity : 0;
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center text-gray-500">
        <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="font-semibold text-sm">Loading restaurant & menu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <p className="text-red-600 text-sm mb-4">{error}</p>
        <button
          onClick={fetchRestaurant}
          className="bg-orange-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center text-gray-500">
        <h2 className="text-xl font-bold">Restaurant not found.</h2>
        <Link to="/" className="text-xs text-orange-600 font-bold hover:underline mt-2 inline-block">
          ← Return to restaurant listing
        </Link>
      </div>
    );
  }

  const allCategories = [
    "All",
    ...new Set((restaurant.menu || []).map((m) => m.category || "Main").filter(Boolean))
  ];

  const filteredMenu = (restaurant.menu || []).filter((item) => {
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    const matchesVeg = !vegOnly || item.isVeg;
    return matchesCategory && matchesVeg;
  });

  const fallbackHero = "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80";

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Restaurant Header Banner */}
      <div className="relative bg-gray-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-40">
          <img
            src={restaurant.image || fallbackHero}
            alt={restaurant.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.src = fallbackHero; }}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-transparent"></div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <Link to="/" className="text-xs font-bold text-orange-300 hover:text-white mb-4 inline-block">
            ← Back to Restaurants
          </Link>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                  restaurant.isOpen ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                }`}>
                  {restaurant.isOpen ? "Open Now" : "Currently Closed"}
                </span>
                <span className="text-xs text-gray-300">• {restaurant.cuisine} Cuisine</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white">{restaurant.name}</h1>
              <p className="text-xs text-gray-300 mt-1 max-w-lg">{restaurant.address}</p>
            </div>

            <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20 text-xs">
              <div>
                <span className="block font-black text-emerald-400 text-sm">★ {restaurant.rating || 4.5}</span>
                <span className="text-[10px] text-gray-300">Ratings</span>
              </div>
              <div className="border-l border-white/20 pl-4">
                <span className="block font-bold text-white text-sm">⏱ {restaurant.deliveryTime || "30 mins"}</span>
                <span className="text-[10px] text-gray-300">Delivery Time</span>
              </div>
              <div className="border-l border-white/20 pl-4">
                <span className="block font-bold text-white text-sm">₹{restaurant.costForTwo || 400}</span>
                <span className="text-[10px] text-gray-300">For Two</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Navigation & Filters */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 pb-4 mb-6">
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  selectedCategory === cat
                    ? "bg-orange-600 text-white shadow-xs"
                    : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-2xs">
            <input
              type="checkbox"
              checked={vegOnly}
              onChange={(e) => setVegOnly(e.target.checked)}
              className="rounded text-green-600 focus:ring-green-500 h-4 w-4"
            />
            <span className="text-xs font-bold text-gray-700 flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-600 inline-block"></span>
              Veg Only
            </span>
          </label>
        </div>

        {/* Menu Items List */}
        {filteredMenu.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
            <p className="text-sm">No items matching your selection.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredMenu.map((item) => {
              const qty = getItemQuantityInCart(item._id);

              return (
                <div
                  key={item._id}
                  className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:border-orange-200 hover:shadow-md transition flex justify-between gap-4"
                >
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center ${
                          item.isVeg ? "border-green-600" : "border-red-600"
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-600"}`}></span>
                        </span>
                        <h3 className="text-base font-black text-gray-900">{item.name}</h3>
                      </div>
                      <p className="text-sm font-black text-gray-900">₹{item.price}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description || "Freshly prepared dish"}</p>
                    </div>

                    <div className="mt-4">
                      {item.available === false ? (
                        <span className="text-xs font-bold text-red-600">Out of stock</span>
                      ) : qty > 0 ? (
                        <div className="inline-flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1 text-xs font-black text-orange-900">
                          <button
                            onClick={() => dispatch(decrementItem(item._id))}
                            className="text-orange-600 hover:text-orange-800 text-sm font-black"
                          >
                            -
                          </button>
                          <span>{qty}</span>
                          <button
                            onClick={() => dispatch(incrementItem(item._id))}
                            className="text-orange-600 hover:text-orange-800 text-sm font-black"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          disabled={!restaurant.isOpen}
                          onClick={() => handleAddToCart(item)}
                          className="bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white font-bold text-xs px-5 py-2 rounded-xl shadow-xs transition"
                        >
                          + Add to Cart
                        </button>
                      )}
                    </div>
                  </div>

                  {item.image && (
                    <div className="w-28 h-28 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default RestaurantPage;

