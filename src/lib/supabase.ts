/**
 * Supabase client singleton.
 *
 * Run the following SQL in your Supabase SQL editor to set up the schema:
 *
 * ── saved_places ─────────────────────────────────────────────────────────────
 *
 *   create table saved_places (
 *     id           text primary key,
 *     name         text not null,
 *     description  text,
 *     category     text,
 *     price        text,
 *     age_group    text,
 *     outdoor      boolean,
 *     postcode     text,
 *     website      text,
 *     lat          double precision not null,
 *     lng          double precision not null,
 *     created_at   timestamptz default now()
 *   );
 *
 *   alter table saved_places enable row level security;
 *   create policy "public read"   on saved_places for select using (true);
 *   create policy "public insert" on saved_places for insert with check (true);
 *   create policy "public delete" on saved_places for delete using (true);
 *
 * ── spotlist ──────────────────────────────────────────────────────────────────
 *
 *   create table spotlist (
 *     id           text primary key,
 *     name         text not null,
 *     description  text,
 *     category     text,
 *     price        text,
 *     age_group    text,
 *     outdoor      boolean,
 *     postcode     text,
 *     website      text,
 *     lat          double precision not null,
 *     lng          double precision not null,
 *     added_at     timestamptz not null,
 *     visited      boolean default false,
 *     created_at   timestamptz default now()
 *   );
 *
 *   alter table spotlist enable row level security;
 *   create policy "public read"   on spotlist for select using (true);
 *   create policy "public insert" on spotlist for insert with check (true);
 *   create policy "public update" on spotlist for update using (true);
 *   create policy "public delete" on spotlist for delete using (true);
 */
import { createClient } from '@supabase/supabase-js';
import { getEnv } from './env';

const url = getEnv('SUPABASE_URL');
const key = getEnv('SUPABASE_ANON_KEY');

export const supabase = url && key ? createClient(url, key) : null;

export type DbPlace = {
  id: string;
  name: string;
  description: string;
  category: string;
  price?: string | null;
  age_group?: string | null;
  outdoor?: boolean | null;
  postcode?: string | null;
  website?: string | null;
  lat: number;
  lng: number;
};

export type DbSpotlistEntry = DbPlace & {
  added_at: string;
  visited: boolean;
};
