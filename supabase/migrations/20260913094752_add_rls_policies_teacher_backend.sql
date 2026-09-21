/*
# Ajout des politiques RLS — Backend Enseignant

## Description
Ajoute des politiques de sécurité au niveau des lignes (RLS) sur toutes les tables.
Le backend NestJS se connecte avec le service role key qui contourne le RLS,
mais ces politiques protègent l'accès direct via l'anon key.

## Sécurité
- Les tables sont verrouillées : seul le service role (backend) peut y accéder
- Aucune politique anon n'est créée car l'accès se fait exclusivement via l'API NestJS
- Les politiques authenticated permettent la lecture de base pour les utilisateurs connectés
*/

-- Les tables ont RLS activé mais aucune politique anon.
-- L'accès se fait via le backend NestJS avec le service role key qui contourne RLS.
-- On ajoute des politiques deny-by-default pour authenticated sur les tables sensibles.

-- Table teacher : un utilisateur authentifié ne peut lire que son propre profil
DROP POLICY IF EXISTS "teacher_select_own" ON teacher;
CREATE POLICY "teacher_select_own" ON teacher
  FOR SELECT TO authenticated
  USING (auth.uid()::text = external_user_id OR id = auth.uid()::text);

-- Table notification : un utilisateur ne peut lire que ses propres notifications
DROP POLICY IF EXISTS "notification_select_own" ON notification;
CREATE POLICY "notification_select_own" ON notification
  FOR SELECT TO authenticated
  USING (recipient_external_user_id = auth.uid()::text);

-- Les autres tables n'ont pas de politique anon/authenticated
-- car l'accès se fait uniquement via le backend NestJS (service role)
