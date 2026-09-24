# Cómo publicar el registro de asistencia (sin programar)

Necesitas: una cuenta de GitHub y una de Supabase (ambas gratis). El link final
será https://USUARIO.github.io/cepal-cluster/ — por eso conviene crear la cuenta
de GitHub con el nombre que quieres que aparezca (p. ej. manuela-angelelli).

## 1. Base de datos (Supabase)
1. supabase.com → New project → nombre `cepal-cluster`, región São Paulo.
2. SQL Editor → New query → pega TODO `supabase/schema.sql` → Run.
   (Ya trae las 20 personas y los escritorios.)
3. Settings → API: copia **Project URL** y **anon public key**.

## 2. Código (GitHub)
1. github.com/new → nombre exacto `cepal-cluster`, Public → Create.
2. "uploading an existing file" → arrastra todo el contenido de esta carpeta
   (src, public, supabase, index.html, package.json, vite.config.js...) → Commit.
3. Add file → Create new file → en el nombre escribe
   `.github/workflows/deploy.yml` → pega el contenido de `deploy.yml` → Commit.

## 3. Conectar ambos
1. Repo → Settings → Secrets and variables → Actions → New repository secret:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
2. Settings → Pages → Source: **GitHub Actions**.
3. Pestaña Actions → "Deploy to GitHub Pages" → Run workflow (o haz cualquier
   commit). Cuando salga el check verde (~3 min), el link está listo.
