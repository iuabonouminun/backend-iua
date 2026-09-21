/**
 * Moteur de détection de fraude — règles pures, sans accès base.
 *
 * Principe : un scan QR ne prouve qu'une chose, c'est qu'un appareil a lu un
 * code. Il ne prouve pas qu'un étudiant était physiquement en cours. Toute la
 * fraude tient dans cet écart. Les règles ci-dessous cherchent les traces que
 * laisse inévitablement un QR relayé (WhatsApp, capture d'écran, téléphone
 * prêté) : même appareil pour plusieurs comptes, scan hors du campus, scan
 * hors du créneau, rafale de scans, présence simultanée dans deux cours.
 *
 * Chaque règle produit une alerte avec une `signature` déterministe : relancer
 * la détection sur la même période ne crée jamais de doublon.
 */
import { distanceMetres, minutesDepuisMinuit } from '../common/mappers';

export type FraudTypeName =
  | 'SCAN_HORS_CRENEAU'
  | 'APPAREIL_PARTAGE'
  | 'COMPTE_MULTI_APPAREILS'
  | 'SCAN_HORS_SITE'
  | 'PRESENCE_SIMULTANEE'
  | 'SCAN_ECLAIR'
  | 'QR_REGENERATIONS_EXCESSIVES'
  | 'PRESENCE_MANUELLE_ABUSIVE'
  | 'COMPTE_SUSPENDU_ACTIF'
  | 'IP_PARTAGEE';

export type Severite = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AlerteCandidate {
  signature: string;
  type: FraudTypeName;
  severity: Severite;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  sessionId?: string | null;
  studentId?: string | null;
  attendanceRecordId?: string | null;
}

/** Vue minimale d'un pointage, telle que chargée par FraudService. */
export interface RecordVue {
  id: string;
  sessionId: string;
  studentId: string;
  status: string;
  method: string;
  scannedAt: Date | null;
  deviceFingerprint: string | null;
  ipAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    status: string;
    classId: string;
  };
  session: {
    id: string;
    date: Date;
    startTime: string;
    endTime: string;
    room: string;
    status: string;
    qrRegenerations: number;
    classId: string;
    subject: { name: string };
    teacher: { firstName: string; lastName: string };
  };
}

export interface ParametresFraude {
  campusLatitude: number | null;
  campusLongitude: number | null;
  campusRadiusMeters: number;
  maxDevicesPerStudent: number;
  maxQrRegenerations: number;
  burstScanWindowSeconds: number;
  burstScanThreshold: number;
  lateToleranceMinutes: number;
}

/** Marge avant le début du cours pendant laquelle un scan reste normal. */
const MARGE_AVANT_COURS_MINUTES = 20;

function horodatage(session: RecordVue['session'], hhmm: string): Date | null {
  const minutes = minutesDepuisMinuit(hhmm);
  if (minutes === null) return null;
  const d = new Date(session.date);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + minutes * 60_000);
}

function nomEtudiant(r: RecordVue): string {
  return `${r.student.firstName} ${r.student.lastName} (${r.student.matricule})`;
}

function libelleSeance(r: RecordVue): string {
  return `${r.session.subject.name} du ${r.session.date
    .toISOString()
    .slice(0, 10)} ${r.session.startTime}`;
}

/* ========================================================================= */
/* Règles                                                                     */
/* ========================================================================= */

