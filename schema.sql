-- ============================================
-- Registro Asistencia Clúster CEPAL-DEK
-- Schema completo (con soporte AM/PM)
-- ============================================

CREATE TABLE people (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  initials TEXT NOT NULL,
  name TEXT NOT NULL,
  area TEXT DEFAULT '',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE desks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  office TEXT NOT NULL,
  desk TEXT NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'maintenance')),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_key TEXT NOT NULL,
  day_index INT NOT NULL CHECK (day_index BETWEEN 0 AND 4),
  desk_id UUID NOT NULL REFERENCES desks(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  period TEXT NOT NULL DEFAULT 'AM' CHECK (period IN ('AM', 'PM')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(week_key, day_index, desk_id, period)
);

CREATE INDEX idx_attendance_week ON attendance(week_key);
CREATE INDEX idx_attendance_person ON attendance(person_id);
CREATE INDEX idx_attendance_desk ON attendance(desk_id);

CREATE TABLE holidays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  block_am BOOLEAN DEFAULT true,
  block_pm BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_holidays_date ON holidays(date);

-- Datos iniciales
INSERT INTO people (initials, name, area) VALUES
  ('CS', 'Cesar Sandino', ''),
  ('ZN', 'Zara Nieto', ''),
  ('AG', 'Audrey Gramcko', ''),
  ('FK', 'Fabian Klein', ''),
  ('BS', 'Barbara Scholz', ''),
  ('CM', 'Carlos Mohr', ''),
  ('IC', 'Israel Cuenca', ''),
  ('AO', 'Angela Oblasser', ''),
  ('PM', 'Pamela Martinez', ''),
  ('EZ', 'Eva Zuñiga', ''),
  ('NSi', 'Nora Sieverding', ''),
  ('MN', 'Manuel Novoa', ''),
  ('NSe', 'Nicolas Seelmann', ''),
  ('AL', 'Annekatrin Leis', ''),
  ('NL', 'Nicolas Lillo', ''),
  ('MH', 'Maída Hernandez', ''),
  ('MA', 'Manuela Angelelli', ''),
  ('GC', 'Gloria Contreras', ''),
  ('GF', 'Gabriela Fuentes', ''),
  ('FS', 'Franziska Seiffarth', '');

INSERT INTO desks (office, desk, status, sort_order) VALUES
  ('Oficina 206', 'Escritorio 1', 'available', 1),
  ('Oficina 206', 'Escritorio 2', 'available', 2),
  ('Oficina 207', 'Escritorio 1', 'reserved', 3),
  ('Oficina 208', 'Escritorio 1', 'available', 4),
  ('Oficina 208', 'Escritorio 2', 'available', 5),
  ('Oficina 209', 'Escritorio 1', 'available', 6),
  ('Ed. CLADES', 'CLD-209-A', 'available', 7),
  ('Ed. CLADES', 'CLD-209-G', 'available', 8),
  ('Ed. CLADES', 'CLD-209-H', 'available', 9),
  ('Ed. CLADES', 'CLD-209-I', 'available', 10);

-- Row Level Security
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE desks ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_people" ON people FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_desks" ON desks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_attendance" ON attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_holidays" ON holidays FOR ALL USING (true) WITH CHECK (true);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Activar Realtime en las 4 tablas
ALTER PUBLICATION supabase_realtime ADD TABLE people;
ALTER PUBLICATION supabase_realtime ADD TABLE desks;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE holidays;
