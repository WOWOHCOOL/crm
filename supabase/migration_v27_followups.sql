-- Migration v27: 客户状态 + 询盘内容 + 跟进记录
-- 在 Supabase SQL Editor 中执行

-- ============================================================
-- 1. customers 表新增字段
-- ============================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS inquiry_content TEXT;

-- 存量客户默认标记为已成交
UPDATE customers SET status = 'dealt' WHERE status = 'new';

-- ============================================================
-- 2. 跟进记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  next_plan TEXT,
  follow_up_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ============================================================
-- 3. 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_follow_ups_customer ON follow_ups(customer_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_date ON follow_ups(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user ON follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- ============================================================
-- 4. RLS (org-compatible, 与 customers 权限模型一致)
-- ============================================================
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

-- 同组织成员可查看
CREATE POLICY "follow_ups_select" ON follow_ups FOR SELECT USING (
  auth.uid() = user_id OR users_in_same_org(user_id)
);

-- 仅自己能新增
CREATE POLICY "follow_ups_insert" ON follow_ups FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 自己或管理员/主账号可编辑
CREATE POLICY "follow_ups_update" ON follow_ups FOR UPDATE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);

-- 自己或管理员/主账号可删除
CREATE POLICY "follow_ups_delete" ON follow_ups FOR DELETE USING (
  auth.uid() = user_id OR (current_user_is_admin_or_owner() AND users_in_same_org(user_id))
);
