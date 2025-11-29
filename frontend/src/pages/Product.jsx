import React, { useEffect, useState } from "react";
import Skeleton from "react-loading-skeleton";
import { Link, useParams } from "react-router-dom";
import Marquee from "react-fast-marquee";
import { useDispatch } from "react-redux";
import { addItem } from "../redux/cartSlice";
import { fetchProductById, fetchProducts } from "../api/products";
import InnerImageZoom from "react-inner-image-zoom";
import "react-inner-image-zoom/lib/InnerImageZoom/styles.css";
import "../styles/Product.css";

const Product = () => {
  const { id } = useParams();
  const [product, setProduct] = useState([]);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loading2, setLoading2] = useState(false);

  const dispatch = useDispatch();

  const addProduct = (product) => {
    dispatch(addItem(product));
  };

  useEffect(() => {
    const getProduct = async () => {
      setLoading(true);
      setLoading2(true);
      try {
        const data = await fetchProductById(id);
        setProduct(data);
        setLoading(false);

        const allProducts = await fetchProducts();
        const related = allProducts.filter(
          (item) => item.category === data.category && item.id !== data.id
        );
        const fillers = allProducts.filter(
          (item) => item.category !== data.category && item.id !== data.id
        );
        const combined = [...related, ...fillers].slice(0, 8);
        setSimilarProducts(combined);
      } catch (err) {
        console.error("Failed to load product", err);
      } finally {
        setLoading(false);
        setLoading2(false);
      }
    };
    getProduct();
  }, [id]);

  const Loading = () => {
    return (
      <>
        <div className="container my-5 py-2">
          <div className="row">
            <div className="col-md-6 py-3">
              <Skeleton height={400} width={400} />
            </div>
            <div className="col-md-6 py-5">
              <Skeleton height={30} width={250} />
              <Skeleton height={90} />
              <Skeleton height={40} width={70} />
              <Skeleton height={50} width={110} />
              <Skeleton height={120} />
              <Skeleton height={40} width={110} inline={true} />
              <Skeleton className="mx-3" height={40} width={110} />
            </div>
          </div>
        </div>
      </>
    );
  };

  const ShowProduct = () => {
    return (
      <>
        <div className="container my-5 py-2">
          <div className="row">
            <div className="col-md-6 col-sm-12 py-3">
              <div className="product-image-wrap p-4 bg-white rounded-4 border border-light shadow-sm">
                {product.image && (
                  <InnerImageZoom
                    src={product.image}
                    zoomSrc={product.image}
                    alt={product.title}
                    zoomType="hover"
                    zoomScale={1.8}
                    className="product-image-zoom"
                  />
                )}
              </div>
            </div>
            <div className="col-md-6 col-md-6 py-5">
              <h4 className="text-uppercase text-primary fw-bold small mb-2">{product.category}</h4>
              <h1 className="display-5 fw-bold mb-3">{product.title}</h1>
              <p className="lead mb-4">
                {product.rating} <i className="fa fa-star text-warning"></i>
              </p>
              <h3 className="display-6 fw-bold text-primary mb-4">
                ${product.price}
              </h3>
              <p className="lead text-muted mb-5">{product.description}</p>
              {product.specs && (
                <div className="p-4 rounded-4 mb-5 border border-light" style={{ backgroundColor: "var(--bg-card)" }}>
                  <h6 className="fw-bold mb-3" style={{ color: "var(--text-main)" }}>
                    Specifications
                  </h6>
                  <ul className="list-unstyled mb-0 small" style={{ color: "var(--text-muted)" }}>
                    {product.specs.panel_type && <li className="mb-2"><strong>Panel:</strong> {product.specs.panel_type}</li>}
                    {product.specs.refresh_hz && <li className="mb-2"><strong>Refresh:</strong> {product.specs.refresh_hz}Hz</li>}
                    {product.specs.screen_size_inches && (
                      <li className="mb-2"><strong>Size:</strong> {product.specs.screen_size_inches}"</li>
                    )}
                    {product.specs.resolution && <li className="mb-2"><strong>Resolution:</strong> {product.specs.resolution}</li>}
                    {product.specs.size && <li className="mb-2"><strong>Size:</strong> {product.specs.size}</li>}
                    {product.specs.switch_type && <li className="mb-2"><strong>Switch:</strong> {product.specs.switch_type}</li>}
                    {product.specs.connection && (
                      <li className="mb-2">
                        <strong>Connection:</strong>{" "}
                        {Array.isArray(product.specs.connection)
                          ? product.specs.connection.join(", ")
                          : product.specs.connection}
                      </li>
                    )}
                    {product.specs.polling_hz && <li className="mb-2"><strong>Polling:</strong> {product.specs.polling_hz}Hz</li>}
                    {product.specs.capacity_gb && <li className="mb-2"><strong>Capacity:</strong> {product.specs.capacity_gb}GB</li>}
                    {product.specs.interface && <li className="mb-2"><strong>Interface:</strong> {product.specs.interface}</li>}
                    {product.specs.read_mb_s && <li className="mb-2"><strong>Read:</strong> {product.specs.read_mb_s} MB/s</li>}
                    {product.specs.write_mb_s && <li className="mb-2"><strong>Write:</strong> {product.specs.write_mb_s} MB/s</li>}
                  </ul>
                </div>
              )}
              <div className="d-flex gap-3">
                <button className="btn btn-outline-saas btn-lg px-4" onClick={() => addProduct(product)}>
                  Add to Cart
                </button>
                <Link to="/cart" className="btn btn-primary-saas btn-lg px-4">
                  Go to Cart
                </Link>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  const Loading2 = () => {
    return (
      <>
        <div className="my-4 py-4">
          <div className="d-flex">
            {[...Array(4)].map((_, idx) => (
              <div className="mx-4" key={idx}>
                <Skeleton height={400} width={250} />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  const ShowSimilarProduct = () => {
    return (
      <>
        <div className="py-4 my-4">
          <div className="d-flex gap-4">
            {similarProducts.map((item) => {
              return (
                <div key={item.id} className="card-saas h-100 d-flex flex-column" style={{ minWidth: "280px" }}>
                  <div className="p-4 d-flex align-items-center justify-content-center bg-white border-bottom border-light" style={{ height: "220px" }}>
                    <img className="img-fluid" src={item.image} alt={item.title} style={{ maxHeight: "180px", objectFit: "contain" }} />
                  </div>
                  <div className="card-body d-flex flex-column p-4">
                    <h5 className="card-title fw-bold mb-1 text-truncate" title={item.title}>{item.title}</h5>
                    <div className="mt-auto pt-3">
                      <Link to={"/product/" + item.id} className="btn btn-outline-saas w-100 btn-sm mb-2">
                        View Details
                      </Link>
                      <button className="btn btn-primary-saas w-100 btn-sm" onClick={() => addProduct(item)}>
                        Add to Cart
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  };
  return (
    <>
      <div className="container">
        <div className="row">{loading ? <Loading /> : <ShowProduct />}</div>
        <div className="row my-5 py-5">
          <div className="d-none d-md-block">
            <h2 className="">You may also like</h2>
            <Marquee pauseOnHover={true} pauseOnClick={true} speed={50}>
              {loading2 ? <Loading2 /> : <ShowSimilarProduct />}
            </Marquee>
          </div>
        </div>
      </div>
    </>
  );
};

export default Product;
