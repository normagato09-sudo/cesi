-- =============================================================================
-- CIFA · Parte 9: calendario único y sin enlace de reservas
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu). Se puede ejecutar más de una
-- vez. No borra datos ni tablas: booking_links, booking_requests y weekly_availability se quedan
-- tal cual, solo dejan de usarse.
--
-- Qué hace:
--   · El enlace de reservas deja de funcionar: nadie (ni con ni sin cuenta) puede ya leer un
--     enlace ni pedir una reunión con él. La página /reservar ya solo dice «Este enlace ya no está
--     disponible».
--   · Para volver a abrirlo bastaría con volver a dar los permisos (las dos líneas «grant» de la
--     parte del enlace de reservas en supabase/schema.sql).

revoke all on function public.cesi_booking_get(text) from public, anon, authenticated;
revoke all on function public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las dos funciones sin permiso para nadie de fuera (debe salir 0 y 0).
select
  (select count(*) from unnest(array['anon', 'authenticated']) as r (role)
     where has_function_privilege(r.role, 'public.cesi_booking_get(text)', 'execute')) as leer_enlace,
  (select count(*) from unnest(array['anon', 'authenticated']) as r (role)
     where has_function_privilege(r.role, 'public.cesi_booking_request(text, timestamptz, int, text, text, text, text, text, text)', 'execute')) as pedir_reunion;
