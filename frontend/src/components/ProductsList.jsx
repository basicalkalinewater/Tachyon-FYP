import React, { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import { addItem } from "../redux/cartSlice";
import { fetchProducts } from "../api/products";
import { formatPromotionBadge, hasActivePromotion } from "../utils/promo";
import { formatCategoryLabel } from "../utils/category";

import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

import { Link, useLocation } from "react-router-dom";
import toast from "react-hot-toast";

const ProductsList = () => {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [specFilters, setSpecFilters] = useState({});
  const location = useLocation();

  const dispatch = useDispatch();

  useEffect(() => {
    const getProducts = async () => {
      setLoading(true);
      try {
        const products = await fetchProducts();
        setData(products);
        setFilter(products);
        setCategories(
          Array.from(
            new Set(
              products
                .map((item) => item.category)
                .filter((cat) => cat && cat !== "uncategorized")
            )
          )
        );
      } catch (err) {
        console.error("Failed to load products", err);
      } finally {
        setLoading(false);
      }
    };

    getProducts();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const raw = (params.get("cat") || "").trim().toLowerCase();
    if (!raw) {
      setSelectedCategory(null);
      setSpecFilters({});
      setFilter(data);
      return;
    }
    const normalized = raw === "mice" ? "mouse" : raw;
    setSelectedCategory(normalized);
    setSpecFilters({});
    applyFilters(normalized, {});
  }, [location.search, data]);

  const applyFilters = (category, nextSpecFilters = specFilters) => {
    let list = data;
    const specGroups = buildSpecGroups(category);
    if (category) {
      list = list.filter((item) => item.category === category);
    }

    Object.entries(nextSpecFilters).forEach(([key, value]) => {
      if (!value) return;
      list = list.filter((item) => {
        const specs = item.specs || {};
        const aliases = specGroups[key]?.aliases || [key];
        return aliases.some((alias) => {
          const specVal = specs[alias];
          if (Array.isArray(specVal)) {
            return specVal.some((v) => compareSpecValues(v, value));
          }
          return compareSpecValues(specVal, value);
        });
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

  const normalizeSpecGroupKey = (key) =>
    String(key || "")
      .trim()
      .toLowerCase()
      .replace(/([a-z0-9])([A-Z])/g, "$1$2")
      .replace(/[^a-z0-9]+/g, "");

  const prettifySpecKey = (key) =>
    String(key || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const compareSpecValues = (a, b) => {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA === numB;
    return String(a) === String(b);
  };

  const buildSpecGroups = (category) => {
    const inCategory = data.filter((item) => item.category === category);
    const groups = {};

    inCategory.forEach((item) => {
      const specs = item.specs || {};
      Object.entries(specs).forEach(([rawKey, rawValue]) => {
        const key = String(rawKey || "").trim();
        const groupKey = normalizeSpecGroupKey(key);
        if (!groupKey) return;
        if (!groups[groupKey]) {
          groups[groupKey] = {
            key: groupKey,
            label: prettifySpecKey(key),
            aliases: new Set(),
            values: new Set(),
          };
        }
        const current = groups[groupKey];
        const candidateLabel = prettifySpecKey(key);
        // Prefer labels that are more readable (contains spaces).
        if (candidateLabel.includes(" ") && !current.label.includes(" ")) {
          current.label = candidateLabel;
        }
        current.aliases.add(key);

        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        values.forEach((v) => {
          if (v === null || v === undefined || v === "") return;
          current.values.add(v);
        });
      });
    });

    const sortValues = (values) => {
      return values.sort((a, b) => {
        if (typeof a === "number" && typeof b === "number") return a - b;
        const numA = Number(a);
        const numB = Number(b);
        if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
        return String(a).localeCompare(String(b));
      });
    };

    const normalized = {};
    Object.values(groups)
      .sort((a, b) => a.label.localeCompare(b.label))
      .forEach((group) => {
        normalized[group.key] = {
          key: group.key,
          label: group.label,
          aliases: Array.from(group.aliases),
          values: sortValues(Array.from(group.values)),
        };
      });

    return normalized;
  };

  const formatSpecLabel = (key) => {
    if (key === "capacitygb") return "Capacity";
    if (key === "pollinghz") return "Polling Rate";
    return prettifySpecKey(key);
  };

  const formatSpecValue = (key, value) => {
    if (key === "capacitygb") {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        return num >= 1000 ? `${num / 1000}TB` : `${num}GB`;
      }
    }
    if (key === "pollinghz") {
      return `${value}Hz`;
    }
    return value;
  };

  const specOptions = selectedCategory ? buildSpecGroups(selectedCategory) : {};
  const isBestseller = (product) =>
    !!product?.isBestseller || Number(product?.ratingCount || 0) >= 1500;

  const formatRating = (product) => {
    const avg = Number(product?.rating || 0);
    const count = Number(product?.ratingCount || 0);
    if (!count) return "";
    return `${avg.toFixed(1)} (${count})`;
  };

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
          <button
            className={`btn btn-sm m-2 ${selectedCategory ? "btn-outline-saas" : "btn-primary-saas"}`}
            onClick={() => filterProduct(null)}
          >
            All
          </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`btn btn-sm m-2 ${selectedCategory === cat ? "btn-primary-saas" : "btn-outline-saas"}`}
                  onClick={() => filterProduct(cat)}
                >
                  {formatCategoryLabel(cat)}
                </button>
              ))}
        </div>

        {selectedCategory && Object.keys(specOptions).length > 0 && (
          <div className="text-center pb-4">
            {Object.entries(specOptions).map(([key, options]) => (
              <div key={key} className="mb-2">
                <span className="mr-2 text-uppercase small fw-bold text-muted">
                  {specOptions[key]?.label || formatSpecLabel(key)}
                  :
                </span>
                {(specOptions[key]?.values || options).map((opt) => {
                  const label = formatSpecValue(key, opt);
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
                  {product.category !== "uncategorized" && (
                    <p className="text-muted small mb-3">{formatCategoryLabel(product.category)}</p>
                  )}
                  {isBestseller(product) && (
                    <span className="badge bg-success text-white align-self-start mb-2">Bestseller</span>
                  )}

                  <div className="mt-auto">
                    {formatRating(product) && (
                      <div className="small text-muted mb-2">
                        <i className="fa fa-star text-warning me-1" />
                        {formatRating(product)}
                      </div>
                    )}
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      {(() => {
                        const price = Number(product.price || 0);
                        const original = Number(product.originalPrice ?? product.price ?? 0);
                        const showPromo = hasActivePromotion(product);
                        const badge = showPromo ? formatPromotionBadge(product) : "";
                        return (
                          <div className="d-flex flex-column">
                            {showPromo && (
                              <span className="small text-muted text-decoration-line-through">
                                ${original.toFixed(2)}
                              </span>
                            )}
                            <span className="fs-5 fw-bold text-primary">${price.toFixed(2)}</span>
                            {showPromo && badge && (
                              <span className="badge bg-warning text-dark mt-1 align-self-start">
                                {badge}
                              </span>
                            )}
                          </div>
                        );
                      })()}
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
