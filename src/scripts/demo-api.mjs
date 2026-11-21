import { request } from '@playwright/test';
import nextEnv from '@next/env';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);
const qaFile = path.join(root, '.env.backend-tests.local');
if (fs.existsSync(qaFile)) {
  for (const line of fs.readFileSync(qaFile, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
for (const name of ['TEST_OWNER_EMAIL', 'TEST_INTRUDER_EMAIL', 'TEST_USER_PASSWORD']) {
  if (!process.env[name]) throw new Error(`Falta ${name}; configura .env.backend-tests.local`);
}
if (![process.env.TEST_OWNER_EMAIL, process.env.TEST_INTRUDER_EMAIL].every(v => /^qa_backend_[^@]+@/.test(v))) {
  throw new Error('La demo requiere cuentas QA; no utiliza cuentas de investigadores.');
}
const baseURL = process.env.DEMO_BASE_URL || 'http://localhost:3317';
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('La demo debe apuntar al servidor local.');
const output = process.env.DEMO_OUTPUT_DIR;
const hold = Number(process.env.DEMO_HOLD_SECONDS || '0');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const owner = await request.newContext({ baseURL, timeout: 30000, extraHTTPHeaders: { Origin: baseURL } });
const anonymous = await request.newContext({ baseURL, timeout: 30000 });
const intruder = await request.newContext({ baseURL, timeout: 30000, extraHTTPHeaders: { Origin: baseURL } });
const marker = `DEMO_22076_${randomUUID()}`;
const evidence = { recordedAt: new Date().toISOString(), baseURL, syntheticData: true, marker, steps: [], cleanup: false };
const started = Date.now();
let projectId;
let seq = 0;
const clean = value => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, /password|token|cookie|email|^(created_by|updated_by|user_id|owner_id)$/i.test(k) ? '[oculto]' : clean(v)]));
  return value;
};
const save = () => {
  if (!output) return;
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'evidencia-api.json'), JSON.stringify(evidence, null, 2) + '\n');
};
function page(title, subtitle, lines) {
  if (hold) process.stdout.write('\x1b[2J\x1b[H');
  console.log('\x1b[36mANTROPOLOGÍA · BACKEND API\x1b[0m');
  console.log('Proyecto de graduación 2026 · Julio Andrés García Salas Pérez · 22076\n');
  console.log(`\x1b[1m${title}\x1b[0m\n`);
  console.log(lines);
  console.log(`\n\x1b[36m${subtitle}\x1b[0m`);
  console.log('\nDatos sintéticos · Cuenta QA · Petición HTTP real al servidor local');
}
async function step(title, subtitle, method, url, options = {}) {
  const { data, expected = 200, client = owner, binary = false } = options;
  const stepStarted = Date.now();
  const res = await client.fetch(url, { method, ...(data === undefined ? {} : { data }) });
  const buffer = await res.body();
  let body;
  if (binary) body = { content_type: res.headers()['content-type'], bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), signature: buffer.subarray(0, 4).toString('hex') };
  else { try { body = JSON.parse(buffer.toString()); } catch { body = { text: buffer.toString().slice(0, 500) }; } }
  const item = { sequence: ++seq, title, subtitle, method, path: url, request: clean(data), status: res.status(), expected, durationMs: Date.now() - stepStarted, body: clean(body), elapsedSeconds: (Date.now() - started) / 1000 };
  evidence.steps.push(item); save();
  const requestText = data === undefined ? '' : '\n' + JSON.stringify(clean(data), null, 2);
  const responseText = JSON.stringify(item.body, null, 2).split('\n');
  // The complete sanitized response is retained in evidencia-api.json.
  const visible = responseText.length > 24 ? responseText.slice(0, 23).concat('  … respuesta completa en docs/evidencia-api.json') : responseText;
  page(`${String(seq).padStart(2, '0')} / ${title}`, subtitle,
    `\x1b[33m${method} ${url}\x1b[0m${requestText}\n\n\x1b[32mHTTP ${res.status()} · ${item.durationMs} ms\x1b[0m\n${visible.join('\n')}`);
  if (res.status() !== expected) throw new Error(`${title}: esperado HTTP ${expected}; recibido ${res.status()}`);
  if (output) fs.writeFileSync(path.join(output, 'current-step.json'), JSON.stringify({ sequence: seq, title, subtitle, status: res.status() }));
  if (hold) await delay(hold * 1000);
  return body;
}
try {
  page('Demo de la API para investigación cualitativa', 'Un recorrido del servidor: autenticación, protocolo, corpus, análisis y exportación.', 'Node.js · Next.js Route Handlers · TypeScript · Supabase / PostgreSQL\n\nServidor sin páginas ni componentes del cliente.\nLas operaciones siguientes utilizan exclusivamente un proyecto temporal.');
  if (hold) await delay(8000);
  await step('Disponibilidad del servidor', 'El endpoint público confirma que la aplicación responde.', 'GET', '/api/health', { client: anonymous });
  await step('Protección de recursos', 'Una solicitud sin sesión no obtiene acceso a los proyectos.', 'GET', '/api/projects', { client: anonymous, expected: 401 });
  await step('Autenticación de la cuenta QA', 'El servidor inicia una sesión mediante cookies; las credenciales permanecen ocultas.', 'POST', '/api/auth/login', { data: { email: process.env.TEST_OWNER_EMAIL, password: process.env.TEST_USER_PASSWORD } });
  const p = await step('Creación de un proyecto', 'Se crea un espacio temporal para organizar la investigación antropológica.', 'POST', '/api/projects', { expected: 201, data: { name: marker, description: 'Demostración con datos sintéticos para la entrega de graduación.' } });
  projectId = p.project.id;
  const purl = `/api/projects/${projectId}`;
  await step('Validación de los datos de entrada', 'Un proyecto con nombre vacío se rechaza antes de persistirlo.', 'POST', '/api/projects', { expected: 400, data: { name: '' } });
  await step('Registro de un participante', 'El corpus identifica al participante por un alias de demostración.', 'POST', purl + '/participants', { expected: 201, data: { alias: 'Participante de demostración', notes: 'Registro sintético; no corresponde a una persona real.' } });
  await step('Incorporación de una entrevista', 'Se guarda un documento de campo para su posterior análisis cualitativo.', 'POST', purl + '/documents', { expected: 201, data: { title: 'Entrevista sintética sobre el barrio', content: 'En mi barrio nos reunimos cada semana para organizar actividades comunitarias.', document_type: 'interview', location: 'Ciudad de Guatemala', language: 'es' } });
  await step('Construcción del libro de códigos', 'Los códigos organizan categorías y definiciones para interpretar el corpus.', 'POST', purl + '/analysis/codes', { expected: 201, data: { name: 'Participación comunitaria', definition: 'Actividades colectivas organizadas por habitantes del barrio.', color: '#0f766e' } });
  await step('Escritura de un memo analítico', 'Se conserva una observación interpretativa vinculada al proyecto.', 'POST', purl + '/analysis/memos', { expected: 201, data: { title: 'Organización vecinal', body: 'La entrevista sintética sugiere una práctica de coordinación comunitaria.', tags: ['comunidad', 'demostración'] } });
  const d = await owner.get(purl + '/delimitation');
  const initial = await d.json();
  if (d.status() !== 200) throw new Error('No se pudo leer la delimitación inicial');
  const revision = initial.data.delim?.revision ?? initial.data.revision ?? 0;
  await step('Delimitación del estudio', 'El protocolo guarda tema, contexto, población y periodo con control de revisiones.', 'PATCH', purl + '/delimitation', { data: { base_revision: revision, topic: 'Prácticas de organización comunitaria', context_place: 'Ciudad de Guatemala', population: 'Personas adultas participantes de actividades vecinales', time_period: 'Ciclo 2026', resources: 'Entrevistas y notas de campo' } });
  await step('Revisión metodológica local', 'Sin claves de IA, la revisión utiliza reglas heurísticas y declara su origen.', 'POST', purl + '/delimitation/review', { data: { draft: { topic: 'Prácticas de organización comunitaria', context_place: 'Ciudad de Guatemala', population: 'Personas adultas participantes de actividades vecinales', time_period: 'Ciclo 2026', resources: 'Entrevistas y notas de campo', include: ['Participación voluntaria de personas adultas'], exclude: ['Personas menores de edad'] } } });
  await step('Resumen del análisis cualitativo', 'El backend integra indicadores del corpus y de la codificación.', 'GET', purl + '/analysis/overview');
  await step('Exportación del libro de códigos', 'El servidor genera un PDF y devuelve su tipo, tamaño y firma de archivo.', 'GET', purl + '/exports/codebook?format=pdf', { binary: true });
  const loginIntruder = await intruder.post('/api/auth/login', { data: { email: process.env.TEST_INTRUDER_EMAIL, password: process.env.TEST_USER_PASSWORD } });
  if (loginIntruder.status() !== 200) throw new Error('No se pudo iniciar la segunda sesión QA');
  await step('Aislamiento entre investigadores', 'Una segunda cuenta sin membresía no puede leer este proyecto.', 'GET', purl, { client: intruder, expected: 403 });
  const beforeDelete = await owner.get(purl);
  const knownProject = (await beforeDelete.json()).project;
  if (beforeDelete.status() !== 200 || knownProject?.name !== marker) throw new Error('Se canceló la limpieza: el recurso no pertenece a esta demo.');
  await step('Eliminación del proyecto temporal', 'Se elimina exclusivamente el proyecto creado en este recorrido.', 'DELETE', purl);
  await step('Verificación de la limpieza', 'El recurso eliminado deja de estar disponible a través de la API.', 'GET', purl, { expected: 403 });
  evidence.cleanup = true; projectId = undefined; save();
  page('Recorrido completado', 'La API funciona de forma independiente; el proyecto temporal fue eliminado.', `${evidence.steps.length} operaciones HTTP verificadas\nAutenticación · Validación · Protocolo · Corpus · Análisis · PDF · Permisos\n\nNo se incluyeron pantallas ni componentes del frontend.\nEl informe aprobado y el consentimiento firmado serán agregados por el estudiante.`);
  if (hold) await delay(8000);
} finally {
  if (projectId) {
    const r = await owner.get(`/api/projects/${projectId}`).catch(() => null);
    const b = r ? await r.json().catch(() => null) : null;
    if (r?.status() === 200 && b?.project?.name === marker) {
      const deletion = await owner.delete(`/api/projects/${projectId}`);
      evidence.cleanup = deletion.status() === 200;
      save();
    }
  }
  await Promise.all([owner.dispose(), anonymous.dispose(), intruder.dispose()]);
}
