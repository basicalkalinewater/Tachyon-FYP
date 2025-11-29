import React from "react";

const Terms = () => {
  return (
    <div className="container py-5">
      <h2 className="mb-4">Terms & Conditions</h2>
      <p className="text-muted">
        By using this site and placing orders, you agree to these terms. Please review them carefully.
      </p>
      <ul className="text-muted">
        <li>Pricing and availability are subject to change without notice.</li>
        <li>Orders may be canceled or refunded if items are unavailable or if we detect fraud.</li>
        <li>Product descriptions and images are for reference; minor variations may occur.</li>
        <li>Warranties, if any, follow the manufacturer’s policy. Returns follow our Shipping & Returns page.</li>
        <li>We are not liable for delays outside our control (e.g., carriers, weather).</li>
        <li>Your use of the site is subject to applicable laws and our Privacy Policy.</li>
      </ul>
    </div>
  );
};

export default Terms;
