-- Migration v28: Create storage buckets for images
-- Run this in Supabase SQL Editor

-- ============================================================
-- 1. Product images bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/png','image/jpeg','image/gif','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read
DROP POLICY IF EXISTS "public_read_product_images" ON storage.objects;
CREATE POLICY "public_read_product_images" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

-- Allow authenticated users to upload
DROP POLICY IF EXISTS "auth_upload_product_images" ON storage.objects;
CREATE POLICY "auth_upload_product_images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- Allow users to delete their own uploads
DROP POLICY IF EXISTS "auth_delete_product_images" ON storage.objects;
CREATE POLICY "auth_delete_product_images" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- ============================================================
-- 2. Business cards bucket (ensure it exists)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('business-cards', 'business-cards', true, 5242880, ARRAY['image/png','image/jpeg','image/gif','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "public_read_business_cards" ON storage.objects;
CREATE POLICY "public_read_business_cards" ON storage.objects
  FOR SELECT USING (bucket_id = 'business-cards');

DROP POLICY IF EXISTS "auth_upload_business_cards" ON storage.objects;
CREATE POLICY "auth_upload_business_cards" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'business-cards' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_delete_business_cards" ON storage.objects;
CREATE POLICY "auth_delete_business_cards" ON storage.objects
  FOR DELETE USING (bucket_id = 'business-cards' AND auth.role() = 'authenticated');
