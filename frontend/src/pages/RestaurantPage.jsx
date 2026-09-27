import { useEffect, useState } from "react";

import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import { getRestaurantById } from "../services/restaurantService";
import { addItem, startNewCartForRestaurant } from "../store/cartSlice";

function RestaurantPage() {

  const { id } = useParams();
  const dispatch = useDispatch();
  const cartRestaurantId = useSelector((state) => state.cart.restaurantId);

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      // BUG-025: this page used to assume the fetch always succeeded and
      // read `restaurant.name` etc. straight away — a 404 or a network
      // blip left the whole page crashing on `restaurant.menu.map` (null).
      setError(err.response?.data?.message || "Could not load this restaurant.");

    } finally {

      setLoading(false);

    }

  };

  const handleAddToCart = (item) => {
    // BUG-029: switching restaurants used to silently wipe whatever was
    // already in the cart, inside the reducer, with no warning. Now the
    // user is asked first, and the cart is only cleared if they agree.
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

  if (loading) {
    return <h1 className="p-10">Loading...</h1>;
  }

  if (error) {
    return (
      <div className="p-10">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={fetchRestaurant} className="border px-4 py-2 rounded">
          Try again
        </button>
      </div>
    );
  }

  if (!restaurant) {
    return <h1 className="p-10">Restaurant not found.</h1>;
  }

  return (
    <div className="p-10">

      <div className="mb-10">

        <h1 className="text-4xl font-bold">
          {restaurant.name}
        </h1>

        <p className="text-gray-600 mt-2">
          {restaurant.cuisine}
        </p>

        {!restaurant.isOpen && (
          <p className="text-red-600 mt-2 font-semibold">Currently closed — not accepting orders.</p>
        )}

      </div>

      <h2 className="text-2xl font-bold mb-5">
        Menu
      </h2>

      {(!restaurant.menu || restaurant.menu.length === 0) && (
        <p className="text-gray-500">No menu items yet.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {restaurant.menu?.map((item) => (

          <div
            key={item._id}
            className="shadow p-5 rounded"
          >

            <h3 className="text-xl font-bold">
              {item.name}
            </h3>

            <p className="text-gray-600 mt-2">
              ₹ {item.price}
            </p>

            {item.available === false && (
              <p className="text-red-600 text-sm mt-1">Currently unavailable</p>
            )}

            <button
              className="bg-black text-white px-4 py-2 mt-4 rounded disabled:opacity-50"
              disabled={!restaurant.isOpen || item.available === false}
              onClick={() => handleAddToCart(item)}
            >
              Add To Cart
            </button>

          </div>

        ))}

      </div>

    </div>
  );
}

export default RestaurantPage;
