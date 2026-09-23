// Genera src/lib/countries.js a partir de datos oficiales:
//   - Zonas horarias: zone.tab de la tz database de IANA (https://data.iana.org/time-zones/tzdb/).
//   - Países miembros de la ONU: campo unMember de mledoze/countries, con las correcciones de abajo.
// Nombres en español con Intl.DisplayNames('es'), revisados a mano en NAME_OVERRIDES.
//
// Uso: node scripts/generate-countries.mjs
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TZDB = 'https://data.iana.org/time-zones/tzdb'
const COUNTRIES_JSON = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json'
const OUTPUT = fileURLToPath(new URL('../src/lib/countries.js', import.meta.url))

// La Santa Sede (VA) y Palestina (PS) son Estados observadores, no miembros de la ONU.
// El dataset marca VA como miembro por error: se quita y se añaden los dos a mano.
const NOT_UN_MEMBERS = new Set(['VA'])
const EXTRA_STATES = ['VA', 'PS']

const NAME_OVERRIDES = {
  PS: 'Palestina',
  CI: 'Costa de Marfil',
  CG: 'República del Congo',
}

// Zona que se preselecciona al elegir el país (por defecto, la primera de zone.tab).
const DEFAULT_ZONE = {
  AU: 'Australia/Sydney',
  BR: 'America/Sao_Paulo',
  CA: 'America/Toronto',
  RU: 'Europe/Moscow',
  UA: 'Europe/Kyiv',
  UZ: 'Asia/Tashkent',
}

// España se muestra con dos zonas: península y Baleares (Madrid, predeterminada) y Canarias.
// Africa/Ceuta tiene la misma hora que Madrid y se omite.
const ZONE_OVERRIDES = {
  ES: [
    { id: 'Europe/Madrid', place: 'península y Baleares', label: 'España (península y Baleares)' },
    { id: 'Atlantic/Canary', place: 'Canarias', label: 'España (Canarias)' },
  ],
}

// Nombres en español de las ciudades de las zonas. Si no está aquí, se usa el de la zona.
const CITY_NAMES = {
  // América
  'America/New_York': 'Nueva York',
  'America/Los_Angeles': 'Los Ángeles',
  'America/Mexico_City': 'Ciudad de México',
  'America/Cancun': 'Cancún',
  'America/Merida': 'Mérida',
  'America/Ciudad_Juarez': 'Ciudad Juárez',
  'America/Mazatlan': 'Mazatlán',
  'America/Bahia_Banderas': 'Bahía de Banderas',
  'America/St_Johns': 'San Juan de Terranova',
  'America/Blanc-Sablon': 'Blanc-Sablon',
  'America/Belem': 'Belém',
  'America/Araguaina': 'Araguaína',
  'America/Maceio': 'Maceió',
  'America/Bahia': 'Salvador de Bahía',
  'America/Cuiaba': 'Cuiabá',
  'America/Santarem': 'Santarém',
  'America/Eirunepe': 'Eirunepé',
  'America/Noronha': 'Fernando de Noronha',
  'America/Argentina/Cordoba': 'Córdoba',
  'America/Argentina/Tucuman': 'Tucumán',
  'America/Argentina/Rio_Gallegos': 'Río Gallegos',
  'Pacific/Easter': 'Isla de Pascua',
  'Pacific/Galapagos': 'Islas Galápagos',
  'Pacific/Honolulu': 'Honolulu (Hawái)',
  // Europa
  'Europe/Lisbon': 'Lisboa',
  'Atlantic/Madeira': 'Madeira',
  'Atlantic/Azores': 'Azores',
  'Europe/Berlin': 'Berlín',
  'Europe/Busingen': 'Büsingen',
  'Europe/Kyiv': 'Kiev',
  'Europe/Simferopol': 'Simferópol (Crimea)',
  'Europe/Moscow': 'Moscú',
  'Europe/Astrakhan': 'Astracán',
  'Europe/Ulyanovsk': 'Uliánovsk',
  // Asia
  'Asia/Yekaterinburg': 'Ekaterimburgo',
  'Asia/Khandyga': 'Jandyga',
  'Asia/Sakhalin': 'Sajalín',
  'Asia/Kamchatka': 'Kamchatka',
  'Asia/Shanghai': 'Pekín (Shanghái)',
  'Asia/Urumqi': 'Urumchi',
  'Asia/Jakarta': 'Yakarta',
  'Asia/Qyzylorda': 'Kyzylorda',
  'Asia/Qostanay': 'Kostanái',
  'Asia/Aqtobe': 'Aktobe',
  'Asia/Aqtau': 'Aktau',
  'Asia/Oral': 'Oral',
  'Asia/Ulaanbaatar': 'Ulán Bator',
  'Asia/Tashkent': 'Taskent',
  'Asia/Samarkand': 'Samarcanda',
  'Asia/Famagusta': 'Famagusta',
  'Asia/Nicosia': 'Nicosia',
  'Asia/Gaza': 'Gaza',
  'Asia/Hebron': 'Hebrón (Cisjordania)',
  // Oceanía
  'Australia/Sydney': 'Sídney',
  'Australia/Adelaide': 'Adelaida',
  'Australia/Lord_Howe': 'Isla Lord Howe',
  'Antarctica/Macquarie': 'Isla Macquarie',
  'Pacific/Chatham': 'Islas Chatham',
  'Pacific/Kanton': 'Islas Fénix (Kanton)',
  'Pacific/Kiritimati': 'Islas de la Línea (Kiritimati)',
  'Pacific/Tarawa': 'Tarawa',
  'Pacific/Port_Moresby': 'Port Moresby',
  'Pacific/Bougainville': 'Bougainville',
}

