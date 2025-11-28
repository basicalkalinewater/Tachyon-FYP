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

router.get('/', async (_req, res, next) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return next(error);
  res.json(data.map(mapProduct));
});

router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return next(error);
  res.json(mapProduct(data));
});

router.post('/', async (req, res, next) => {
  const { title, description, price, image, category, rating, rating_count } = req.body;
  if (!title || price === undefined) {
    return res.status(400).json({ error: 'title and price are required' });
  }

  const payload = {
    title,
    description: description || '',
    price,
    image_url: image,
    category: category || null,
    rating: rating ?? null,
    rating_count: rating_count ?? null,
  };

  const { data, error } = await supabase
    .from('products')
    .insert(payload)
    .select('*')
    .single();

  if (error) return next(error);
  res.status(201).json(mapProduct(data));
});

router.put('/:id', async (req, res, next) => {
  const { id } = req.params;
  const { title, description, price, image, category, rating, rating_count } = req.body;

  const payload = {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(image !== undefined ? { image_url: image } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(rating_count !== undefined ? { rating_count } : {}),
  };

  const { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return next(error);
  res.json(mapProduct(data));
});

export default router;
