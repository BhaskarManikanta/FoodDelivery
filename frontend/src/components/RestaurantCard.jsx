import { Link } from "react-router-dom";

function RestaurantCard({ restaurant }) {

  return (
    <Link
      to={`/restaurants/${restaurant._id}`}
    >

      <div className="shadow rounded p-4 hover:scale-105 transition">

        <div className="h-[180px] bg-gray-200 rounded mb-3" />

        <h2 className="text-xl font-bold">
          {restaurant.name}
        </h2>

        <p className="text-gray-600">
          {restaurant.cuisine}
        </p>

        <p className="mt-2">
          ⭐ {restaurant.rating || 4.5}
        </p>

      </div>

    </Link>
  );
}

export default RestaurantCard;