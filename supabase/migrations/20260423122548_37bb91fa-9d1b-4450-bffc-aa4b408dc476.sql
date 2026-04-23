
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'restaurant', 'student');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  restaurant_id UUID,
  UNIQUE(user_id, role, restaurant_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_restaurant(_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT restaurant_id FROM public.user_roles WHERE user_id = _user_id AND role = 'restaurant' LIMIT 1
$$;

-- Restaurants
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  cuisine TEXT,
  emoji TEXT DEFAULT '🍽️',
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- Menu items
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Mains',
  price NUMERIC(10,2) NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- Orders
CREATE TYPE public.order_status AS ENUM ('pending', 'preparing', 'ready', 'completed', 'cancelled');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  status order_status NOT NULL DEFAULT 'pending',
  total NUMERIC(10,2) NOT NULL,
  pickup_code TEXT NOT NULL DEFAULT upper(substring(md5(random()::text) from 1 for 6)),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id),
  item_name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + assign student role for IBA emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  -- Auto-assign student role for IBA domains
  IF NEW.email LIKE '%@khi.iba.edu.pk' OR NEW.email LIKE '%@iba.edu.pk' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- profiles
CREATE POLICY "users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "admins view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- restaurants - everyone authenticated can view
CREATE POLICY "auth view restaurants" ON public.restaurants FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage restaurants" ON public.restaurants FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "vendors update own restaurant" ON public.restaurants FOR UPDATE USING (id = public.get_user_restaurant(auth.uid()));

-- menu_items
CREATE POLICY "auth view menu items" ON public.menu_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "vendors manage own menu" ON public.menu_items FOR ALL
  USING (restaurant_id = public.get_user_restaurant(auth.uid()))
  WITH CHECK (restaurant_id = public.get_user_restaurant(auth.uid()));
CREATE POLICY "admins manage all menus" ON public.menu_items FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- orders
CREATE POLICY "students view own orders" ON public.orders FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "students create orders" ON public.orders FOR INSERT WITH CHECK (
  auth.uid() = student_id AND public.has_role(auth.uid(), 'student')
);
CREATE POLICY "vendors view their restaurant orders" ON public.orders FOR SELECT
  USING (restaurant_id = public.get_user_restaurant(auth.uid()));
CREATE POLICY "vendors update their restaurant orders" ON public.orders FOR UPDATE
  USING (restaurant_id = public.get_user_restaurant(auth.uid()));
CREATE POLICY "admins view all orders" ON public.orders FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- order_items
CREATE POLICY "students view own order items" ON public.order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.student_id = auth.uid())
);
CREATE POLICY "students insert own order items" ON public.order_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.student_id = auth.uid())
);
CREATE POLICY "vendors view restaurant order items" ON public.order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.restaurant_id = public.get_user_restaurant(auth.uid()))
);
CREATE POLICY "admins view all order items" ON public.order_items FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER TABLE public.menu_items REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;

-- Seed restaurants
INSERT INTO public.restaurants (name, slug, cuisine, emoji, description) VALUES
  ('Gyroverse', 'gyroverse', 'Mediterranean', '🥙', 'Fresh gyros, wraps & bowls'),
  ('Bambou', 'bambou', 'Asian Fusion', '🥢', 'Pan-Asian comfort food'),
  ('Smash & Grill', 'smash-grill', 'Burgers', '🍔', 'Smashed patties & loaded fries'),
  ('United King', 'united-king', 'Desserts & Bakery', '🍰', 'Cakes, pastries & sweets');

-- Seed sample menu items
WITH r AS (SELECT id, slug FROM public.restaurants)
INSERT INTO public.menu_items (restaurant_id, name, description, category, price)
SELECT r.id, m.name, m.description, m.category, m.price FROM r
JOIN (VALUES
  ('gyroverse', 'Chicken Gyro Wrap', 'Grilled chicken, tzatziki, fresh veggies', 'Wraps', 550),
  ('gyroverse', 'Beef Shawarma Bowl', 'Spiced beef over rice with garlic sauce', 'Bowls', 720),
  ('gyroverse', 'Falafel Plate', 'Crispy falafel with hummus and pita', 'Plates', 500),
  ('gyroverse', 'Greek Salad', 'Feta, olives, cucumber, tomato', 'Sides', 380),
  ('bambou', 'Chicken Ramen', 'Rich broth, soft-boiled egg, scallions', 'Ramen', 690),
  ('bambou', 'Beef Bao Buns', 'Two steamed buns with Korean beef', 'Starters', 540),
  ('bambou', 'Veg Hakka Noodles', 'Wok-tossed with seasonal vegetables', 'Noodles', 470),
  ('bambou', 'Sweet & Sour Chicken', 'Crispy chicken in tangy sauce, jasmine rice', 'Mains', 620),
  ('smash-grill', 'Classic Smash Burger', 'Double patty, cheese, secret sauce', 'Burgers', 650),
  ('smash-grill', 'BBQ Bacon Burger', 'Smoky BBQ, crispy bacon, cheddar', 'Burgers', 780),
  ('smash-grill', 'Loaded Cheese Fries', 'Fries with cheese, jalapeños, bacon', 'Sides', 420),
  ('smash-grill', 'Chicken Wings (6 pc)', 'Choice of buffalo or BBQ glaze', 'Sides', 550),
  ('united-king', 'Chocolate Fudge Slice', 'Rich layered chocolate cake', 'Cakes', 380),
  ('united-king', 'Tiramisu Cup', 'Classic Italian dessert in a cup', 'Desserts', 420),
  ('united-king', 'Cheesecake Slice', 'New York style with berry compote', 'Cakes', 450),
  ('united-king', 'Chicken Patty', 'Flaky pastry with spiced chicken', 'Savory', 180)
) AS m(slug, name, description, category, price) ON r.slug = m.slug;
