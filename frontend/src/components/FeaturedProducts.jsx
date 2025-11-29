import React from "react";
import { Link } from "react-router-dom";
import "../styles/FeaturedProducts.css";

const featured = [
  {
    id: "f16d261a-04e2-4b3a-9276-963b4a5f462a",
    title: "ASUS ROG Swift PG27AQN",
    image: "/assets/monitors/pg27aqn.jpg",
    price: 999.99,
  },
  {
    id: "48ea5cc6-8066-419d-aa93-46a1e8d9bfd7",
    title: "Logitech G Pro X Superlight 2",
    image: "/assets/mice/gpx-superlight-2.jpg",
    price: 159.99,
  },
  {
    id: "6548f0b4-520e-455e-a2bc-459ffb44c5f5",
    title: "Samsung 990 Pro 1TB",
    image: "/assets/ssds/990-pro-1tb.jpg",
    price: 129.99,
  },
  {
    id: "a263178b-46ea-4e80-961c-97856bbd2045",
    title: "Razer Huntsman Mini",
    image: "/assets/keyboards/huntsman-mini.jpg",
    price: 129.99,
  },
];

const FeaturedProducts = () => {
  return (
    <section className="featured-section py-5">
      <div className="container">
        <div className="text-center mb-4">
          <h2 className="fw-bold">Featured Products</h2>
          <p className="text-muted">Handpicked picks to get you started.</p>
        </div>
        <div className="row justify-content-center">
          {featured.map((item) => (
            <div key={item.id} className="col-lg-3 col-md-4 col-sm-6 col-12 mb-4">
              <div className="card h-100 text-center feature-card">
                <div className="feature-image-wrap">
                  <img
                    src={item.image}
                    className="card-img-top p-3"
                    alt={item.title}
                    style={{ maxHeight: "220px", objectFit: "contain" }}
                  />
                </div>
                <div className="card-body">
                  <h5 className="card-title">{item.title}</h5>
                  <p className="card-text fw-bold">${item.price}</p>
                  <Link to={`/product/${item.id}`} className="btn btn-primary rounded-pill px-3">
                    View Product
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
