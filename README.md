# Backend Enseignant — Application Universitaire de Gestion des Présences

## Description

Backend NestJS dédié à l'espace enseignant d'une application universitaire.
Stack technique : **NestJS + TypeScript + PostgreSQL + Prisma**.

## Prérequis

- Node.js 18+
- Une base de données PostgreSQL (Supabase par défaut)

## Installation

```bash
npm install
npx prisma generate
```

## Configuration

Le fichier `.env` doit contenir :

```
DATABASE_URL="postgresql://user:password@host:port/database"
JWT_SECRET="votre_secret_jwt"
```

## Démarrage

```bash
# Mode développement
npm run dev

# Mode production
npm run build
npm start
```

## Compte de test

- Email : `amadou.traore@univ-plateau.edu`
- Mot de passe : `password123`

## Routes API

Toutes les routes sont préfixées par `/api` et protégées par JWT + EnseignantGuard.

### Authentification

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/enseignant/auth/login` | Connecte un enseignant et renvoie un jeton JWT |

### Profil

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/enseignant/profil` | Consulter son profil |
| PATCH | `/api/enseignant/profil` | Modifier son prénom et son nom (email et statut non modifiables) |

### Cours

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/enseignant/cours` | Consulter ses cours |
| GET | `/api/enseignant/cours/:id` | Consulter les détails d'un cours |
| GET | `/api/enseignant/classes` | Consulter ses classes |
| GET | `/api/enseignant/classes/:classeId/etudiants` | Consulter les étudiants d'une classe |

### Emploi du temps

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/enseignant/emploi-du-temps` | Consulter son emploi du temps complet |
| GET | `/api/enseignant/emploi-du-temps?jour=1` | Filtrer par jour (1=lundi ... 7=dimanche) |
| GET | `/api/enseignant/emploi-du-temps?jourDebut=1&jourFin=5` | Filtrer par plage de jours |

### Présences

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/enseignant/sessions-presence/actives` | Sessions actives |
| GET | `/api/enseignant/sessions-presence/:id` | Détails d'une session |
| POST | `/api/enseignant/sessions-presence` | Démarrer une session |
| POST | `/api/enseignant/presences` | Enregistrer une présence/absence/retard |
| POST | `/api/enseignant/presences/absence` | Enregistrer une absence |
| POST | `/api/enseignant/presences/retard` | Enregistrer un retard |
| PATCH | `/api/enseignant/presences/:id` | Modifier une présence |
| PATCH | `/api/enseignant/sessions-presence/:id/cloturer` | Clôturer une session |

### Historique

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/enseignant/historique` | Historique des sessions |
| GET | `/api/enseignant/historique/presences` | Présences par classe |
| GET | `/api/enseignant/historique/absences` | Historique des absences |
| GET | `/api/enseignant/historique/retards` | Historique des retards |

### Statistiques

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/enseignant/statistiques` | Statistiques globales |
| GET | `/api/enseignant/statistiques/classes` | Statistiques par classe |
| GET | `/api/enseignant/statistiques/cours` | Statistiques par cours |

### Notifications

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/enseignant/notifications` | Recevoir ses notifications |
| GET | `/api/enseignant/notifications/compteur` | Nombre de non lues |
| PATCH | `/api/enseignant/notifications/:id/lue` | Marquer comme lue |
| PATCH | `/api/enseignant/notifications/toutes-lues` | Marquer toutes comme lues |

## Sécurité

### Guards

1. **JwtAuthGuard** — vérifie la validité du jeton JWT sur chaque requête
2. **EnseignantGuard** — vérifie que l'utilisateur est un enseignant (jamais un admin)

### Permissions appliquées

