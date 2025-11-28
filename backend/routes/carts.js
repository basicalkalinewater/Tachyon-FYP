import express from 'express';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

const mapProduct = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  price: Number(row.price),
  image: row.image_url,
  category: row.category,
  rating: row.rating,
  rating_count: row.rating_count,
  specs: row.specs || {},
});

const readCartItems = async (cartId) => {
  const { data, error } = await supabase
    .from('cart_items')
    .select(`cart_id, product_id, quantity, products:product_id ( id, title, description, price, image_url, category, rating, rating_count, specs )`)
    .eq('cart_id', cartId);

  if (error) throw error;

  return data.map((row) => ({
    id: row.product_id,
    qty: row.quantity,
    ...mapProduct(row.products),
  }));
};

router.post('/', async (_req, res, next) => {
  const { data, error } = await supabase
    .from('carts')
    .insert({})
    .select('id')
    .single();

  if (error) return next(error);
  res.status(201).json({ cartId: data.id });
});

router.get('/:cartId', async (req, res, next) => {
  const { cartId } = req.params;
  const { data: cart, error: cartError } = await supabase
    .from('carts')
    .select('id')
    .eq('id', cartId)
    .single();

  if (cartError) return next(cartError);
  if (!cart) return res.status(404).json({ error: 'Cart not found' });

  try {
    const items = await readCartItems(cartId);
    return res.json({ cartId, items });
  } catch (err) {
    return next(err);
  }
});

router.post('/:cartId/items', async (req, res, next) => {
  const { cartId } = req.params;
  const { product_id, quantity = 1 } = req.body;

  if (!product_id) return res.status(400).json({ error: 'product_id is required' });
  if (quantity < 1) return res.status(400).json({ error: 'quantity must be >= 1' });

  const { error } = await supabase
    .from('cart_items')
    .upsert({ cart_id: cartId, product_id, quantity }, { onConflict: 'cart_id,product_id' });

  if (error) return next(error);

  try {
    const items = await readCartItems(cartId);
    res.status(201).json({ cartId, items });
  } catch (err) {
    next(err);
  }
});

router.patch('/:cartId/items/:productId', async (req, res, next) => {
  const { cartId, productId } = req.params;
  const { quantity } = req.body;

  if (quantity === undefined) return res.status(400).json({ error: 'quantity is required' });
  if (quantity < 1) return res.status(400).json({ error: 'quantity must be >= 1' });

  const { error } = await supabase
    .from('cart_items')
    .update({ quantity })
    .eq('cart_id', cartId)
    .eq('product_id', productId);

  if (error) return next(error);

  try {
    const items = await readCartItems(cartId);
    res.json({ cartId, items });
  } catch (err) {
    next(err);
  }
});

router.delete('/:cartId/items/:productId', async (req, res, next) => {
  const { cartId, productId } = req.params;

  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('cart_id', cartId)
    .eq('product_id', productId);

  if (error) return next(error);

  try {
    const items = await readCartItems(cartId);
    res.json({ cartId, items });
  } catch (err) {
    next(err);
  }
});

export default router;
