-- =============================================================================
-- CIFA · Parte 5: áreas del equipo (renombrar, añadir y quitar; solo nombres)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 2
-- (supabase/parte2_papeles_permisos.sql). Se puede ejecutar más de una vez.
--
-- Qué hace (quedan 10 áreas, en este orden):
--   Directivo, Profesor, Alianzas, RRHH, Finanzas, Legal, Media, Técnico, Ciberseguridad, Moderación.
--   · Renombra Dirección → Directivo, Formación → Profesor y Personas → RRHH, con el mismo id: las
--     personas que ya las tienen y sus permisos no cambian.
--   · Añade Finanzas, Legal, Media, Técnico, Ciberseguridad y Moderación sin permisos (no ven
--     ninguna pantalla salvo Mi panel).
--   · Quita Comunicación: quien la tenía pasa a «Sin área» y se borran sus permisos de área. Los
--     permisos propios de cada persona no se tocan.
--   · No cambia los permisos de las demás áreas.

do $$
begin
  if to_regclass('public.areas') is null or to_regclass('public.area_permissions') is null then
    raise exception 'Falta la parte 2 (supabase/parte2_papeles_permisos.sql): ejecútala antes.';
  end if;
end;
$$;

-- Quién tiene Comunicación antes de quitarla (sale en la comprobación del final).
drop table if exists pg_temp.cesi_comunicacion_antes;
create temp table cesi_comunicacion_antes as
  select coalesce(nullif(trim(p.display_name), ''), p.email) as quien
  from public.profiles p
  where p.area = 'comunicacion';

-- ---------------------------------------------------------------------------
-- Parte 5: las 10 áreas del equipo (solo nombres y orden)
-- ---------------------------------------------------------------------------
-- Renombradas con el mismo id (quien las tiene y sus permisos no cambian): direccion → Directivo,
-- formacion → Profesor, personas → RRHH. Nuevas sin permisos (todo 'none': solo ven Mi panel).
-- Comunicación se quita: quien la tenía pasa a «Sin área» y se borran sus permisos de área (los
-- permisos propios de cada persona, profile_permissions, se quedan).
insert into public.areas (id, name, sort) values
  ('direccion', 'Directivo', 1),
  ('formacion', 'Profesor', 2),
  ('alianzas', 'Alianzas', 3),
  ('personas', 'RRHH', 4),
  ('finanzas', 'Finanzas', 5),
  ('legal', 'Legal', 6),
  ('media', 'Media', 7),
  ('tecnico', 'Técnico', 8),
  ('ciberseguridad', 'Ciberseguridad', 9),
  ('moderacion', 'Moderación', 10)
on conflict (id) do update set name = excluded.name, sort = excluded.sort;

-- Áreas nuevas: ninguna pantalla (solo las filas que falten; no toca las de las demás áreas).
insert into public.area_permissions (area, screen, level)
select a.id, s.screen, 'none'
from unnest(array['finanzas', 'legal', 'media', 'tecnico', 'ciberseguridad', 'moderacion']) as a (id)
cross join unnest(array['calendario', 'contactos', 'huecos', 'equipo', 'vacantes', 'fichajes', 'cursos', 'alumnos', 'asistencia']) as s (screen)
on conflict (area, screen) do nothing;

-- Quitar Comunicación.
update public.profiles set area = null where area = 'comunicacion';
delete from public.area_permissions where area = 'comunicacion';
delete from public.areas where id = 'comunicacion';

notify pgrst, 'reload schema';

-- Comprobación: las áreas en orden con cuántas personas tiene cada una, «Sin área» y, al final,
-- quién tenía Comunicación (vacío si nadie o si ya se había quitado antes).
select orden, area, id, personas, quienes
from (
  select a.sort as orden, a.name as area, a.id,
    (select count(*) from public.profiles p where p.area = a.id) as personas,
    (select string_agg(coalesce(nullif(trim(p.display_name), ''), p.email), ', ' order by p.email)
       from public.profiles p where p.area = a.id) as quienes
  from public.areas a
  union all
  select 98, 'Sin área (equipo)', null,
    (select count(*) from public.profiles p where p.role = 'equipo' and p.area is null),
    (select string_agg(coalesce(nullif(trim(p.display_name), ''), p.email), ', ' order by p.email)
       from public.profiles p where p.role = 'equipo' and p.area is null)
  union all
  select 99, 'Comunicación (quitada): la tenían', 'comunicacion',
    (select count(*) from cesi_comunicacion_antes),
    (select string_agg(quien, ', ' order by quien) from cesi_comunicacion_antes)
) t
order by orden;
