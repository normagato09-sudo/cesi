-- =============================================================================
-- CIFA · Parte 33: testimonios con puntuación (fase de alumnos)
-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (proyecto fvswxhfjclvadcoyuqyu), después de la parte 32
-- (supabase/parte32_clases_desde_el_inicio.sql). Se puede ejecutar más de una vez. No borra ni
-- cambia datos, tablas ni funciones de antes: solo añade.
--
-- Qué hace:
--   · testimonials: una valoración (1 a 5 estrellas, texto opcional de hasta 1000 caracteres) por
--     persona y curso (o «General (CIFA)», sin curso). Si vuelve a valorar, se cambia la suya.
--   · Nadie la lee ni la escribe directamente; solo con estas funciones:
--       cesi_testimonials()            todas (para alumnos, equipo y ceo), con el nombre, el papel
--                                       y el curso de quien la escribe, y si la puede borrar.
--       cesi_testimonial_courses()     los cursos que puede valorar quien llama: el alumno, los
--                                       suyos; el profesor, los que da; la ceo y Directivo, todos;
--                                       el resto del equipo, ninguno (solo «General»).
--       cesi_testimonial_save(...)     publica o cambia la suya.
--       cesi_testimonial_delete(id)    borra la suya; la ceo, cualquiera.

do $$
begin
  if position('startDate' in pg_get_functiondef('public.cesi_course_classes(public.courses, timestamptz, timestamptz)'::regprocedure)) = 0 then
    raise exception 'Falta la parte 32 (supabase/parte32_clases_desde_el_inicio.sql): ejecútala antes.';
  end if;
end;
$$;

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- '' = «General (CIFA)»
  course_id text not null default '' check (length(course_id) <= 200),
  rating integer not null check (rating between 1 and 5),
  body text not null default '' check (length(body) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, course_id)
);
create index if not exists testimonials_created_idx on public.testimonials (created_at desc);

alter table public.testimonials enable row level security;
revoke all on public.testimonials from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Ayudas
-- -----------------------------------------------------------------------------

-- La cuenta actual si puede usar Testimonios (ceo, equipo o alumno); si no, error.
create or replace function public.cesi_testimonial_me()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (select 1 from public.profiles where id = v_me and role in ('ceo', 'equipo', 'alumno')) then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- Cursos (ids) que puede valorar una cuenta.
create or replace function public.cesi_testimonial_course_ids(p_profile uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select co.id from public.courses co
  where co.deleted_at is null and co.user_id in (select id from public.profiles where role = 'ceo')
    and (
      exists (select 1 from public.profiles p where p.id = p_profile and (p.role = 'ceo' or (p.role = 'equipo' and p.area = 'direccion')))
      or co.id in (select public.cesi_student_courses(p_profile))
      or co.id in (select public.cesi_teacher_courses(p_profile))
    );
$$;

revoke all on function public.cesi_testimonial_me() from public, anon, authenticated;
revoke all on function public.cesi_testimonial_course_ids(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Leer
-- -----------------------------------------------------------------------------
--   kind         'alumno', 'equipo' o 'ceo'
--   author_role  «Alumno», «CEO», «Profesor» o el nombre de su área
--   course_name  el nombre del curso («General (CIFA)» sin curso; «Curso borrado» si ya no está)
create or replace function public.cesi_testimonials()
returns table (
  id uuid, rating integer, body text, course_id text, course_name text,
  author_name text, author_role text, kind text, mine boolean, can_delete boolean,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_testimonial_me();
  v_ceo boolean := public.is_ceo();
begin
  return query
    select t.id, t.rating, t.body, t.course_id,
      case when t.course_id = '' then 'General (CIFA)'
        else coalesce((select nullif(trim(co.data ->> 'name'), '') from public.courses co
                       where co.id = t.course_id and co.deleted_at is null
                         and co.user_id in (select id from public.profiles where role = 'ceo') limit 1), 'Curso borrado') end,
      public.cesi_person_name(p.id),
      case when p.role = 'alumno' then 'Alumno'
        when p.role = 'ceo' then 'CEO'
        when p.area = 'formacion' then 'Profesor'
        else coalesce((select a.name from public.areas a where a.id = p.area), 'Equipo') end,
      case when p.role in ('alumno', 'ceo') then p.role else 'equipo' end,
      t.author_id = v_me,
      t.author_id = v_me or v_ceo,
      t.created_at, t.updated_at
    from public.testimonials t
    join public.profiles p on p.id = t.author_id
    order by t.updated_at desc;
end;
$$;

-- Cursos que puede valorar quien llama (id y nombre), por nombre.
create or replace function public.cesi_testimonial_courses()
returns table (id text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := public.cesi_testimonial_me();
begin
  return query
    select co.id, coalesce(nullif(trim(co.data ->> 'name'), ''), 'Curso')
    from public.courses co
    where co.deleted_at is null and co.user_id in (select id from public.profiles where role = 'ceo')
      and co.id in (select public.cesi_testimonial_course_ids(v_me))
    order by 2;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escribir
-- -----------------------------------------------------------------------------

-- Publica o cambia la valoración de quien llama para ese curso ('' o null: «General (CIFA)»).
create or replace function public.cesi_testimonial_save(p_course text, p_rating integer, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_testimonial_me();
  v_course text := coalesce(nullif(trim(p_course), ''), '');
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Elige de 1 a 5 estrellas.' using errcode = '22023';
  end if;
  if length(v_body) > 1000 then
    raise exception 'El texto puede tener como mucho 1000 caracteres.' using errcode = '22023';
  end if;
  if v_course <> '' and v_course not in (select public.cesi_testimonial_course_ids(v_me)) then
    raise exception 'Solo puedes valorar tus cursos.' using errcode = '42501';
  end if;
  insert into public.testimonials (author_id, course_id, rating, body)
  values (v_me, v_course, p_rating, v_body)
  on conflict (author_id, course_id) do update
    set rating = excluded.rating, body = excluded.body, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Borra una valoración: la suya; la ceo, cualquiera.
create or replace function public.cesi_testimonial_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.cesi_testimonial_me();
begin
  delete from public.testimonials t where t.id = p_id and (t.author_id = v_me or public.is_ceo());
  if not found then
    raise exception 'Solo puedes borrar tus valoraciones.' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permisos de las funciones
-- -----------------------------------------------------------------------------
revoke all on function public.cesi_testimonials() from public, anon;
revoke all on function public.cesi_testimonial_courses() from public, anon;
revoke all on function public.cesi_testimonial_save(text, integer, text) from public, anon;
revoke all on function public.cesi_testimonial_delete(uuid) from public, anon;
grant execute on function public.cesi_testimonials() to authenticated;
grant execute on function public.cesi_testimonial_courses() to authenticated;
grant execute on function public.cesi_testimonial_save(text, integer, text) to authenticated;
grant execute on function public.cesi_testimonial_delete(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Comprobación: la tabla (true), las 4 funciones con permiso (4) y las ayudas internas sin él
-- (false, false).
select
  to_regclass('public.testimonials') is not null as tabla,
  (select count(*) from unnest(array[
     'public.cesi_testimonials()', 'public.cesi_testimonial_courses()',
     'public.cesi_testimonial_save(text, integer, text)', 'public.cesi_testimonial_delete(uuid)'
   ]) as f (sig) where has_function_privilege('authenticated', f.sig, 'execute')) as funciones_con_permiso,
  has_function_privilege('authenticated', 'public.cesi_testimonial_me()', 'execute') as ayuda_1,
  has_function_privilege('authenticated', 'public.cesi_testimonial_course_ids(uuid)', 'execute') as ayuda_2;
