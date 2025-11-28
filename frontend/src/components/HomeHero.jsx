import React from "react";

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
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default HomeHero;
