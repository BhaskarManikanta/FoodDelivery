import { useEffect, useState } from "react";

import {
  getRestaurants,
  searchRestaurants
} from "../services/restaurantService";

import RestaurantCard from "../components/RestaurantCard";

function HomePage() {

  const [restaurants, setRestaurants] = useState([]);

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);

  useEffect(() => {

    fetchRestaurants();

  }, []);

  const fetchRestaurants = async () => {

    try {

      const data = await getRestaurants();

      setRestaurants(data.data);

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

      setRestaurants(data.data);

    } catch (error) {

      console.log(error);

    }

  };

  if (loading) {
    return <h1 className="p-10">Loading...</h1>;
  }

  return (
    <div className="p-10">

      <h1 className="text-4xl font-bold mb-6">
        Restaurants
      </h1>

      <input
        type="text"
        placeholder="Search restaurants..."
        value={search}
        onChange={handleSearch}
        className="border p-3 rounded w-full mb-8"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {restaurants.map((restaurant) => (

          <RestaurantCard
            key={restaurant._id}
            restaurant={restaurant}
          />

        ))}

      </div>

    </div>
  );
}

export default HomePage;