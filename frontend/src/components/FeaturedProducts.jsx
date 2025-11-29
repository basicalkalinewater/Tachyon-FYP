import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";
import { addItem } from "../redux/cartSlice";
import { fetchProducts } from "../api/products";
import "../styles/FeaturedProducts.css";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

const FeaturedProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const dispatch = useDispatch();

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const data = await fetchProducts();
        // Take the first 4 products as featured
        setProducts(data.slice(0, 4));
      } catch (error) {
        console.error("Failed to load featured products", error);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
  }, []);

  const addProduct = (product) => {
    dispatch(addItem(product));
    toast.success("Added to cart");
  };

  const Loading = () => {
    return (
      <>
        {[...Array(4)].map((_, idx) => (
          <div key={idx} className="col-lg-3 col-md-4 col-sm-6 col-12 mb-4">
            <Skeleton height={320} />
          </div>
        ))}
      </>
    );
  };

  return (
    <section className="featured-section py-5">
      <div className="container">
        <div className="text-center mb-4">
          <h2 className="fw-bold">Featured Products</h2>
          <p className="text-muted">Handpicked picks to get you started.</p>
        </div>
        <div className="row justify-content-center">
          {loading ? (
            <Loading />
          ) : (
            products.map((item) => (
              <div key={item.id} className="col-lg-3 col-md-4 col-sm-6 col-12 mb-4">
                <div className="card-saas h-100 d-flex flex-column">
                  <div className="p-4 d-flex align-items-center justify-content-center bg-white border-bottom border-light" style={{ height: "220px" }}>
                    <img
                      src={item.image}
                      className="img-fluid"
                      alt={item.title}
                      style={{ maxHeight: "180px", objectFit: "contain" }}
                    />
                  </div>
                  <div className="card-body d-flex flex-column p-4">
                    <h5 className="card-title fw-bold mb-1 text-truncate" title={item.title}>{item.title}</h5>
                    <div className="mt-auto pt-3">
                      <div className="d-flex align-items-center justify-content-between mb-3">
                        <span className="fs-5 fw-bold text-primary">${item.price}</span>
                      </div>
                      <Link to={`/product/${item.id}`} className="btn btn-outline-saas w-100 btn-sm mb-2">
                        View Details
                      </Link>
                      <button className="btn btn-primary-saas w-100 btn-sm" onClick={() => addProduct(item)}>
                        Add to Cart
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
