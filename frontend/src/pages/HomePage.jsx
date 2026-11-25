import { useEffect, useState } from "react";
import { getRestaurants, searchRestaurants } from "../services/restaurantService";
import RestaurantCard from "../components/RestaurantCard";

const CUISINES = ["All", "Indian", "Italian", "Chinese", "American"];

function HomePage() {
  const [restaurants, setRestaurants] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedCuisine, setSelectedCuisine] = useState("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRestaurants();
  }, [selectedCuisine]);

  const fetchRestaurants = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedCuisine !== "All") params.cuisine = selectedCuisine;
      const data = await getRestaurants(params);
      setRestaurants(data.data || []);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    const value = e.target.value;
    setSearch(value);

    try {
      if (!value.trim()) {
        return fetchRestaurants();
      }
      const data = await searchRestaurants(value);
      setRestaurants(data.data || []);
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white py-14 px-4 sm:px-8 shadow-inner">
        <div className="max-w-5xl mx-auto text-center space-y-4">
          <span className="inline-block bg-white/20 backdrop-blur-xs text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full text-white">
            Fast, Fresh & Microservices-Powered
          </span>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Order Food From Top Kitchens Near You
          </h1>
          <p className="text-orange-100 text-sm sm:text-base max-w-2xl mx-auto">
            Choreography saga, transactional outbox, Redis GEO nearest-agent dispatch, and real-time live GPS tracking.
          </p>

          {/* Search Box */}
          <div className="max-w-2xl mx-auto mt-6 relative">
            <input
              type="text"
              placeholder="Search by restaurant name, cuisine (Indian, Italian...), or dish..."
              value={search}
              onChange={handleSearch}
              className="w-full bg-white text-gray-900 rounded-2xl py-3.5 pl-11 pr-4 text-sm shadow-xl focus:outline-none focus:ring-4 focus:ring-orange-300 transition"
            />
            <span className="absolute left-4 top-3.5 text-gray-400 text-base">🔍</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Cuisine Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
          {CUISINES.map((cuisine) => (
            <button
              key={cuisine}
              onClick={() => {
                setSelectedCuisine(cuisine);
                setSearch("");
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap shadow-2xs ${
                selectedCuisine === cuisine
                  ? "bg-orange-600 text-white shadow-orange-200"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              {cuisine === "All" ? "🍽️ All Cuisines" : cuisine}
            </button>
          ))}
        </div>

        {/* Restaurants Grid */}
        <div className="mb-6 flex justify-between items-baseline">
          <h2 className="text-2xl font-black text-gray-900">
            {selectedCuisine === "All" ? "Popular Restaurants" : `${selectedCuisine} Restaurants`}
          </h2>
          <span className="text-xs text-gray-500 font-semibold">{restaurants.length} kitchens available</span>
        </div>

        {loading ? (
          <div className="py-20 text-center text-gray-500">
            <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="font-semibold text-sm">Discovering nearby kitchens...</p>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <span className="text-4xl block mb-2">🍽️</span>
            <h3 className="text-lg font-bold text-gray-900">No restaurants found</h3>
            <p className="text-xs text-gray-500 mt-1">Try another search keyword or select a different cuisine filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {restaurants.map((restaurant) => (
              <RestaurantCard key={restaurant._id} restaurant={restaurant} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default HomePage;
