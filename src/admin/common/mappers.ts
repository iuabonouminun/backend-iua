/**
 * Adaptateurs base de données → contrats du front admin-app (types/index.ts).
 * Le front n'est pas modifié pour coller à Prisma : c'est le backend qui
 * expose exactement la forme attendue.
 */

export function mapAttendanceStatus(
  statut: string,
): 'present' | 'absent' | 'late' | 'excused' {
  switch (statut) {
    case 'present':
      return 'present';
    case 'late':
      return 'late';
    case 'rejected':
      return 'excused';
    default:
      return 'absent';
  }
}

export function mapSessionStatus(
  statut: string,
): 'active' | 'expired' | 'closed' | 'pending' {
  switch (statut) {
    case 'ACTIVE':
      return 'active';
    case 'EXPIRED':
      return 'expired';
    case 'CLOSED':
    case 'CANCELLED':
      return 'closed';
    default:
      return 'pending';
  }
}

export function mapUserStatus(
  statut: string,
): 'active' | 'inactive' | 'suspended' {
  return statut === 'suspended' ? 'suspended' : 'active';
}

export function isoDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

export function pourcentage(numerateur: number, denominateur: number): number {
  if (!denominateur) return 0;
  return Math.round((numerateur / denominateur) * 100);
}

const JOURS = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

export function nomDuJour(dayOfWeek: number): string {
  return JOURS[dayOfWeek % 7] ?? 'Lundi';
}

/** "08:30" → minutes depuis minuit. null si le format est invalide. */
export function minutesDepuisMinuit(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Distance en mètres entre deux points GPS (Haversine). */
export function distanceMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Mot de passe temporaire lisible, remis une seule fois à l'admin. */
export function motDePasseTemporaire(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
