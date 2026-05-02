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
);

-- We will additionally filter menu_items in the UI by a separate "is_listed" flag,
-- but to avoid schema sprawl we instead delete only the items NOT referenced anywhere.
DELETE FROM public.menu_items
WHERE restaurant_id IN (
  'b9a488a3-6fbd-4329-b376-0e90576af98f',
  '70a078b7-ae38-4708-a2e8-aa72604b1fae',
  '7042a451-28f4-4174-bf7b-df14d044a858',
  'af6b5a66-122d-47bc-b8f3-2674f28ba70b'
)
AND id NOT IN (SELECT menu_item_id FROM public.order_items WHERE menu_item_id IS NOT NULL);

-- 3. Insert fresh Gyroverse menu
INSERT INTO public.menu_items (restaurant_id, name, description, price, category, is_available) VALUES
('b9a488a3-6fbd-4329-b376-0e90576af98f', 'The Classic', 'Pita, Juicy Chicken, Hummus, Lettuce, Pickles, Cucumber, Sauce, Jalapenos', 250, 'Desi', true),
('b9a488a3-6fbd-4329-b376-0e90576af98f', 'The Loaded', 'Pita, Cheese, Juicy Chicken, French Fries, Hummus, Jalapenos, Lettuce, Pickles, Cucumber, Sauce', 350, 'Desi', true),
('b9a488a3-6fbd-4329-b376-0e90576af98f', 'The Sulemani', 'Pita, Juicy Chicken, Hummus, Jalapenos, Pickles, Cucumber, Sauce', 240, 'Desi', true),
('b9a488a3-6fbd-4329-b376-0e90576af98f', 'The OG', 'Tortilla, Juicy Chicken, French Fries, Hummus, Jalapenos, Lettuce, Pickles, Sauce', 350, 'Arabic', true),
('b9a488a3-6fbd-4329-b376-0e90576af98f', 'Special Arabic', 'Tortilla, Cheese, Juicy Chicken, French Fries, Hummus, Jalapenos, Lettuce, Pickles, Sauce', 400, 'Arabic', true),
('b9a488a3-6fbd-4329-b376-0e90576af98f', 'All Veggies', 'Tortilla, Hummus, Lettuce, Pickles, Jalapenos, French Fries, Cucumber', 300, 'Arabic', true),
('b9a488a3-6fbd-4329-b376-0e90576af98f', 'Pepsi', NULL, 90, 'Beverages', true),
('b9a488a3-6fbd-4329-b376-0e90576af98f', 'Mirinda', NULL, 90, 'Beverages', true),
('b9a488a3-6fbd-4329-b376-0e90576af98f', '7UP', NULL, 90, 'Beverages', true),
('b9a488a3-6fbd-4329-b376-0e90576af98f', 'Water', NULL, 70, 'Beverages', true),
('b9a488a3-6fbd-4329-b376-0e90576af98f', 'Gatorade', NULL, 120, 'Beverages', true);

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