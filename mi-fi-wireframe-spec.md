# Mi-Fi Wireframe Design Spec (1:1 with Current UI)

Source alignment:
- Routes: `routes.md`
- Router implementation: `frontend/src/main.jsx`
- Page/components reviewed directly in `frontend/src/pages/*` and `frontend/src/components/*`

## 1. Plan (How we execute this with review checkpoints)

1. Lock route inventory and access rules (public/customer/support/admin).
2. Define shared app shell wireframe (navbar/main/footer + global widgets).
3. Define route-by-route mi-fi wireframes using current component structure.
4. Validate section-level screens for dashboard routes.
5. Review mismatches and cleanup items before high-fi or implementation handoff.

## 2. Global Shell (applies to almost all routes)

```
+----------------------------------------------------------------------------------+
| Announcement Bar (optional, dynamic)                                            |
+----------------------------------------------------------------------------------+
| Navbar (brand, nav links/dropdowns, theme toggle, cart, account/login/logout)   |
+----------------------------------------------------------------------------------+
| Main Route Content (changes by route)                                            |
|                                                                                  |
+----------------------------------------------------------------------------------+
| Footer (shop links, support links, newsletter, legal links)                      |
+----------------------------------------------------------------------------------+
| Global overlays/widgets: Toaster, CartDrawer, RasaWidget                         |
+----------------------------------------------------------------------------------+
```

Notes:
- Navbar/footers are always mounted from `frontend/src/main.jsx`.
- Protected routes render only if role passes `ProtectedRoute`.

## 3. Route Inventory (1:1 mapping)

## Public routes
- `/` -> `Home` (`HomeHero`, `TrustStrip`, `FeaturedProducts`, `SocialProof`)
- `/products` -> `Products` (`ProductsList`)
- `/product/:id` -> `Product`
- `/about` -> `AboutPage`
- `/contact` -> `ContactPage`
- `/cart` -> `Cart`
- `/login` -> `Login`
- `/register` -> `Register`
- `/checkout` -> `Checkout`
- `/faq` -> `Faq`
- `/shipping-returns` -> `ShippingReturns`
- `/privacy` -> `Privacy`
- `/terms` -> `Terms`
- `/accessibility` -> `Accessibility`
- `*` -> `PageNotFound`

## Customer protected
- `/dashboard/customer` -> `CustomerDashboard` (defaults to `profile` section state)
- `/dashboard/customer/:section` -> `CustomerDashboard`
- `/product/:id/review` -> `ProductReview`

Sections in UI:
- `profile`, `password`, `payments`, `shipping`, `orders`, `rmas`

## Support protected
- `/dashboard/customer-support` -> `CustomerSupportDashboard` (`overview` default)
- `/dashboard/customer-support/:section` -> `CustomerSupportDashboard`

Sections in UI:
- `overview`, `inbox`, `assigned`, `history`, `csat`, `profile`

## Admin protected
- `/dashboard/admin` -> `AdminDashboard` (`dashboard` default)
- `/dashboard/admin/:section` -> `AdminDashboard`
- `/dashboard/admin/products` -> `AdminProducts` (separate page/component)

Sections in UI:
- `dashboard`, `inventory`, `users`, `management`, `businessinsights`, `promotions`, `promos`, `profile`

Management subtabs in UI:
- `faqs`, `policies`, `announcement`

## 4. Mi-Fi Wireframes by Route

## A) Public storefront

### `/` Home
```
[Hero banner: badge + H1 + subtitle + CTA]
[Trust strip: rating, shipping, returns]
[Featured product cards grid (4)]
[Customer review cards + pager]
```

### `/products`
```
[Page title + subtitle]
[Category filter buttons: All + categories]
[Spec filter chips by selected category]
[Product card grid]
  [image]
  [title/category/badges/rating]
  [price + promo state]
  [Add to Cart] [Details]
```

### `/product/:id`
```
[2-column product detail]
  Left: zoomable image
  Right: category, title, rating, price/promo, description, specs, CTA buttons
[You may also like]
  Horizontal marquee of similar product cards (desktop-only block)
```

### `/about`
```
[Centered H1]
[Divider]
[Single lead paragraph block]
```

### `/contact`
```
[Centered H1]
[Divider]
[Single column contact form]
  Name, Email, Message, disabled Send button
```

### `/cart`
```
if empty:
  [Cart title]
  [Empty message]
  [Go Shopping]
else:
  [Cart title]
  [line items rows]
    image | title+price | qty stepper | line total | remove
  [Subtotal]
  [Promo discount row if applied]
  [Continue Shopping] [Proceed to Checkout]
```

