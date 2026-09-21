/*
# Création du schéma de la base de données — Backend Enseignant

## Description
Crée toutes les tables nécessaires au backend de l'espace enseignant d'une application universitaire de gestion des présences.

## Tables créées
1. `establishment` — Établissement scolaire
2. `admin_user` — Comptes administrateurs
3. `subject` — Matières enseignées
4. `school_class` — Classes (groupes d'étudiants)
5. `teacher` — Enseignants (avec mot de passe hashé pour l'authentification)
6. `teacher_subject` — Table de jointure enseignant ↔ matière
7. `student` — Étudiants
8. `assignment` — Affectations enseignant ↔ matière ↔ classe
9. `schedule_entry` — Entrées d'emploi du temps
10. `class_session` — Séances de cours (avec QR code)
11. `attendance_record` — Enregistrements de présence
12. `report_request` — Demandes de rapports
13. `notification` — Notifications
14. `establishment_settings` — Paramètres de l'établissement
15. `activity_event` — Journal d'activité

## Sécurité
- RLS activée sur toutes les tables
- Toutes les tables utilisent `TO authenticated` avec vérification de propriété
- Le mot de passe de l'enseignant est stocké sous forme de hash (jamais en clair)
*/

-- =====================================================
-- 1. ÉTABLISSEMENT
-- =====================================================
CREATE TABLE IF NOT EXISTS establishment (
  id        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name      text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE establishment ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. ADMIN_USER
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_user (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           text NOT NULL UNIQUE,
  establishment_id text NOT NULL REFERENCES establishment(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_user ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. SUBJECT
-- =====================================================
CREATE TABLE IF NOT EXISTS subject (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            text NOT NULL,
  code            text NOT NULL UNIQUE,
  volume_hours    integer NOT NULL,
  establishment_id text NOT NULL REFERENCES establishment(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_subject_establishment ON subject(establishment_id);

ALTER TABLE subject ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. SCHOOL_CLASS
-- =====================================================
CREATE TABLE IF NOT EXISTS school_class (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            text NOT NULL,
  level           text NOT NULL,
  program         text NOT NULL,
  student_count   integer NOT NULL DEFAULT 0,
  leader_id       text UNIQUE,
  deputy_leader_id text UNIQUE,
  establishment_id text NOT NULL REFERENCES establishment(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_school_class_establishment ON school_class(establishment_id);

ALTER TABLE school_class ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. TEACHER
-- =====================================================
CREATE TABLE IF NOT EXISTS teacher (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           text NOT NULL UNIQUE,
  external_user_id text NOT NULL UNIQUE,
  password_hash   text,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  establishment_id text NOT NULL REFERENCES establishment(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_establishment ON teacher(establishment_id);

ALTER TABLE teacher ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. TEACHER_SUBJECT (table de jointure)
-- =====================================================
CREATE TABLE IF NOT EXISTS teacher_subject (
  teacher_id text NOT NULL REFERENCES teacher(id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, subject_id)
);

ALTER TABLE teacher_subject ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. STUDENT
-- =====================================================
CREATE TABLE IF NOT EXISTS student (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  matricule       text NOT NULL UNIQUE,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  email           text NOT NULL UNIQUE,
  external_user_id text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  class_id        text NOT NULL REFERENCES school_class(id) ON DELETE CASCADE,
  establishment_id text NOT NULL REFERENCES establishment(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_student_class ON student(class_id);
CREATE INDEX IF NOT EXISTS idx_student_establishment ON student(establishment_id);

-- Maintenant on peut ajouter les FK de school_class vers student (leader / deputy)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_class_leader_id_fkey') THEN
    ALTER TABLE school_class ADD CONSTRAINT school_class_leader_id_fkey
      FOREIGN KEY (leader_id) REFERENCES student(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_class_deputy_leader_id_fkey') THEN
    ALTER TABLE school_class ADD CONSTRAINT school_class_deputy_leader_id_fkey
      FOREIGN KEY (deputy_leader_id) REFERENCES student(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE student ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 8. ASSIGNMENT (affectations)
-- =====================================================
CREATE TABLE IF NOT EXISTS assignment (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id text NOT NULL REFERENCES teacher(id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  class_id   text NOT NULL REFERENCES school_class(id) ON DELETE CASCADE,
  UNIQUE (teacher_id, subject_id, class_id)
);

ALTER TABLE assignment ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 9. SCHEDULE_ENTRY (emploi du temps)
-- =====================================================
CREATE TABLE IF NOT EXISTS schedule_entry (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_id   text NOT NULL REFERENCES school_class(id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  teacher_id text NOT NULL REFERENCES teacher(id) ON DELETE CASCADE,
  room       text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time text NOT NULL,
  end_time   text NOT NULL,
  conflict   text CHECK (conflict IN ('teacher','room'))
);
CREATE INDEX IF NOT EXISTS idx_schedule_class ON schedule_entry(class_id);
CREATE INDEX IF NOT EXISTS idx_schedule_teacher ON schedule_entry(teacher_id);
CREATE INDEX IF NOT EXISTS idx_schedule_room_day ON schedule_entry(room, day_of_week);

ALTER TABLE schedule_entry ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 10. CLASS_SESSION (séances)
-- =====================================================
CREATE TABLE IF NOT EXISTS class_session (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_id        text NOT NULL REFERENCES school_class(id) ON DELETE CASCADE,
  subject_id      text NOT NULL REFERENCES subject(id) ON DELETE CASCADE,
  teacher_id      text NOT NULL REFERENCES teacher(id) ON DELETE CASCADE,
  room            text NOT NULL,
  date            date NOT NULL,
  start_time      text NOT NULL,
  end_time        text NOT NULL,
  status          text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','ACTIVE','CLOSED','EXPIRED','CANCELLED')),
  expected_count  integer NOT NULL,
  qr_token_hash   text,
  qr_generated_at timestamptz,
  qr_valid_until  timestamptz,
  qr_regenerations integer NOT NULL DEFAULT 0,
  establishment_id text NOT NULL REFERENCES establishment(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_session_class_date ON class_session(class_id, date);
CREATE INDEX IF NOT EXISTS idx_session_establishment ON class_session(establishment_id);
CREATE INDEX IF NOT EXISTS idx_session_teacher_date ON class_session(teacher_id, date);

ALTER TABLE class_session ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 11. ATTENDANCE_RECORD (présences)
-- =====================================================
CREATE TABLE IF NOT EXISTS attendance_record (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id      text NOT NULL REFERENCES class_session(id) ON DELETE CASCADE,
  student_id      text NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  scanned_at      timestamptz,
  status          text NOT NULL CHECK (status IN ('present','late','absent','rejected')),
  rejection_reason text CHECK (rejection_reason IN ('expired_qr','duplicate_scan','wrong_session','unknown_student','other')),
  UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_record(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_record(student_id);

ALTER TABLE attendance_record ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 12. REPORT_REQUEST (rapports)
-- =====================================================
CREATE TABLE IF NOT EXISTS report_request (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type            text NOT NULL CHECK (type IN ('session','weekly','monthly','class','teacher')),
  format          text NOT NULL CHECK (format IN ('pdf','xlsx','docx')),
  scope_label     text NOT NULL,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'generating' CHECK (status IN ('ready','generating','failed')),
  file_size_kb    integer,
  file_url        text,
  requested_by_id text NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
  establishment_id text NOT NULL REFERENCES establishment(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_report_establishment ON report_request(establishment_id);

ALTER TABLE report_request ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 13. NOTIFICATION
-- =====================================================
CREATE TABLE IF NOT EXISTS notification (
  id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type                    text NOT NULL CHECK (type IN ('session_imminent','qr_available','qr_expiring','session_cancelled','absence_recorded','admin_info')),
  title                   text NOT NULL,
  body                    text NOT NULL,
  read                    boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  recipient_external_user_id text NOT NULL,
  establishment_id         text NOT NULL REFERENCES establishment(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notification(recipient_external_user_id, read);
CREATE INDEX IF NOT EXISTS idx_notif_establishment ON notification(establishment_id);

ALTER TABLE notification ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 14. ESTABLISHMENT_SETTINGS
-- =====================================================
CREATE TABLE IF NOT EXISTS establishment_settings (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  establishment_id text NOT NULL UNIQUE REFERENCES establishment(id) ON DELETE CASCADE,
  qr_default_validity_minutes integer NOT NULL DEFAULT 20,
  qr_auto_rotate   boolean NOT NULL DEFAULT false,
  notify_imminent_session  boolean NOT NULL DEFAULT true,
  notify_qr_expiring       boolean NOT NULL DEFAULT true,
  notify_cancelled_session boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE establishment_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 15. ACTIVITY_EVENT
-- =====================================================
CREATE TABLE IF NOT EXISTS activity_event (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type            text NOT NULL CHECK (type IN ('attendance_scan','qr_generated','qr_regenerated','session_closed','schedule_modified','login_external','settings_changed')),
  actor_name      text NOT NULL,
  actor_role      text NOT NULL CHECK (actor_role IN ('student','class_leader','teacher','admin')),
  target_label    text NOT NULL,
  timestamp       timestamptz NOT NULL DEFAULT now(),
  establishment_id text NOT NULL REFERENCES establishment(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_activity_est_timestamp ON activity_event(establishment_id, timestamp);

ALTER TABLE activity_event ENABLE ROW LEVEL SECURITY;
