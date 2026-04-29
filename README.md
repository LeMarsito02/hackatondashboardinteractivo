# Hackaton Dashboard Interactivo

Dashboard React + Vite para monitoreo de eventos de seguridad en tiempo real usando Supabase.

## Variables de entorno

Crea un archivo `.env`:

```bash
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<tu-anon-key>
VITE_SUPABASE_STORAGE_BUCKET=security-snapshots
```

## Soporte de imágenes

El dashboard intenta renderizar la imagen en este orden:

1. `image_url` o `snapshot_url` (URL completa `https://...`)
2. `image_path`, `storage_path`, `snapshot_path`, `file_path` o `image_key` (ruta dentro del bucket)

Cuando llega una ruta relativa, la app intenta:

- crear `signed URL` (funciona en buckets privados)
- fallback a `public URL` (funciona en buckets públicos)

## Ejecutar

```bash
npm install
npm run dev
```

## SQL

Aplica `supabase/schema.sql` en Supabase SQL Editor para crear/actualizar tablas, vista y políticas RLS.
