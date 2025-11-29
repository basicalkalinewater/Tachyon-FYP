import React from "react";

const Faq = () => {
  return (
    <div className="container py-5">
      <h2 className="mb-4">Frequently Asked Questions</h2>
      <div className="mb-4">
        <h5>When will my order ship?</h5>
        <p className="text-muted">Most in-stock items ship within 1-2 business days. You’ll get a tracking email as soon as it leaves the warehouse.</p>
      </div>
      <div className="mb-4">
        <h5>How do I track my order?</h5>
        <p className="text-muted">Use the tracking link in your confirmation email, or visit “Track Your Order” with your order number and email address.</p>
      </div>
      <div className="mb-4">
        <h5>What payment methods do you accept?</h5>
        <p className="text-muted">We accept major credit/debit cards, PayPal, and select installment providers (where available).</p>
      </div>
      <div className="mb-4">
        <h5>Do you ship internationally?</h5>
        <p className="text-muted">Yes, we ship to many countries. Shipping options, rates, and delivery times are shown at checkout.</p>
      </div>
      <div className="mb-4">
        <h5>How do I start a return?</h5>
        <p className="text-muted">Visit “Shipping & Returns” for eligibility and steps. Most items can be returned within 30 days in original condition.</p>
      </div>
    </div>
  );
};

export default Faq;