### `/login`
```
[Centered auth card]
  Email
  Password
  Error alert (conditional)
  Login button
  Link to Register
```

### `/register`
```
[Centered auth card]
  Full Name
  Email
  Password
  Confirm Password
  Register button
  Error alert (conditional)
  Link to Login
```

### `/checkout`
```
state A (guest):
  modal gate: Login/Register/Back to cart

state B (empty cart):
  empty state + back to products

state C (checkout):
  Header: "Review & pay"
  2-column layout
    Left: Billing & Shipping
      Shipping address selector / new address form
      Payment selector / new card form
      Place order button
    Right: Order Summary
      promo form + applied promo badge row
      line items
      products/discount/shipping/total

state D:
  order confirmed modal -> redirect to customer orders
```

### `/faq`, `/shipping-returns`, `/privacy`, `/terms`, `/accessibility`
```
[Page H2]
[Loading/Error/Empty states]
[List of content blocks from CMS/API]
```

### `*` PageNotFound
```
[Centered 404 heading]
[Back to Home button]
```

## B) Customer dashboard

Applies to `/dashboard/customer` and `/dashboard/customer/:section`
```
[Container]
  [Sidebar card]
    account identity
    grouped nav links
    logout button
  [Main content]
    hero (welcome + active section chip)
    section panel (by route param)
```

Section panels:
- `profile`: profile form (name/email/phone + save/refresh)
- `password`: password change form
- `payments`: saved cards list + add/edit form
- `shipping`: saved addresses list + add/edit form
- `orders`: filter + orders list/cards + review status
- `rmas`: return history/status panel

## C) Support dashboard

Applies to `/dashboard/customer-support` and `/dashboard/customer-support/:section`
```
[Container]
  [Sidebar card]
    support identity
    grouped nav links
    logout
  [Main]
    hero panel + refresh action
    active section content
```

Section panels:
- `overview`: operational summary cards
- `inbox`: open ticket queue + conversation pane
- `assigned`: agent-assigned ticket queue + conversation pane
- `history`: resolved tickets table/list
- `csat`: CSAT stats/trend/verbatim
- `profile`: support profile form

## D) Admin dashboard

Applies to `/dashboard/admin` and `/dashboard/admin/:section`
```
[Admin shell]
  [Left admin sidebar]
    identity
    grouped nav links
    logout
  [Main]
    hero (welcome + trend chip/meta)
    section renderer by viewMode
```

Section panels:
- `dashboard`: KPIs + overview modules
- `inventory`: product/inventory management views + modals
- `users`: users table + create/edit modals
- `management`: website content management
  - subtab `faqs`
  - subtab `policies` (rich text editor modal)
  - subtab `announcement`
- `businessinsights`: insights controls/charts/tables
- `promotions`: promotion CRUD
- `promos`: promo code CRUD
- `profile`: admin profile form

Modal ecosystem:
- create/edit product
- create category
- faq editor
- policy editor
- promo create/edit
- promotion create/edit

## E) `/dashboard/admin/products` (standalone AdminProducts)
```
[Page title + Add Product]
[Advanced filter bar]
  title search
  category search/select
  price range form
[Products table]
[Create/Edit modal]
```

## 5. Responsive Wireframe Rules (from current implementation)

- Public pages rely on Bootstrap grid (`container`, `row`, `col-*`).
- Auth screens are single centered card (`col-lg-5`).
- Dashboard pages use two-pane layout:
  - Desktop: left sidebar + right content.
  - Smaller widths: stacked behavior from CSS (`dashboard.css`, `support-dashboard.css`, `admin-dashboard.css`).
- Product recommendation marquee hidden on small screens (`d-none d-md-block`).

## 6. Review Findings (for spec accuracy before high-fi)

1. `routes.md` says admin management subtab `policie`; UI uses `policies`.
2. Admin route `/dashboard/admin/products` is separate (`AdminProducts`) and not part of `AdminDashboard` section render switch.
3. `ContactPage` uses `class`/`for` attributes in JSX; should be `className`/`htmlFor` for React correctness.
4. Some text glyphs in home social proof/trust strip appear mojibake in source (e.g., star/arrow/quotes). Should normalize UTF-8 characters before visual QA.

## 7. Review Checklist with You

Please confirm these before I move to the next deliverable (high-fi or clickable wireframe):

1. Keep `AdminProducts` as a separate route screen in the wireframe package, yes/no?
2. For customer `/dashboard/customer` default, should the spec treat it as direct `profile` section (current behavior), yes/no?
3. Do you want me to produce this next as:
   - Figma-ready frame-by-frame checklist, or
   - clickable HTML wireframe in `frontend` matching this structure?
