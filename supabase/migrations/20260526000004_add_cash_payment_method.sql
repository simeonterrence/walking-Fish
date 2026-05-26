-- Add 'cash' and 'wave' to the payment_method check constraint on orders table.
-- The scanner's /confirm-payment endpoint sets payment_method to 'cash' or 'wave'
-- for booth top-ups and on-site ticket creation, but the constraint only allowed
-- 'modempay' and 'wave_transfer'.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check,
  ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('modempay', 'wave_transfer', 'cash', 'wave'));
