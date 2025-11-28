// Import 

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
          <button className="btn btn-outline-dark btn-sm m-2" onClick={() => filterProduct(null)}>
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className="btn btn-outline-dark btn-sm m-2"
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
                <span className="mr-2 text-uppercase small">
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
                      className={`btn btn-outline-dark btn-sm m-1 ${
                        specFilters[key] === opt ? "active" : ""
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
              <div className="card text-center h-100" key={product.id}>
                <img className="card-img-top p-3" src={product.image} alt="Card" height={300} />
                <div className="card-body">
                  <h5 className="card-title">{product.title}</h5>
                  {product.specs && (
                    <ul className="list-unstyled small text-muted text-start">
                      {product.specs.panel_type && <li>Panel: {product.specs.panel_type}</li>}
                      {product.specs.refresh_hz && <li>Refresh: {product.specs.refresh_hz}Hz</li>}
                      {product.specs.screen_size_inches && (
                        <li>Size: {product.specs.screen_size_inches}"</li>
                      )}
                      {product.specs.size && <li>Size: {product.specs.size}</li>}
                      {product.specs.switch_type && <li>Switch: {product.specs.switch_type}</li>}
                      {product.specs.connection && (
                        <li>
                          Connection:{" "}
                          {Array.isArray(product.specs.connection)
                            ? product.specs.connection.join(", ")
                            : product.specs.connection}
                        </li>
                      )}
                      {product.specs.polling_hz && <li>Polling: {product.specs.polling_hz}Hz</li>}
                      {product.specs.capacity_gb && <li>Capacity: {product.specs.capacity_gb}GB</li>}
                      {product.specs.interface && <li>Interface: {product.specs.interface}</li>}
                      {product.specs.read_mb_s && <li>Read: {product.specs.read_mb_s} MB/s</li>}
                    </ul>
                  )}
                </div>
                <ul className="list-group list-group-flush">
                  <li className="list-group-item lead">
                    <strong>${product.price}</strong>
                  </li>
                </ul>
                <div className="card-body">
                  <Link to={"/product/" + product.id} className="btn btn-primary text-white rounded-pill px-3 m-1">
                    Learn More
                  </Link>
                  <button
                    className="btn btn-dark rounded-pill px-3 m-1"
                    onClick={() => {
                      toast.success("Added to cart");
                      dispatch(addItem(product));
                    }}
                  >
                    Add to Cart
                  </button>
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
      <div className="container my-3 py-3">
        <div className="row">
          <div className="col-12">
            <h2 className="display-5 text-center">Latest Products</h2>
            <hr />
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
