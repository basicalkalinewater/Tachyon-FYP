import React from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/Hero.css";

const HomeHero = () => {
  const navigate = useNavigate();

  return (
    <section
      className="hero-outer text-white text-center py-5"
      role="button"
      onClick={() => navigate("/products")}
    >
      <div className="container d-flex flex-column align-items-center hero-content">
        <h1 className="hero-title fw-bold">One-Stop Electronics Solution</h1>
        <p className="hero-subtitle fw-semibold">
          Powered by Tachyon Chatbot, we bring you the latest and greatest in electronics with unparalleled customer service.
        </p>
        <Link
          to="/products"
          className="btn btn-primary rounded-pill text-white px-4 py-2 mt-3 fw-semibold hero-cta"
        >
          Shop
        </Link>
      </div>
    </section>
  );
};

export default HomeHero;
