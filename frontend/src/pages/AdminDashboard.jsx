import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCsatSummary, fetchCsatResponses } from "../api/support";
import { fetchAdminProfile, logoutRequest, updateAdminProfile } from "../api/auth";
import { logout } from "../redux/authSlice";
import {
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  fetchAdminInsights,
  fetchAdminInsightsHistory,
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  getAnnouncement,
  updateAnnouncement,
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
import { listProducts, createProduct, updateProduct, deleteProduct } from "../api/productManagement";
import { listProductCategories, createProductCategory, deleteProductCategory } from "../api/categories";
import { toast } from "react-hot-toast";
import { formatPromotionBadge, hasActivePromotion } from "../utils/promo";
import { formatCategoryLabel } from "../utils/category";
import "../styles/admin-dashboard.css";

const ADMIN_SECTIONS = [
  { id: "dashboard", label: "Overview", group: "Command Center" },
  { id: "inventory", label: "Inventory", group: "Management" },
  { id: "users", label: "Users", group: "Management" },
  { id: "management", label: "Website Content", group: "Management" },
  { id: "businessinsights", label: "Business Insights", group: "Command Center" },
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
  const [insightMonth, setInsightMonth] = useState(() => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  });
  const [insightsHistory, setInsightsHistory] = useState([]);
  const [insightsHistoryLoading, setInsightsHistoryLoading] = useState(false);
  const [insightsHistoryFilters, setInsightsHistoryFilters] = useState(() => ({
    year: new Date().getUTCFullYear(),
    month: "",
  }));
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ full_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const { section } = useParams();
  const sectionIds = useMemo(() => new Set(ADMIN_SECTIONS.map((item) => item.id)), []);
  const defaultSection = "dashboard";
  const [viewMode, setViewMode] = useState(
    section && sectionIds.has(section) ? section : defaultSection
  ); // dashboard | inventory | profile | users | management | promos | promotions
  const [managementTab, setManagementTab] = useState("faqs"); // faqs | policies | announcement
  const [faqItems, setFaqItems] = useState([]);
  const [policyItems, setPolicyItems] = useState([]);
  const [promoItems, setPromoItems] = useState([]);
  const [faqForm, setFaqForm] = useState({ id: null, question: "", answer: "", sort_order: 1 });
  const [policyForm, setPolicyForm] = useState({ id: null, title: "", tag: "", content: "", sort_order: 1 });
  const [announcement, setAnnouncement] = useState({ id: null, message: "", link_url: "", link_label: "", enabled: true });
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
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
  const [editImagePreview, setEditImagePreview] = useState("");
  const [newProductImageKey, setNewProductImageKey] = useState(0);
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
  const [adjustingId, setAdjustingId] = useState(null);
  const [adjustmentForm, setAdjustmentForm] = useState({ quantity: 0, reason: "" });
  const [adjustingThresholdId, setAdjustingThresholdId] = useState(null);
  const [thresholdValue, setThresholdValue] = useState(15);
  const [isDeleting, setIsDeleting] = useState(null);
  const CATEGORY_TEMPLATES = {
  keyboard: { size: "", connection: "", switch_type: "" },
  mouse: { connection: "", polling_hz: "", weight_grams: "" },
  ssd: { interface: "", read_mb_s: "", write_mb_s: "", capacity_gb: "" },
  monitor: { panel_type: "", refresh_hz: "", resolution: "", screen_size_inches: "" },
  };
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
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
  const overviewMonthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 5; i += 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      opts.push({
        value: `${year}-${month}`,
        label: date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      });
    }
    return opts;
  }, []);
  const historyMonthOptions = useMemo(
    () => [
      { value: "", label: "All months" },
      { value: "1", label: "Jan" },
      { value: "2", label: "Feb" },
      { value: "3", label: "Mar" },
      { value: "4", label: "Apr" },
      { value: "5", label: "May" },
      { value: "6", label: "Jun" },
      { value: "7", label: "Jul" },
      { value: "8", label: "Aug" },
      { value: "9", label: "Sep" },
      { value: "10", label: "Oct" },
      { value: "11", label: "Nov" },
      { value: "12", label: "Dec" },
    ],
    []
  );
  const formatMonthYear = useCallback((year, month) => {
    const safeYear = Number(year);
    const safeMonth = Number(month);
    if (!safeYear || !safeMonth) return "-";
    const date = new Date(Date.UTC(safeYear, safeMonth - 1, 1));
    return date.toLocaleString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }, []);

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
      const [yearStr, monthStr] = (insightMonth || "").split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const [summaryData, responses, insightsRes] = await Promise.all([
        fetchCsatSummary(120),
        fetchCsatResponses(20),
        fetchAdminInsights({
          year: Number.isFinite(year) ? year : undefined,
          month: Number.isFinite(month) ? month : undefined,
        }),
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
  }, [insightMonth]);

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
    return () => {
      if (editImagePreview) {
        URL.revokeObjectURL(editImagePreview);
      }
    };
  }, [editImagePreview]);

  const loadFaqs = useCallback(async () => {
    setFaqLoading(true);
    try {
      const data = await listFaqs();
      const list = data.data || data || [];
      const sorted = [...list].sort((a, b) => {
        const aOrder = Number(a.sort_order ?? 0);
        const bOrder = Number(b.sort_order ?? 0);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.question || "").localeCompare(String(b.question || ""));
      });
      setFaqItems(sorted);
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

  const loadAnnouncement = useCallback(async () => {
    setAnnouncementLoading(true);
    try {
      const res = await getAnnouncement();
      const data = res?.data || res || {};
      setAnnouncement({
        id: data.id || null,
        message: data.message || "",
        link_url: data.link_url || "",
        link_label: data.link_label || "",
        enabled: data.enabled !== false,
      });
    } catch (err) {
      toast.error(err.message || "Failed to load announcement");
    } finally {
      setAnnouncementLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const res = await listProductCategories();
      const list = res?.data || res || [];
      setCategories(list);
    } catch (err) {
      console.error("Category Load Error:", err);
      toast.error("Failed to load product categories");
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadProfile();
    loadCategories();
  }, [load, loadProfile, loadCategories]);

  const loadInsightsHistory = useCallback(async () => {
    setInsightsHistoryLoading(true);
    try {
      const cleanedYear = Number(insightsHistoryFilters.year) || new Date().getUTCFullYear();
      const cleanedMonth = insightsHistoryFilters.month
        ? Number(insightsHistoryFilters.month)
        : undefined;
      const params = { year: cleanedYear };
      if (cleanedMonth && cleanedMonth >= 1 && cleanedMonth <= 12) {
        params.month = cleanedMonth;
        params.months = 1;
      }
      const res = await fetchAdminInsightsHistory(params);
      const data = res?.data || res || {};
      setInsightsHistory(data.months || []);
    } catch (err) {
      toast.error(err.message || "Failed to load insights history");
    } finally {
      setInsightsHistoryLoading(false);
    }
  }, [insightsHistoryFilters]);

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

  const saveAnnouncement = async (e) => {
    if (e) e.preventDefault();
    if (!announcement.message.trim()) {
      toast.error("Announcement message is required");
      return;
    }
    setAnnouncementSaving(true);
    try {
      const res = await updateAnnouncement({
        id: announcement.id,
        message: announcement.message.trim(),
        link_url: announcement.link_url.trim() || null,
        link_label: announcement.link_label.trim() || null,
        enabled: announcement.enabled,
      });
      const data = res?.data || res || {};
      setAnnouncement({
        id: data.id || announcement.id,
        message: data.message || announcement.message,
        link_url: data.link_url || announcement.link_url,
        link_label: data.link_label || announcement.link_label,
        enabled: data.enabled !== false,
      });
      window.dispatchEvent(new Event("announcement:updated"));
      toast.success("Announcement updated");
    } catch (err) {
      toast.error(err.message || "Failed to update announcement");
    } finally {
      setAnnouncementSaving(false);
    }
  };

  useEffect(() => {
    if (viewMode === "management") {
      if (managementTab === "faqs") {
        loadFaqs();
      } else if (managementTab === "policies") {
        loadPolicies();
      } else if (managementTab === "announcement") {
        loadAnnouncement();
      }
    } else if (viewMode === "businessinsights") {
      loadInsightsHistory();
    } else if (viewMode === "promos") {
      loadPromos();
    } else if (viewMode === "promotions") {
      loadPromotions();
    }
  }, [viewMode, managementTab, loadFaqs, loadPolicies, loadAnnouncement, loadInsightsHistory, loadPromos, loadPromotions]);

  useEffect(() => {
    if (!section) {
      if (viewMode !== defaultSection) {
        setViewMode(defaultSection);
      }
      return;
    }
    if (!sectionIds.has(section)) return;
    if (section !== viewMode) {
      setViewMode(section);
    }
  }, [section, sectionIds, viewMode]);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const data = await listProducts();
      const list = data.data || data || [];
      setProducts(list);
    } catch (err) {
      toast.error(err.message || "Failed to load products");
    } finally {
      setProductsLoading(false);
    }
  }, []);
  useEffect(() => {
    if (viewMode === "inventory" || viewMode === "promotions") {
      loadProducts();
    }
  }, [viewMode, loadProducts]);

  const startEditProduct = (p) => {
    // We include existing data and reset any 'newImageFile' from previous sessions
    setEditProductForm({ ...p, newImageFile: null });
    setEditImagePreview("");
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
      const res = await updateProduct(editProductForm.id, formData);
      if (res?.warning) toast.error(res.warning);
      
      toast.success("Product updated successfully");
      setEditImagePreview("");
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

    const finalCategory = newProduct.category;

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
      const res = await createProduct(formData);
      if (res?.warning) toast.error(res.warning);
      toast.success(`Product added to ${finalCategory}!`);
      setShowCreateProductForm(false);
      // Reset state
      resetNewProductForm();
      loadProducts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const normalizeCategoryValue = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const openNewCategoryModal = () => {
    setNewCategoryName("");
    setShowNewCategoryModal(true);
  };

  const closeNewCategoryModal = () => {
    setShowNewCategoryModal(false);
  };

  const handleCreateCategory = (e) => {
    e.preventDefault();
    const normalized = normalizeCategoryValue(newCategoryName);
    if (!normalized) {
      toast.error("Please enter a category name.");
      return;
    }
    createProductCategory({ name: newCategoryName.trim(), slug: normalized })
      .then((res) => {
        const created = res?.data || res;
        if (created) {
          setCategories((prev) => [...prev, created]);
        } else {
          loadCategories();
        }
        window.dispatchEvent(new Event("categories:updated"));
        toast.success(`Category added: ${formatCategoryLabel(normalized)}`);
        setNewCategoryName("");
        setShowNewCategoryModal(false);
      })
      .catch((err) => {
        toast.error(err.message || "Failed to create category");
      });
  };

  const handleDeleteCategory = async (categoryId, label) => {
    if (!window.confirm(`Delete category "${label}"? Products using this category must be updated first.`)) return;
    try {
      await deleteProductCategory(categoryId);
      toast.success("Category removed");
      setCategories((prev) => prev.filter((c) => c.id !== categoryId && c.slug !== categoryId));
      window.dispatchEvent(new Event("categories:updated"));
    } catch (err) {
      toast.error(err.message || "Failed to delete category");
    }
  };

  const resetNewProductForm = () => {
    setNewProduct({
      title: "",
      Brand: "",
      category: "",
      description: "",
      price: "",
      specs: {},
      imageFile: null,
    });
    setNewProductImageKey((prev) => prev + 1);
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

  const addSpecField = () => {
    setNewProduct((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev.specs, "")) return prev;
      return {
        ...prev,
        specs: { ...prev.specs, "": "" }
      };
    });
  };

  const handleSpecKeyChange = (oldKey, newKey) => {
    const cleanedKey = String(newKey || "").trim().replace(/\s+/g, "_");
    if (cleanedKey === "" && oldKey !== "" && newProduct.specs[""] !== undefined) {
      toast.error("Please finish the existing empty spec before adding another.");
      return;
    }
    if (cleanedKey && cleanedKey !== oldKey && newProduct.specs[cleanedKey] !== undefined) {
      toast.error("That spec already exists. Choose another.");
      return;
    }
    const { [oldKey]: value, ...rest } = newProduct.specs;
    setNewProduct((prev) => ({
      ...prev,
      specs: { ...rest, [cleanedKey]: value }
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

  const addEditSpecField = () => {
    setEditProductForm((prev) => {
      if (!prev) return prev;
      if (Object.prototype.hasOwnProperty.call(prev.specs || {}, "")) return prev;
      return { ...prev, specs: { ...(prev.specs || {}), "": "" } };
    });
  };

  const handleEditSpecKeyChange = (oldKey, newKey) => {
    const cleanedKey = String(newKey || "").trim().replace(/\s+/g, "_");
    setEditProductForm((prev) => {
      if (!prev) return prev;
      const specs = { ...(prev.specs || {}) };
      if (cleanedKey && cleanedKey !== oldKey && specs[cleanedKey] !== undefined) {
        toast.error("That spec already exists. Choose another.");
        return prev;
      }
      const { [oldKey]: value, ...rest } = specs;
      return { ...prev, specs: { ...rest, [cleanedKey]: value } };
    });
  };

  const handleEditSpecValueChange = (key, value) => {
    setEditProductForm((prev) => {
      if (!prev) return prev;
      return { ...prev, specs: { ...(prev.specs || {}), [key]: value } };
    });
  };

  const removeEditSpecField = (key) => {
    setEditProductForm((prev) => {
      if (!prev) return prev;
      const updatedSpecs = { ...(prev.specs || {}) };
      delete updatedSpecs[key];
      return { ...prev, specs: updatedSpecs };
    });
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
    if (viewMode === "inventory") {
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

  const handleDeleteUser = async (userId, email) => {
    const confirm = window.confirm(`Delete user ${email}? This removes all user data and cannot be undone.`);
    if (!confirm) return;
    try {
      await deleteAdminUser(userId);
      toast.success("User deleted");
      await loadUsers();
    } catch (err) {
      toast.error(err.message || "Unable to delete user");
    }
  };

  const resetFaqForm = () => setFaqForm({ id: null, question: "", answer: "" });
  const resetPolicyForm = () => setPolicyForm({ id: null, title: "", tag: "", content: "" });
  const resetPromoForm = () => setPromoForm(emptyPromoForm);
  const sanitizePromoCode = (value) => value.replace(/[^A-Za-z0-9]/g, "");
  const isValidPromoCode = (value) => /^[A-Za-z0-9]+$/.test(value);
  const closeCreateProductModal = () => {
    setShowCreateProductForm(false);
    resetNewProductForm();
  };
  const closeEditProductModal = () => {
    setEditProductForm(null);
    setEditImagePreview("");
  };
  const closeCreatePromoModal = () => {
    setShowCreatePromoForm(false);
    resetPromoForm();
  };
  const closeEditPromoModal = () => setEditPromoForm(null);
  const closeCreatePromotionModal = () => {
    setShowCreatePromotionForm(false);
    resetPromotionForm();
  };
  const closeEditPromotionModal = () => setEditPromotionForm(null);
  const closeFaqModal = () => {
    setShowFaqModal(false);
    resetFaqForm();
  };
  const closePolicyModal = () => {
    setShowPolicyModal(false);
    resetPolicyForm();
  };
  const closeCreateUserModal = () => {
    if (userSaving) return;
    setShowCreateForm(false);
    setUserForm({ id: null, email: "", role: "customer", full_name: "", phone: "", password: "", status: "active" });
  };
  const closeEditUserModal = () => {
    if (editUserSaving) return;
    setEditUserForm(null);
  };


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
    const cats = (categories || [])
      .map((c) => c?.slug || c?.name)
      .filter((c) => !!c);
    return Array.from(new Set(cats)).sort((a, b) => a.localeCompare(b));
  }, [categories]);

  const inventoryCategories = useMemo(() => {
    const cats = (categories || [])
      .map((c) => c?.slug || c?.name)
      .filter((c) => !!c);
    return Array.from(new Set(cats)).sort((a, b) => a.localeCompare(b));
  }, [categories]);

  const productCategoryOptions = useMemo(() => {
    const base = Object.keys(CATEGORY_TEMPLATES || {});
    const combined = [...base, ...(inventoryCategories || [])];
    return Array.from(new Set(combined)).sort((a, b) => a.localeCompare(b));
  }, [inventoryCategories]);

  const promotionProductMap = useMemo(() => {
    return new Map((products || []).map((p) => [p.id, p.title]));
  }, [products]);

  const categoryLabelMap = useMemo(() => {
    const entries = (categories || []).map((c) => {
      const key = c?.slug || c?.name;
      const label = c?.name || formatCategoryLabel(key);
      return [key, label];
    });
    return new Map(entries);
  }, [categories]);

  const getCategoryLabel = (value) =>
    categoryLabelMap.get(value) || formatCategoryLabel(value);

  const newProductCategoryKey = (newProduct.category || "").toLowerCase();
  const newProductTemplate = CATEGORY_TEMPLATES[newProductCategoryKey] || null;
  const newProductTemplateKeys = newProductTemplate ? Object.keys(newProductTemplate) : [];

  const newProductValueOptions = useMemo(() => {
    if (!newProductCategoryKey) return {};
    const map = {};
    (products || [])
      .filter((p) => String(p.category || "").toLowerCase() === newProductCategoryKey)
      .forEach((product) => {
        const specs = product.specs || {};
        Object.entries(specs).forEach(([specKey, specValue]) => {
          if (!specKey) return;
          const values = Array.isArray(specValue) ? specValue : [specValue];
          values.forEach((raw) => {
            if (raw === null || raw === undefined || raw === "") return;
            const cleaned = String(raw).trim();
            if (!cleaned) return;
            if (!map[specKey]) map[specKey] = new Set();
            map[specKey].add(cleaned);
          });
        });
      });
    return Object.fromEntries(
      Object.entries(map).map(([k, set]) => [k, Array.from(set).sort((a, b) => a.localeCompare(b))])
    );
  }, [products, newProductCategoryKey]);

  const newProductAvailableKeys = useMemo(() => {
    if (!newProductCategoryKey) return newProductTemplateKeys;
    const keysFromValues = Object.keys(newProductValueOptions || {});
    return Array.from(new Set([...newProductTemplateKeys, ...keysFromValues])).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [newProductCategoryKey, newProductTemplateKeys, newProductValueOptions]);

  const editImageSrc = editProductForm?.image || "/assets/placeholder.jpg";
  const isAnyModalOpen = !!(
    showCreateProductForm ||
    editProductForm ||
    showCreatePromoForm ||
    editPromoForm ||
    showCreatePromotionForm ||
    editPromotionForm ||
    showCreateForm ||
    showFaqModal ||
    showPolicyModal ||
    editUserForm
  );

  useEffect(() => {
    const body = document.body;
    if (!body) return;
    if (isAnyModalOpen) {
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = "hidden";
      if (scrollBarWidth > 0) {
        body.style.paddingRight = `${scrollBarWidth}px`;
      }
    } else {
      body.style.overflow = "";
      body.style.paddingRight = "";
    }
    return () => {
      body.style.overflow = "";
      body.style.paddingRight = "";
    };
  }, [isAnyModalOpen]);

  const filteredProducts = useMemo(() => {
    const title = (productFilters.title || "").trim().toLowerCase();
    const category = (productFilters.category || "").trim();
    return (products || []).filter((product) => {
      const matchesTitle = title
        ? (product.title || "").toLowerCase().includes(title)
        : true;
      const matchesCategory = category ? product.category === category : true;
      return matchesTitle && matchesCategory;
    });
  }, [products, productFilters]);

  const stockByProductId = useMemo(() => {
    return new Map((stocks || []).map((s) => [s.id, s]));
  }, [stocks]);

  const inventoryItems = useMemo(() => {
    return filteredProducts.map((product) => ({
      product,
      stock: stockByProductId.get(product.id),
    }));
  }, [filteredProducts, stockByProductId]);

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
          <p className="muted">Avg. Rating</p>
          <div className="metric-value">{Number(summary.avg_rating ?? 0).toFixed(2)}</div>
          <span className="muted small">5-point scale</span>
        </div>
        <div className="admin-card metric">
          <p className="muted">Responses</p>
          <div className="metric-value">{summary.responses ?? 0}</div>
          <span className="muted small">Collected</span>
        </div>
        <div className="admin-card metric">
          <p className="muted">Peak Day</p>
          <div className="metric-value">
            {bestTrendPoint?.csat_pct ? `${Math.round(bestTrendPoint.csat_pct)}%` : "-"}
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
            <div className="insight-controls">
              <label className="muted tiny" htmlFor="insight-month">Month</label>
              <select
                id="insight-month"
                className="form-select form-select-sm"
                value={insightMonth}
                onChange={(e) => setInsightMonth(e.target.value)}
              >
                {overviewMonthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
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
        <div className="admin-card">
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
          <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
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
            <button
              type="button"
              className={`btn ${managementTab === "announcement" ? "btn-primary-saas" : "btn-outline-saas"}`}
              onClick={() => setManagementTab("announcement")}
            >
              Promotional Banner
            </button>
          {managementTab === "faqs" && (
            <button
              type="button"
              className="btn btn-primary-saas"
              onClick={() => {
                setFaqForm({ id: null, question: "", answer: "", sort_order: 1 });
                setShowFaqModal(true);
              }}
            >
              Create FAQ
            </button>
          )}
      </div>
          {managementTab === "faqs" && (
            <div className="admin-grid">
              <div className="admin-card wide">
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
                  <div className="table-responsive management-scroll">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th style={{ width: 90 }}>Order</th>
                          <th>Question</th>
                          <th>Answer</th>
                          <th className="text-end" style={{ width: 160 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faqItems.map((item) => (
                          <tr key={item.id}>
                            <td>{Number(item.sort_order ?? 0)}</td>
                            <td className="fw-semibold">{item.question}</td>
                            <td style={{ whiteSpace: "pre-wrap" }}>{item.answer}</td>
                            <td className="text-end">
                              <div className="d-flex gap-2 justify-content-end">
                                <button
                                  type="button"
                                  className="btn btn-outline-saas btn-sm"
                                  onClick={() => {
                                    setFaqForm(item);
                                    setShowFaqModal(true);
                                  }}
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
          )}
        {managementTab === "policies" && (
          <div className="admin-grid">
            <div className="admin-card wide">
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
                  <div className="d-flex flex-column gap-4">
                      {[
                      { slug: "shipping-returns", label: "Shipping & Returns" },
                      { slug: "privacy", label: "Privacy" },
                      { slug: "terms", label: "Terms" },
                    ].map((group) => {
                      const items = policyItems
                        .filter((item) => String(item.slug || "").toLowerCase() === group.slug)
                        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
                      return (
                        <div key={group.slug} className="admin-card">
                          <div className="card-header">
                            <div>
                              <p className="eyebrow">Policies</p>
                              <h4>{group.label}</h4>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary-saas btn-sm"
                              onClick={() => {
                                setPolicyForm({ id: null, title: "", tag: group.slug, content: "", sort_order: 1 });
                                setShowPolicyModal(true);
                              }}
                            >
                              New
                            </button>
                          </div>
                          {items.length === 0 ? (
                            <p className="muted mb-0">No policies yet.</p>
                          ) : (
                            <div className="table-responsive">
                              <table className="dashboard-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: 90 }}>Order</th>
                                    <th>Title</th>
                                    <th>Content</th>
                                    <th className="text-end" style={{ width: 160 }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item) => (
                                    <tr key={item.id}>
                                      <td>{Number(item.sort_order ?? 0)}</td>
                                      <td className="fw-semibold">{item.title}</td>
                                      <td style={{ whiteSpace: "pre-wrap" }}>{item.content}</td>
                                      <td className="text-end">
                                        <div className="d-flex gap-2 justify-content-end">
                                          <button
                                            type="button"
                                            className="btn btn-outline-saas btn-sm"
                                            onClick={() => {
                                              setPolicyForm({
                                                ...item,
                                                tag: item.slug || group.slug,
                                                sort_order: Number(item.sort_order ?? 1),
                                              });
                                              setShowPolicyModal(true);
                                            }}
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
                      );
                    })}
                  </div>
              )}
            </div>
          </div>
        )}
          {managementTab === "announcement" && (
            <div className="admin-grid">
              <div className="admin-card wide">
                <div className="card-header">
                  <div>
                    <p className="eyebrow">Promotional Banner</p>
                    <h4>Message above the navbar</h4>
                  </div>
                </div>
                {announcementLoading ? (
                  <p className="muted mb-0">Loading announcement...</p>
                ) : (
                  <form className="profile-form" onSubmit={saveAnnouncement}>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="announcement-message">Message</label>
                      <input
                        id="announcement-message"
                        type="text"
                        className="form-control"
                        value={announcement.message}
                        onChange={(e) => setAnnouncement((p) => ({ ...p, message: e.target.value }))}
                        placeholder="New customers: Get 10% off your first order"
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="announcement-link-label">Link label (optional)</label>
                      <input
                        id="announcement-link-label"
                        type="text"
                        className="form-control"
                        value={announcement.link_label}
                        onChange={(e) => setAnnouncement((p) => ({ ...p, link_label: e.target.value }))}
                        placeholder="Sign up"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="announcement-link-url">Link URL (optional)</label>
                      <input
                        id="announcement-link-url"
                        type="text"
                        className="form-control"
                        value={announcement.link_url}
                        onChange={(e) => setAnnouncement((p) => ({ ...p, link_url: e.target.value }))}
                        placeholder="/register"
                      />
                    </div>
                    <div className="mb-3 form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="announcement-enabled"
                        checked={!!announcement.enabled}
                        onChange={(e) => setAnnouncement((p) => ({ ...p, enabled: e.target.checked }))}
                      />
                      <label className="form-check-label" htmlFor="announcement-enabled">
                        Enabled
                      </label>
                    </div>
                    <button type="submit" className="btn btn-primary-saas" disabled={announcementSaving}>
                      {announcementSaving ? "Saving..." : "Save banner"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
      </div>
    </section>
  );

  const renderBusinessInsights = () => (
    <section className="admin-grid">
      <div className="admin-card wide">
        <div className="card-header">
          <div>
            <p className="eyebrow">Business insights</p>
            <h4>Monthly best/worst history</h4>
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap mb-3 align-items-end">
          <div>
            <label className="form-label" htmlFor="insights-year">Year</label>
            <select
              id="insights-year"
              className="form-select"
              style={{ width: 160 }}
              value={insightsHistoryFilters.year}
              onChange={(e) =>
                setInsightsHistoryFilters((p) => ({ ...p, year: e.target.value }))
              }
            >
              {Array.from({ length: 11 }, (_, idx) => 2026 - idx).map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="insights-month">Month</label>
            <select
              id="insights-month"
              className="form-select"
              style={{ width: 180 }}
              value={insightsHistoryFilters.month}
              onChange={(e) =>
                setInsightsHistoryFilters((p) => ({ ...p, month: e.target.value }))
              }
            >
              {historyMonthOptions.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary-saas"
            onClick={loadInsightsHistory}
            disabled={insightsHistoryLoading}
          >
            {insightsHistoryLoading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <div className="results-count">{insightsHistory.length} results found</div>
        <div className="table-responsive">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Best product</th>
                <th>Worst product</th>
                <th className="text-end">Sales</th>
                <th className="text-end">Orders</th>
              </tr>
            </thead>
            <tbody>
              {insightsHistoryLoading ? (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-muted">
                    Loading insights...
                  </td>
                </tr>
              ) : insightsHistory.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-muted">
                    No insights found for this filter.
                  </td>
                </tr>
              ) : (
                insightsHistory.map((row) => (
                  <tr key={`history-${row.year}-${row.month}`}>
                    <td>{formatMonthYear(row.year, row.month)}</td>
                    <td>
                      {row.best_selling_product_month?.name || "N/A"}
                      {row.best_selling_product_month?.quantity
                        ? ` (${row.best_selling_product_month.quantity})`
                        : ""}
                    </td>
                    <td>
                      {row.worst_selling_product_month?.name || "N/A"}
                      {row.worst_selling_product_month?.quantity
                        ? ` (${row.worst_selling_product_month.quantity})`
                        : ""}
                    </td>
                    <td className="text-end">{currencyFormatter.format(row.month_total_sales || 0)}</td>
                    <td className="text-end">{row.month_orders || 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );

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
            New User
          </button>
        </div>
        <div className="results-count">{users.length} results found</div>

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
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          title="Delete user"
                        >
                          Delete
                        </button>
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
          onClick={closeCreateUserModal}
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
                onClick={closeCreateUserModal}
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
                      setUserForm((p) => ({ ...p, status: e.target.checked ? "active" : "inactive" }))
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
          onClick={closeEditUserModal}
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
                onClick={closeEditUserModal}
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
                      setEditUserForm((p) => ({ ...p, status: e.target.checked ? "active" : "inactive" }))
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

const renderInventory = () => (
  <section className="admin-grid products-grid">
    <div className="admin-card wide">
      <div className="card-header">
        <div>
          <p className="eyebrow">Inventory</p>
          <h4>Products & Stock</h4>
        </div>
      </div>

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
          <select
            className="form-select"
            style={{ maxWidth: 200 }}
            value={productFilters.category}
            onChange={(e) => setProductFilters({ title: "", category: e.target.value })}
          >
            <option value="">All categories</option>
            {inventoryCategories.map((cat) => (
              <option key={cat} value={cat}>
                {getCategoryLabel(cat)}
              </option>
            ))}
          </select>
        </div>

        <div className="d-flex gap-2">
          <button
            className="btn btn-outline-saas"
            onClick={() => {
              loadProducts();
              loadStocks();
            }}
            disabled={productsLoading || stocksLoading}
          >
            {productsLoading || stocksLoading ? "Loading..." : "Refresh"}
          </button>

          <button
            className="btn btn-outline-saas"
            onClick={openNewCategoryModal}
          >
            New Category
          </button>

          <button
            className="btn btn-primary-saas"
            onClick={() => {
              setShowCreateProductForm(true);
              setEditProductForm(null);
            }}
          >
            New Product
          </button>
        </div>
      </div>
      <div className="results-count">{inventoryItems.length} results found</div>

      <div className="admin-grid">
        {productsLoading || stocksLoading ? (
          <div className="admin-card">
            <p className="muted mb-0">Loading inventory...</p>
          </div>
        ) : inventoryItems.length === 0 ? (
          <div className="admin-card">
            <p className="muted mb-0">No products found.</p>
          </div>
        ) : (
          inventoryItems.map(({ product, stock }) => {
            const qty = Number(stock?.quantity_available ?? 0);
            const rawThreshold = stock?.low_stock_threshold;
            const hasThreshold = Number.isFinite(Number(rawThreshold));
            const threshold = hasThreshold ? Number(rawThreshold) : 15;
            const thresholdLabel = hasThreshold ? threshold : "-";
            const hasStock = !!stock;

            let statusText = "In Stock";
            let statusClass = "stock-status is-ok";
            let qtyClass = "stock-qty is-ok";
            if (!hasStock) {
              statusText = "No Stock Record";
              statusClass = "stock-status is-none";
              qtyClass = "stock-qty is-none";
            } else if (qty <= 0) {
              statusText = "Out of Stock";
              statusClass = "stock-status is-out";
              qtyClass = "stock-qty is-out";
            } else if (qty <= threshold) {
              statusText = "Low Stock";
              statusClass = "stock-status is-low";
              qtyClass = "stock-qty is-low";
            }

            return (
              <div key={product.id} className="admin-card">
                <div className="inventory-card-top">
                  <div className="inventory-media">
                    <img
                      src={product.image}
                      alt=""
                      className="inventory-thumb"
                      onError={(e) => {
                        e.target.src = "/assets/placeholder.jpg";
                      }}
                    />
                    <h5 className="inventory-title">{product.title}</h5>
                    <span className="badge bg-light text-dark border">
                      {getCategoryLabel(product.category)}
                    </span>
                  </div>
                  <div className="inventory-info">
                    <div className="muted tiny inventory-meta">
                      <code className="small">#{product.id.toString().slice(0, 8)}</code>
                    </div>
                    <div className="inventory-meta">
                      {hasActivePromotion(product) ? (
                        <>
                          <span className="text-decoration-line-through me-1">
                            {currencyFormatter.format(product.originalPrice)}
                          </span>
                          <span className="inventory-price fw-bold text-primary">
                            {currencyFormatter.format(product.price)}
                          </span>
                          {(() => {
                            const badge = formatPromotionBadge(product);
                            return badge ? (
                              <span className="badge bg-warning text-dark ms-2">
                                {badge}
                              </span>
                            ) : null;
                          })()}
                        </>
                      ) : (
                        <span className="inventory-price">{currencyFormatter.format(product.price)}</span>
                      )}
                    </div>
                    <div className="inventory-actions">
                      <button
                        className="btn btn-outline-saas btn-sm"
                        onClick={() => {
                          startEditProduct(product);
                          setShowCreateProductForm(false);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => handleDeleteProduct(product.id, product.title)}
                        disabled={isDeleting === product.id}
                      >
                        {isDeleting === product.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="inventory-stock-panel mt-3 p-3 rounded">
                  <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div>
                      <p className="muted tiny mb-1">Stock</p>
                      <div className="d-flex align-items-center gap-2">
                        <strong className={qtyClass}>{hasStock ? qty : "-"}</strong>
                        <span className={statusClass}>
                          {statusText.toUpperCase()}
                        </span>
                      </div>
                      <p className="muted tiny mb-0">Threshold: {thresholdLabel}</p>
                    </div>

                    <div className="d-flex gap-2">
                      <button
                        className={`btn btn-sm ${
                          adjustingId === product.id ? "btn-primary-saas" : "btn-outline-saas"
                        }`}
                        onClick={() => {
                          setAdjustingThresholdId(null);
                          setAdjustingId(product.id);
                          setAdjustmentForm({ quantity: qty, reason: "Manual Adjustment" });
                        }}
                      >
                        Update Stock
                      </button>
                      <button
                        className={`btn btn-sm ${
                          adjustingThresholdId === product.id ? "btn-primary-saas" : "btn-outline-saas"
                        }`}
                        onClick={() => {
                          setAdjustingId(null);
                          setAdjustingThresholdId(product.id);
                          setThresholdValue(threshold);
                        }}
                      >
                        Set Threshold
                      </button>
                    </div>
                  </div>

                  {adjustingId === product.id && (
                    <div className="d-flex gap-2 align-items-center mt-3 flex-wrap">
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        style={{ maxWidth: 140 }}
                        value={adjustmentForm.quantity}
                        onChange={(e) =>
                          setAdjustmentForm({
                            ...adjustmentForm,
                            quantity: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        autoFocus
                      />
                      <button className="btn btn-primary-saas btn-sm" onClick={() => handleStockSubmit(product.id)}>
                        Save
                      </button>
                      <button
                        className="btn btn-outline-saas btn-sm"
                        onClick={() => {
                          setAdjustingId(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {adjustingThresholdId === product.id && (
                    <div className="d-flex gap-2 align-items-center mt-3 flex-wrap">
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        style={{ maxWidth: 140 }}
                        value={thresholdValue}
                        onChange={(e) => setThresholdValue(parseInt(e.target.value, 10) || 0)}
                        autoFocus
                      />
                      <button className="btn btn-primary-saas btn-sm" onClick={() => handleSaveThreshold(product.id)}>
                        Save
                      </button>
                      <button
                        className="btn btn-outline-saas btn-sm"
                        onClick={() => {
                          setAdjustingThresholdId(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  </section>
);

  const productCreateModal = showCreateProductForm && (
    <div className="admin-modal" role="dialog" aria-modal="true" onClick={closeCreateProductModal}>
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Product Management</p>
            <h4>Create New Product</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={closeCreateProductModal}>
            Close
          </button>
        </div>
        <form onSubmit={handleCreateProduct}>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="small fw-bold">Product Title</label>
              <input
                type="text"
                className="form-control"
                value={newProduct.title}
                onChange={(e) => setNewProduct({ ...newProduct, title: e.target.value })}
                required
              />
            </div>
            <div className="col-md-3">
              <label className="small fw-bold">Brand</label>
              <input
                type="text"
                className="form-control"
                value={newProduct.Brand}
                onChange={(e) => setNewProduct({ ...newProduct, Brand: e.target.value })}
                required
              />
            </div>
            <div className="col-md-3">
              <label className="small fw-bold">Price ($)</label>
              <input
                type="number"
                step="0.01"
                className="form-control"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="small fw-bold">Category</label>
              <select
                className="form-select"
                value={newProduct.category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                required
              >
                <option value="">Select...</option>
                {productCategoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {getCategoryLabel(cat)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="small fw-bold">Product Image</label>
              <input
                key={newProductImageKey}
                type="file"
                className="form-control"
                accept="image/*"
                onChange={(e) => setNewProduct({ ...newProduct, imageFile: e.target.files[0] })}
                required
              />
            </div>
            <div className="col-md-12">
              <label className="small fw-bold">Description</label>
              <textarea
                className="form-control"
                rows="2"
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
              />
            </div>
            <div className="col-md-12">
              <div className="d-flex justify-content-between align-items-center">
                <label className="small fw-bold mb-0">Technical specifications</label>
                <button type="button" className="btn btn-outline-saas btn-sm" onClick={addSpecField}>
                  Add spec
                </button>
              </div>
              <div className="mt-2 d-flex flex-column gap-2">
                {Object.entries(newProduct.specs).length === 0 && (
                  <p className="small text-muted mb-0">No specs yet.</p>
                )}
                {Object.entries(newProduct.specs).map(([key, value], idx) => (
                  <div className="row g-2 align-items-end" key={`spec-${idx}`}>
                    <div className="col-md-4">
                      <label className="small text-muted">Spec</label>
                      <input
                        type="text"
                        className="form-control"
                        value={key}
                        onChange={(e) => handleSpecKeyChange(key, e.target.value)}
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="small text-muted">Value</label>
                      <input
                        type="text"
                        className="form-control"
                        value={value ?? ""}
                        onChange={(e) => handleSpecValueChange(key, e.target.value)}
                      />
                    </div>
                    <div className="col-md-2">
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm w-100"
                        onClick={() => removeSpecField(key)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="d-flex gap-3 mt-4">
            <button type="submit" className="btn btn-primary-saas">Create product</button>
            <button type="button" className="btn btn-outline-saas" onClick={closeCreateProductModal}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const newCategoryModal = showNewCategoryModal && (
    <div className="admin-modal" role="dialog" aria-modal="true" onClick={closeNewCategoryModal}>
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Product categories</p>
            <h4>New category</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={closeNewCategoryModal}>
            Close
          </button>
        </div>
        <form onSubmit={handleCreateCategory}>
          <div className="mb-3">
            <label className="form-label">Category name</label>
            <input
              type="text"
              className="form-control"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Headphones"
              required
            />
          </div>
          <div className="d-flex gap-3">
            <button type="submit" className="btn btn-primary-saas">Add category</button>
            <button type="button" className="btn btn-outline-saas" onClick={closeNewCategoryModal}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const productEditModal = editProductForm && (
    <div className="admin-modal" role="dialog" aria-modal="true" onClick={closeEditProductModal}>
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Product Management</p>
            <h4>Edit Product: {editProductForm.title}</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={closeEditProductModal}>
            Close
          </button>
        </div>

        <form className="profile-form" onSubmit={handleEditProductSave}>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Product Title</label>
              <input
                type="text"
                className="form-control"
                value={editProductForm.title}
                onChange={(e) => setEditProductForm({ ...editProductForm, title: e.target.value })}
                required
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={editProductForm.category || ""}
                onChange={(e) => setEditProductForm({ ...editProductForm, category: e.target.value })}
                required
              >
                <option value="">Select...</option>
                {productCategoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {getCategoryLabel(cat)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
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
            <div className="col-md-6">
              <label className="form-label">Brand</label>
              <input
                type="text"
                className="form-control"
                value={editProductForm.Brand || ""}
                onChange={(e) => setEditProductForm({ ...editProductForm, Brand: e.target.value })}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label">Description</label>
              <input
                type="text"
                className="form-control"
                value={editProductForm.description || ""}
                onChange={(e) => setEditProductForm({ ...editProductForm, description: e.target.value })}
              />
            </div>
            <div className="col-md-12">
              <label className="form-label">Product Image</label>
              <div className="card p-3 bg-light border-dashed">
                <div className="d-flex align-items-center gap-4 flex-wrap">
                  <div className="text-center">
                    <p className="small text-muted mb-1">Current Image</p>
                    <img
                      src={editImagePreview || editImageSrc}
                      alt="Current"
                      className="rounded border"
                      style={{ width: "100px", height: "100px", objectFit: "cover", backgroundColor: "#fff" }}
                      onError={(e) => {
                        e.target.src = "/assets/placeholder.jpg";
                      }}
                    />
                  </div>
                  <div className="flex-grow-1">
                    <label className="form-label small fw-bold">Upload New Image</label>
                    <input
                      type="file"
                      className="form-control"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          setEditProductForm({
                            ...editProductForm,
                            newImageFile: file,
                          });
                          const previewUrl = URL.createObjectURL(file);
                          setEditImagePreview((prev) => {
                            if (prev) URL.revokeObjectURL(prev);
                            return previewUrl;
                          });
                        }
                      }}
                    />
                    <div className="form-text">Leave empty to keep the current image.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex gap-3 pt-3">
            <button type="submit" className="btn btn-primary-saas px-4" disabled={editProductSaving}>
              {editProductSaving ? "Saving..." : "Save changes"}
            </button>
            <button type="button" className="btn btn-outline-saas" onClick={closeEditProductModal}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const faqModal = showFaqModal && (
    <div className="admin-modal" role="dialog" aria-modal="true" onClick={closeFaqModal}>
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">FAQs</p>
            <h4>{faqForm.id ? "Edit FAQ" : "Create FAQ"}</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={closeFaqModal}>
            Close
          </button>
        </div>
        <form
          className="profile-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              if (faqForm.id) {
                await updateFaq(faqForm.id, faqForm);
                toast.success("FAQ updated");
              } else {
                await createFaq(faqForm);
                toast.success("FAQ created");
              }
              setFaqForm({ id: null, question: "", answer: "", sort_order: 1 });
              setShowFaqModal(false);
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
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="faq-order">Sort order</label>
            <input
              id="faq-order"
              type="number"
              className="form-control"
              value={faqForm.sort_order ?? 1}
              onChange={(e) =>
                setFaqForm((p) => ({ ...p, sort_order: Number(e.target.value) || 1 }))
              }
              min="1"
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
              required
            />
          </div>
          <div className="d-flex gap-3">
            <button type="submit" className="btn btn-primary-saas">
              {faqForm.id ? "Update" : "Create"}
            </button>
            <button type="button" className="btn btn-outline-saas" onClick={closeFaqModal}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const policyModal = showPolicyModal && (
    <div className="admin-modal" role="dialog" aria-modal="true">
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Policies</p>
            <h4>{policyForm.id ? "Edit policy" : "Create policy"}</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={closePolicyModal}>
            Close
          </button>
        </div>
        <form
          className="profile-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const payload = {
              title: policyForm.title,
              slug: policyForm.tag,
              content: policyForm.content,
              sort_order: policyForm.sort_order,
            };
            try {
              if (policyForm.id) {
                await updatePolicy(policyForm.id, payload);
                toast.success("Policy updated");
              } else {
                await createPolicy(payload);
                toast.success("Policy created");
              }
              setPolicyForm({ id: null, title: "", tag: "", content: "", sort_order: 1 });
              setShowPolicyModal(false);
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
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="policy-order">Sort order</label>
            <input
              id="policy-order"
              type="number"
              className="form-control"
              value={policyForm.sort_order ?? 1}
              onChange={(e) =>
                setPolicyForm((p) => ({ ...p, sort_order: Number(e.target.value) || 1 }))
              }
              min="1"
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="policy-tag">Tag</label>
            <select
              id="policy-tag"
              className="form-select"
              value={policyForm.tag}
              onChange={(e) => setPolicyForm((p) => ({ ...p, tag: e.target.value }))}
              required
            >
              <option value="">Select tag</option>
              <option value="shipping-returns">Shipping-returns</option>
              <option value="privacy">Privacy</option>
              <option value="terms">Terms</option>
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="policy-content">Content</label>
            <textarea
              id="policy-content"
              className="form-control"
              rows="5"
              value={policyForm.content}
              onChange={(e) => setPolicyForm((p) => ({ ...p, content: e.target.value }))}
              required
            />
          </div>
          <div className="d-flex gap-3">
            <button type="submit" className="btn btn-primary-saas">
              {policyForm.id ? "Update" : "Create"}
            </button>
            <button type="button" className="btn btn-outline-saas" onClick={closePolicyModal}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const promoCreateModal = showCreatePromoForm && (
    <div className="admin-modal" role="dialog" aria-modal="true" onClick={closeCreatePromoModal}>
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Create Promo</p>
            <h4>New Promo Code</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={closeCreatePromoModal}>
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
            <button type="submit" className="btn btn-primary-saas">Create Promo</button>
            <button type="button" className="btn btn-outline-saas" onClick={resetPromoForm}>
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const promoEditModal = editPromoForm && (
    <div className="admin-modal" role="dialog" aria-modal="true" onClick={closeEditPromoModal}>
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Edit promo</p>
            <h4>{editPromoForm.code}</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={closeEditPromoModal}>
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
            <button type="submit" className="btn btn-primary-saas">Save changes</button>
            <button type="button" className="btn btn-outline-saas" onClick={closeEditPromoModal}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const promotionCreateModal = showCreatePromotionForm && (
    <div className="admin-modal" role="dialog" aria-modal="true" onClick={closeCreatePromotionModal}>
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Create Promotion</p>
            <h4>New auto-applied discount</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={closeCreatePromotionModal}>
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
                  <select
                    id="promotion-category"
                    className="form-select"
                    value={promotionForm.category}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, category: e.target.value }))}
                  >
                    <option value="">Select category</option>
                    {promotionCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
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
            <button type="submit" className="btn btn-primary-saas">Create Promotion</button>
            <button type="button" className="btn btn-outline-saas" onClick={resetPromotionForm}>
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const promotionEditModal = editPromotionForm && (
    <div className="admin-modal" role="dialog" aria-modal="true" onClick={closeEditPromotionModal}>
      <div className="admin-modal-card admin-card" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div>
            <p className="eyebrow">Edit promotion</p>
            <h4>Update auto-applied discount</h4>
          </div>
          <button type="button" className="btn btn-outline-saas btn-sm" onClick={closeEditPromotionModal}>
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
                  <select
                    id="promotion-category-edit"
                    className="form-select"
                    value={editPromotionForm.category}
                    onChange={(e) => setEditPromotionForm((p) => ({ ...p, category: e.target.value }))}
                  >
                    <option value="">Select category</option>
                    {promotionCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
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
          <button type="submit" className="btn btn-primary-saas mt-3">Save changes</button>
        </form>
      </div>
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
                    <Link
                      key={section.id}
                      className={`sidebar-link ${viewMode === section.id ? "active" : ""}`}
                      to={section.id === defaultSection ? "/dashboard/admin" : `/dashboard/admin/${section.id}`}
                      aria-current={viewMode === section.id ? "page" : undefined}
                    >
                      {section.label}
                    </Link>
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
                  Monitor CSAT and Business Insights
                </p>
                <div className="hero-actions">
                  {viewMode === "dashboard" && (
                    <button className="btn btn-outline-saas" onClick={load} disabled={loading}>
                      {loading ? "Refreshing..." : "Refresh data"}
                    </button>
                  )}
                  {viewMode !== "dashboard" && (
                    <Link className="pill-btn ghost" to="/dashboard/admin">
                      Back to overview
                    </Link>
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
            {viewMode === "businessinsights" && renderBusinessInsights()}
            {viewMode === "promos" && renderPromos()}
            {viewMode === "promotions" && renderPromotions()}
            {viewMode === "inventory" && renderInventory()}
          </main>
        </div>
      </div>
      {productCreateModal}
      {newCategoryModal}
      {productEditModal}
      {faqModal}
      {policyModal}
      {promoCreateModal}
      {promoEditModal}
      {promotionCreateModal}
      {promotionEditModal}
    </div>
  );
};

export default AdminDashboard;