/** R1 — Scan en dehors du créneau réel du cours. */
function scanHorsCreneau(
  records: RecordVue[],
  p: ParametresFraude,
): AlerteCandidate[] {
  const out: AlerteCandidate[] = [];

  for (const r of records) {
    if (!r.scannedAt || r.method !== 'qr') continue;
    const debut = horodatage(r.session, r.session.startTime);
    const fin = horodatage(r.session, r.session.endTime);
    if (!debut || !fin) continue;

    const bornetot = debut.getTime() - MARGE_AVANT_COURS_MINUTES * 60_000;
    const borneTard = fin.getTime() + p.lateToleranceMinutes * 60_000;
    const t = r.scannedAt.getTime();
    if (t >= bornetot && t <= borneTard) continue;

    const ecartMinutes = Math.round(
      (t < bornetot ? bornetot - t : t - borneTard) / 60_000,
    );

    out.push({
      signature: `SCAN_HORS_CRENEAU:${r.id}`,
      type: 'SCAN_HORS_CRENEAU',
      severity: ecartMinutes > 120 ? 'HIGH' : 'MEDIUM',
      title: 'Scan en dehors du créneau du cours',
      description: `${nomEtudiant(r)} a été pointé pour ${libelleSeance(r)} avec ${ecartMinutes} minute(s) d'écart avec le créneau autorisé.`,
      evidence: {
        scanneA: r.scannedAt.toISOString(),
        creneau: `${r.session.startTime} - ${r.session.endTime}`,
        ecartMinutes,
        salle: r.session.room,
      },
      sessionId: r.sessionId,
      studentId: r.studentId,
      attendanceRecordId: r.id,
    });
  }
  return out;
}

/** R2 — Un même appareil pointe plusieurs étudiants : cas de fraude le plus courant. */
function appareilPartage(records: RecordVue[]): AlerteCandidate[] {
  const out: AlerteCandidate[] = [];
  const parSessionAppareil = new Map<string, RecordVue[]>();

  for (const r of records) {
    if (!r.deviceFingerprint) continue;
    const cle = `${r.sessionId}|${r.deviceFingerprint}`;
    const liste = parSessionAppareil.get(cle) ?? [];
    liste.push(r);
    parSessionAppareil.set(cle, liste);
  }

  for (const [cle, liste] of parSessionAppareil) {
    const etudiants = new Set(liste.map((r) => r.studentId));
    if (etudiants.size < 2) continue;

    const premier = liste[0];
    out.push({
      signature: `APPAREIL_PARTAGE:${cle}`,
      type: 'APPAREIL_PARTAGE',
      severity: etudiants.size >= 4 ? 'CRITICAL' : 'HIGH',
      title: `Un seul appareil a pointé ${etudiants.size} étudiants`,
      description: `Pour ${libelleSeance(premier)}, ${etudiants.size} présences ont été enregistrées depuis le même appareil. Le QR Code a très probablement été relayé.`,
      evidence: {
        appareil: premier.deviceFingerprint,
        etudiants: liste.map((r) => ({
          id: r.studentId,
          nom: nomEtudiant(r),
          scanneA: r.scannedAt?.toISOString() ?? null,
        })),
        presencesConcernees: liste.map((r) => r.id),
      },
      sessionId: premier.sessionId,
      studentId: null,
      attendanceRecordId: null,
    });
  }
  return out;
}

/** R3 — Un compte étudiant utilisé depuis trop d'appareils différents. */
function compteMultiAppareils(
  records: RecordVue[],
  p: ParametresFraude,
): AlerteCandidate[] {
  const out: AlerteCandidate[] = [];
  const parEtudiant = new Map<string, RecordVue[]>();

  for (const r of records) {
    if (!r.deviceFingerprint) continue;
    const liste = parEtudiant.get(r.studentId) ?? [];
    liste.push(r);
    parEtudiant.set(r.studentId, liste);
  }

  for (const [studentId, liste] of parEtudiant) {
    const appareils = new Set(liste.map((r) => r.deviceFingerprint));
    if (appareils.size <= p.maxDevicesPerStudent) continue;

    out.push({
      signature: `COMPTE_MULTI_APPAREILS:${studentId}:${appareils.size}`,
      type: 'COMPTE_MULTI_APPAREILS',
      severity: appareils.size > p.maxDevicesPerStudent * 2 ? 'HIGH' : 'MEDIUM',
      title: 'Compte utilisé depuis trop d’appareils',
      description: `${nomEtudiant(liste[0])} a pointé depuis ${appareils.size} appareils différents (seuil : ${p.maxDevicesPerStudent}). Identifiants probablement partagés.`,
      evidence: {
        nombreAppareils: appareils.size,
        seuil: p.maxDevicesPerStudent,
        appareils: [...appareils],
      },
      sessionId: null,
      studentId,
      attendanceRecordId: null,
    });
  }
  return out;
}

