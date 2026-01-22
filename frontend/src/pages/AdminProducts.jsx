import { useEffect, useState } from "react";
import { 
  listProducts, deleteProduct, createProduct, updateProduct,
  searchProductsByTitle, filterProductsByCategory, filterProductsByPrice 
} from "../api/productManagement";

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({ title: "", price: "" });
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });

  const categories = ["Electronics", "Clothing", "Home", "Accessories"];

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    try {
      const data = await listProducts();
      setProducts(Array.isArray(data) ? data : data?.data || []);
      // Reset local filter UI
      setSearchTerm("");
      setCatSearch("");
      setPriceRange({ min: "", max: "" });
    } catch (err) { console.error("Load error", err); }
  };

  // --- FILTER HANDLERS ---
  const handleTitleSearch = async (val) => {
    setSearchTerm(val);
    if (!val.trim()) return loadProducts();
    const data = await searchProductsByTitle(val);
    setProducts(data);
  };

  const handleCategorySearch = async (val) => {
    setCatSearch(val);
    if (!val.trim()) return loadProducts();
    const data = await filterProductsByCategory(val);
    setProducts(data);
  };

  const handlePriceRangeSubmit = async (e) => {
    e.preventDefault();
    const min = priceRange.min || 0;
    const max = priceRange.max || 1000000;
    const data = await filterProductsByPrice(min, max);
    setProducts(data);
  };

  // --- CRUD HANDLERS ---
  const openModal = (product = null) => {
    setEditingProduct(product);
    setFormData(product ? { title: product.title, price: product.price } : { title: "", price: "" });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProduct) await updateProduct(editingProduct.id, formData);
      else await createProduct(formData);
      setIsModalOpen(false);
      loadProducts();
    } catch (err) { alert("Action failed"); }
  };

  const onDelete = async (id) => {
    if (window.confirm("Delete product?")) {
      await deleteProduct(id);
      loadProducts();
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto font-sans">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Product Management</h1>
        <button onClick={() => openModal()} className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 transition">
          + Add Product
        </button>
      </div>

      {/* ADVANCED FILTER BAR */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
          
          {/* Title Search */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Search Title</label>
            <input 
              type="text" 
              className="w-full border p-2 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none" 
              placeholder="e.g. iPhone..."
              value={searchTerm}
              onChange={(e) => handleTitleSearch(e.target.value)}
            />
          </div>

          {/* Category Hybrid (Type or Select) */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Category Search</label>
            <div className="flex">
              <input 
                type="text" 
                className="w-full border-y border-l p-2 rounded-l-lg bg-gray-50 outline-none" 
                placeholder="Type category..."
                value={catSearch}
                onChange={(e) => handleCategorySearch(e.target.value)}
              />
              <select 
                className="border p-2 rounded-r-lg bg-gray-100 text-sm cursor-pointer"
                onChange={(e) => handleCategorySearch(e.target.value)}
                value={catSearch}
              >
                <option value="">Select</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Price Range Fields */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Price Range ($)</label>
            <form onSubmit={handlePriceRangeSubmit} className="flex items-center gap-2">
              <input 
                type="number" 
                placeholder="Min" 
                className="w-full border p-2 rounded-lg bg-gray-50"
                value={priceRange.min}
                onChange={(e) => setPriceRange({...priceRange, min: e.target.value})}
              />
              <span className="text-gray-400">to</span>
              <input 
                type="number" 
                placeholder="Max" 
                className="w-full border p-2 rounded-lg bg-gray-50"
                value={priceRange.max}
                onChange={(e) => setPriceRange({...priceRange, max: e.target.value})}
              />
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                Go
              </button>
              <button type="button" onClick={loadProducts} className="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300">
                Reset
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 text-sm font-semibold text-gray-600">Product Info</th>
              <th className="p-4 text-sm font-semibold text-gray-600">Price</th>
              <th className="p-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length > 0 ? products.map(p => (
              <tr key={p.id} className="border-b hover:bg-gray-50 transition">
                <td className="p-4">
                   <div className="font-medium text-gray-800">{p.title}</div>
                   <div className="text-xs text-gray-400 font-mono">{p.category}</div>
                </td>
                <td className="p-4 text-gray-700 font-semibold">${p.price}</td>
                <td className="p-4 text-right space-x-4">
                  <button onClick={() => openModal(p)} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                  <button onClick={() => onDelete(p.id)} className="text-red-500 hover:text-red-700 font-medium">Delete</button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="3" className="p-12 text-center text-gray-400 italic">No products match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL (Add/Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">{editingProduct ? "Edit Product" : "New Product"}</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input type="text" className="w-full border p-3 rounded-xl bg-gray-50" 
                  value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                <input type="number" step="0.01" className="w-full border p-3 rounded-xl bg-gray-50" 
                  value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} required />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-gray-500 hover:text-gray-800">Cancel</button>
                <button type="submit" className="bg-blue-600 text-white px-8 py-2 rounded-xl hover:bg-blue-700 shadow-lg">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}