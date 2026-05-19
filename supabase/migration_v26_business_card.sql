-- 客户添加名片字段（用于存储名片图片 URL）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_card TEXT;

-- 可选：创建 Supabase Storage 存储桶（在 Supabase SQL Editor 中执行）
-- INSERT INTO storage.buckets (id, name, public) VALUES ('business-cards', 'business-cards', true)
-- ON CONFLICT (id) DO NOTHING;

-- 可选：允许所有人读取名片图片
-- CREATE POLICY "public_read" ON storage.objects FOR SELECT USING (bucket_id = 'business-cards');
-- CREATE POLICY "auth_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'business-cards' AND auth.role() = 'authenticated');
