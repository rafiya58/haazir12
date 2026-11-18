ALTER TABLE public.order_items
  ALTER COLUMN menu_item_id DROP NOT NULL;

ALTER TABLE public.order_items
  DROP CONSTRAINT order_items_menu_item_id_fkey,
  ADD CONSTRAINT order_items_menu_item_id_fkey
    FOREIGN KEY (menu_item_id)
    REFERENCES public.menu_items(id)
    ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.prevent_deleting_menu_item_in_accepted_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.menu_item_id = OLD.id
      AND o.status IN ('preparing', 'ready')
  ) THEN
    RAISE EXCEPTION 'Cannot delete a menu item that is part of an accepted active order.'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER prevent_deleting_menu_item_in_accepted_order
BEFORE DELETE ON public.menu_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_deleting_menu_item_in_accepted_order();
