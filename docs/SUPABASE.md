# Supabase

Repozytorium zawiera standardową strukturę Supabase:

- `supabase/migrations/` — migracje bazy;
- `supabase/functions/` — Edge Functions.

Nigdy nie umieszczaj w repozytorium `SUPABASE_SERVICE_ROLE_KEY`. Klucz publikowalny używany przez frontend może być publiczny, natomiast wszystkie operacje administracyjne muszą pozostać chronione przez RLS, RPC i Edge Functions.
