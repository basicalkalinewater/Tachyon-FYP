import React from "react";

const ShippingReturns = () => {
  return (
    <div className="container py-5">
      <h2 className="mb-4">Shipping & Returns</h2>
      <div className="mb-4">
        <h5>Shipping</h5>
        <p className="text-muted">Standard shipping: 3-5 business days. Expedited options are available at checkout. Tracking is provided for all shipments.</p>
      </div>
      <div className="mb-4">
        <h5>Order Processing</h5>
        <p className="text-muted">In-stock items usually ship within 1-2 business days. Orders placed after 2pm local time may process the next business day.</p>
      </div>
      <div className="mb-4">
        <h5>Returns</h5>
        <p className="text-muted">Most items can be returned within 30 days of delivery in new, unused condition with original packaging. Final sale items are not eligible for return.</p>
      </div>
      <div className="mb-4">
        <h5>How to Start a Return</h5>
        <p className="text-muted">Contact our support team with your order number to receive a return authorization and instructions. Return shipping fees may apply.</p>
      </div>
      <div className="mb-4">
        <h5>Refunds</h5>
        <p className="text-muted">Refunds are issued to the original payment method once the return is received and inspected. Please allow 3-5 business days for processing.</p>
      </div>
    </div>
  );
};

export default ShippingReturns;
