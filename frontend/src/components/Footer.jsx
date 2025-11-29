import React from "react";
import { Link } from "react-router-dom";
import "../styles/Footer.css";

const Footer = () => {
  return (
    <footer className="footer-dark">
      <div className="container py-5">
        <div className="row g-4">
          <div className="col-md-3 col-sm-6">
            <h5 className="fw-bold text-uppercase">About Us</h5>
            <ul className="list-unstyled mt-3">
              <li><Link to="/about">Our Story</Link></li>
            </ul>
          </div>
          <div className="col-md-3 col-sm-6">
            <h5 className="fw-bold text-uppercase">Customer Support</h5>
            <ul className="list-unstyled mt-3">
              <li><Link to="/shipping-returns">Shipping & Returns</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
            </ul>
          </div>
          <div className="col-md-3 col-sm-6">
            <h5 className="fw-bold text-uppercase">Help Center</h5>
            <ul className="list-unstyled mt-3">
              <li><Link to="/contact">Contact Us</Link></li>
            </ul>
          </div>
          <div className="col-md-3 col-sm-6">
            <h5 className="fw-bold text-uppercase">Connect with Us</h5>
            <div className="social-icons my-3">
              {['facebook', 'twitter', 'instagram'].map((icon) => (
                <a key={icon} href="#" aria-label={icon}>
                  <i className={`fa fa-${icon === 'tiktok' ? 'music' : icon}`} />
                </a>
              ))}
            </div>
            <p className="small mb-2">Want $20 Off? Sign up for our Newsletter.</p>
            <p className="small mb-3">Sign up for email updates and be the first to know!</p>
            <button className="btn btn-danger rounded-pill px-3">Get in the loop!</button>
          </div>
        </div>
        <div className="footer-bottom mt-4 pt-3 d-flex flex-wrap justify-content-between align-items-center">
          <div className="d-flex align-items-center">
            <div className="small text">
              <Link to="/privacy" className="text">Privacy Policy</Link> &nbsp;|&nbsp;
              <Link to="/terms" className="text">Terms & Conditions</Link> &nbsp;|&nbsp;
              <Link to="/accessibility" className="text">Accessibility Statement</Link>
            </div>
          </div>
          <div className="small text">
            Tachyon Chatbot � 2025. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
