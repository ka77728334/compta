# compta

Application Windows pour préparer l'Einnahmenüberschussrechnung (EÜR), la TVA (UStVA) et ranger les justificatifs. Indépendant à Munich — Karim Dabbèche.

## Installer

1. Page **Releases** du dépôt → télécharger `compta-setup-x.y.z.exe`.
2. Lancer. Si Windows affiche « Windows a protégé votre ordinateur » : **Informations complémentaires** → **Exécuter quand même** (l'application n'est pas signée).
3. Les mises à jour se proposent toutes seules au démarrage.

## Où sont mes données ?

`Documents\compta` (changeable : menu **Fichier → Choisir un autre dossier de données**).

| Dossier / fichier | Contenu |
|---|---|
| `compta-data.json` | toutes les transactions, factures, règles, constantes |
| `Justificatifs\` | factures et tickets joints (vrais fichiers) |
| `Sauvegardes\` | une copie des données par jour (60 jours) |
| `Exports\` | Excel, PDF, CSV, ZIP exportés |

Les mises à jour et la désinstallation ne touchent jamais à ce dossier.

## Reprendre les données de la version en ligne

Dans la version en ligne : **récap EÜR → Sauvegarde → Télécharger (JSON)**.
Dans l'application : **récap EÜR → Restaurer une sauvegarde** et choisir ce fichier.

## Publier une nouvelle version (développement)

1. Monter `version` dans `package.json` (ex. `0.1.1`).
2. Commit et push sur `main`.
3. GitHub Actions voit qu'il n'existe pas encore de Release `v0.1.1`, fabrique l'installateur et le publie dans **Releases** ; les applications installées le proposent au démarrage.

Développement local : `npm install` puis `npm start`.

## Contenu

- `app/index.html` — l'interface (même code que la version en ligne ; détecte l'application via `window.compta`).
- `main.js` — fenêtre, dossier de données, justificatifs, exports, menu, mises à jour.
- `preload.js` — pont sécurisé entre l'interface et Windows.
- `app/fonts/` — police Inter (SIL Open Font License, voir `LICENSE-Inter.txt`).