/** R4 — Scan géolocalisé hors du campus. */
function scanHorsSite(
  records: RecordVue[],
  p: ParametresFraude,
): AlerteCandidate[] {
  if (p.campusLatitude === null || p.campusLongitude === null) return [];
  const out: AlerteCandidate[] = [];

  for (const r of records) {
    if (r.latitude === null || r.longitude === null) continue;
    const d = distanceMetres(
      p.campusLatitude,
      p.campusLongitude,
      r.latitude,
      r.longitude,
    );
    if (d <= p.campusRadiusMeters) continue;

    out.push({
      signature: `SCAN_HORS_SITE:${r.id}`,
      type: 'SCAN_HORS_SITE',
      severity: d > p.campusRadiusMeters * 5 ? 'CRITICAL' : 'HIGH',
      title: 'Présence validée hors du campus',
      description: `${nomEtudiant(r)} a été pointé à ${d} m du campus (rayon autorisé : ${p.campusRadiusMeters} m) pour ${libelleSeance(r)}.`,
      evidence: {
        distanceMetres: d,
        rayonAutorise: p.campusRadiusMeters,
        position: { latitude: r.latitude, longitude: r.longitude },
      },
      sessionId: r.sessionId,
      studentId: r.studentId,
      attendanceRecordId: r.id,
    });
  }
  return out;
}

/** R5 — Même étudiant présent dans deux cours qui se chevauchent. */
function presenceSimultanee(records: RecordVue[]): AlerteCandidate[] {
  const out: AlerteCandidate[] = [];
  const parEtudiant = new Map<string, RecordVue[]>();

  for (const r of records) {
    if (r.status === 'absent') continue;
    const liste = parEtudiant.get(r.studentId) ?? [];
    liste.push(r);
    parEtudiant.set(r.studentId, liste);
  }

  for (const [studentId, liste] of parEtudiant) {
    const parJour = new Map<string, RecordVue[]>();
    for (const r of liste) {
      const jour = r.session.date.toISOString().slice(0, 10);
      const l = parJour.get(jour) ?? [];
      l.push(r);
      parJour.set(jour, l);
    }

    for (const [jour, duJour] of parJour) {
      for (let i = 0; i < duJour.length; i += 1) {
        for (let j = i + 1; j < duJour.length; j += 1) {
          const a = duJour[i];
          const b = duJour[j];
          if (a.sessionId === b.sessionId) continue;

          const debutA = minutesDepuisMinuit(a.session.startTime);
          const finA = minutesDepuisMinuit(a.session.endTime);
          const debutB = minutesDepuisMinuit(b.session.startTime);
          const finB = minutesDepuisMinuit(b.session.endTime);
          if ([debutA, finA, debutB, finB].some((v) => v === null)) continue;
          if (!(debutA! < finB! && debutB! < finA!)) continue;

          const paire = [a.sessionId, b.sessionId].sort().join('~');
          out.push({
            signature: `PRESENCE_SIMULTANEE:${studentId}:${jour}:${paire}`,
            type: 'PRESENCE_SIMULTANEE',
            severity: 'HIGH',
            title: 'Présence dans deux cours en même temps',
            description: `${nomEtudiant(a)} est marqué présent le ${jour} sur deux séances qui se chevauchent : ${a.session.subject.name} (${a.session.startTime}-${a.session.endTime}) et ${b.session.subject.name} (${b.session.startTime}-${b.session.endTime}).`,
            evidence: {
              jour,
              seanceA: {
                id: a.sessionId,
                matiere: a.session.subject.name,
                creneau: `${a.session.startTime}-${a.session.endTime}`,
                salle: a.session.room,
              },
              seanceB: {
                id: b.sessionId,
                matiere: b.session.subject.name,
                creneau: `${b.session.startTime}-${b.session.endTime}`,
                salle: b.session.room,
              },
              presencesConcernees: [a.id, b.id],
            },
            sessionId: a.sessionId,
            studentId,
            attendanceRecordId: a.id,
          });
        }
      }
    }
  }
  return out;
}

