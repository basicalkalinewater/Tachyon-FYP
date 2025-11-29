import React, { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { addItem } from "../redux/cartSlice";
import { fetchProducts } from "../api/products";

import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

import { Link } from "react-router-dom";
import toast from "react-hot-toast";

const ProductsList = () => {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [specFilters, setSpecFilters] = useState({});

  const dispatch = useDispatch();

  useEffect(() => {
    const getProducts = async () => {
      setLoading(true);
      try {
        const products = await fetchProducts();
        setData(products);
        setFilter(products);
        setCategories(
          Array.from(new Set(products.map((item) => item.category).filter(Boolean)))
        );
      } catch (err) {
        console.error("Failed to load products", err);
      } finally {
        setLoading(false);
      }
    };

    getProducts();
  }, []);

  const applyFilters = (category, nextSpecFilters = specFilters) => {
    let list = data;
    if (category) {
      list = list.filter((item) => item.category === category);
    }

    Object.entries(nextSpecFilters).forEach(([key, value]) => {
      if (!value) return;
      list = list.filter((item) => {
        const specs = item.specs || {};
        const specVal = specs[key];
        if (Array.isArray(specVal)) return specVal.includes(value);
        return specVal === value;
      });
    });

    setFilter(list);
  };

  const filterProduct = (cat) => {
    const nextCategory = cat || null;
    setSelectedCategory(nextCategory);
    setSpecFilters({});
    applyFilters(nextCategory, {});
  };

  const handleSpecFilterChange = (key, value) => {
    const next = { ...specFilters, [key]: specFilters[key] === value ? null : value };
    setSpecFilters(next);
    applyFilters(selectedCategory, next);
  };

  const getSpecOptions = (category) => {
    const inCategory = data.filter((item) => item.category === category);
    const collect = (getter) => {
      const values = Array.from(
        new Set(
          inCategory
            .map((p) => getter(p.specs || {}))
            .flat()
            .filter(Boolean)
        )
      );
      return values.sort((a, b) => {
        if (typeof a === "number" && typeof b === "number") return a - b;
        return String(a).localeCompare(String(b));
      });
    };

    switch ((category || "").toLowerCase()) {
      case "monitor":
        return {
          refresh_hz: collect((s) => s.refresh_hz),
          screen_size_inches: collect((s) => s.screen_size_inches),
          panel_type: collect((s) => s.panel_type),
        };
      case "keyboard":
        return {
          size: collect((s) => s.size),
          switch_type: collect((s) => s.switch_type),
          connection: collect((s) => s.connection),
        };
      case "mouse":
        return {
          connection: collect((s) => s.connection),
          polling_hz: collect((s) => s.polling_hz),
        };
      case "ssd":
        return {
          interface: collect((s) => s.interface),
          capacity_gb: collect((s) => s.capacity_gb),
        };
      default:
        return {};
    }
  };

  const specOptions = selectedCategory ? getSpecOptions(selectedCategory) : {};

  const Loading = () => {
    return (
      <>
        <div className="col-12 py-5 text-center">
          <Skeleton height={40} width={560} />
        </div>
        {[...Array(6)].map((_, idx) => (
          <div className="col-md-4 col-sm-6 col-xs-8 col-12 mb-4" key={idx}>
            <Skeleton height={592} />
          </div>
        ))}
      </>
    );
  };

  const ShowProducts = () => {
    return (
      <>
        <div className="buttons text-center py-5">
          <button className="btn btn-outline-saas btn-sm m-2" onClick={() => filterProduct(null)}>
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className="btn btn-outline-saas btn-sm m-2"
              onClick={() => filterProduct(cat)}
            >
              {cat === "ssd"
                ? "NVMe SSD"
                : cat
                  ? cat.charAt(0).toUpperCase() + cat.slice(1)
                  : ""}
            </button>
          ))}
        </div>

        {selectedCategory && Object.keys(specOptions).length > 0 && (
          <div className="text-center pb-4">
            {Object.entries(specOptions).map(([key, options]) => (
              <div key={key} className="mb-2">
                <span className="mr-2 text-uppercase small fw-bold text-muted">
                  {key === "capacity_gb"
                    ? "Capacity"
                    : key === "polling_hz"
                      ? "Polling Rate"
                      : key.replace(/_/g, " ")}
                  :
                </span>
                {options.map((opt) => {
                  const label =
                    key === "capacity_gb"
                      ? opt >= 1000
                        ? `${opt / 1000}TB`
                        : `${opt}GB`
                      : key === "polling_hz"
                        ? `${opt}Hz`
                        : opt;
                  return (
                    <button
                      key={opt}
                      className={`btn btn-sm m-1 ${specFilters[key] === opt ? "btn-primary-saas" : "btn-outline-saas"
                        }`}
                      onClick={() => handleSpecFilterChange(key, opt)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {filter.map((product) => {
          return (
            <div id={product.id} key={product.id} className="col-md-4 col-sm-6 col-xs-8 col-12 mb-4">
              <div className="card-saas h-100 d-flex flex-column" key={product.id}>
                <div className="p-4 d-flex align-items-center justify-content-center bg-white border-bottom border-light" style={{ height: "280px" }}>
                  <img className="img-fluid" src={product.image} alt={product.title} style={{ maxHeight: "200px", objectFit: "contain" }} />
                </div>
                <div className="card-body d-flex flex-column p-4">
                  <h5 className="card-title fw-bold mb-1 text-truncate" title={product.title}>{product.title}</h5>
                  <p className="text-muted small mb-3 text-capitalize">{product.category}</p>

                  {product.specs && (
                    <div className="mb-3 small text-muted">
                      {/* Show only key specs to keep it clean */}
                      {product.specs.screen_size_inches && <div>Size: {product.specs.screen_size_inches}"</div>}
                      {product.specs.capacity_gb && <div>Capacity: {product.specs.capacity_gb}GB</div>}
                      {product.specs.switch_type && <div>Switch: {product.specs.switch_type}</div>}
                    </div>
                  )}

                  <div className="mt-auto">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <span className="fs-5 fw-bold text-primary">${product.price}</span>
                    </div>
                    <div className="d-grid gap-2">
                      <button
                        className="btn btn-primary-saas btn-sm"
                        onClick={() => {
                          toast.success("Added to cart");
                          dispatch(addItem(product));
                        }}
                      >
                        Add to Cart
                      </button>
                      <Link to={"/product/" + product.id} className="btn btn-outline-saas btn-sm">
                        Details
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <>
      <div className="container my-5 py-3">
        <div className="row">
          <div className="col-12 text-center mb-5">
            <h2 className="display-5 fw-bold">Latest Products</h2>
            <p className="text-muted">Explore our cutting-edge collection</p>
          </div>
        </div>
        <div className="row justify-content-center">
          {loading ? <Loading /> : <ShowProducts />}
        </div>
      </div>
    </>
  );
};

export default ProductsList;