// Regiones de EE. UU. que aparecen en rutas como America/Indiana/Knox.
const REGION_NAMES = { Indiana: 'Indiana', Kentucky: 'Kentucky', North_Dakota: 'Dakota del Norte' }

function cityName(zoneId) {
  if (CITY_NAMES[zoneId]) return CITY_NAMES[zoneId]
  const parts = zoneId.split('/')
  const city = parts[parts.length - 1].replace(/_/g, ' ')
  if (parts.length === 3 && REGION_NAMES[parts[1]]) return `${city} (${REGION_NAMES[parts[1]]})`
  return city
}

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo descargar ${url}: ${res.status}`)
  return res.text()
}

const [zoneTab, tzVersion, countriesJson] = await Promise.all([
  fetchText(`${TZDB}/zone.tab`),
  fetchText(`${TZDB}/version`),
  fetchText(COUNTRIES_JSON),
])

const zonesByCountry = new Map()
for (const line of zoneTab.split('\n')) {
  if (!line || line.startsWith('#')) continue
  const [code, , zoneId] = line.split('\t')
  if (!zonesByCountry.has(code)) zonesByCountry.set(code, [])
  zonesByCountry.get(code).push(zoneId)
}

const unMembers = JSON.parse(countriesJson)
  .filter((c) => c.unMember && !NOT_UN_MEMBERS.has(c.cca2))
  .map((c) => c.cca2)
if (unMembers.length !== 193) throw new Error(`Se esperaban 193 miembros de la ONU y hay ${unMembers.length}.`)

const displayNames = new Intl.DisplayNames('es', { type: 'region' })
const codes = [...new Set([...unMembers, ...EXTRA_STATES])]

const countries = codes.map((code) => {
  const name = NAME_OVERRIDES[code] || displayNames.of(code)
  const zoneIds = zonesByCountry.get(code)
  if (!zoneIds) throw new Error(`zone.tab no tiene zonas para ${code}.`)

  let zones
  if (ZONE_OVERRIDES[code]) {
    zones = ZONE_OVERRIDES[code]
  } else if (zoneIds.length === 1) {
    zones = [{ id: zoneIds[0], place: name, label: name }]
  } else {
    const ordered = DEFAULT_ZONE[code] ? [DEFAULT_ZONE[code], ...zoneIds.filter((z) => z !== DEFAULT_ZONE[code])] : zoneIds
    zones = ordered.map((id) => ({ id, place: cityName(id), label: `${name}: ${cityName(id)}` }))
  }

  for (const zone of zones) new Intl.DateTimeFormat('es', { timeZone: zone.id }) // lanza si no es válida
  return { code, name, zones }
})

countries.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))

const header = `// ARCHIVO GENERADO por scripts/generate-countries.mjs. No lo edites a mano.
// Fuentes: zone.tab de la tz database de IANA (versión ${tzVersion.trim()}) y la lista de
// miembros de la ONU (193) más la Santa Sede y Palestina. Nombres en español.
//
// Cada país: { code: ISO 3166-1 alfa-2, name, zones: [{ id: zona IANA, place, label }] }.
// La primera zona de cada país es la predeterminada.
`

const body = `export const COUNTRIES = ${JSON.stringify(countries, null, 2)}\n`
writeFileSync(OUTPUT, `${header}\n${body}`)
console.log(`countries.js: ${countries.length} países, ${countries.reduce((n, c) => n + c.zones.length, 0)} zonas (tzdb ${tzVersion.trim()}).`)
