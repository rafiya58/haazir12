-- 1. Add payment_proof_url to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_proof_url text;

-- 2. Hide existing menu items for all 4 vendors (preserve FK to order_items)
UPDATE public.menu_items
SET is_available = false
WHERE restaurant_id IN (
  'b9a488a3-6fbd-4329-b376-0e90576af98f',
  '70a078b7-ae38-4708-a2e8-aa72604b1fae',
  '7042a451-28f4-4174-bf7b-df14d044a858',
  'af6b5a66-122d-47bc-b8f3-2674f28ba70b'
)
OR restaurant_id IN (
  SELECT id FROM public.restaurants
  WHERE slug IN ('gyroverse', 'bambou', 'smash-grill', 'united-king')
);

-- We will additionally filter menu_items in the UI by a separate "is_listed" flag,
-- but to avoid schema sprawl we instead delete only the items NOT referenced anywhere.
DELETE FROM public.menu_items
WHERE (
  restaurant_id IN (
    'b9a488a3-6fbd-4329-b376-0e90576af98f',
    '70a078b7-ae38-4708-a2e8-aa72604b1fae',
    '7042a451-28f4-4174-bf7b-df14d044a858',
    'af6b5a66-122d-47bc-b8f3-2674f28ba70b'
  )
  OR restaurant_id IN (
    SELECT id FROM public.restaurants
    WHERE slug IN ('gyroverse', 'bambou', 'smash-grill', 'united-king')
  )
)
AND id NOT IN (SELECT menu_item_id FROM public.order_items WHERE menu_item_id IS NOT NULL);

-- 3. Insert fresh Gyroverse menu
INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available)
SELECT r.id, m.name, m.description, m.price, m.category, true
FROM public.restaurants AS r
CROSS JOIN (VALUES
  ('The Classic', 'Pita, Juicy Chicken, Hummus, Lettuce, Pickles, Cucumber, Sauce, Jalapenos', 250, 'Desi'),
  ('The Loaded', 'Pita, Cheese, Juicy Chicken, French Fries, Hummus, Jalapenos, Lettuce, Pickles, Cucumber, Sauce', 350, 'Desi'),
  ('The Sulemani', 'Pita, Juicy Chicken, Hummus, Jalapenos, Pickles, Cucumber, Sauce', 240, 'Desi'),
  ('The OG', 'Tortilla, Juicy Chicken, French Fries, Hummus, Jalapenos, Lettuce, Pickles, Sauce', 350, 'Arabic'),
  ('Special Arabic', 'Tortilla, Cheese, Juicy Chicken, French Fries, Hummus, Jalapenos, Lettuce, Pickles, Sauce', 400, 'Arabic'),
  ('All Veggies', 'Tortilla, Hummus, Lettuce, Pickles, Jalapenos, French Fries, Cucumber', 300, 'Arabic'),
  ('Pepsi', NULL, 90, 'Beverages'),
  ('Mirinda', NULL, 90, 'Beverages'),
  ('7UP', NULL, 90, 'Beverages'),
  ('Water', NULL, 70, 'Beverages'),
  ('Gatorade', NULL, 120, 'Beverages')
) AS m(name, description, price, category)
WHERE r.slug = 'gyroverse';

-- 4. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage policies
CREATE POLICY "Anyone authenticated can view payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payment-proofs');

CREATE POLICY "Students upload own payment proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Students update own payment proofs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);