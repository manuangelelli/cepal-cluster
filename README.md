# Registro de Asistencia — Clúster CEPAL-DEK v2

## Instrucciones desde cero

### PASO 1: Borrar el proyecto anterior en Supabase

1. Ve a [supabase.com](https://supabase.com) → tu dashboard
2. Click en tu proyecto `cepal-cluster`
3. Ve a **Settings → General** → scroll abajo → **Delete project**
4. Confirma la eliminación

### PASO 2: Crear proyecto nuevo en Supabase

1. Click **New Project**
   - Nombre: `cepal-cluster`
   - Password: genera una y guárdala
   - Región: **South America (São Paulo)**
2. Espera ~2 min
3. Ve a **SQL Editor** → **New query**
4. Pega TODO el contenido de `supabase/schema.sql` → click **Run**
5. Ve a **Settings → API** y copia:
   - **Project URL** (ej: `https://xxxxx.supabase.co`)
   - **anon public key** (la larga que empieza con `eyJ...`)

### PASO 3: Borrar el repo anterior en GitHub

1. Ve a tu repo → **Settings** → scroll hasta abajo → **Delete this repository**
2. Confirma

### PASO 4: Crear repo nuevo y subir

1. Ve a [github.com/new](https://github.com/new)
   - Nombre: `cepal-cluster`
   - **Public** y SIN readme ni gitignore
2. En tu terminal:

```bash
cd cepal-cluster
npm install
git init
git add .
git commit -m "v2 con AM/PM"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/cepal-cluster.git
git push -u origin main
```

### PASO 5: Configurar secrets en GitHub

1. En tu repo → **Settings → Secrets and variables → Actions**
2. **New repository secret:**
   - Name: `VITE_SUPABASE_URL`
   - Value: tu Project URL de Supabase
3. **New repository secret:**
   - Name: `VITE_SUPABASE_ANON_KEY`
   - Value: tu anon key de Supabase

### PASO 6: Activar GitHub Pages

1. **Settings → Pages**
2. Source: **GitHub Actions**

### PASO 7: Esperar al deploy

1. Ve a la pestaña **Actions**
2. Espera a que el workflow termine con check verde (~2-3 min)
3. Tu app estará en: `https://TU-USUARIO.github.io/cepal-cluster/`
