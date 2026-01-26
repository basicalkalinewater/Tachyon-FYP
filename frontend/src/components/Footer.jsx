import React from "react";
import { Link } from "react-router-dom";
import "../styles/Footer.css";

const Footer = () => {
  return (
    <footer className="footer-saas pt-5 pb-3">
      <div className="container">
        <div className="row g-4 mb-5">
          <div className="col-lg-4 col-md-6">
            <Link to="/" className="d-flex align-items-center gap-2 mb-3 text-decoration-none">
              <span className="fw-bold fs-4 text-white">Tachyon</span>
            </Link>
            <p className="text-muted small mb-4" style={{ maxWidth: '300px' }}>
              Empowering your digital lifestyle with cutting-edge electronics and AI-driven support.
            </p>
            <div className="d-flex gap-3">
              {['facebook', 'twitter', 'instagram', 'linkedin'].map((icon) => (
                <a key={icon} href="#" className="social-icon-link" aria-label={icon}>
                  <i className={`fa fa-${icon}`} />
                </a>
              ))}
            </div>
          </div>

          <div className="col-lg-2 col-md-6">
            <h6 className="fw-bold text-white mb-3">Shop</h6>
            <ul className="list-unstyled">
              <li className="mb-2"><Link to="/products" className="footer-link">All Products</Link></li>
              <li className="mb-2"><Link to="/products?cat=monitor" className="footer-link">Monitors</Link></li>
              <li className="mb-2"><Link to="/products?cat=keyboard" className="footer-link">Keyboards</Link></li>
              <li className="mb-2"><Link to="/products?cat=mouse" className="footer-link">Mouse</Link></li>
            </ul>
          </div>

          <div className="col-lg-2 col-md-6">
            <h6 className="fw-bold text-white mb-3">Support</h6>
            <ul className="list-unstyled">
              <li className="mb-2"><Link to="/contact" className="footer-link">Contact Us</Link></li>
              <li className="mb-2"><Link to="/faq" className="footer-link">FAQs</Link></li>
              <li className="mb-2"><Link to="/shipping-returns" className="footer-link">Shipping</Link></li>
              <li className="mb-2"><Link to="/accessibility" className="footer-link">Accessibility</Link></li>
            </ul>
          </div>

          <div className="col-lg-4 col-md-6">
            <h6 className="fw-bold text-white mb-3">Stay Updated</h6>
            <p className="text-muted small mb-3">Subscribe to our newsletter for the latest tech news and exclusive offers.</p>
            <div className="input-group mb-3">
              <input type="email" className="form-control border-0" placeholder="Enter your email" aria-label="Email" />
              <button className="btn btn-primary-saas" type="button">Subscribe</button>
            </div>
          </div>
        </div>

        <div className="border-top border-secondary pt-4">
          <div className="row align-items-center">
            <div className="col-md-6 text-center text-md-start mb-3 mb-md-0">
              <p className="small text-muted mb-0">&copy; 2025 Tachyon. All rights reserved.</p>
            </div>
            <div className="col-md-6 text-center text-md-end">
              <ul className="list-inline mb-0 small">
                <li className="list-inline-item"><Link to="/privacy" className="footer-link">Privacy</Link></li>
                <li className="list-inline-item ms-3"><Link to="/terms" className="footer-link">Terms</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