/** R6 — Rafale de scans depuis une même IP : un téléphone qui enchaîne les comptes. */
function scanEclair(
  records: RecordVue[],
  p: ParametresFraude,
): AlerteCandidate[] {
  const out: AlerteCandidate[] = [];
  const groupes = new Map<string, RecordVue[]>();

  for (const r of records) {
    if (!r.scannedAt || !r.ipAddress) continue;
    const cle = `${r.sessionId}|${r.ipAddress}`;
    const l = groupes.get(cle) ?? [];
    l.push(r);
    groupes.set(cle, l);
  }

  const fenetre = p.burstScanWindowSeconds * 1000;

  for (const [cle, liste] of groupes) {
    if (liste.length < p.burstScanThreshold) continue;
    const tries = [...liste].sort(
      (a, b) => a.scannedAt!.getTime() - b.scannedAt!.getTime(),
    );

    for (let i = 0; i + p.burstScanThreshold - 1 < tries.length; i += 1) {
      const debut = tries[i];
      const fin = tries[i + p.burstScanThreshold - 1];
      if (fin.scannedAt!.getTime() - debut.scannedAt!.getTime() > fenetre) continue;

      const lot = tries.slice(i, i + p.burstScanThreshold);
      const etudiants = new Set(lot.map((r) => r.studentId));
      if (etudiants.size < 2) break;

      out.push({
        signature: `SCAN_ECLAIR:${cle}:${debut.scannedAt!.toISOString()}`,
        type: 'SCAN_ECLAIR',
        severity: 'HIGH',
        title: 'Rafale de scans depuis une même adresse IP',
        description: `${lot.length} présences de ${etudiants.size} étudiants différents ont été enregistrées en moins de ${p.burstScanWindowSeconds} secondes depuis la même adresse IP sur ${libelleSeance(debut)}.`,
        evidence: {
          ip: debut.ipAddress,
          fenetreSecondes: p.burstScanWindowSeconds,
          scans: lot.map((r) => ({
            presenceId: r.id,
            etudiant: nomEtudiant(r),
            scanneA: r.scannedAt!.toISOString(),
          })),
        },
        sessionId: debut.sessionId,
        studentId: null,
        attendanceRecordId: null,
      });
      break; // une alerte par groupe suffit
    }
  }
  return out;
}

/** R7 — QR régénéré de façon excessive sur une séance. */
function qrRegenerationsExcessives(
  records: RecordVue[],
  p: ParametresFraude,
): AlerteCandidate[] {
  const vues = new Map<string, RecordVue>();
  for (const r of records) if (!vues.has(r.sessionId)) vues.set(r.sessionId, r);

  const out: AlerteCandidate[] = [];
  for (const [sessionId, r] of vues) {
    if (r.session.qrRegenerations <= p.maxQrRegenerations) continue;
    out.push({
      signature: `QR_REGENERATIONS_EXCESSIVES:${sessionId}:${r.session.qrRegenerations}`,
      type: 'QR_REGENERATIONS_EXCESSIVES',
      severity: 'MEDIUM',
      title: 'QR Code régénéré un nombre inhabituel de fois',
      description: `${libelleSeance(r)} : ${r.session.qrRegenerations} régénérations du QR Code (seuil : ${p.maxQrRegenerations}). À vérifier avec ${r.session.teacher.firstName} ${r.session.teacher.lastName}.`,
      evidence: {
        regenerations: r.session.qrRegenerations,
        seuil: p.maxQrRegenerations,
        enseignant: `${r.session.teacher.firstName} ${r.session.teacher.lastName}`,
      },
      sessionId,
      studentId: null,
      attendanceRecordId: null,
    });
  }
  return out;
}