L'enseignant peut uniquement :
- Accéder à **ses propres cours** (via `teacher_subject` et `assignment`)
- Accéder à **ses classes** (via `assignment`)
- Accéder aux **étudiants de ses classes** (vérification d'affectation)
- Accéder aux **présences de ses sessions** (vérification `teacherId`)
- **Modifier uniquement** les présences des sessions **actives** qu'il possède

L'enseignant ne peut **pas** :
- Gérer les utilisateurs
- Modifier les rôles
- Accéder aux données administrateur
- Modifier les cours d'un autre enseignant
- Modifier une autre classe
- Modifier son email, son statut ou son établissement

### RLS (Row Level Security)

Le RLS est activé sur toutes les tables. Le backend se connecte avec le service role
qui contourne le RLS, mais des politiques restrictives sont en place pour l'accès direct.

## Structure du projet

```
src/
├── main.ts                    # Point d'entrée
├── app.module.ts              # Module racine
├── prisma/                    # Service et module Prisma
├── auth/                      # Authentification JWT
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.module.ts
│   ├── jwt.strategy.ts
│   └── dto/login.dto.ts
├── common/                    # Guards, décorateurs et types partagés
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── enseignant.guard.ts
│   ├── decorators/
│   │   └── current-user.decorator.ts
│   └── types/
│       └── authenticated-request.ts
└── enseignant/                # Module enseignant (toutes les fonctionnalités)
    ├── enseignant.module.ts
    ├── profil/                # Profil enseignant
    ├── cours/                 # Cours, classes, étudiants
    ├── emploi-du-temps/       # Emploi du temps
    ├── presences/             # Sessions et présences
    ├── historique/            # Historique
    ├── statistiques/          # Statistiques
    └── notifications/         # Notifications
```

## Module Étudiant (ajouté)

En plus de l'espace enseignant d'origine, ce backend expose désormais un
espace **étudiant**, monté sous `/api/etudiant/*`, destiné à l'app
`student-app`.

### Différence clé : pas de mot de passe

Contrairement à l'enseignant (login email + mot de passe), l'étudiant est
déjà authentifié sur la plateforme universitaire existante. Le frontend
échange l'identité déjà validée contre un jeton JWT via :

```
POST /api/etudiant/auth/identifier
Body: { "externalUserId": "..." }
→ { "accessToken": "...", "etudiant": { ... } }
```

⚠️ Tel quel, cet endpoint fait confiance à l'`externalUserId` transmis par le
navigateur. En production, il doit être appelé uniquement après une
vérification réelle côté plateforme (assertion signée, appel serveur-à-
serveur, etc.) — voir le commentaire dans `etudiant-auth.service.ts`.

Le jeton se transmet ensuite en `Authorization: Bearer <token>` sur toutes
les routes ci-dessous (guard dédié `EtudiantJwtAuthGuard`, strategy Passport
nommée `jwt-etudiant`, secret `JWT_SECRET_ETUDIANT` — indépendant de celui de
l'enseignant).

### Routes

| Méthode | Route                              | Description |
| ------- | ------------------------------------ | ------------ |
| POST    | `/api/etudiant/auth/identifier`     | Échange l'identité plateforme contre un JWT |
| GET     | `/api/etudiant/profil`              | Profil de l'étudiant connecté (lecture seule) |
| GET     | `/api/etudiant/dashboard`           | Cours du jour, prochain cours, statistiques |
| GET     | `/api/etudiant/emploi-du-temps`     | Emploi du temps de la classe de l'étudiant |
| GET     | `/api/etudiant/cours`               | Séances (passées et à venir) de la classe |
| GET     | `/api/etudiant/presences`           | Historique de présence (`?date=&matiere=&statut=`) |
| POST    | `/api/etudiant/presences/scan`      | Validation d'une présence via QR Code |
| GET     | `/api/etudiant/notifications`       | Notifications de l'étudiant |
| PATCH   | `/api/etudiant/notifications/:id/lue` | Marque une notification comme lue |

### Limite connue : génération du QR Code

Le module enseignant existant ne génère pas encore de `qrTokenHash` sur
`ClassSession` (aucune route de génération de QR trouvée dans le code repris).
En attendant, `POST /api/etudiant/presences/scan` accepte comme `token` soit
l'identifiant de la séance (`ClassSession.id`), soit un futur `qrTokenHash`
une fois cette génération implémentée côté enseignant — la vérification
teste les deux. À adapter dès que la génération réelle du QR sera en place.

### Statuts de présence

Le schéma Prisma ne connaît que `present | late | absent | rejected`, sans
notion d'absence "justifiée". Le mapping vers les libellés attendus par
`student-app` (`present | retard | absent | justifie`) mappe provisoirement
`rejected → justifie` — à revoir si un vrai workflow de justification
d'absence est ajouté au schéma.
#   b a c k e n d - i u a  
 