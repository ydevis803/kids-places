/**
 * Supabase client singleton.
 *
 * Required table (run in Supabase SQL editor):
 *
 *   create table saved_places (
 *     id           text primary key,
 *     name         text not null,
 *     description  text,
 *     category     text,
 *     price        text,
 *     age_group    text,
 *     outdoor      boolean,
 *     lat          double precision not null,
 *     lng          double precision not null,
 *     created_at   timestamptz default now()
 *   );
 *
 *   -- Allow public read/write (no auth) — tighten when you add auth
 *   alter table saved_places enable row level security;
 *   create policy "public read"  on saved_places for select using (true);
 *   create policy "public insert" on saved_places for insert with check (true);
 *   create policy "public delete" on saved_places for delete using (true);
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_ANON_KEY ?? '';

export const supabase = url && key ? createClient(url, key) : null;

export type DbPlace = {
  id: string;
  name: string;
  description: string;
  category: string;
  price?: string | null;
  age_group?: string | null;
  outdoor?: boolean | null;
  lat: number;
  lng: number;
};
