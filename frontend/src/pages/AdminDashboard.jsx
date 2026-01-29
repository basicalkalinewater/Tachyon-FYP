import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchCsatSummary, fetchCsatResponses } from "../api/support";
import { fetchAdminProfile, logoutRequest, updateAdminProfile } from "../api/auth";
import { logout } from "../redux/authSlice";
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  disableAdminUser,
  fetchAdminInsights,
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  listPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  listProductStockView,
  adjustStock,
  updateStock
} from "../api/admin";
import { listProducts, searchProductsByTitle, filterProductsByCategory, createProduct, updateProduct, deleteProduct } from "../api/productManagement";
import { toast } from "react-hot-toast";
import "../styles/admin-dashboard.css";

const ADMIN_SECTIONS = [
  { id: "dashboard", label: "Overview", group: "Command Center" },
  { id: "products", label: "Products", group: "Management" },
  { id: "stocks", label: "Stock", group: "Management" },
  { id: "users", label: "Users", group: "Management" },
  { id: "management", label: "Content", group: "Management" },
  { id: "promotions", label: "Promotions", group: "Management" },
  { id: "promos", label: "Promo Codes", group: "Management" },
  { id: "profile", label: "My Profile", group: "Account" },
];

const GROUPED_ADMIN_SECTIONS = ADMIN_SECTIONS.reduce((groups, section) => {
  const existing = groups.find((g) => g.group === section.group);
  if (existing) {
    existing.items.push(section);
  } else {
    groups.push({ group: section.group, items: [section] });
  }
  return groups;
}, []);

