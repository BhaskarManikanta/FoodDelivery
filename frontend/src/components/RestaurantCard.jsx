import { Link } from "react-router-dom";

function RestaurantCard({ restaurant }) {
  const fallbackImage = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&auto=format&fit=crop&q=80";

  return (
    <Link to={`/restaurants/${restaurant._id}`} className="block group">
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs hover:shadow-xl transition-all duration-300 transform group-hover:-translate-y-1">
        <div className="relative h-48 bg-gray-100 overflow-hidden">
          <img
            src={restaurant.image || fallbackImage}
            alt={restaurant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
            onError={(e) => { e.target.src = fallbackImage; }}
          />
          <div className="absolute top-3 left-3 flex gap-2">
            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-md ${
              restaurant.isOpen ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
            }`}>
              {restaurant.isOpen ? "Open" : "Closed"}
            </span>
          </div>
          <div className="absolute bottom-3 right-3 bg-black/75 backdrop-blur-xs text-white text-xs font-bold px-2 py-1 rounded-lg">
            ⏱ {restaurant.deliveryTime || "30 mins"}
          </div>
        </div>

        <div className="p-4">
          <div className="flex justify-between items-start">
            <h2 className="text-lg font-black text-gray-900 group-hover:text-orange-600 transition">
              {restaurant.name}
            </h2>
            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black px-2 py-0.5 rounded-md flex items-center gap-0.5">
              <span>★</span> {restaurant.rating || 4.5}
            </span>
          </div>

          <p className="text-xs text-gray-500 mt-1">{restaurant.cuisine} Cuisine • {restaurant.address}</p>

          <div className="pt-3 border-t border-gray-100 mt-3 flex justify-between items-center text-xs font-semibold text-gray-600">
            <span>₹{restaurant.costForTwo || 400} for two</span>
            <span className="text-orange-600 font-bold group-hover:underline">View Menu →</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default RestaurantCard;
