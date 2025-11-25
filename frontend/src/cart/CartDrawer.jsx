// src/components/cart/CartDrawer.jsx
import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { addCart, delCart } from "../../redux/action";
import { Link } from "react-router-dom";

const CartDrawer = ({ isOpen, onClose }) => {
  const items = useSelector((state) => state.handleCart);
  const dispatch = useDispatch();

  let subtotal = 0;
  let totalItems = 0;

  items.forEach((item) => {
    subtotal += item.price * item.qty;
    totalItems += item.qty;
  });

  const shipping = items.length > 0 ? 30.0 : 0.0;

  const handleAdd = (item) => dispatch(addCart(item));
  const handleRemove = (item) => dispatch(delCart(item));

  return (
    <>
      {/* Backdrop */}
      <div
        className={`backdrop ${isOpen ? "backdrop-show" : ""}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`cart-drawer ${isOpen ? "cart-drawer-open" : ""}`}>
        <div className="cart-header">
          <h5 className="mb-0">My Cart</h5>
          <button className="cart-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="cart-body">
          {items.length === 0 ? (
            <p className="text-muted">Your cart is empty.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="cart-item">
                <img src={item.image} alt={item.title} />
                <div className="cart-item-info">
                  <div className="cart-item-title">{item.title}</div>

                  <div className="cart-item-qty d-flex align-items-center mb-1">
                    <button
                      className="btn btn-sm btn-outline-secondary px-2"
                      onClick={() => handleRemove(item)}
                    >
                      <i className="fas fa-minus"></i>
                    </button>

                    <span className="mx-3">{item.qty}</span>

                    <button
                      className="btn btn-sm btn-outline-secondary px-2"
                      onClick={() => handleAdd(item)}
                    >
                      <i className="fas fa-plus"></i>
                    </button>
                  </div>

                  <div className="cart-item-meta">
                    <span>{item.qty} x ${item.price}</span>
                    <span><strong>${(item.qty * item.price).toFixed(2)}</strong></span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cart-footer">
          <div className="cart-total mb-2">
            <span>Items ({totalItems})</span>
            <span>${Math.round(subtotal)}</span>
          </div>

          <div className="cart-total mb-2">
            <span>Shipping</span>
            <span>${shipping}</span>
          </div>

          <div className="cart-total mb-3">
            <strong>Total</strong>
            <strong>${Math.round(subtotal + shipping)}</strong>
          </div>

          <Link to="/cart" className="btn btn-outline-dark w-100 mb-2" onClick={onClose}>
            View full cart
          </Link>

          <Link to="/checkout" className="btn btn-dark w-100" onClick={onClose}>
            Checkout
          </Link>
        </div>
      </div>
    </>
  );
};

export default CartDrawer;
