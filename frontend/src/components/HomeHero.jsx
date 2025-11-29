import React from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/Hero.css";

const HomeHero = () => {
  const navigate = useNavigate();

  return (
    <section className="hero-section d-flex align-items-center">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-lg-8 mx-auto text-center">
            <span className="badge bg-primary-subtle text-primary rounded-pill px-3 py-2 mb-3 fw-semibold">
              New Arrival: ASUS ROG Swift 360Hz Monitor!
            </span>
            <h1 className="hero-title fw-bold mb-4">
              <span className="text-gradient">Tachyon</span> Electronics
            </h1>
            <p className="hero-subtitle mb-5 text-muted mx-auto">
              Experience unparalleled gaming performance with our latest collection.
              Powered by Tachyon Chatbot to bring you the best shopping experience.
            </p>
            <div className="d-flex justify-content-center gap-3">
              <Link
                to="/products"
                className="btn btn-primary-saas btn-lg"
              >
                Shop Now <i className="fa fa-arrow-right ms-2" />
              </Link>
              <Link
                to="/about"
                className="btn btn-outline-saas btn-lg"
              >
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeHero;
