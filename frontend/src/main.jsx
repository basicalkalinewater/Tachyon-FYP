import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "../node_modules/font-awesome/css/font-awesome.min.css";
import "../node_modules/bootstrap/dist/css/bootstrap.min.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Provider, useDispatch } from "react-redux";
import store from "./redux/store";
import { Navbar, ScrollToTop, Footer } from "./components";
import { bootstrapCart } from "./redux/cartSlice";

import {
  Home,
  Product,
  Products,
  AboutPage,
  ContactPage,
  Cart,
  Login,
  Register,
  Checkout,
  PageNotFound,
} from "./pages";

import { Toaster } from "react-hot-toast";

const CartInitializer = ({ children }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(bootstrapCart());
  }, [dispatch]);

  return children;
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <Provider store={store}>
    <BrowserRouter>
      <CartInitializer>
        <ScrollToTop>
          {/* Navbar always visible */}
          <Navbar />

          {/* Page content */}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/product/:id" element={<Product />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
          <Footer />
        </ScrollToTop>

        <Toaster />
      </CartInitializer>
    </BrowserRouter>
  </Provider>
);
