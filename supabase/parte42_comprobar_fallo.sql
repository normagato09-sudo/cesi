-- =============================================================================
-- CIFA · Comprobación (SOLO LECTURA) tras el fallo de la parte 42
-- =============================================================================
-- El primer script de la parte 42 falló con «cannot change return type of existing function»
-- al llegar a cesi_task_delete (la de las tareas del equipo, parte 7). El SQL Editor ejecuta todo
-- el script como un único bloque: al fallar, se deshace todo lo anterior. Esta consulta solo LEE
-- para confirmarlo. No cambia nada. Se puede ejecutar las veces que haga falta.
--
-- Lo esperado si no quedó nada a medias:
--   tablas_parte42          0   (course_tasks y task_submissions no existen)
--   columna_task_id         false
--   indice_notas_tareas     false
--   funciones_aula_nuevas   0   (cesi_room_tasks y cesi_course_task_*; antes de ejecutar la parte 42 corregida)
--   cesi_task_save_overloads: solo las del equipo (sin la de 11 argumentos con «timestamptz»)
--   cesi_task_delete_equipo true (sigue siendo la de la parte 7: borra de team_tasks y no devuelve nada)
--   notas_parte36_intactas  true (cesi_grades_course aún no menciona task_id)

select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name in ('course_tasks', 'task_submissions')) as tablas_parte42,
  exists (select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'grades' and column_name = 'task_id') as columna_task_id,
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'grades_task_student_idx') as indice_notas_tareas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname = 'cesi_room_tasks' or p.proname like 'cesi\_course\_task\_%')) as funciones_aula_nuevas,
  (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ' order by p.oid)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cesi_task_save') as cesi_task_save_overloads,
  (select pg_get_function_result(p.oid) = 'void' and position('team_tasks' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'cesi_task_delete' and pg_get_function_identity_arguments(p.oid) = 'p_id uuid') as cesi_task_delete_equipo,
  (select position('task_id' in pg_get_functiondef('public.cesi_grades_course(text)'::regprocedure)) = 0) as notas_parte36_intactas;