const AdminDashboard = () => {
  const [csat, setCsat] = useState({ summary: {}, trend: [], verbatim: [] });
  const [insights, setInsights] = useState({ bestMonth: null, worstMonth: null, totalSalesToday: 0, ordersToday: 0 });
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ full_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [viewMode, setViewMode] = useState("dashboard"); // dashboard | profile | users | management | promos | promotions
  const [managementTab, setManagementTab] = useState("faqs"); // faqs | policies
  const [faqItems, setFaqItems] = useState([]);
  const [policyItems, setPolicyItems] = useState([]);
  const [promoItems, setPromoItems] = useState([]);
  const [faqForm, setFaqForm] = useState({ id: null, question: "", answer: "" });
  const [policyForm, setPolicyForm] = useState({ id: null, title: "", content: "" });
  const emptyPromoForm = {
    id: null,
    code: "",
    description: "",
    discountType: "percent",
    discountValue: 10,
    maxUses: "",
    startsAt: "",
    expiresAt: "",
    active: true,
  };
  const [promoForm, setPromoForm] = useState(emptyPromoForm);
  const [showCreatePromoForm, setShowCreatePromoForm] = useState(false);
  const [editPromoForm, setEditPromoForm] = useState(null);
  const emptyPromotionForm = {
    id: null,
    name: "",
    scopeType: "product",
    productId: "",
    category: "",
    discountType: "percent",
    discountValue: 10,
    startsAt: "",
    expiresAt: "",
    active: true,
  };
  const [promotionItems, setPromotionItems] = useState([]);
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [showCreatePromotionForm, setShowCreatePromotionForm] = useState(false);
  const [editPromotionForm, setEditPromotionForm] = useState(null);
  const [faqLoading, setFaqLoading] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoFilters, setPromoFilters] = useState({ q: "", active: "all" });
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [promotionFilters, setPromotionFilters] = useState({ q: "", active: "all", scope: "all" });
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userFilters, setUserFilters] = useState({ email: "", role: "" });
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productFilters, setProductFilters] = useState({ title: "", category: ""});
  const [userForm, setUserForm] = useState({
    id: null,
    email: "",
    role: "customer",
    full_name: "",
    phone: "",
    password: "",
    status: "active",
  });
  const [editProductForm, setEditProductForm] = useState(null); 
  const [editProductSaving, setEditProductSaving] = useState(false);
  const [showCreateProductForm, setShowCreateProductForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
  title: "",
  Brand: "",
  category: "",
  description: "",
  price: "",
  specs: {},
  image_url: null
  });
  const [stocks, setStocks] = useState([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [stockSearch, setStockSearch] = useState("");
  const [stockCategory, setStockCategory] = useState("all");
  const [adjustingId, setAdjustingId] = useState(null);
  const [adjustmentForm, setAdjustmentForm] = useState({ quantity: 0, reason: "" });
  const [adjustingThresholdId, setAdjustingThresholdId] = useState(null);
  const [thresholdValue, setThresholdValue] = useState(15);
  const [customFieldName, setCustomFieldName] = useState("");
  const [isDeleting, setIsDeleting] = useState(null);
  const CATEGORY_TEMPLATES = {
  keyboard: { size: "", connection: "", switch_type: "" },
  mouse: { connection: "", polling_hz: "", weight_grams: "" },
  ssd: { interface: "", read_mb_s: "", write_mb_s: "", capacity_gb: "" },
  monitor: { panel_type: "", refresh_hz: "", resolution: "", screen_size_inches: "" },
  };
  const [customCategory, setCustomCategory] = useState("");
  const [userSaving, setUserSaving] = useState(false);
  const [editUserForm, setEditUserForm] = useState(null);
  const [editUserSaving, setEditUserSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const dispatch = useDispatch();
  const currentUser = useSelector((state) => state.auth.user);
  const displayName = currentUser?.fullName || currentUser?.email || "Admin";
  const displayEmail = currentUser?.email || "";
  const handleLogout = async () => {
    try {
      await logoutRequest();
    } catch {
      // ignore server logout errors; still clear client session
    } finally {
      dispatch(logout());
    }
  };
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

  const toLocalInputDateTime = (date = new Date()) => {
    const pad = (n) => `${n}`.padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const nowInputMin = toLocalInputDateTime(new Date());

  const toInputDateTime = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => `${n}`.padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const describeWindow = (start, end) => {
    const fmt = (val) => {
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString();
    };
    if (start && end) return `${fmt(start)} - ${fmt(end)}`;
    if (start) return `From ${fmt(start)}`;
    if (end) return `Until ${fmt(end)}`;
    return "No expiry window";
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, responses, insightsRes] = await Promise.all([
        fetchCsatSummary(120),
        fetchCsatResponses(20),
        fetchAdminInsights(),
      ]);
      setCsat({
        summary: summaryData.summary || {},
        trend: summaryData.trend || [],
        verbatim: responses || [],
      });
      const insightsData = insightsRes?.data || insightsRes || {};
      setInsights({
        bestMonth: insightsData.best_selling_product_month || null,
        worstMonth: insightsData.worst_selling_product_month || null,
        totalSalesToday: insightsData.total_sales_today || 0,
        ordersToday: insightsData.orders_today || 0,
      });
    } catch (err) {
      toast.error(err.message || "Failed to load admin metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetchAdminProfile();
      setProfile({
        full_name: res.data?.full_name || "",
        phone: res.data?.phone || "",
      });
    } catch (err) {
      toast.error(err.message || "Failed to load profile");
    }
  }, []);

  useEffect(() => {
    load();
    loadProfile();
  }, [load, loadProfile]);

  const loadFaqs = useCallback(async () => {
    setFaqLoading(true);
    try {
      const data = await listFaqs();
      const list = data.data || data || [];
      setFaqItems(list);
    } catch (err) {
      toast.error(err.message || "Failed to load FAQs");
    } finally {
      setFaqLoading(false);
    }
  }, []);

  const loadPolicies = useCallback(async () => {
    setPolicyLoading(true);
    try {
      const data = await listPolicies();
      const list = data.data || data || [];
      setPolicyItems(list);
    } catch (err) {
      toast.error(err.message || "Failed to load policies");
    } finally {
      setPolicyLoading(false);
    }
  }, []);

  const loadPromos = useCallback(async () => {
    setPromoLoading(true);
    try {
      const params = {};
      if (promoFilters.q.trim()) {
        params.q = promoFilters.q.trim();
      }
      if (promoFilters.active === "active") params.active = true;
      else if (promoFilters.active === "inactive") params.active = false;
      const data = await listPromoCodes(params);
      const list = data.data || data || [];
      setPromoItems(list);
    } catch (err) {
      toast.error(err.message || "Failed to load promo codes");
    } finally {
      setPromoLoading(false);
    }
  }, [promoFilters]);

  const loadPromotions = useCallback(async () => {
    setPromotionLoading(true);
    try {
      const params = {};
      if (promotionFilters.q.trim()) {
        params.q = promotionFilters.q.trim();
      }
      if (promotionFilters.active === "active") params.active = true;
      else if (promotionFilters.active === "inactive") params.active = false;
      if (promotionFilters.scope !== "all") params.scope = promotionFilters.scope;
      const data = await listPromotions(params);
      const list = data.data || data || [];
      setPromotionItems(list);
    } catch (err) {
      toast.error(err.message || "Failed to load promotions");
    } finally {
      setPromotionLoading(false);
    }
  }, [promotionFilters]);

  useEffect(() => {
    if (viewMode === "management") {
      if (managementTab === "faqs") {
        loadFaqs();
      } else if (managementTab === "policies") {
        loadPolicies();
      }
    } else if (viewMode === "promos") {
      loadPromos();
    } else if (viewMode === "promotions") {
      loadPromotions();
    }
  }, [viewMode, managementTab, loadFaqs, loadPolicies, loadPromos, loadPromotions]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      let data;
      if (productFilters.title) {
        data = await searchProductsByTitle(productFilters.title);
      } else if (productFilters.category) {
        data = await filterProductsByCategory(productFilters.category);
      } else {
        data = await listProducts();
      }

      const list = data.data || data || [];
      setProducts(list);
    } catch (err) {
      toast.error(err.message || "Failed to load products");
    } finally {
      setProductsLoading(false);
    }
  }, [productFilters]);
  useEffect(() => {
    if (viewMode === "products" || viewMode === "promotions") {
      loadProducts();
    }
  }, [viewMode, loadProducts]);

  const startEditProduct = (p) => {
    // We include existing data and reset any 'newImageFile' from previous sessions
    setEditProductForm({ ...p, newImageFile: null });
  };

  const handleEditProductSave = async (e) => {
    e.preventDefault();
    if (!editProductForm) return;

    setEditProductSaving(true);
    
    // 1. Create FormData for the PUT request
    const formData = new FormData();
    formData.append("title", editProductForm.title);
    formData.append("category", editProductForm.category);
    formData.append("price", editProductForm.price);
    
    // Optional: Append brand/description if you have those fields in your edit form
    if (editProductForm.Brand) formData.append("Brand", editProductForm.Brand);
    if (editProductForm.description) formData.append("description", editProductForm.description);
    
    // We stringify the specs so the backend can parse them as JSON
    formData.append("specs", JSON.stringify(editProductForm.specs || {}));

    // 2. Append the new image file ONLY if the admin selected one
    if (editProductForm.newImageFile) {
      formData.append("image", editProductForm.newImageFile);
    }

    try {
      // 3. Pass the formData to your API helper
      await updateProduct(editProductForm.id, formData);
      
      toast.success("Product updated successfully");
      setEditProductForm(null);
      await loadProducts();
    } catch (err) {
      toast.error(err.message || "Failed to update product");
    } finally {
      setEditProductSaving(false);
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();

    const finalCategory = newProduct.category === "other" 
      ? customCategory 
      : newProduct.category;

    const cleanedSpecs = {};
    Object.entries(newProduct.specs).forEach(([k, v]) => {
      if (k.trim() !== "") cleanedSpecs[k] = v;
    });
    // Use FormData for file upload
    const formData = new FormData();
    formData.append("title", newProduct.title);
    formData.append("Brand", newProduct.Brand);
    formData.append("category", finalCategory);
    formData.append("description", newProduct.description);
    formData.append("price", parseFloat(newProduct.price));
    formData.append("specs", JSON.stringify(cleanedSpecs));
    // Append the file if it exists
    if (newProduct.imageFile) {
      formData.append("image", newProduct.imageFile); 
    }
    try {
      // Note: ensure your createProduct API function can handle FormData
      await createProduct(formData);
      toast.success(`Product added to ${finalCategory}!`);
      setShowCreateProductForm(false);
      // Reset state
      setNewProduct({ 
        title: "", 
        Brand: "", 
        category: "", 
        description: "", 
        price: "", 
        specs: {},
        imageFile: null 
      });
      setCustomCategory("");
      loadProducts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteProduct = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete product "${title}"? This action cannot be undone.`)) return;
    setIsDeleting(id);
    try {
      await deleteProduct(id);
      toast.success("Product deleted");
      loadProducts();
    } catch (err) {
      toast.error(err.message || "Failed to delete product");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleCategoryChange = (cat) => {
    const template = CATEGORY_TEMPLATES[cat.toLowerCase()] || {};
    setNewProduct({
      ...newProduct,
      category: cat,
      specs: { ...template }
    });
  };

  const updateSpec = (key, value) => {
    setNewProduct((prev) => ({
      ...prev,
      specs: { ...prev.specs, [key]: value }
    }));
  };

  const addCustomField = () => {
    if (!customFieldName) return;
    updateSpec(customFieldName, "");
    setCustomFieldName("");
  };

  const addSpecField = () => {
    setNewProduct(prev => ({
      ...prev,
      specs: { ...prev.specs, "": "" } // Adds an empty key-value pair
    }));
  };

  const handleSpecKeyChange = (oldKey, newKey) => {
    const { [oldKey]: value, ...rest } = newProduct.specs;
    setNewProduct(prev => ({
      ...prev,
      specs: { ...rest, [newKey]: value }
    }));
  };

  const handleSpecValueChange = (key, value) => {
    setNewProduct(prev => ({
      ...prev,
      specs: { ...prev.specs, [key]: value }
    }));
  };

  const removeSpecField = (key) => {
    const updatedSpecs = { ...newProduct.specs };
    delete updatedSpecs[key];
    setNewProduct(prev => ({ ...prev, specs: updatedSpecs }));
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const loadStocks = useCallback(async () => {
    setStocksLoading(true);
    try {
      const res = await listProductStockView();
    
      // Support both wrapped {data: []} and direct array responses
      const data = res?.data || res || [];
    
      setStocks(data);
    } catch (err) {
      console.error("Stock Load Error:", err);
      toast.error("Failed to load inventory data");
      setStocks([]); 
    } finally {
      setStocksLoading(false);
    }
  }, []);

  useEffect(() => {
  if (viewMode === "stocks") {
    loadStocks();
  }
}, [viewMode, loadStocks]);
  
const handleStockSubmit = async (productId) => {
  // Prevent empty submissions
  if (adjustmentForm.quantity === 0) {
    toast.error("Please enter a valid adjustment (e.g., +10 or -5)");
    return;
  }

  try {
    await adjustStock({
      productId,
      adjustment: adjustmentForm.quantity,
      description: adjustmentForm.reason || "Manual adjustment"
    });

    toast.success("Inventory updated");
    
    // Reset the local form state
    setAdjustingId(null);
    setAdjustmentForm({ quantity: 0, reason: "" });
    
    // REFRESH the list so the user sees the new stock level immediately
    await loadStocks(); 
  } catch (err) {
    toast.error(err.message || "Failed to update stock");
  }
};

  const handleSaveThreshold = async (productId) => {
    if (isNaN(thresholdValue)) {
      toast.error("Please enter a valid number");
      return;
    }

    try {
      // This uses the updateStock function imported from ../api/admin
      await updateStock(productId, { 
        low_stock_threshold: parseInt(thresholdValue, 10) 
      });
    
      toast.success("Threshold updated!");
      setAdjustingThresholdId(null); // Close the inline input
      await loadStocks(); // Refresh the list
    } catch (err) {
      console.error("Threshold Update Error:", err);
      toast.error(err.message || "Failed to update threshold");
    }
  };

  const filteredStocks = useMemo(() => {
    return stocks.filter((s) => {
      const matchesTitle = (s.title || "").toLowerCase().includes(stockSearch.toLowerCase());
      const matchesCategory = stockCategory === "all" || s.category === stockCategory;
      return matchesTitle && matchesCategory;
    });
  }, [stocks, stockSearch, stockCategory]);

  const stockCategories = useMemo(() => {
    const cats = stocks.map(s => s.category).filter(Boolean);
    return ["all", ...new Set(cats)];
  }, [stocks]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await updateAdminProfile({
        full_name: profile.full_name,
        phone: profile.phone
      });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await listAdminUsers({
        email: userFilters.email,
        role: userFilters.role,
        limit: 50,
        offset: 0,
      });
      const list = data.data || data || [];
      setUsers(list.filter((u) => u.role !== "admin"));
    } catch (err) {
      toast.error(err.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }, [userFilters]);

  useEffect(() => {
    if (viewMode === "users") {
      loadUsers();
    }
  }, [viewMode, loadUsers]);

  const startCreateUser = () => {
    setEditUserForm(null);
    setShowCreateForm(true);
    setUserForm({ id: null, email: "", role: "customer", full_name: "", phone: "", password: "", status: "active" });
  };

  const startEditUser = (u) => {
    setShowCreateForm(false);
    setEditUserForm({
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status || "active",
      full_name: u.full_name || "",
      phone: u.phone || "",
      password: "",
      shippingAddresses: u.shippingAddresses || [],
    });
  };

  const handleUserChange = (e) => {
    const { name, value } = e.target;
    setUserForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUserSave = async (e) => {
    e.preventDefault();
    setUserSaving(true);
    try {
      await createAdminUser({
        email: userForm.email,
        role: userForm.role,
        password: userForm.password,
        full_name: userForm.full_name,
        phone: userForm.phone,
        status: userForm.status,
      });
      toast.success("User created");
      await loadUsers();
      setShowCreateForm(false);
      setUserForm({ id: null, email: "", role: "customer", full_name: "", phone: "", password: "", status: "active" });
    } catch (err) {
      toast.error(err.message || "Failed to save user");
    } finally {
      setUserSaving(false);
    }
  };

  const handleEditUserSave = async (e) => {
    e.preventDefault();
    if (!editUserForm) return;
    setEditUserSaving(true);
    try {
      await updateAdminUser(editUserForm.id, {
        role: editUserForm.role,
        status: editUserForm.status,
        full_name: editUserForm.full_name,
        phone: editUserForm.phone,
        password: editUserForm.password || undefined,
      });
      toast.success("User updated");
      await loadUsers();
      setEditUserForm(null);
    } catch (err) {
      toast.error(err.message || "Failed to update user");
    } finally {
      setEditUserSaving(false);
    }
  };

  const handleDisableUser = async (userId, email) => {
    const confirm = window.confirm(`Disable user ${email}? This revokes all sessions and sets status to disabled.`);
    if (!confirm) return;
    try {
      await disableAdminUser(userId);
      toast.success("User disabled (sessions revoked)");
      await loadUsers();
    } catch (err) {
      toast.error(err.message || "Unable to disable user");
    }
  };

  const handleEnableUser = async (userId, email) => {
    const confirm = window.confirm(`Re-enable ${email}?`);
    if (!confirm) return;
    try {
      await updateAdminUser(userId, { status: "active" });
      toast.success("User enabled");
      await loadUsers();
    } catch (err) {
      toast.error(err.message || "Unable to enable user");
    }
  };

  const resetPromoForm = () => setPromoForm(emptyPromoForm);
  const sanitizePromoCode = (value) => value.replace(/[^A-Za-z0-9]/g, "");
  const isValidPromoCode = (value) => /^[A-Za-z0-9]+$/.test(value);

  const handlePromoSubmit = async (e) => {
    e.preventDefault();
    const trimmedCode = promoForm.code.trim();
    if (!trimmedCode) {
      toast.error("Promo code is required");
      return;
    }
    if (!isValidPromoCode(trimmedCode)) {
      toast.error("Promo code can only contain letters and numbers");
      return;
    }
    const numericValue = Number(promoForm.discountValue);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      toast.error("Discount value must be greater than 0");
      return;
    }
    if (promoForm.discountType === "percent" && numericValue > 100) {
      toast.error("Percent discounts cannot exceed 100%");
      return;
    }
    const startsAt = promoForm.startsAt ? new Date(promoForm.startsAt) : null;
    const expiresAt = promoForm.expiresAt ? new Date(promoForm.expiresAt) : null;
    const now = new Date();
    if (startsAt && startsAt < now) {
      toast.error("Start date/time cannot be in the past");
      return;
    }
    if (expiresAt && expiresAt < now) {
      toast.error("End date/time cannot be in the past");
      return;
    }
    if (startsAt && expiresAt && startsAt > expiresAt) {
      toast.error("End date/time must be after start date/time");
      return;
    }
    const toIso = (val) => (val ? new Date(val).toISOString() : null);
    const payload = {
      code: trimmedCode,
      description: (promoForm.description || "").trim(),
      discountType: promoForm.discountType,
      discountValue: numericValue,
      maxUses: promoForm.maxUses === "" ? null : Number(promoForm.maxUses),
      startsAt: toIso(promoForm.startsAt),
      expiresAt: toIso(promoForm.expiresAt),
      active: !!promoForm.active,
    };
    try {
      await createPromoCode(payload);
      toast.success("Promo created");
      resetPromoForm();
      setShowCreatePromoForm(false);
      await loadPromos();
    } catch (err) {
      toast.error(err.message || "Failed to save promo");
    }
  };

  const handlePromoUpdate = async (e) => {
    e.preventDefault();
    if (!editPromoForm) return;
    const trimmedCode = editPromoForm.code.trim();
    if (!trimmedCode) {
      toast.error("Promo code is required");
      return;
    }
    if (!isValidPromoCode(trimmedCode)) {
      toast.error("Promo code can only contain letters and numbers");
      return;
    }
    const numericValue = Number(editPromoForm.discountValue);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      toast.error("Discount value must be greater than 0");
      return;
    }
    if (editPromoForm.discountType === "percent" && numericValue > 100) {
      toast.error("Percent discounts cannot exceed 100%");
      return;
    }
    const startsAt = editPromoForm.startsAt ? new Date(editPromoForm.startsAt) : null;
    const expiresAt = editPromoForm.expiresAt ? new Date(editPromoForm.expiresAt) : null;
    const now = new Date();
    if (startsAt && startsAt < now) {
      toast.error("Start date/time cannot be in the past");
      return;
    }
    if (expiresAt && expiresAt < now) {
      toast.error("End date/time cannot be in the past");
      return;
    }
    if (startsAt && expiresAt && startsAt > expiresAt) {
      toast.error("End date/time must be after start date/time");
      return;
    }
    const toIso = (val) => (val ? new Date(val).toISOString() : null);
    const payload = {
      code: trimmedCode,
      description: (editPromoForm.description || "").trim(),
      discountType: editPromoForm.discountType,
      discountValue: numericValue,
      maxUses: editPromoForm.maxUses === "" ? null : Number(editPromoForm.maxUses),
      startsAt: toIso(editPromoForm.startsAt),
      expiresAt: toIso(editPromoForm.expiresAt),
      active: !!editPromoForm.active,
    };
    try {
      await updatePromoCode(editPromoForm.id, payload);
      toast.success("Promo updated");
      setEditPromoForm(null);
      await loadPromos();
    } catch (err) {
      toast.error(err.message || "Failed to update promo");
    }
  };

  const startCreatePromo = () => {
    resetPromoForm();
    setEditPromoForm(null);
    setShowCreatePromoForm(true);
  };

  const startEditPromo = (promo) => {
    setShowCreatePromoForm(false);
    setEditPromoForm({
      id: promo.id,
      code: promo.code || "",
      description: promo.description || "",
      discountType: promo.discount_type || promo.discountType || "percent",
      discountValue: Number(promo.discount_value ?? promo.discountValue ?? 0),
      maxUses: promo.max_uses ?? promo.maxUses ?? "",
      startsAt: toInputDateTime(promo.starts_at || promo.startsAt),
      expiresAt: toInputDateTime(promo.expires_at || promo.expiresAt),
      active: promo.active ?? true,
    });
  };

  const resetPromotionForm = () => setPromotionForm(emptyPromotionForm);

  const handlePromotionSubmit = async (e) => {
    e.preventDefault();
    const scopeType = promotionForm.scopeType;
    if (scopeType === "product" && !promotionForm.productId) {
      toast.error("Select a product for this promotion");
      return;
    }
    if (scopeType === "category" && !promotionForm.category.trim()) {
      toast.error("Enter a category for this promotion");
      return;
    }
    const numericValue = Number(promotionForm.discountValue);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      toast.error("Discount value must be greater than 0");
      return;
    }
    if (promotionForm.discountType === "percent" && numericValue > 100) {
      toast.error("Percent discounts cannot exceed 100%");
      return;
    }
    const startsAt = promotionForm.startsAt ? new Date(promotionForm.startsAt) : null;
    const expiresAt = promotionForm.expiresAt ? new Date(promotionForm.expiresAt) : null;
    const now = new Date();
    if (startsAt && startsAt < now) {
      toast.error("Start date/time cannot be in the past");
      return;
    }
    if (expiresAt && expiresAt < now) {
      toast.error("End date/time cannot be in the past");
      return;
    }
    if (startsAt && expiresAt && startsAt > expiresAt) {
      toast.error("End date/time must be after start date/time");
      return;
    }
    const toIso = (val) => (val ? new Date(val).toISOString() : null);
    const payload = {
      name: (promotionForm.name || "").trim(),
      scopeType,
      productId: scopeType === "product" ? promotionForm.productId : null,
      category: scopeType === "category" ? promotionForm.category.trim() : null,
      discountType: promotionForm.discountType,
      discountValue: numericValue,
      startsAt: toIso(promotionForm.startsAt),
      expiresAt: toIso(promotionForm.expiresAt),
      active: !!promotionForm.active,
    };
    try {
      await createPromotion(payload);
      toast.success("Promotion created");
      resetPromotionForm();
      setShowCreatePromotionForm(false);
      await loadPromotions();
    } catch (err) {
      toast.error(err.message || "Failed to save promotion");
    }
  };

  const handlePromotionUpdate = async (e) => {
    e.preventDefault();
    if (!editPromotionForm) return;
    const scopeType = editPromotionForm.scopeType;
    if (scopeType === "product" && !editPromotionForm.productId) {
      toast.error("Select a product for this promotion");
      return;
    }
    if (scopeType === "category" && !editPromotionForm.category.trim()) {
      toast.error("Enter a category for this promotion");
      return;
    }
    const numericValue = Number(editPromotionForm.discountValue);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      toast.error("Discount value must be greater than 0");
      return;
    }
    if (editPromotionForm.discountType === "percent" && numericValue > 100) {
      toast.error("Percent discounts cannot exceed 100%");
      return;
    }
    const startsAt = editPromotionForm.startsAt ? new Date(editPromotionForm.startsAt) : null;
    const expiresAt = editPromotionForm.expiresAt ? new Date(editPromotionForm.expiresAt) : null;
    const now = new Date();
    if (startsAt && startsAt < now) {
      toast.error("Start date/time cannot be in the past");
      return;
    }
    if (expiresAt && expiresAt < now) {
      toast.error("End date/time cannot be in the past");
      return;
    }
    if (startsAt && expiresAt && startsAt > expiresAt) {
      toast.error("End date/time must be after start date/time");
      return;
    }
    const toIso = (val) => (val ? new Date(val).toISOString() : null);
    const payload = {
      name: (editPromotionForm.name || "").trim(),
      scopeType,
      productId: scopeType === "product" ? editPromotionForm.productId : null,
      category: scopeType === "category" ? editPromotionForm.category.trim() : null,
      discountType: editPromotionForm.discountType,
      discountValue: numericValue,
      startsAt: toIso(editPromotionForm.startsAt),
      expiresAt: toIso(editPromotionForm.expiresAt),
      active: !!editPromotionForm.active,
    };
    try {
      await updatePromotion(editPromotionForm.id, payload);
      toast.success("Promotion updated");
      setEditPromotionForm(null);
      await loadPromotions();
    } catch (err) {
      toast.error(err.message || "Failed to update promotion");
    }
  };

  const startCreatePromotion = () => {
    resetPromotionForm();
    setEditPromotionForm(null);
    setShowCreatePromotionForm(true);
  };

  const startEditPromotion = (promotion) => {
    setShowCreatePromotionForm(false);
    setEditPromotionForm({
      id: promotion.id,
      name: promotion.name || "",
      scopeType: promotion.scope_type || promotion.scopeType || "product",
      productId: promotion.product_id || promotion.productId || "",
      category: promotion.category || "",
      discountType: promotion.discount_type || promotion.discountType || "percent",
      discountValue: Number(promotion.discount_value ?? promotion.discountValue ?? 0),
      startsAt: toInputDateTime(promotion.starts_at || promotion.startsAt),
      expiresAt: toInputDateTime(promotion.expires_at || promotion.expiresAt),
      active: promotion.active ?? true,
    });
  };

  const summary = csat.summary || {};
  const trend = csat.trend || [];

  const bestTrendPoint = useMemo(() => {
    if (!trend.length) return null;
    return trend.reduce((best, point) => {
      const value = Number(point.csat_pct ?? 0);
      const bestValue = Number(best.csat_pct ?? 0);
      return value > bestValue ? point : best;
    }, trend[0]);
  }, [trend]);

  const averageTrend = useMemo(() => {
    if (!trend.length) return 0;
    const total = trend.reduce((sum, p) => sum + Number(p.csat_pct ?? 0), 0);
    return Math.round(total / trend.length);
  }, [trend]);

  const promotionCategories = useMemo(() => {
    const cats = (products || [])
      .map((p) => p.category)
      .filter((c) => !!c);
    return Array.from(new Set(cats)).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const promotionProductMap = useMemo(() => {
    return new Map((products || []).map((p) => [p.id, p.title]));
  }, [products]);

  // Helper Render functions
  const renderDashboard = () => (
    <>
      <section className="admin-metric-grid">
        <div className="admin-card metric">
          <p className="muted">CSAT %</p>
          <div className="metric-value">{Math.round(summary.csat_pct ?? 0)}%</div>
          <span className="muted small">Overall satisfaction</span>
        </div>
        <div className="admin-card metric">
          <p className="muted">Avg Rating</p>
          <div className="metric-value">{Number(summary.avg_rating ?? 0).toFixed(2)}</div>
          <span className="muted small">5-point scale</span>
        </div>
        <div className="admin-card metric">
          <p className="muted">Responses</p>
          <div className="metric-value">{summary.responses ?? 0}</div>
          <span className="muted small">Collected in the window</span>
        </div>
        <div className="admin-card metric">
          <p className="muted">Peak day</p>
          <div className="metric-value">
            {bestTrendPoint?.csat_pct ? `${Math.round(bestTrendPoint.csat_pct)}%` : "—"}
          </div>
          <span className="muted small">
            {bestTrendPoint?.day
              ? new Date(bestTrendPoint.day).toLocaleDateString()
              : "Best recorded CSAT"}
          </span>
        </div>
      </section>

      <section className="admin-grid">
        <div className="admin-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Business insights</p>
              <h4>Sales performance</h4>
            </div>
          </div>
          <ul className="insight-list">
            <li>
              <p className="muted tiny mb-1">Best-selling product (month)</p>
              <div className="insight-value">
                <strong>{insights.bestMonth?.name || "N/A"}</strong>
                <span className="muted tiny">{insights.bestMonth ? `${insights.bestMonth.quantity} sold` : "No sales yet"}</span>
              </div>
            </li>
            <li>
              <p className="muted tiny mb-1">Worst-selling product (month)</p>
              <div className="insight-value">
                <strong>{insights.worstMonth?.name || "N/A"}</strong>
                <span className="muted tiny">{insights.worstMonth ? `${insights.worstMonth.quantity} sold` : "No sales yet"}</span>
              </div>
            </li>
            <li>
              <p className="muted tiny mb-1">Total sales today</p>
              <div className="insight-value">
                <strong>{currencyFormatter.format(insights.totalSalesToday || 0)}</strong>
                <span className="muted tiny">{insights.ordersToday} orders today</span>
              </div>
            </li>
          </ul>
        </div>

        <div className="admin-card wide">
          <div className="card-header">
            <div>
              <p className="eyebrow">Voice of customer</p>
              <h4>Latest feedback</h4>
            </div>
          </div>
          {loading ? (
            <p className="muted small mb-0">Loading...</p>
          ) : csat.verbatim && csat.verbatim.length ? (
            <ul className="feedback-list">
              {csat.verbatim.map((v) => (
                <li key={v.session_id}>
                  <div className="feedback-top">
                    <div className="badge">Rating {v.customer_rating}/5</div>
                    <span className="muted tiny">
                      {v.customer_rating_submitted_at
                        ? new Date(v.customer_rating_submitted_at).toLocaleString()
                        : ""}
                    </span>
                  </div>
                  <p className="muted tiny mb-1">
                    {v.customer_name || "Unknown customer"} ({v.customer_email || "N/A"})
                  </p>
                  {v.customer_feedback && <div className="feedback-text">{v.customer_feedback}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small mb-0">No feedback yet.</p>
          )}
        </div>
      </section>
    </>
  );

  const renderProfile = () => (
    <section className="admin-grid">
      <div className="admin-card">
        <div className="card-header">
          <div>
            <p className="eyebrow">Profile</p>
            <h4>Admin details</h4>
          </div>
        </div>
        <form className="profile-form" onSubmit={handleProfileSave}>
          <div className="mb-3">
            <label className="form-label" htmlFor="admin-full-name">Full name</label>
            <input
              id="admin-full-name"
              name="full_name"
              type="text"
              className="form-control"
              value={profile.full_name}
              onChange={handleProfileChange}
              placeholder="Enter your name"
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="admin-email">Email</label>
            <input
              id="admin-email"
              type="email"
              className="form-control"
              value={currentUser?.email || ""}
              disabled
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="admin-phone">Phone</label>
            <input
              id="admin-phone"
              name="phone"
              type="tel"
              className="form-control"
              value={profile.phone}
              onChange={handleProfileChange}
              placeholder="+65 1234 5678"
            />
          </div>
          <div className="d-flex gap-3 mt-3">
            <button type="submit" className="btn btn-primary-saas" disabled={profileSaving}>
              {profileSaving ? "Saving..." : "Save"}
            </button>
            <button type="button" className="btn btn-outline-saas" onClick={loadProfile} disabled={profileSaving}>
              Refresh
            </button>
          </div>
        </form>
      </div>
    </section>
  );

const renderManagement = () => (
  <section className="admin-grid">
    <div className="admin-card wide">
      <div className="card-header">
        <div>
            <p className="eyebrow">Management</p>
            <h4>Tools & settings</h4>
          </div>
        </div>
        <div className="d-flex gap-2 mb-3 flex-wrap">
          <button
            type="button"
            className={`btn ${managementTab === "faqs" ? "btn-primary-saas" : "btn-outline-saas"}`}
            onClick={() => setManagementTab("faqs")}
          >
            FAQs
          </button>
          <button
            type="button"
            className={`btn ${managementTab === "policies" ? "btn-primary-saas" : "btn-outline-saas"}`}
            onClick={() => setManagementTab("policies")}
          >
            Policies
          </button>
        </div>
        {managementTab === "faqs" && (
          <div className="admin-grid">
            <div className="admin-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">FAQs</p>
                  <h4>{faqForm.id ? "Edit FAQ" : "Create FAQ"}</h4>
                </div>
              </div>
              <form
                className="profile-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!faqForm.question.trim() || !faqForm.answer.trim()) return;
                  try {
                    if (faqForm.id) {
                      await updateFaq(faqForm.id, {
                        question: faqForm.question.trim(),
                        answer: faqForm.answer.trim(),
                      });
                      toast.success("FAQ updated");
                    } else {
                      await createFaq({
                        question: faqForm.question.trim(),
                        answer: faqForm.answer.trim(),
                      });
                      toast.success("FAQ created");
                    }
                    setFaqForm({ id: null, question: "", answer: "" });
                    await loadFaqs();
                  } catch (err) {
                    toast.error(err.message || "Failed to save FAQ");
                  }
                }}
              >
                <div className="mb-3">
                  <label className="form-label" htmlFor="faq-question">Question</label>
                  <input
                    id="faq-question"
                    type="text"
                    className="form-control"
                    value={faqForm.question}
                    onChange={(e) => setFaqForm((p) => ({ ...p, question: e.target.value }))}
                    placeholder="Enter FAQ question"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="faq-answer">Answer</label>
                  <textarea
                    id="faq-answer"
                    className="form-control"
                    rows="4"
                    value={faqForm.answer}
                    onChange={(e) => setFaqForm((p) => ({ ...p, answer: e.target.value }))}
                    placeholder="Enter answer"
                  />
                </div>
                <div className="d-flex gap-3">
                  <button type="submit" className="btn btn-primary-saas">
                    {faqForm.id ? "Update" : "Create"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-saas"
                    onClick={() => setFaqForm({ id: null, question: "", answer: "" })}
                  >
                    Clear
                  </button>
                </div>
              </form>
            </div>
            <div className="admin-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">Existing FAQs</p>
                  <h4>Manage entries</h4>
                </div>
              </div>
              {faqLoading ? (
                <p className="muted mb-0">Loading FAQs...</p>
              ) : faqItems.length === 0 ? (
                <p className="muted mb-0">No FAQs yet.</p>
              ) : (
                <div className="management-scroll">
                  <ul className="list-unstyled mb-0">
                    {faqItems.map((item) => (
                      <li key={item.id} className="mb-3">
                        <strong>{item.question}</strong>
                        <p className="muted small mb-2">{item.answer}</p>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-saas btn-sm"
                            onClick={() => setFaqForm(item)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={async () => {
                              try {
                                await deleteFaq(item.id);
                                toast.success("FAQ removed");
                                await loadFaqs();
                              } catch (err) {
                                toast.error(err.message || "Failed to remove FAQ");
                              }
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        {managementTab === "policies" && (
          <div className="admin-grid">
            <div className="admin-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">Policies</p>
                  <h4>{policyForm.id ? "Edit policy" : "Create policy"}</h4>
                </div>
              </div>
              <form
                className="profile-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!policyForm.title.trim() || !policyForm.content.trim()) return;
                  try {
                    if (policyForm.id) {
                      await updatePolicy(policyForm.id, {
                        title: policyForm.title.trim(),
                        content: policyForm.content.trim(),
                      });
                      toast.success("Policy updated");
                    } else {
                      await createPolicy({
                        title: policyForm.title.trim(),
                        content: policyForm.content.trim(),
                      });
                      toast.success("Policy created");
                    }
                    setPolicyForm({ id: null, title: "", content: "" });
                    await loadPolicies();
                  } catch (err) {
                    toast.error(err.message || "Failed to save policy");
                  }
                }}
              >
                <div className="mb-3">
                  <label className="form-label" htmlFor="policy-title">Title</label>
                  <input
                    id="policy-title"
                    type="text"
                    className="form-control"
                    value={policyForm.title}
                    onChange={(e) => setPolicyForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Policy title"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="policy-content">Content</label>
                  <textarea
                    id="policy-content"
                    className="form-control"
                    rows="6"
                    value={policyForm.content}
                    onChange={(e) => setPolicyForm((p) => ({ ...p, content: e.target.value }))}
                    placeholder="Policy content"
                  />
                </div>
                <div className="d-flex gap-3">
                  <button type="submit" className="btn btn-primary-saas">
                    {policyForm.id ? "Update" : "Create"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-saas"
                    onClick={() => setPolicyForm({ id: null, title: "", content: "" })}
                  >
                    Clear
                  </button>
                </div>
              </form>
            </div>
            <div className="admin-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">Existing policies</p>
                  <h4>Manage documents</h4>
                </div>
              </div>
              {policyLoading ? (
                <p className="muted mb-0">Loading policies...</p>
              ) : policyItems.length === 0 ? (
                <p className="muted mb-0">No policies yet.</p>
              ) : (
                <div className="management-scroll">
                  <ul className="list-unstyled mb-0">
                    {policyItems.map((item) => (
                      <li key={item.id} className="mb-3">
                        <strong>{item.title}</strong>
                        <p className="muted small mb-2">{item.content}</p>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-saas btn-sm"
                            onClick={() => setPolicyForm(item)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={async () => {
                              try {
                                await deletePolicy(item.id);
                                toast.success("Policy removed");
                                await loadPolicies();
                              } catch (err) {
                                toast.error(err.message || "Failed to remove policy");
                              }
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );

  const renderPromos = () => (
    <section className="admin-grid">
      <div className="admin-card wide">
        <div className="card-header">
          <div>
            <p className="eyebrow">Promo codes</p>
            <h4>Discount rules</h4>
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap mb-3 align-items-center">
          <input
            type="search"
            className="form-control"
            style={{ maxWidth: 220 }}
            placeholder="Code contains"
            value={promoFilters.q}
            onChange={(e) => setPromoFilters((p) => ({ ...p, q: e.target.value }))}
          />
          <select
            className="form-select"
            style={{ maxWidth: 160 }}
            value={promoFilters.active}
            onChange={(e) => setPromoFilters((p) => ({ ...p, active: e.target.value }))}
          >
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
            <button className="btn btn-outline-saas" onClick={loadPromos} disabled={promoLoading}>
              {promoLoading ? "Loading..." : "Refresh"}
            </button>
            <button type="button" className="btn btn-primary-saas" onClick={startCreatePromo}>
              New promo
            </button>
          </div>

        <div className="admin-grid">
          <div className="admin-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Existing promo codes</p>
                <h4>Search & Manage</h4>
              </div>
            </div>
            {promoLoading ? (
              <p className="muted mb-0">Loading promo codes...</p>
            ) : promoItems.length === 0 ? (
              <p className="muted mb-0">No promo codes yet.</p>
            ) : (
              <div className="table-responsive management-scroll">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Discount</th>
                      <th>Status</th>
                      <th>Window</th>
                      <th>Usage</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promoItems.map((promo) => (
                      <tr key={promo.id}>
                        <td className="fw-semibold">{promo.code}</td>
                        <td>
                          {(() => {
                            const discountType = promo.discount_type || promo.discountType;
                            const discountValue = Number(promo.discount_value ?? promo.discountValue ?? 0);
                            return discountType === "percent"
                              ? `${discountValue}% off`
                              : `$${discountValue.toFixed(2)} off`;
                          })()}
                        </td>
                        <td>
                          <span className={`badge rounded-pill ${promo.active ? "bg-success" : "bg-secondary"}`}>
                            {promo.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="small text-muted">
                          {describeWindow(promo.starts_at || promo.startsAt, promo.expires_at || promo.expiresAt)}
                        </td>
                        <td className="small">
                          {(promo.times_redeemed ?? promo.timesRedeemed ?? 0).toLocaleString()}
                          {promo.max_uses || promo.maxUses ? ` / ${(promo.max_uses ?? promo.maxUses).toLocaleString()}` : ""}
                        </td>
                        <td className="text-end">
                          <div className="d-flex gap-2 justify-content-end">
                            <button type="button" className="btn btn-outline-saas btn-sm" onClick={() => startEditPromo(promo)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm"
                              onClick={async () => {
                                const confirm = window.confirm(`Delete promo ${promo.code}?`);
                                if (!confirm) return;
                                try {
                                  await deletePromoCode(promo.id);
                                  toast.success("Promo removed");
                                  await loadPromos();
                                } catch (err) {
                                  toast.error(err.message || "Failed to delete promo");
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  const renderPromotions = () => (
    <section className="admin-grid">
      <div className="admin-card wide">
        <div className="card-header">
          <div>
            <p className="eyebrow">Promotions</p>
            <h4>Auto-applied discounts</h4>
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap mb-3 align-items-center">
          <input
            type="search"
            className="form-control"
            style={{ maxWidth: 220 }}
            placeholder="Name or category"
            value={promotionFilters.q}
            onChange={(e) => setPromotionFilters((p) => ({ ...p, q: e.target.value }))}
          />
          <select
            className="form-select"
            style={{ maxWidth: 170 }}
            value={promotionFilters.active}
            onChange={(e) => setPromotionFilters((p) => ({ ...p, active: e.target.value }))}
          >
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            className="form-select"
            style={{ maxWidth: 170 }}
            value={promotionFilters.scope}
            onChange={(e) => setPromotionFilters((p) => ({ ...p, scope: e.target.value }))}
          >
            <option value="all">Any scope</option>
            <option value="product">Product</option>
            <option value="category">Category</option>
          </select>
          <button className="btn btn-outline-saas" onClick={loadPromotions} disabled={promotionLoading}>
            {promotionLoading ? "Loading..." : "Refresh"}
          </button>
          <button type="button" className="btn btn-primary-saas" onClick={startCreatePromotion}>
            New promotion
          </button>
        </div>

        <div className="admin-grid">
          <div className="admin-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Existing promotions</p>
                <h4>Search & Manage</h4>
              </div>
            </div>
            {promotionLoading ? (
              <p className="muted mb-0">Loading promotions...</p>
            ) : promotionItems.length === 0 ? (
              <p className="muted mb-0">No promotions yet.</p>
            ) : (
              <div className="table-responsive management-scroll">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Target</th>
                      <th>Discount</th>
                      <th>Status</th>
                      <th>Window</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promotionItems.map((promotion) => {
                      const scopeType = promotion.scope_type || promotion.scopeType;
                      const discountType = promotion.discount_type || promotion.discountType;
                      const discountValue = Number(promotion.discount_value ?? promotion.discountValue ?? 0);
                      const productTitle = promotionProductMap.get(promotion.product_id || promotion.productId);
                      const targetLabel =
                        scopeType === "product"
                          ? productTitle || "Product"
                          : promotion.category || "Category";
                      return (
                        <tr key={promotion.id}>
                          <td className="fw-semibold">{promotion.name || "Untitled"}</td>
                          <td className="small">
                            {scopeType === "product" ? "Product" : "Category"}: {targetLabel}
                          </td>
                          <td>
                            {discountType === "percent"
                              ? `${discountValue}% off`
                              : `$${discountValue.toFixed(2)} off`}
                          </td>
                          <td>
                            <span className={`badge rounded-pill ${promotion.active ? "bg-success" : "bg-secondary"}`}>
                              {promotion.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="small text-muted">
                            {describeWindow(promotion.starts_at || promotion.startsAt, promotion.expires_at || promotion.expiresAt)}
                          </td>
                          <td className="text-end">
                            <div className="d-flex gap-2 justify-content-end">
                              <button type="button" className="btn btn-outline-saas btn-sm" onClick={() => startEditPromotion(promotion)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm"
                                onClick={async () => {
                                  const confirm = window.confirm(`Delete promotion ${promotion.name || "untitled"}?`);
                                  if (!confirm) return;
                                  try {
                                    await deletePromotion(promotion.id);
                                    toast.success("Promotion removed");
                                    await loadPromotions();
                                  } catch (err) {
                                    toast.error(err.message || "Failed to delete promotion");
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  const promoCreateModal = showCreatePromoForm && (
    <div
      className="admin-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Create new promo"
      onClick={() => setShowCreatePromoForm(false)}
    >
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Create promo</p>
            <h4>New promo code</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={() => setShowCreatePromoForm(false)}>
            Close
          </button>
        </div>
        <form className="profile-form" onSubmit={handlePromoSubmit}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label" htmlFor="promo-code">Code</label>
              <input
                id="promo-code"
                type="text"
                className="form-control"
                value={promoForm.code}
                onChange={(e) =>
                  setPromoForm((p) => ({ ...p, code: sanitizePromoCode(e.target.value) }))
                }
                placeholder="SAVE10"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promo-type">Discount type</label>
              <select
                id="promo-type"
                className="form-select"
                value={promoForm.discountType}
                onChange={(e) => setPromoForm((p) => ({ ...p, discountType: e.target.value }))}
              >
                <option value="percent">Percent off</option>
                <option value="amount">Amount off</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promo-value">Value</label>
              <input
                id="promo-value"
                type="number"
                min="0"
                step="0.01"
                className="form-control"
                value={promoForm.discountValue}
                onChange={(e) => setPromoForm((p) => ({ ...p, discountValue: e.target.value }))}
                placeholder={promoForm.discountType === "percent" ? "10 = 10%" : "5 = $5"}
              />
            </div>
            <div className="col-md-12">
              <label className="form-label" htmlFor="promo-description">Description</label>
              <textarea
                id="promo-description"
                className="form-control"
                rows="2"
                value={promoForm.description}
                onChange={(e) => setPromoForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Short description for admins/customers"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promo-max-uses">Max uses (optional)</label>
              <input
                id="promo-max-uses"
                type="number"
                min="0"
                className="form-control"
                value={promoForm.maxUses}
                onChange={(e) => setPromoForm((p) => ({ ...p, maxUses: e.target.value }))}
                placeholder="Blank = unlimited"
              />
            </div>
            <div className="col-md-12">
              <label className="form-label" htmlFor="promo-starts">Starts at</label>
              <input
                id="promo-starts"
                type="datetime-local"
                className="form-control"
                min={nowInputMin}
                value={promoForm.startsAt}
                onChange={(e) => setPromoForm((p) => ({ ...p, startsAt: e.target.value }))}
              />
            </div>
            <div className="col-md-12">
              <label className="form-label" htmlFor="promo-expires">Expires at</label>
              <input
                id="promo-expires"
                type="datetime-local"
                className="form-control"
                min={promoForm.startsAt || nowInputMin}
                value={promoForm.expiresAt}
                onChange={(e) => setPromoForm((p) => ({ ...p, expiresAt: e.target.value }))}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label d-block">Status</label>
              <div className="form-check form-switch">
                <input
                  id="promo-active"
                  className="form-check-input"
                  type="checkbox"
                  checked={!!promoForm.active}
                  onChange={(e) => setPromoForm((p) => ({ ...p, active: e.target.checked }))}
                />
                <label className="form-check-label" htmlFor="promo-active">
                  {promoForm.active ? "Active" : "Inactive"}
                </label>
              </div>
            </div>
          </div>
          <div className="d-flex gap-3 mt-3">
            <button type="submit" className="btn btn-primary-saas">
              Create promo
            </button>
            <button type="button" className="btn btn-outline-saas" onClick={resetPromoForm}>
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const promoEditModal = editPromoForm && (
    <div
      className="admin-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Edit promo"
      onClick={() => setEditPromoForm(null)}
    >
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Edit promo</p>
            <h4>{editPromoForm.code}</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={() => setEditPromoForm(null)}>
            Close
          </button>
        </div>
        <form className="profile-form" onSubmit={handlePromoUpdate}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label" htmlFor="promo-code-edit">Code</label>
              <input
                id="promo-code-edit"
                type="text"
                className="form-control"
                value={editPromoForm.code}
                onChange={(e) =>
                  setEditPromoForm((p) => ({ ...p, code: sanitizePromoCode(e.target.value) }))
                }
                placeholder="SAVE10"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promo-type-edit">Discount type</label>
              <select
                id="promo-type-edit"
                className="form-select"
                value={editPromoForm.discountType}
                onChange={(e) => setEditPromoForm((p) => ({ ...p, discountType: e.target.value }))}
              >
                <option value="percent">Percent off</option>
                <option value="amount">Amount off</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promo-value-edit">Value</label>
              <input
                id="promo-value-edit"
                type="number"
                min="0"
                step="0.01"
                className="form-control"
                value={editPromoForm.discountValue}
                onChange={(e) => setEditPromoForm((p) => ({ ...p, discountValue: e.target.value }))}
                placeholder={editPromoForm.discountType === "percent" ? "10 = 10%" : "5 = $5"}
              />
            </div>
            <div className="col-md-12">
              <label className="form-label" htmlFor="promo-description-edit">Description</label>
              <textarea
                id="promo-description-edit"
                className="form-control"
                rows="2"
                value={editPromoForm.description}
                onChange={(e) => setEditPromoForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Short description for admins/customers"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promo-max-uses-edit">Max uses (optional)</label>
              <input
                id="promo-max-uses-edit"
                type="number"
                min="0"
                className="form-control"
                value={editPromoForm.maxUses}
                onChange={(e) => setEditPromoForm((p) => ({ ...p, maxUses: e.target.value }))}
                placeholder="Blank = unlimited"
              />
            </div>
            <div className="col-md-12">
              <label className="form-label" htmlFor="promo-starts-edit">Starts at</label>
              <input
                id="promo-starts-edit"
                type="datetime-local"
                className="form-control"
                min={nowInputMin}
                value={editPromoForm.startsAt}
                onChange={(e) => setEditPromoForm((p) => ({ ...p, startsAt: e.target.value }))}
              />
            </div>
            <div className="col-md-12">
              <label className="form-label" htmlFor="promo-expires-edit">Expires at</label>
              <input
                id="promo-expires-edit"
                type="datetime-local"
                className="form-control"
                min={editPromoForm.startsAt || nowInputMin}
                value={editPromoForm.expiresAt}
                onChange={(e) => setEditPromoForm((p) => ({ ...p, expiresAt: e.target.value }))}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label d-block">Status</label>
              <div className="form-check form-switch">
                <input
                  id="promo-active-edit"
                  className="form-check-input"
                  type="checkbox"
                  checked={!!editPromoForm.active}
                  onChange={(e) => setEditPromoForm((p) => ({ ...p, active: e.target.checked }))}
                />
                <label className="form-check-label" htmlFor="promo-active-edit">
                  {editPromoForm.active ? "Active" : "Inactive"}
                </label>
              </div>
            </div>
          </div>
          <div className="d-flex gap-3 mt-3">
            <button type="submit" className="btn btn-primary-saas">
              Save changes
            </button>
            <button type="button" className="btn btn-outline-saas" onClick={() => setEditPromoForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const promotionCreateModal = showCreatePromotionForm && (
    <div
      className="admin-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Create new promotion"
      onClick={() => setShowCreatePromotionForm(false)}
    >
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Create promotion</p>
            <h4>New auto-applied discount</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={() => setShowCreatePromotionForm(false)}>
            Close
          </button>
        </div>
        <form className="profile-form" onSubmit={handlePromotionSubmit}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label" htmlFor="promotion-name">Name</label>
              <input
                id="promotion-name"
                type="text"
                className="form-control"
                value={promotionForm.name}
                onChange={(e) => setPromotionForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Winter Flash Sale"
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promotion-scope">Scope</label>
              <select
                id="promotion-scope"
                className="form-select"
                value={promotionForm.scopeType}
                onChange={(e) =>
                  setPromotionForm((p) => ({
                    ...p,
                    scopeType: e.target.value,
                    productId: "",
                    category: "",
                  }))
                }
              >
                <option value="product">Single product</option>
                <option value="category">Category</option>
              </select>
            </div>
            <div className="col-md-4">
              {promotionForm.scopeType === "product" ? (
                <>
                  <label className="form-label" htmlFor="promotion-product">Product</label>
                  <select
                    id="promotion-product"
                    className="form-select"
                    value={promotionForm.productId}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, productId: e.target.value }))}
                  >
                    <option value="">{productsLoading ? "Loading products..." : "Select product"}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.title}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="form-label" htmlFor="promotion-category">Category</label>
                  <input
                    id="promotion-category"
                    list="promotion-category-list"
                    className="form-control"
                    value={promotionForm.category}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, category: e.target.value }))}
                    placeholder="keyboard"
                  />
                  <datalist id="promotion-category-list">
                    {promotionCategories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </>
              )}
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promotion-type">Discount type</label>
              <select
                id="promotion-type"
                className="form-select"
                value={promotionForm.discountType}
                onChange={(e) => setPromotionForm((p) => ({ ...p, discountType: e.target.value }))}
              >
                <option value="percent">Percent off</option>
                <option value="amount">Amount off</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promotion-value">Value</label>
              <input
                id="promotion-value"
                type="number"
                step="0.01"
                className="form-control"
                value={promotionForm.discountValue}
                onChange={(e) => setPromotionForm((p) => ({ ...p, discountValue: e.target.value }))}
                placeholder={promotionForm.discountType === "percent" ? "10 = 10%" : "5 = $5"}
              />
            </div>
            <div className="col-md-12">
              <label className="form-label" htmlFor="promotion-starts">Starts at</label>
              <input
                id="promotion-starts"
                type="datetime-local"
                className="form-control"
                min={nowInputMin}
                value={promotionForm.startsAt}
                onChange={(e) => setPromotionForm((p) => ({ ...p, startsAt: e.target.value }))}
              />
            </div>
            <div className="col-md-12">
              <label className="form-label" htmlFor="promotion-expires">Expires at</label>
              <input
                id="promotion-expires"
                type="datetime-local"
                className="form-control"
                min={promotionForm.startsAt || nowInputMin}
                value={promotionForm.expiresAt}
                onChange={(e) => setPromotionForm((p) => ({ ...p, expiresAt: e.target.value }))}
              />
            </div>
            <div className="col-md-4 d-flex align-items-end">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="promotion-active"
                  checked={!!promotionForm.active}
                  onChange={(e) => setPromotionForm((p) => ({ ...p, active: e.target.checked }))}
                />
                <label className="form-check-label" htmlFor="promotion-active">
                  {promotionForm.active ? "Active" : "Inactive"}
                </label>
              </div>
            </div>
          </div>
          <div className="d-flex gap-3 mt-3">
            <button type="submit" className="btn btn-primary-saas">
              Create promotion
            </button>
            <button type="button" className="btn btn-outline-saas" onClick={resetPromotionForm}>
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const promotionEditModal = editPromotionForm && (
    <div
      className="admin-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Edit promotion"
      onClick={() => setEditPromotionForm(null)}
    >
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Edit promotion</p>
            <h4>Update auto-applied discount</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={() => setEditPromotionForm(null)}>
            Close
          </button>
        </div>
        <form className="profile-form" onSubmit={handlePromotionUpdate}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label" htmlFor="promotion-name-edit">Name</label>
              <input
                id="promotion-name-edit"
                type="text"
                className="form-control"
                value={editPromotionForm.name}
                onChange={(e) => setEditPromotionForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promotion-scope-edit">Scope</label>
              <select
                id="promotion-scope-edit"
                className="form-select"
                value={editPromotionForm.scopeType}
                onChange={(e) =>
                  setEditPromotionForm((p) => ({
                    ...p,
                    scopeType: e.target.value,
                    productId: "",
                    category: "",
                  }))
                }
              >
                <option value="product">Single product</option>
                <option value="category">Category</option>
              </select>
            </div>
            <div className="col-md-4">
              {editPromotionForm.scopeType === "product" ? (
                <>
                  <label className="form-label" htmlFor="promotion-product-edit">Product</label>
                  <select
                    id="promotion-product-edit"
                    className="form-select"
                    value={editPromotionForm.productId}
                    onChange={(e) => setEditPromotionForm((p) => ({ ...p, productId: e.target.value }))}
                  >
                    <option value="">{productsLoading ? "Loading products..." : "Select product"}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.title}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="form-label" htmlFor="promotion-category-edit">Category</label>
                  <input
                    id="promotion-category-edit"
                    list="promotion-category-list-edit"
                    className="form-control"
                    value={editPromotionForm.category}
                    onChange={(e) => setEditPromotionForm((p) => ({ ...p, category: e.target.value }))}
                  />
                  <datalist id="promotion-category-list-edit">
                    {promotionCategories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </>
              )}
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promotion-type-edit">Discount type</label>
              <select
                id="promotion-type-edit"
                className="form-select"
                value={editPromotionForm.discountType}
                onChange={(e) => setEditPromotionForm((p) => ({ ...p, discountType: e.target.value }))}
              >
                <option value="percent">Percent off</option>
                <option value="amount">Amount off</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label" htmlFor="promotion-value-edit">Value</label>
              <input
                id="promotion-value-edit"
                type="number"
                step="0.01"
                className="form-control"
                value={editPromotionForm.discountValue}
                onChange={(e) => setEditPromotionForm((p) => ({ ...p, discountValue: e.target.value }))}
              />
            </div>
            <div className="col-md-12">
              <label className="form-label" htmlFor="promotion-starts-edit">Starts at</label>
              <input
                id="promotion-starts-edit"
                type="datetime-local"
                className="form-control"
                min={nowInputMin}
                value={editPromotionForm.startsAt}
                onChange={(e) => setEditPromotionForm((p) => ({ ...p, startsAt: e.target.value }))}
              />
            </div>
            <div className="col-md-12">
              <label className="form-label" htmlFor="promotion-expires-edit">Expires at</label>
              <input
                id="promotion-expires-edit"
                type="datetime-local"
                className="form-control"
                min={editPromotionForm.startsAt || nowInputMin}
                value={editPromotionForm.expiresAt}
                onChange={(e) => setEditPromotionForm((p) => ({ ...p, expiresAt: e.target.value }))}
              />
            </div>
            <div className="col-md-4 d-flex align-items-end">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="promotion-active-edit"
                  checked={!!editPromotionForm.active}
                  onChange={(e) => setEditPromotionForm((p) => ({ ...p, active: e.target.checked }))}
                />
                <label className="form-check-label" htmlFor="promotion-active-edit">
                  {editPromotionForm.active ? "Active" : "Inactive"}
                </label>
              </div>
            </div>
          </div>
          <button type="submit" className="btn btn-primary-saas mt-3">
            Save changes
          </button>
        </form>
      </div>
    </div>
  );

const renderStocks = () => {
  if (stocksLoading) return <div className="p-4 text-center">Loading inventory...</div>;

  // 1. Single Omnisearch Logic
  // This looks for your search term in BOTH the title and the category fields
  const filteredStocks = stocks.filter((s) => {
    const searchTerm = stockSearch.toLowerCase().trim();
    if (!searchTerm) return true;

    const matchesTitle = (s.title || "").toLowerCase().includes(searchTerm);
    const matchesCategory = (s.category || "").toLowerCase().includes(searchTerm);
    
    return matchesTitle || matchesCategory;
  });

  return (
    <div className="stock-container" style={{ padding: '20px' }}>
      
      {/* STANDALONE SEARCH FIELD */}
      <div style={{ 
        marginBottom: '30px', 
        backgroundColor: '#fff', 
        padding: '20px', 
        borderRadius: '12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: '15px'
      }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#888', marginBottom: '8px', textTransform: 'uppercase' }}>
            Inventory Search
          </label>
          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              placeholder="Search by title or category (e.g., 'keyboard', 'ssd', 'monitor')..." 
              className="admin-input"
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '12px 15px', 
                borderRadius: '8px', 
                border: '1px solid #ddd',
                fontSize: '14px'
              }}
            />
            {stockSearch && (
              <button 
                onClick={() => setStockSearch("")}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'none',
                  color: '#999',
                  cursor: 'pointer',
                  fontSize: '18px'
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <div style={{ paddingTop: '20px' }}>
          <span style={{ fontSize: '13px', color: '#666', fontWeight: '500', backgroundColor: '#f0f2f5', padding: '8px 12px', borderRadius: '6px' }}>
            {filteredStocks.length} Results
          </span>
        </div>
      </div>

      {/* TABLE HEADERS */}
      <div style={{ 
        display: 'flex', 
        padding: '0 25px 15px 25px', 
        color: '#999', 
        fontSize: '11px', 
        fontWeight: 'bold', 
        textTransform: 'uppercase', 
        letterSpacing: '1px' 
      }}>
        <div style={{ flex: 2 }}>Product Information</div>
        <div style={{ flex: 1, textAlign: 'center' }}>In Stock</div>
        <div style={{ flex: 1, textAlign: 'center' }}>Status</div>
        <div style={{ flex: 2, textAlign: 'right' }}>Actions</div>
      </div>

      {/* STOCK LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredStocks.map((s) => {
          const qty = Number(s.quantity_available ?? 0);
          const threshold = Number(s.low_stock_threshold ?? 15);

          let statusText = "In Stock";
          let statusColor = "#2c7a7b"; let statusBg = "#e6fffa";
          if (qty <= 0) {
            statusText = "Out of Stock";
            statusColor = "#e53e3e"; statusBg = "#fff5f5";
          } else if (qty <= threshold) {
            statusText = "Low Stock";
            statusColor = "#dd6b20"; statusBg = "#fffaf0";
          }

          return (
            <div key={s.id} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              padding: '18px 25px', 
              backgroundColor: '#fff', 
              borderRadius: '10px', 
              border: '1px solid #edf2f7',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              
              <div style={{ flex: 2 }}>
                <div style={{ fontWeight: '600', color: '#2d3748', fontSize: '15px' }}>{s.title}</div>
                <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '4px' }}>
                  <span style={{ 
                    backgroundColor: '#ebf8ff', 
                    color: '#2b6cb0', 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    marginRight: '8px',
                    fontWeight: 'bold',
                    fontSize: '10px'
                  }}>
                    {s.category ? s.category.toUpperCase() : "GENERAL"}
                  </span>
                  ID: {s.id.toString().substring(0, 8)}
                </div>
              </div>

              <div style={{ flex: 1, textAlign: 'center' }}>
                <span style={{ fontSize: '18px', fontWeight: '700', color: qty <= threshold ? '#e53e3e' : '#2d3748' }}>
                  {qty}
                </span>
              </div>

              <div style={{ flex: 1, textAlign: 'center' }}>
                <span style={{ 
                  backgroundColor: statusBg, 
                  color: statusColor, 
                  padding: '6px 14px', 
                  borderRadius: '25px', 
                  fontSize: '11px', 
                  fontWeight: '800', 
                  border: `1px solid ${statusColor}22`,
                  display: 'inline-block'
                }}>
                  {statusText.toUpperCase()}
                </span>
              </div>

              <div style={{ flex: 2, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                {adjustingId === s.id ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="number" 
                      className="admin-input-small" 
                      style={{ width: '80px', textAlign: 'center' }}
                      value={adjustmentForm.quantity}
                      onChange={(e) => setAdjustmentForm({ ...adjustmentForm, quantity: parseInt(e.target.value) || 0 })}
                      autoFocus
                    />
                    <button className="btn-save" onClick={() => handleStockSubmit(s.id)}>Save</button>
                    <button className="btn-cancel" onClick={() => setAdjustingId(null)}>✕</button>
                  </div>
                ) : adjustingThresholdId === s.id ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="number" 
                      className="admin-input-small" 
                      style={{ width: '80px', textAlign: 'center', borderColor: '#3182ce' }}
                      value={thresholdValue}
                      onChange={(e) => setThresholdValue(parseInt(e.target.value) || 0)}
                      autoFocus
                    />
                    <button className="btn-save" style={{ backgroundColor: '#3182ce' }} onClick={() => handleSaveThreshold(s.id)}>Save</button>
                    <button className="btn-cancel" onClick={() => setAdjustingThresholdId(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    <button className="admin-btn-secondary" onClick={() => {
                      setAdjustingId(s.id);
                      setAdjustmentForm({ quantity: 0, reason: "Manual Adjustment" });
                    }}>
                      Update Stock
                    </button>
                    <button className="admin-btn-outline" onClick={() => {
                      setAdjustingThresholdId(s.id);
                      setThresholdValue(threshold);
                    }}>
                      Set Threshold ({threshold})
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {filteredStocks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#a0aec0' }}>
            <p>No results found for "<strong>{stockSearch}</strong>".</p>
          </div>
        )}
      </div>
    </div>
  );
};

  const renderUsers = () => (
    <section className="admin-grid users-grid">
      <div className="admin-card wide">
        <div className="card-header">
          <div>
            <p className="eyebrow">User management</p>
            <h4>User Accounts</h4>
          </div>
        </div>
        <div className="d-flex gap-3 flex-wrap mb-3 align-items-center">
          <input
            type="search"
            className="form-control"
            style={{ maxWidth: 220 }}
            placeholder="Email contains"
            value={userFilters.email}
            onChange={(e) => setUserFilters((p) => ({ ...p, email: e.target.value }))}
          />
          <select
            className="form-select"
            style={{ maxWidth: 160 }}
            value={userFilters.role}
            onChange={(e) => setUserFilters((p) => ({ ...p, role: e.target.value }))}
          >
            <option value="">All Roles</option>
            <option value="customer">Customer</option>
            <option value="support">Support</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn btn-outline-saas" onClick={loadUsers} disabled={usersLoading}>
            {usersLoading ? "Loading..." : "Refresh"}
          </button>
          <button
            className="btn btn-primary-saas"
            type="button"
            onClick={startCreateUser}
            disabled={usersLoading}
          >
            New user
          </button>
        </div>

        <div className="admin-grid">
          <div className="admin-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Existing users</p>
                <h4>Search & Manage</h4>
              </div>
            </div>
            <div className="table-responsive management-scroll">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Phone</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usersLoading ? (
                <tr>
                  <td colSpan="6" className="text-muted">Loading users...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-muted">No users found.</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.full_name || "—"}</td>
                    <td className="text-capitalize">{u.role}</td>
                    <td>
                      <span className={`badge rounded-pill ${u.status === "active" ? "bg-success" : "bg-secondary"}`}>
                        {u.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{u.phone || "—"}</td>
                    <td className="text-end">
                      <div className="d-flex gap-2 justify-content-end">
                        <button className="btn btn-outline-saas btn-sm" onClick={() => startEditUser(u)}>
                          Edit
                        </button>
                        {u.status === "disabled" ? (
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => handleEnableUser(u.id, u.email)}
                            title="Enable user"
                          >
                            Enable
                          </button>
                        ) : (
                          <button
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => handleDisableUser(u.id, u.email)}
                            title="Revoke sessions / disable"
                          >
                            Disable
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
            </div>
          </div>
        </div>
      </div>

      {showCreateForm && (
        <div
          className="admin-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Create new user"
          onClick={() => !userSaving && setShowCreateForm(false)}
        >
          <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <div>
                <p className="eyebrow">Create user</p>
                <h4>New account</h4>
              </div>
              <button
                type="button"
                className="btn btn-outline-saas btn-sm"
                onClick={() => setShowCreateForm(false)}
                disabled={userSaving}
              >
                Close
              </button>
            </div>
            <form className="profile-form" onSubmit={handleUserSave}>
              <div className="mb-3">
                <label className="form-label" htmlFor="um-email">Email</label>
                <input
                  id="um-email"
                  name="email"
                  type="email"
                  className="form-control"
                  value={userForm.email}
                  onChange={handleUserChange}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="um-role">Role</label>
                <select
                  id="um-role"
                  name="role"
                  className="form-select"
                  value={userForm.role}
                  onChange={handleUserChange}
                  required
                >
                  <option value="customer">Customer</option>
                  <option value="support">Support</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="um-full-name">Full name</label>
                <input
                  id="um-full-name"
                  name="full_name"
                  type="text"
                  className="form-control"
                  value={userForm.full_name}
                  onChange={handleUserChange}
                  placeholder="Name"
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="um-phone">Phone</label>
                <input
                  id="um-phone"
                  name="phone"
                  type="tel"
                  className="form-control"
                  value={userForm.phone}
                  onChange={handleUserChange}
                  placeholder="+65 1234 5678"
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="um-password">Password</label>
                <input
                  id="um-password"
                  name="password"
                  type="password"
                  className="form-control"
                  value={userForm.password}
                  onChange={handleUserChange}
                  placeholder="Set an initial password"
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label d-block">Status</label>
                <div className="form-check form-switch">
                  <input
                    id="um-status"
                    className="form-check-input"
                    type="checkbox"
                    checked={userForm.status === "active"}
                    onChange={(e) =>
                      setUserForm((p) => ({ ...p, status: e.target.checked ? "active" : "disabled" }))
                    }
                  />
                  <label className="form-check-label" htmlFor="um-status">
                    {userForm.status === "active" ? "Active" : "Inactive"}
                  </label>
                </div>
              </div>
              <div className="d-flex gap-3 mt-3">
                <button type="submit" className="btn btn-primary-saas" disabled={userSaving}>
                  {userSaving ? "Saving..." : "Save user"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-saas"
                  onClick={startCreateUser}
                  disabled={userSaving}
                >
                  Clear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editUserForm && (
        <div
          className="admin-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Edit user"
          onClick={() => !editUserSaving && setEditUserForm(null)}
        >
          <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <div>
                <p className="eyebrow">Edit user</p>
                <h4>{editUserForm.email}</h4>
              </div>
              <button
                type="button"
                className="btn btn-outline-saas btn-sm"
                onClick={() => setEditUserForm(null)}
                disabled={editUserSaving}
              >
                Close
              </button>
            </div>
            <form className="profile-form" onSubmit={handleEditUserSave}>
              <div className="mb-3">
                <label className="form-label" htmlFor="um-edit-email">Email</label>
                <input
                  id="um-edit-email"
                  type="email"
                  className="form-control"
                  value={editUserForm.email}
                  disabled
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="um-edit-role">Role</label>
                <select
                  id="um-edit-role"
                  name="role"
                  className="form-select"
                  value={editUserForm.role}
                  onChange={(e) => setEditUserForm((p) => ({ ...p, role: e.target.value }))}
                  required
                >
                  <option value="customer">Customer</option>
                  <option value="support">Support</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="um-edit-full-name">Full name</label>
                <input
                  id="um-edit-full-name"
                  name="full_name"
                  type="text"
                  className="form-control"
                  value={editUserForm.full_name}
                  onChange={(e) => setEditUserForm((p) => ({ ...p, full_name: e.target.value }))}
                  placeholder="Name"
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="um-edit-phone">Phone</label>
                <input
                  id="um-edit-phone"
                  name="phone"
                  type="tel"
                  className="form-control"
                  value={editUserForm.phone || ""}
                  onChange={(e) => setEditUserForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+65 1234 5678"
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="um-edit-password">Reset password</label>
                <input
                  id="um-edit-password"
                  name="password"
                  type="password"
                  className="form-control"
                  value={editUserForm.password || ""}
                  onChange={(e) => setEditUserForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="mb-3">
                <label className="form-label d-block">Status</label>
                <div className="form-check form-switch">
                  <input
                    id="um-edit-status"
                    className="form-check-input"
                    type="checkbox"
                    checked={editUserForm.status === "active"}
                    onChange={(e) =>
                      setEditUserForm((p) => ({ ...p, status: e.target.checked ? "active" : "disabled" }))
                    }
                  />
                  <label className="form-check-label" htmlFor="um-edit-status">
                    {editUserForm.status === "active" ? "Active" : "Inactive"}
                  </label>
                </div>
              </div>
              <div className="d-flex gap-3 mt-3">
                <button type="submit" className="btn btn-primary-saas" disabled={editUserSaving}>
                  {editUserSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );

const renderProducts = () => (
  <section className="admin-grid products-grid">
    <div className="admin-card wide">
      <div className="card-header">
        <div>
          <p className="eyebrow">Inventory</p>
          <h4>Catalog Management</h4>
        </div>
      </div>

      {/* --- FILTER & ACTION BAR --- */}
      <div className="d-flex gap-3 flex-wrap mb-4 align-items-center">
        <div className="d-flex gap-2">
          <input
            type="search"
            className="form-control"
            style={{ maxWidth: 220 }}
            placeholder="Search by title..."
            value={productFilters.title}
            onChange={(e) => setProductFilters({ title: e.target.value, category: "" })}
          />
          <input
            type="search"
            className="form-control"
            style={{ maxWidth: 180 }}
            placeholder="Category..."
            value={productFilters.category}
            onChange={(e) => setProductFilters({ title: "", category: e.target.value })}
          />
        </div>
        
        <div className="d-flex gap-2">
          <button 
            className="btn btn-outline-saas" 
            onClick={loadProducts} 
            disabled={productsLoading}
          >
            {productsLoading ? "Loading..." : "Refresh"}
          </button>

          <button 
            className="btn btn-primary-saas" 
            onClick={() => {
              setShowCreateProductForm(!showCreateProductForm);
              setEditProductForm(null); 
            }}
          >
            {showCreateProductForm ? "Cancel" : "New Product"}
          </button>
        </div>
      </div>

      {/* --- CREATE PRODUCT FORM --- */}
      {showCreateProductForm && (
        <div className="admin-card mb-4 bg-light border shadow-sm">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5>Create New Product</h5>
            <button className="btn-close" onClick={() => setShowCreateProductForm(false)}></button>
          </div>

          <form onSubmit={handleCreateProduct}>
            <div className="row g-3">
              {/* --- ROW 1: BASIC INFO --- */}
              <div className="col-md-3">
                <label className="small fw-bold">Product Title</label>
                <input type="text" className="form-control" value={newProduct.title} onChange={e => setNewProduct({...newProduct, title: e.target.value})} required />
              </div>
              
              <div className="col-md-3">
                <label className="small fw-bold">Brand</label>
                <input type="text" className="form-control" value={newProduct.Brand} onChange={e => setNewProduct({...newProduct, Brand: e.target.value})} required />
              </div>

              <div className="col-md-3">
                <label className="small fw-bold">Category</label>
                <select 
                  className="form-select" 
                  value={newProduct.category} 
                  onChange={e => handleCategoryChange(e.target.value)} 
                  required
                >
                  <option value="">Select...</option>
                  <option value="keyboard">Keyboard</option>
                  <option value="mouse">Mouse</option>
                  <option value="ssd">SSD</option>
                  <option value="monitor">Monitor</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {newProduct.category === "other" && (
                <div className="col-md-3">
                  <label className="small fw-bold text-primary">Custom Category Name</label>
                  <input 
                    type="text" 
                    className="form-control border-primary" 
                    placeholder="e.g. Headphones"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="col-md-3">
                <label className="small fw-bold">Price ($)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="form-control" 
                  placeholder="0.00"
                  value={newProduct.price} 
                  onChange={e => setNewProduct({...newProduct, price: e.target.value})} 
                  required 
                />
              </div>

              {/* --- NEW: IMAGE UPLOAD FIELD --- */}
              <div className="col-md-6">
                <label className="small fw-bold text-success">Product Image (Upload)</label>
                <input 
                  type="file" 
                  className="form-control" 
                  accept="image/*"
                  onChange={e => setNewProduct({...newProduct, imageFile: e.target.files[0]})}
                  required 
                />
              </div>

              {/* --- ROW 2: DESCRIPTION --- */}
              <div className="col-md-12">
                <label className="small fw-bold">Description</label>
                <textarea 
                  className="form-control" 
                  rows="2" 
                  placeholder="Enter product details..."
                  value={newProduct.description} 
                  onChange={e => setNewProduct({...newProduct, description: e.target.value})} 
                />
              </div>

              {/* --- ROW 3: DYNAMIC SPECS --- */}
              <div className="col-md-12 mt-4">
                <div className="d-flex justify-content-between align-items-center p-2 bg-dark text-white rounded-top">
                  <span className="small fw-bold">TECHNICAL SPECIFICATIONS</span>
                  <button type="button" className="btn btn-sm btn-light" onClick={addSpecField}>
                    + Add Field
                  </button>
                </div>
                
                <div className="p-3 border rounded-bottom bg-white">
                  {Object.entries(newProduct.specs).map(([key, value], index) => (
                    <div className="row g-2 mb-2 align-items-center" key={index}>
                      <div className="col-md-5">
                        <input 
                          type="text" 
                          className="form-control form-control-sm" 
                          placeholder="Spec Title"
                          value={key} 
                          onChange={(e) => handleSpecKeyChange(key, e.target.value)} 
                        />
                      </div>
                      <div className="col-md-6">
                        <input 
                          type="text" 
                          className="form-control form-control-sm" 
                          placeholder="Content"
                          value={value} 
                          onChange={(e) => handleSpecValueChange(key, e.target.value)} 
                        />
                      </div>
                      <div className="col-md-1 text-center">
                        <button 
                          type="button" 
                          className="btn btn-link btn-sm text-danger p-0"
                          onClick={() => removeSpecField(key)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-md-12 mt-4 text-end">
                <button type="submit" className="btn btn-primary-saas px-5 shadow-sm">
                  Save Product & Upload Image
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* --- PRODUCTS TABLE --- */}
      <div className="admin-grid">
        <div className="admin-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Existing products</p>
              <h4>Search & Manage</h4>
            </div>
          </div>
          <div className="table-responsive management-scroll">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Image</th>
              <th>ID</th>
              <th>Title</th>
              <th>Category</th>
              <th>Price</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {productsLoading ? (
               <tr><td colSpan="6" className="text-center py-4">Loading inventory...</td></tr>
            ) : products.length > 0 ? (
              products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <img 
                      src={p.image_url} 
                      alt="" 
                      style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #eee' }} 
                      onError={(e) => e.target.src = '/assets/placeholder.jpg'}
                    />
                  </td>
                  <td><code className="small">#{p.id.toString().slice(0,8)}</code></td>
                  <td><strong>{p.title}</strong></td>
                  <td><span className="badge bg-light text-dark border">{p.category}</span></td>
                  <td>{currencyFormatter.format(p.price)}</td>
                  <td className="text-end">
                    <div className="d-flex gap-2 justify-content-end">
                      <button 
                        className="btn btn-outline-saas btn-sm"
                        onClick={() => { startEditProduct(p); setShowCreateProductForm(false); }}
                      >
                        Edit
                      </button>
                      <button 
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => handleDeleteProduct(p.id, p.title)}
                        disabled={isDeleting === p.id}
                      >
                        {isDeleting === p.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="6" className="text-center py-4 text-muted">No products found.</td></tr>
            )}
          </tbody>
        </table>
          </div>
        </div>
      </div>
    </div>
    
    {editProductForm && renderEditProduct()}
  </section>
);

const renderEditProduct = () => (
  <div className="admin-card mt-4">
    <div className="card-header d-flex justify-content-between align-items-center">
      <div>
        <p className="eyebrow">Product Management</p>
        <h4>Edit Product: {editProductForm.title}</h4>
      </div>
      <button 
        type="button" 
        className="btn-close" 
        onClick={() => setEditProductForm(null)}
      ></button>
    </div>

    <form className="profile-form" onSubmit={handleEditProductSave}>
      <div className="mb-3">
        <label className="form-label">Product Title</label>
        <input
          type="text"
          className="form-control"
          value={editProductForm.title}
          onChange={(e) => setEditProductForm({ ...editProductForm, title: e.target.value })}
          required
          placeholder="e.g. Mechanical Keyboard G-Pro"
        />
      </div>

      <div className="row">
        <div className="col-md-6 mb-3">
          <label className="form-label">Category</label>
          <input
            type="text"
            className="form-control"
            value={editProductForm.category}
            onChange={(e) => setEditProductForm({ ...editProductForm, category: e.target.value })}
            required
          />
        </div>
        <div className="col-md-6 mb-3">
          <label className="form-label">Price (USD)</label>
          <input
            type="number"
            step="0.01"
            className="form-control"
            value={editProductForm.price}
            onChange={(e) => setEditProductForm({ ...editProductForm, price: e.target.value })}
            required
          />
        </div>
      </div>

      {/* --- IMAGE EDITING SECTION --- */}
      <div className="mb-4">
        <label className="form-label">Product Image</label>
        <div className="card p-3 bg-light border-dashed">
          <div className="d-flex align-items-center gap-4">
            <div className="text-center">
              <p className="small text-muted mb-1">Current Image</p>
              <img 
                // Adding a timestamp prevents the browser from showing a cached old image
                src={`${editProductForm.image_url}?t=${new Date().getTime()}`} 
                alt="Current" 
                className="rounded border"
                style={{ width: '100px', height: '100px', objectFit: 'cover', backgroundColor: '#fff' }}
                onError={(e) => { e.target.src = "/assets/placeholder.jpg"; }}
              />
            </div>
            
            <div className="flex-grow-1">
              <label className="form-label small fw-bold">Upload New Image to Replace</label>
              <input
                type="file"
                className="form-control"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setEditProductForm({ 
                      ...editProductForm, 
                      newImageFile: e.target.files[0] 
                    });
                  }
                }}
              />
              <div className="form-text">
                Accepted formats: PNG, JPG, WEBP. Leave empty to keep the current image.
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* ------------------------------ */}

      <div className="d-flex gap-3 pt-2 border-top">
        <button 
          type="submit" 
          className="btn btn-primary-saas px-4" 
          disabled={editProductSaving}
        >
          {editProductSaving ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              Saving...
            </>
          ) : "Save Changes"}
        </button>
        <button 
          type="button" 
          className="btn btn-outline-saas px-4" 
          onClick={() => setEditProductForm(null)}
          disabled={editProductSaving}
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
);

  // MAIN RETURN
  return (
    <div className="admin-dashboard-page">
      <div className="admin-shell">
        <div className="admin-layout">
          <aside className="admin-sidebar">
            <div className="sidebar-identity mb-4">
              <p className="eyebrow sidebar-label">Admin</p>
              <h3 className="sidebar-name">{displayName}</h3>
              <p className="muted-email">{displayEmail}</p>
            </div>

            <div className="sidebar-divider" />
            {GROUPED_ADMIN_SECTIONS.map(({ group, items }) => (
              <div className="sidebar-group" key={group}>
                <p className="muted tiny sidebar-label">{group}</p>
                <nav className="admin-nav">
                  {items.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className={`sidebar-link ${viewMode === section.id ? "active" : ""}`}
                      onClick={() => setViewMode(section.id)}
                      aria-pressed={viewMode === section.id}
                    >
                      {section.label}
                    </button>
                  ))}
                </nav>
              </div>
            ))}
            <button className="btn btn-outline-saas mt-4 w-100" onClick={handleLogout}>
              Log out
            </button>
          </aside>

          <main className="admin-main">
            <section className="admin-hero">
              <div>
                <p className="eyebrow">Tachyon Command Center</p>
                <h1>
                  Welcome{currentUser?.fullName ? `, ${currentUser.fullName}` : ""}{" "}
                  <span className="hero-chip">Last 30 days</span>
                </h1>
                <p className="muted">
                  Monitor CSAT, spot risky trends, and review verbatim feedback.
                </p>
                <div className="hero-actions">
                  {viewMode === "dashboard" && (
                    <button className="btn btn-outline-saas" onClick={load} disabled={loading}>
                      {loading ? "Refreshing..." : "Refresh data"}
                    </button>
                  )}
                  {viewMode !== "dashboard" && (
                    <button className="pill-btn ghost" type="button" onClick={() => setViewMode("dashboard")}>
                      Back to overview
                    </button>
                  )}
                </div>
              </div>
              <div className="hero-meta">
                <span className="muted tiny">Average trend</span>
                <div className="hero-score">{averageTrend || 0}%</div>
                <p className="muted tiny mb-0">CSAT across recorded days</p>
              </div>
            </section>

            {viewMode === "dashboard" && renderDashboard()}
            {viewMode === "profile" && renderProfile()}
            {viewMode === "users" && renderUsers()}
            {viewMode === "management" && renderManagement()}
            {viewMode === "promos" && renderPromos()}
            {viewMode === "promotions" && renderPromotions()}
            {viewMode === "products" && renderProducts()}
            {viewMode === "stocks" && renderStocks()}
          </main>
        </div>
      </div>
      {promoCreateModal}
      {promoEditModal}
      {promotionCreateModal}
      {promotionEditModal}
    </div>
  );
};

export default AdminDashboard;
