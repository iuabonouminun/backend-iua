# Patch — traçabilité du scan étudiant

Sans ce patch, le moteur anti-fraude tourne à vide : aucun appareil, aucune IP,
aucune position n'est enregistrée, donc les règles APPAREIL_PARTAGE,
SCAN_HORS_SITE, SCAN_ECLAIR et COMPTE_MULTI_APPAREILS ne remontent jamais rien.

Trois modifications, toutes additives.

## 1. DTO — fait

Le fichier `src/etudiant/presences/dto/scanner-qr.dto.ts` fourni dans ce
livrable remplace l'ancien.

## 2. Controller — passer la requête au service

Dans `src/etudiant/presences/presences.controller.ts`, la route de scan doit
transmettre l'IP et le user-agent :

```ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

@Post('scan')
async scan(
  @CurrentUser('id') etudiantId: string,
  @Body() dto: ScannerQrDto,
  @Req() req: Request,
) {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    undefined;

  return this.presencesService.submitScan(etudiantId, dto, {
    ip,
    userAgent: req.headers['user-agent'],
  });
}
```

> Si l'API est derrière un proxy (Nginx, Render, Railway), activer
> `app.set('trust proxy', 1)` dans `main.ts`, sinon toutes les IP collectées
> seront celles du proxy et la règle SCAN_ECLAIR deviendra inutilisable.

## 3. Service — enregistrer les métadonnées

Dans `src/etudiant/presences/presences.service.ts`, changer la signature :

```ts
async submitScan(
  etudiantId: string,
  dto: ScannerQrDto,
  meta: { ip?: string; userAgent?: string } = {},
) {
```

puis, dans le `attendanceRecord.create({ data: { ... } })` existant, ajouter :

```ts
method: 'qr',
deviceFingerprint: dto.deviceFingerprint ?? null,
ipAddress: meta.ip ?? null,
userAgent: meta.userAgent?.slice(0, 255) ?? null,
latitude: dto.latitude ?? null,
longitude: dto.longitude ?? null,
accuracyMeters: dto.accuracyMeters ?? null,
```

Toute la logique de validation existante (QR invalide, expiré, mauvaise classe,
déjà présent) reste inchangée.

## 4. Côté student-app — produire l'empreinte

À ajouter dans l'app étudiante, puis envoyer `deviceFingerprint` avec le scan :

```ts
// src/lib/device.ts
export async function empreinteAppareil(): Promise<string> {
  const cle = 'device-fp';
  const existante = localStorage.getItem(cle);
  if (existante) return existante;

  const brut = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
    crypto.randomUUID(),
  ].join('|');

  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(brut),
  );
  const fp = [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);

  localStorage.setItem(cle, fp);
  return fp;
}
```

Ce n'est pas infalsifiable — un étudiant déterminé peut vider son localStorage.
Ça ne vise pas l'attaquant expert : ça rend le partage de QR entre camarades
visible, ce qui couvre l'immense majorité des cas réels. La géolocalisation
(`navigator.geolocation.getCurrentPosition`) doit rester facultative : refusée,
le scan doit continuer de fonctionner, il produit simplement moins de preuve.
