import React from "react";
import { Link } from "react-router-dom";

const HomeHero = () => {
  return (
    <>
      <div className="hero border-1 pb-3">
        <div className="card bg-dark text-white border-0 mx-3">
          <img
            className="card-img img-fluid"
            src="./assets/main.png.jpg"
            alt="Card"
            height={500}
          />
          <div className="card-img-overlay d-flex align-items-center">
            <div className="container">
              <h5 className="card-title fs-1 text fw-lighter">One-Stop Electronics Solution</h5>
              <p className="card-text fs-5 d-none d-sm-block ">
                Powered by Tachyon Chatbot, we bring you the latest and greatest in electronics with unparalleled customer service.
              </p>
              <Link to="/products" className="btn btn-primary rounded-pill text-white px-4 py-2 mt-3 fw-semibold">
                Shop
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default HomeHero;
