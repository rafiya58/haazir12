ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS image_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-item-images', 'menu-item-images', true, 1048576, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Anyone can view menu item images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'menu-item-images');

CREATE POLICY "Vendors upload own menu item images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'menu-item-images'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'vendor'
      AND restaurant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Vendors delete own menu item images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'menu-item-images'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'vendor'
      AND restaurant_id::text = (storage.foldername(name))[1]
  )
);
