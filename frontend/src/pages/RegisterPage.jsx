import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { registerUser } from "../services/authService";

function RegisterPage() {

  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const handleChange = (e) => {

    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });

  };

  const handleSubmit = async (e) => {

    e.preventDefault();

    try {

      await registerUser(formData);

      alert("Registration Success");

      navigate("/login");

    } catch (error) {

      console.log(error);

      alert("Registration failed");

    }

  };

  return (
    <div className="flex justify-center items-center min-h-screen">

      <form
        onSubmit={handleSubmit}
        className="w-[350px] shadow p-5 rounded"
      >

        <h1 className="text-2xl font-bold mb-5">
          Register
        </h1>

        <input
          type="text"
          name="name"
          placeholder="Name"
          className="border p-2 w-full mb-4"
          onChange={handleChange}
        />

        <input
          type="email"
          name="email"
          placeholder="Email"
          className="border p-2 w-full mb-4"
          onChange={handleChange}
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          className="border p-2 w-full mb-4"
          onChange={handleChange}
        />

        <button
          className="bg-black text-white px-4 py-2 w-full"
        >
          Register
        </button>

      </form>

    </div>
  );
}

export default RegisterPage;