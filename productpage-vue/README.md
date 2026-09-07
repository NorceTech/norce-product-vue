# Product Page Vue

En produktsida byggd i [Vue 3](https://vuejs.org/) med [Vite](https://vitejs.dev/) och TypeScript.
Projektet visar en detaljerad vy av en produkt, inklusive bildgalleri, specifikationer, kampanjer och relaterade produkter – allt hämtat från lokala JSON-filer.

## 🛠️ Teknisk översikt

* **Vue 3** med `<script setup>` SFC-komponenter
* **Vite** som dev-server och bundler
* **TypeScript** för typkontroll
* **CSS** och Google Fonts för grundläggande styling
* **JSON-filer** för produktdata, relationer, kampanjer och flaggor
* **PowerShell**-verktyg för export av projektfiler

## 📁 Mappstruktur

```text
productpage-vue/
├── public/                   # JSON-filer (produktdata etc.)
├── src/
│   ├── assets/              # CSS, bilder
│   ├── components/          # Vue-komponenter
│   ├── composables/         # Hjälpfunktioner
│   ├── types/               # TypeScript-typer (Product, Flag etc.)
│   └── views/               # Sidkomponenter (t.ex. ProductPage.vue)
├── vite.config.js           # Vite-konfiguration med alias
├── tsconfig.json            # TypeScript-konfiguration
├── package.json             # Projektdefinition och dependencies
└── README.md                # Den här filen
```

## 🚀 Kom igång

### 1. Installera beroenden

```bash
npm install
```

### 2. Starta dev-servern

```bash
npm run dev
```

Appen körs vanligtvis på [http://localhost:5173](http://localhost:5173)

## 🧪 Exportera projektfiler

Ett PowerShell-skript finns i `dump/` för att samla alla relevanta projektfiler i en `.txt`-fil.

```powershell
.\dump\export-project-files.ps1
```

Output sparas med tidsstämpel, t.ex.:

```
project-dump_2025-06-05_10-55-13.txt
```

Inkluderar:

* Alla `.vue`, `.ts`, `.css`, `.json`, `.http`-filer i `src/`
* Vissa filer i projektroten (ex. `vite.config.js`, `README.md`)
* `fetchdata/fetch.http`
* Utesluter `node_modules`, testfiler (`*.spec.ts`) och miljöfiler

## 📌 TODO / framtida förbättringar

* Lägg till stöd för fler språk (lokalisering)
* Lägg till responsivitet för mobilvyer
* Eventuellt koppla på riktig produkt-API istället för statiska filer
* Lägg till tester (unit eller E2E)
* Konvertera `main.js` till `main.ts`

---

### 🧑‍💻 Skapad av

Mattias Örtenblad, 2025
Syfte: Att lära sig Vue, Vite, TypeScript och bygga en komponentdriven frontend.