/** R8 — Séance validée majoritairement à la main, sans scan. */
function presenceManuelleAbusive(records: RecordVue[]): AlerteCandidate[] {
  const parSession = new Map<string, RecordVue[]>();
  for (const r of records) {
    const l = parSession.get(r.sessionId) ?? [];
    l.push(r);
    parSession.set(r.sessionId, l);
  }

  const out: AlerteCandidate[] = [];
  for (const [sessionId, liste] of parSession) {
    const manuelles = liste.filter((r) => r.method === 'manual');
    if (manuelles.length < 5) continue;
    const ratio = manuelles.length / liste.length;
    if (ratio < 0.6) continue;

    const r = liste[0];
    out.push({
      signature: `PRESENCE_MANUELLE_ABUSIVE:${sessionId}`,
      type: 'PRESENCE_MANUELLE_ABUSIVE',
      severity: ratio === 1 ? 'HIGH' : 'MEDIUM',
      title: 'Séance pointée presque entièrement à la main',
      description: `${libelleSeance(r)} : ${manuelles.length} présences sur ${liste.length} saisies manuellement (${Math.round(ratio * 100)} %). Le QR Code a été contourné.`,
      evidence: {
        manuelles: manuelles.length,
        total: liste.length,
        ratio: Math.round(ratio * 100),
        enseignant: `${r.session.teacher.firstName} ${r.session.teacher.lastName}`,
      },
      sessionId,
      studentId: null,
      attendanceRecordId: null,
    });
  }
  return out;
}

/** R9 — Présence enregistrée pour un compte suspendu. */
function compteSuspenduActif(records: RecordVue[]): AlerteCandidate[] {
  return records
    .filter((r) => r.student.status === 'suspended' && r.status !== 'absent')
    .map((r) => ({
      signature: `COMPTE_SUSPENDU_ACTIF:${r.id}`,
      type: 'COMPTE_SUSPENDU_ACTIF' as const,
      severity: 'CRITICAL' as const,
      title: 'Présence enregistrée sur un compte suspendu',
      description: `${nomEtudiant(r)} est suspendu mais une présence a été validée pour ${libelleSeance(r)}.`,
      evidence: {
        statutCompte: r.student.status,
        methode: r.method,
        scanneA: r.scannedAt?.toISOString() ?? null,
      },
      sessionId: r.sessionId,
      studentId: r.studentId,
      attendanceRecordId: r.id,
    }));
}

/** R10 — Beaucoup d'étudiants derrière une même IP (signal faible : wifi campus). */
function ipPartagee(records: RecordVue[]): AlerteCandidate[] {
  const groupes = new Map<string, Set<string>>();
  const exemples = new Map<string, RecordVue>();

  for (const r of records) {
    if (!r.ipAddress) continue;
    const cle = `${r.sessionId}|${r.ipAddress}`;
    const s = groupes.get(cle) ?? new Set<string>();
    s.add(r.studentId);
    groupes.set(cle, s);
    if (!exemples.has(cle)) exemples.set(cle, r);
  }

  const out: AlerteCandidate[] = [];
  for (const [cle, etudiants] of groupes) {
    if (etudiants.size < 8) continue;
    const r = exemples.get(cle)!;
    out.push({
      signature: `IP_PARTAGEE:${cle}`,
      type: 'IP_PARTAGEE',
      severity: 'LOW',
      title: 'Nombreux scans derrière une même adresse IP',
      description: `${etudiants.size} étudiants ont pointé depuis la même adresse IP sur ${libelleSeance(r)}. Normal si le campus partage une connexion, suspect en cas de partage de connexion mobile.`,
      evidence: { ip: r.ipAddress, nombreEtudiants: etudiants.size },
      sessionId: r.sessionId,
      studentId: null,
      attendanceRecordId: null,
    });
  }
  return out;
}

/* ========================================================================= */

/** Exécute toutes les règles et renvoie les alertes candidates dédupliquées. */
export function detecterFraudes(
  records: RecordVue[],
  parametres: ParametresFraude,
): AlerteCandidate[] {
  const alertes = [
    ...scanHorsCreneau(records, parametres),
    ...appareilPartage(records),
    ...compteMultiAppareils(records, parametres),
    ...scanHorsSite(records, parametres),
    ...presenceSimultanee(records),
    ...scanEclair(records, parametres),
    ...qrRegenerationsExcessives(records, parametres),
    ...presenceManuelleAbusive(records),
    ...compteSuspenduActif(records),
    ...ipPartagee(records),
  ];

  const parSignature = new Map<string, AlerteCandidate>();
  for (const a of alertes) parSignature.set(a.signature, a);
  return [...parSignature.values()];
}

export const POIDS_SEVERITE: Record<Severite, number> = {
  LOW: 1,
  MEDIUM: 3,
  HIGH: 7,
  CRITICAL: 12,
};
