// Generiert automatisch den wöchentlichen LinkedIn-Wochenplan für ZYNTEVO
// und schreibt das Ergebnis nach data/wochenplan.json.
// Läuft als GitHub Actions Workflow, unabhängig von jedem lokalen Rechner.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const contextPath = path.join(dataDir, 'context.md');
const outputPath = path.join(dataDir, 'wochenplan.json');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY fehlt (als GitHub Secret hinterlegen).');
  process.exit(1);
}

let vaultContext = '';
try {
  vaultContext = readFileSync(contextPath, 'utf-8');
} catch (e) {
  console.warn('Kein data/context.md gefunden, generiere ohne Zusatzkontext.');
}

function mondayOfCurrentWeek(d = new Date()) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Montag = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

const monday = mondayOfCurrentWeek(new Date());
const weekOfStr = isoDate(monday);

const systemPrompt = `Du bist der Social-Media-Content-Assistent für ZYNTEVO, eine KI-Automatisierungs-Agentur für deutsche KMU.
Positionierung: KI-Automatisierung ohne Buzzwords, konkrete Ergebnisse. Content-Säulen: Bildung 40%, Beweis 30%, Persönlich 20%, Angebot 10%.
Aktuell wird AUSSCHLIESSLICH LinkedIn bespielt, Instagram und TikTok sind pausiert, erzeuge dafür keine Inhalte.
Wochenmuster (nur LinkedIn): Mo=Gründer-Einblick, Mi=Fallstudie, Fr=Bildungspost.
LinkedIn-Ton: Sie-Form, professionell mit persönlichem Einschlag, kurze Absätze, konkrete Zahlen, starke erste Zeile, max 3-5 Hashtags, keine Gedankenstriche, keine KI-Floskeln, kein Eigenlob ohne Substanz.
Verteile die Zielgruppen (Handwerker, Immobilienmakler, Steuerberater, Allgemein) gemischt über die drei Posts.

Unternehmens-Kontext (ZYNTEVO):
${vaultContext}

Erzeuge ausschließlich die drei LinkedIn-Posts für Mo, Mi und Fr, keine weiteren Tage oder Plattformen.

Gib die Antwort AUSSCHLIESSLICH in folgendem Format zurück, für jeden Post einen Block, direkt hintereinander, KEIN JSON, KEIN Markdown-Codeblock, keine Erklärung davor oder danach:

===POST===
TAG: Mo
PLATTFORM: linkedin
TYP: Gründer-Einblick
ZIELGRUPPE: Allgemein
TEXT:
Der vollständige, fertige Post-Text kommt hier hin.
===ENDE===`;

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Erstelle den Wochenplan für die Woche vom ' + weekOfStr + '.' }],
  }),
});

if (!res.ok) {
  const t = await res.text();
  console.error('API-Fehler:', res.status, t);
  process.exit(1);
}

const data = await res.json();
const text = data.content?.[0]?.text || '';

const posts = [];
const blocks = text.split(/===\s*POST\s*===/i).slice(1);
for (const block of blocks) {
  const endIdx = block.search(/===\s*ENDE\s*===/i);
  const body = endIdx >= 0 ? block.slice(0, endIdx) : block;
  const tag = body.match(/TAG:\s*(.+)/i)?.[1]?.trim();
  const platform = body.match(/PLATTFORM:\s*(.+)/i)?.[1]?.trim()?.toLowerCase();
  const type = body.match(/TYP:\s*(.+)/i)?.[1]?.trim();
  const audience = body.match(/ZIELGRUPPE:\s*(.+)/i)?.[1]?.trim();
  const content = body.match(/TEXT:\s*([\s\S]*)/i)?.[1]?.trim();
  if (tag && platform && content) {
    posts.push({ tag, platform, type: type || '', audience: audience || 'Allgemein', content });
  }
}

if (posts.length === 0) {
  console.error('Konnte keine Posts aus der Antwort extrahieren. Antwort (gekürzt):', text.slice(0, 800));
  process.exit(1);
}

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const output = {
  weekOf: weekOfStr,
  generatedAt: new Date().toISOString(),
  posts,
};

writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log('Wochenplan geschrieben:', weekOfStr, posts.length, 'Posts');
