ALTER TABLE public.orders
ADD COLUMN pickup_time timestamp with time zone,
ADD COLUMN service_fee numeric NOT NULL DEFAULT 25;