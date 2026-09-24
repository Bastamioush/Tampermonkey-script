# Userscripts Tampermonkey

Collection de scripts utilisateur pour [Tampermonkey](https://www.tampermonkey.net/). Les scripts sont écrits en JavaScript et s'exécutent automatiquement sur les pages correspondant à leur configuration `@match`.

## Installation

### 1. Installer Tampermonkey

1. Installez l'extension Tampermonkey depuis la boutique officielle de votre navigateur : [tampermonkey.net](https://www.tampermonkey.net/).
2. Ouvrez le tableau de bord Tampermonkey depuis l'icône de l'extension.

### 2. Installer un script depuis GitHub

1. Ouvrez le fichier JavaScript voulu dans ce dépôt :
   - [Explain-Userscript.js](Explain-Userscript.js)
   - [quest-ce-que-cest.user.js](quest-ce-que-cest.user.js)
   - [Super-Copie.js](Super-Copie.js)
2. Cliquez sur **Raw** en haut à droite de la page GitHub.
3. Tampermonkey devrait proposer l'installation du script. Cliquez sur **Installer**.
4. Si la fenêtre d'installation ne s'ouvre pas, copiez l'URL de la page Raw, ouvrez le tableau de bord Tampermonkey, choisissez **Utilitaires**, puis utilisez l'importation depuis une URL.
5. Rechargez les pages déjà ouvertes après l'installation.

Pour installer une version locale, ouvrez le fichier `.js` dans VS Code, copiez tout son contenu dans un nouveau script Tampermonkey, puis enregistrez avec `Ctrl+S`.

### 3. Vérifier l'activation

Dans le tableau de bord Tampermonkey, vérifiez que l'interrupteur du script est activé. Les trois scripts ciblent les pages HTTP et HTTPS avec `@match *://*/*`, mais chacun n'affiche son interface que lorsqu'il est nécessaire.

## Vue d'ensemble

| Script | Utilité principale | Déclenchement |
| --- | --- | --- |
| `Explain-Userscript.js` | Simplifier un passage sélectionné avec une API compatible OpenAI | Sélectionner du texte, puis cliquer sur le bouton d'explication |
| `quest-ce-que-cest.user.js` | Inspecter rapidement un élément HTML | Maintenir `Alt` et survoler un élément |
| `Super-Copie.js` | Télécharger la page actuelle et certaines pages redirigées | Cliquer sur **Télécharger cette page** |

## Explain-Userscript.js

### Utilité

Ce script ajoute un bouton **Explain this** près du texte sélectionné. Il envoie le passage à une API compatible avec le format OpenAI Chat Completions et affiche une explication en français simple.

Il est utile pour comprendre rapidement un texte technique, administratif ou difficile, sans quitter la page consultée.

### Utilisation

1. Sélectionnez un passage avec la souris.
2. Cliquez sur le bouton **Explain this** qui apparaît sous la sélection.
3. Lors de la première utilisation, saisissez votre clé API OpenAI.
4. L'explication apparaît dans un panneau en haut à droite.
5. Appuyez sur **Fermer** ou sur `Échap` pour masquer le panneau.

### Fonctionnement

1. Au chargement de la page, le script crée un bouton caché et un panneau de résultat.
2. Les événements `mouseup` et `keyup` permettent de détecter une nouvelle sélection de texte.
3. Le texte est nettoyé des espaces superflus, puis mémorisé.
4. La clé API est enregistrée dans le `localStorage` du site sous la clé `__explain_this_config__`.
5. Le script envoie une requête `POST` à `https://api.openai.com/v1/chat/completions` avec le modèle `gpt-4o-mini` par défaut.
6. La réponse reçue est échappée avant son affichage afin que le texte retourné ne puisse pas être interprété comme du HTML.
7. Les erreurs HTTP, les réponses invalides et les erreurs réseau sont affichées dans le panneau.

### Autorisations et sécurité

- `GM_xmlhttpRequest` autorise la requête vers l'API même si elle est sur un autre domaine.
- `@connect api.openai.com` autorise l'API OpenAI. `localhost` et `127.0.0.1` sont également prévus pour un endpoint local.
- La clé API est conservée dans le navigateur et envoyée avec chaque requête. Ne partagez pas votre profil de navigateur et ne publiez jamais cette clé sur GitHub.
- Le texte sélectionné est envoyé au endpoint configuré. Évitez de sélectionner des informations confidentielles.

### Configuration

La configuration par défaut se trouve au début du script :

```js
const defaultConfig = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    apiKey: ''
};
```

Pour utiliser un service compatible OpenAI ou un serveur local, modifiez `endpoint` et `model`, puis supprimez éventuellement la configuration enregistrée dans le `localStorage` du site afin de repartir de zéro.

## quest-ce-que-cest.user.js

### Utilité

Ce script fonctionne comme un mini outil d'inspection intégré à la page. Il affiche les informations principales de l'élément HTML survolé : balise, classes CSS, identifiant, lien parent, dimensions et événements détectés.

Il permet de comprendre rapidement la structure d'une page sans ouvrir les outils de développement du navigateur.

### Utilisation

1. Maintenez la touche `Alt` enfoncée.
2. Survolez l'élément à examiner.
3. Consultez le panneau qui apparaît en haut à droite.
4. Relâchez `Alt` pour masquer l'inspection.

Le panneau indique aussi la touche d'activation utilisée. L'inspection s'arrête si la fenêtre du navigateur perd le focus.

### Fonctionnement

1. Le script s'exécute à `document-start`, avant que la page soit complètement chargée.
2. Il intercepte `addEventListener` et `removeEventListener` pour compter les types d'événements ajoutés aux éléments HTML pendant que le script est actif.
3. Il écoute `keydown` et `keyup` pour activer ou désactiver le mode inspection avec `Alt`.
4. En mode actif, chaque `pointerover` sur un élément déclenche son analyse.
5. Le panneau affiche les informations lues dans le DOM et les dimensions renvoyées par `getBoundingClientRect()`.
6. Un cadre vert est positionné au-dessus de l'élément inspecté.
7. Le panneau et le cadre sont actualisés pendant le défilement.
8. Les valeurs injectées dans le panneau sont échappées pour éviter d'interpréter le contenu de la page comme du HTML.

### Informations affichées

- **Élément** : nom de la balise, par exemple `button` ou `div`.
- **Classe** : classes CSS présentes sur l'élément.
- **ID** : identifiant HTML, s'il existe.
- **Lien** : URL du lien parent le plus proche, avec ouverture dans un nouvel onglet.
- **Dimensions** : largeur, hauteur et position dans la fenêtre.
- **Événements** : événements enregistrés par le script, attributs `on...` et propriétés d'événement détectables.

### Limites

Le script ne peut afficher que les événements ajoutés après son installation. Les écouteurs ajoutés avant son chargement ou cachés dans certains mécanismes internes du navigateur ne sont pas forcément détectables. Il ne remplace pas les outils de développement pour une inspection complète.

### Autorisations

Le script utilise `@grant none` : il ne demande aucune permission Tampermonkey particulière et fonctionne avec les API normales de la page.

## Super-Copie.js

### Utilité

Ce script ajoute un bouton **Télécharger cette page**. Il enregistre le HTML de la page actuelle et recherche, parmi les liens de la page, ceux qui redirigent vers une autre URL. Les pages redirigées trouvées sont également téléchargées.

Les liens qui ressemblent à des publicités ou à des traceurs sont ignorés pour réduire les téléchargements inutiles.

### Utilisation

1. Ouvrez la page à sauvegarder.
2. Cliquez sur **Télécharger cette page** en bas à droite.
3. Attendez le message **Terminé**.
4. Les fichiers sont créés dans le dossier de téléchargements du navigateur :

```text
Downloads/
└── Page-Titre-de-la-page/
    ├── index.html
    └── redirections/
        └── page-redirigee.html
```

Le titre est nettoyé pour former un nom de dossier compatible avec le système de fichiers. Le dossier principal est nommé `Page-<titre de la page>`.

### Fonctionnement

1. Le script ajoute le bouton, son logo et une zone de statut à la page.
2. Il sauvegarde `document.documentElement.outerHTML` dans `Page-<titre>/index.html`.
3. Il récupère les liens `a[href]`, `iframe[src]` et `area[href]`.
4. Il ignore les URL non HTTP(S), les fragments et les liens publicitaires connus.
5. Il vérifie au maximum 30 liens avec `GM_xmlhttpRequest` et suit les réponses HTTP.
6. Si `response.finalUrl` est différente de l'URL demandée, le contenu reçu est enregistré dans `Page-<titre>/redirections/`.
7. Les noms de fichiers sont construits à partir du dernier élément du chemin URL et reçoivent l'extension `.html`.
8. La zone de statut indique le nombre de redirections enregistrées et de liens ignorés.

### Autorisations et limites

- `GM_download` crée les fichiers dans le dossier de téléchargement configuré par le navigateur. Le script utilise des chemins relatifs pour créer les sous-dossiers.
- `GM_xmlhttpRequest` et `@connect *` permettent de vérifier des liens situés sur d'autres domaines.
- Le script télécharge le HTML, mais ne reconstruit pas automatiquement toutes les ressources associées comme les images, feuilles CSS, scripts ou vidéos.
- Les pages nécessitant une authentification, bloquant les requêtes externes ou renvoyant une erreur peuvent être ignorées.
- Une seule exécution à la fois est autorisée et 30 redirections au maximum sont analysées.

## Permissions Tampermonkey

Les permissions sont déclarées dans l'en-tête de chaque script avec les directives `@grant`, `@connect` et `@resource`.

| Permission | Script | Rôle |
| --- | --- | --- |
| `GM_xmlhttpRequest` | `Explain-Userscript.js`, `Super-Copie.js` | Envoyer des requêtes vers des domaines externes |
| `GM_download` | `Super-Copie.js` | Enregistrer les pages téléchargées |
| `GM_getResourceURL` | `Super-Copie.js` | Charger le logo du bouton |
| `@connect api.openai.com` | `Explain-Userscript.js` | Autoriser l'API OpenAI |
| `@connect localhost`, `127.0.0.1` | `Explain-Userscript.js` | Autoriser un service local compatible |
| `@connect *` | `Super-Copie.js` | Autoriser la vérification de liens sur différents domaines |
| `@grant none` | `quest-ce-que-cest.user.js` | Utiliser uniquement les API normales du navigateur |

## Compatibilité et dépannage

- Si rien ne se passe, vérifiez que Tampermonkey est activé et rechargez la page.
- Si un bouton est absent, vérifiez que le script correspondant est activé dans le tableau de bord.
- Pour `Explain-Userscript.js`, vérifiez la clé API, le modèle et le endpoint configurés.
- Pour `Super-Copie.js`, autorisez les téléchargements multiples si le navigateur affiche une demande de permission.
- Le logo de `Super-Copie.js` est actuellement déclaré comme une ressource locale dans l'en-tête du script. Pour une installation GitHub, remplacez cette ressource par l'URL publique du fichier `Logo.png` ou retirez la ligne `@resource` si le logo n'est pas nécessaire.