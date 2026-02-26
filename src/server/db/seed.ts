/**
 * Database seed script for local development
 * Run with: pnpm db:seed
 *
 * Seeds auth users, user profiles, regions, grape varieties, producers, wines,
 * wine-grape variety assignments, fairs, and junction tables.
 * All operations are idempotent (safe to run multiple times).
 */

import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const conn = postgres(DATABASE_URL)
const db = drizzle(conn, { schema })

// ============================================================================
// SEED DATA
// ============================================================================

const ADMIN_USERS = [
  { email: 'beto@vinte.ai', firstName: 'Beto', lastName: 'Admin', birthDate: '1990-01-01' },
  { email: 'elliott@vinte.ai', firstName: 'Elliott', lastName: 'Admin', birthDate: '1990-01-01' },
]

const ATTENDEE_USERS = [
  { email: 'maria@example.com', firstName: 'Maria', lastName: 'Ivanova', birthDate: '1988-05-12' },
  { email: 'georgi@example.com', firstName: 'Georgi', lastName: 'Petrov', birthDate: '1992-11-03' },
  {
    email: 'elena@example.com',
    firstName: 'Elena',
    lastName: 'Dimitrova',
    birthDate: '1995-07-22',
  },
  {
    email: 'stefan@example.com',
    firstName: 'Stefan',
    lastName: 'Nikolov',
    birthDate: '1985-02-14',
  },
]

const SEED_REGIONS = [
  {
    name: 'Thracian Valley',
    country: 'Bulgaria',
    description:
      'The largest and most famous wine region in Bulgaria, known for its Mediterranean climate and ancient winemaking traditions.',
  },
  {
    name: 'Rose Valley',
    country: 'Bulgaria',
    description:
      'Located in the Sub-Balkan valleys, known for rose oil production and increasingly for quality wines.',
  },
  {
    name: 'Black Sea',
    country: 'Bulgaria',
    description:
      'Coastal wine region with unique maritime climate and limestone soils, producing distinctive white and red wines.',
  },
]

const SEED_GRAPE_VARIETIES = [
  {
    name: 'Mavrud',
    description: 'Ancient Bulgarian red variety with deep color and complex tannins.',
  },
  {
    name: 'Rubin',
    description:
      'Rare Bulgarian crossing of Nebbiolo and Syrah with rose, tar, and dark cherry notes.',
  },
  {
    name: 'Dimyat',
    description: 'Ancient Bulgarian white variety with melon and white flower aromas.',
  },
  {
    name: 'Rkatsiteli',
    description:
      'Ancient Georgian variety also grown in Bulgaria, used for orange and white wines.',
  },
  { name: 'Merlot', description: 'Classic Bordeaux red variety, widely planted in Bulgaria.' },
  {
    name: 'Syrah',
    description: 'Noble red variety from the Rhône Valley, thriving in Bulgarian terroir.',
  },
  {
    name: 'Petit Verdot',
    description: 'Late-ripening Bordeaux variety used in blends for color and spice.',
  },
  { name: 'Cabernet Sauvignon', description: "The world's most planted red grape variety." },
  {
    name: 'Cabernet Franc',
    description: 'Elegant Bordeaux variety with notes of red fruits and violet.',
  },
  { name: 'Chardonnay', description: 'Versatile white grape variety used worldwide.' },
  {
    name: 'Sauvignon Blanc',
    description: 'Aromatic white variety with citrus and herbaceous notes.',
  },
  {
    name: 'Viognier',
    description: 'Aromatic Rhône white variety with stone fruit and floral notes.',
  },
  { name: 'Pinot Noir', description: 'Noble red variety from Burgundy, prized for elegance.' },
  {
    name: 'Gewürztraminer',
    description: 'Aromatic white variety with lychee and rose petal notes.',
  },
  { name: 'Pinot Grigio', description: 'Italian white variety, crisp and refreshing.' },
  { name: 'Grenache', description: 'Mediterranean red variety, often used in rosé blends.' },
  {
    name: 'Mourvèdre',
    description: 'Mediterranean red variety with deep color and earthy flavors.',
  },
  { name: 'Muscat Ottonel', description: 'Aromatic variety used for sweet and dessert wines.' },
]

const SEED_PRODUCERS = [
  {
    name: 'Bessa Valley Winery',
    regionName: 'Thracian Valley',
    description:
      'Founded by Count Stephan von Neipperg, Bessa Valley produces premium wines from the Thracian Valley, known for its Mediterranean climate and ancient winemaking traditions.',
    website: 'https://bessavalley.com',
  },
  {
    name: 'Todoroff Wine Cellar',
    regionName: 'Thracian Valley',
    description:
      'A family-owned winery in the heart of the Thracian Valley, specializing in Mavrud and other indigenous Bulgarian grape varieties.',
    website: 'https://todoroff.com',
  },
  {
    name: 'Midalidare Estate',
    regionName: 'Thracian Valley',
    description:
      'A luxury wine estate combining French winemaking traditions with Bulgarian terroir. Known for elegant blends and single-vineyard wines.',
    website: 'https://midalidare.bg',
  },
  {
    name: 'Edoardo Miroglio',
    regionName: 'Thracian Valley',
    description:
      'Italian-Bulgarian winery bringing together Mediterranean expertise and local terroir to create distinctive wines from both international and indigenous grape varieties.',
    website: 'https://www.emiroglio.com',
  },
  {
    name: 'Villa Yustina',
    regionName: 'Rose Valley',
    description:
      'Located in the Rose Valley near the town of Ustina, this estate produces small-batch wines with a focus on quality and terroir expression.',
    website: 'https://villayustina.com',
  },
  {
    name: 'Rossidi Winery',
    regionName: 'Black Sea',
    description:
      'A boutique winery near the Black Sea coast, producing wines influenced by the unique maritime climate and limestone soils of the region.',
    website: 'https://rossidi.com',
  },
  {
    name: 'Zagreus Winery',
    regionName: 'Thracian Valley',
    description:
      'Named after the ancient Thracian god of wine, Zagreus is dedicated to reviving indigenous Bulgarian grape varieties, particularly Mavrud.',
    website: 'https://zagreus.bg',
  },
]

type SeedWine = {
  name: string
  vintage: number | null
  type: 'white' | 'red' | 'rose' | 'orange' | 'sparkling' | 'dessert'
  grapeVarietyNames: string[]
  alcoholPercent: number
  regionName: string
  description: string
  oneLiner: string | null
  producerName: string
  price: number | null
  fermentationContainer: string | null
  oakAging: string | null
}

const SEED_WINES: SeedWine[] = [
  // Bessa Valley wines
  {
    name: 'Enira',
    vintage: 2021,
    type: 'red',
    grapeVarietyNames: ['Merlot', 'Syrah', 'Petit Verdot'],
    alcoholPercent: 14.0,
    regionName: 'Thracian Valley',
    description: 'Flagship blend with rich dark fruit, spice, and velvety tannins.',
    oneLiner: 'Bold Thracian blend with dark fruit and velvet tannins',
    producerName: 'Bessa Valley Winery',
    price: 18.0,
    fermentationContainer: 'Stainless steel',
    oakAging: '12 months French oak',
  },
  {
    name: 'Enira',
    vintage: 2020,
    type: 'red',
    grapeVarietyNames: ['Merlot', 'Syrah', 'Petit Verdot'],
    alcoholPercent: 13.5,
    regionName: 'Thracian Valley',
    description: 'Previous vintage of the flagship blend with more mature character.',
    oneLiner: 'Mature vintage of the iconic Enira blend',
    producerName: 'Bessa Valley Winery',
    price: 22.0,
    fermentationContainer: 'Stainless steel',
    oakAging: '14 months French oak',
  },
  {
    name: 'Petit Enira',
    vintage: 2022,
    type: 'red',
    grapeVarietyNames: ['Merlot', 'Cabernet Sauvignon', 'Syrah'],
    alcoholPercent: 13.0,
    regionName: 'Thracian Valley',
    description: 'Approachable everyday red with soft fruit and gentle tannins.',
    oneLiner: 'Approachable everyday red with soft fruit',
    producerName: 'Bessa Valley Winery',
    price: 10.0,
    fermentationContainer: 'Stainless steel',
    oakAging: '6 months French oak',
  },
  {
    name: 'Enira Rosé',
    vintage: 2023,
    type: 'rose',
    grapeVarietyNames: ['Syrah', 'Mourvèdre'],
    alcoholPercent: 12.5,
    regionName: 'Thracian Valley',
    description: 'Pale salmon color with fresh strawberry and citrus notes.',
    oneLiner: 'Fresh rosé with strawberry and citrus',
    producerName: 'Bessa Valley Winery',
    price: 12.0,
    fermentationContainer: 'Stainless steel',
    oakAging: null,
  },
  // Todoroff wines
  {
    name: 'Gallery Mavrud',
    vintage: 2020,
    type: 'red',
    grapeVarietyNames: ['Mavrud'],
    alcoholPercent: 14.5,
    regionName: 'Thracian Valley',
    description:
      'Premium Mavrud showcasing the full potential of this ancient Bulgarian variety with deep color and complex tannins.',
    oneLiner: 'Premium expression of ancient Bulgarian Mavrud',
    producerName: 'Todoroff Wine Cellar',
    price: 25.0,
    fermentationContainer: 'Oak barrels',
    oakAging: '18 months Bulgarian oak',
  },
  {
    name: 'Todoroff Mavrud Reserve',
    vintage: 2019,
    type: 'red',
    grapeVarietyNames: ['Mavrud'],
    alcoholPercent: 14.0,
    regionName: 'Thracian Valley',
    description: 'Reserve-level Mavrud with concentrated blackberry, leather, and tobacco notes.',
    oneLiner: 'Concentrated reserve Mavrud with leather and tobacco',
    producerName: 'Todoroff Wine Cellar',
    price: 30.0,
    fermentationContainer: 'Oak barrels',
    oakAging: '24 months French and Bulgarian oak',
  },
  {
    name: 'Todoroff Chardonnay',
    vintage: 2022,
    type: 'white',
    grapeVarietyNames: ['Chardonnay'],
    alcoholPercent: 13.0,
    regionName: 'Thracian Valley',
    description: 'Fresh and mineral Chardonnay with citrus and green apple aromas.',
    oneLiner: 'Fresh mineral Chardonnay with citrus notes',
    producerName: 'Todoroff Wine Cellar',
    price: 14.0,
    fermentationContainer: 'Stainless steel',
    oakAging: null,
  },
  // Midalidare wines
  {
    name: 'Carpe Diem',
    vintage: 2021,
    type: 'red',
    grapeVarietyNames: ['Cabernet Franc', 'Merlot'],
    alcoholPercent: 14.0,
    regionName: 'Thracian Valley',
    description: 'Elegant blend with notes of red fruits, violet, and subtle spice.',
    oneLiner: 'Elegant blend of red fruits and violet',
    producerName: 'Midalidare Estate',
    price: 35.0,
    fermentationContainer: 'French oak barrels',
    oakAging: '16 months new French oak',
  },
  {
    name: 'Rock & Stars White',
    vintage: 2023,
    type: 'white',
    grapeVarietyNames: ['Sauvignon Blanc', 'Viognier'],
    alcoholPercent: 12.5,
    regionName: 'Thracian Valley',
    description: 'Aromatic white blend with tropical fruit and floral notes.',
    oneLiner: 'Tropical aromatics with floral elegance',
    producerName: 'Midalidare Estate',
    price: 16.0,
    fermentationContainer: 'Stainless steel',
    oakAging: null,
  },
  {
    name: 'Mogilovo',
    vintage: 2020,
    type: 'red',
    grapeVarietyNames: ['Syrah'],
    alcoholPercent: 14.5,
    regionName: 'Thracian Valley',
    description: 'Single-vineyard Syrah with dark fruit, black pepper, and smoky finish.',
    oneLiner: 'Single-vineyard Syrah with pepper and smoke',
    producerName: 'Midalidare Estate',
    price: 40.0,
    fermentationContainer: 'French oak barrels',
    oakAging: '18 months new French oak',
  },
  // Edoardo Miroglio wines
  {
    name: 'Pinot Noir Reserve',
    vintage: 2021,
    type: 'red',
    grapeVarietyNames: ['Pinot Noir'],
    alcoholPercent: 13.5,
    regionName: 'Thracian Valley',
    description: 'Burgundian-style Pinot Noir with cherry, earth, and delicate oak.',
    oneLiner: 'Burgundian elegance meets Bulgarian terroir',
    producerName: 'Edoardo Miroglio',
    price: 28.0,
    fermentationContainer: 'French oak barrels',
    oakAging: '12 months French oak',
  },
  {
    name: 'Soli Traminer',
    vintage: 2023,
    type: 'white',
    grapeVarietyNames: ['Gewürztraminer'],
    alcoholPercent: 12.0,
    regionName: 'Thracian Valley',
    description: 'Aromatic and expressive with lychee, rose petal, and ginger notes.',
    oneLiner: 'Lychee, rose petal, and ginger in a glass',
    producerName: 'Edoardo Miroglio',
    price: 15.0,
    fermentationContainer: 'Stainless steel',
    oakAging: null,
  },
  {
    name: 'Soli Pinot Grigio',
    vintage: 2023,
    type: 'white',
    grapeVarietyNames: ['Pinot Grigio'],
    alcoholPercent: 12.5,
    regionName: 'Thracian Valley',
    description: 'Crisp and refreshing with pear, almond, and subtle minerality.',
    oneLiner: 'Crisp pear and almond with mineral finish',
    producerName: 'Edoardo Miroglio',
    price: 12.0,
    fermentationContainer: 'Stainless steel',
    oakAging: null,
  },
  {
    name: 'Brut Rosé',
    vintage: 2022,
    type: 'sparkling',
    grapeVarietyNames: ['Pinot Noir', 'Chardonnay'],
    alcoholPercent: 12.0,
    regionName: 'Thracian Valley',
    description: 'Traditional method sparkling with fine bubbles and red berry character.',
    oneLiner: 'Traditional method sparkler with fine red berry bubbles',
    producerName: 'Edoardo Miroglio',
    price: 20.0,
    fermentationContainer: 'Stainless steel',
    oakAging: null,
  },
  // Villa Yustina wines
  {
    name: 'Monogram Red',
    vintage: 2020,
    type: 'red',
    grapeVarietyNames: ['Cabernet Sauvignon', 'Rubin'],
    alcoholPercent: 14.0,
    regionName: 'Rose Valley',
    description:
      'A blend of international and Bulgarian varieties with cassis, plum, and herbal notes.',
    oneLiner: 'International meets Bulgarian with cassis and herbs',
    producerName: 'Villa Yustina',
    price: 22.0,
    fermentationContainer: 'Oak barrels',
    oakAging: '14 months French oak',
  },
  {
    name: 'Villa Yustina Rosé',
    vintage: 2023,
    type: 'rose',
    grapeVarietyNames: ['Syrah', 'Grenache'],
    alcoholPercent: 12.0,
    regionName: 'Rose Valley',
    description: 'Light and vibrant rosé from the Rose Valley with wild strawberry and herb notes.',
    oneLiner: 'Rose Valley rosé with wild strawberry',
    producerName: 'Villa Yustina',
    price: 11.0,
    fermentationContainer: 'Stainless steel',
    oakAging: null,
  },
  {
    name: 'Orange Wine',
    vintage: 2022,
    type: 'orange',
    grapeVarietyNames: ['Rkatsiteli'],
    alcoholPercent: 13.0,
    regionName: 'Rose Valley',
    description:
      'Skin-contact white from the ancient Rkatsiteli variety with amber color and tannic structure.',
    oneLiner: 'Amber-hued skin-contact from ancient Rkatsiteli',
    producerName: 'Villa Yustina',
    price: 18.0,
    fermentationContainer: 'Clay amphora',
    oakAging: null,
  },
  // Rossidi wines
  {
    name: 'Rossidi Chardonnay',
    vintage: 2022,
    type: 'white',
    grapeVarietyNames: ['Chardonnay'],
    alcoholPercent: 13.5,
    regionName: 'Black Sea',
    description: 'Maritime-influenced Chardonnay with salinity, citrus, and toasted almond.',
    oneLiner: 'Maritime Chardonnay with salinity and almond',
    producerName: 'Rossidi Winery',
    price: 20.0,
    fermentationContainer: 'French oak barrels',
    oakAging: '10 months French oak',
  },
  {
    name: 'Rossidi Cabernet Sauvignon',
    vintage: 2020,
    type: 'red',
    grapeVarietyNames: ['Cabernet Sauvignon'],
    alcoholPercent: 14.0,
    regionName: 'Black Sea',
    description: 'Structured Cabernet with blackcurrant, cedar, and a long mineral finish.',
    oneLiner: 'Structured coastal Cabernet with mineral finish',
    producerName: 'Rossidi Winery',
    price: 24.0,
    fermentationContainer: 'French oak barrels',
    oakAging: '16 months French oak',
  },
  {
    name: 'Rossidi Sauvignon Blanc',
    vintage: 2023,
    type: 'white',
    grapeVarietyNames: ['Sauvignon Blanc'],
    alcoholPercent: 12.5,
    regionName: 'Black Sea',
    description: 'Zesty and aromatic with grapefruit, elderflower, and a hint of sea breeze.',
    oneLiner: 'Zesty grapefruit with a hint of sea breeze',
    producerName: 'Rossidi Winery',
    price: 14.0,
    fermentationContainer: 'Stainless steel',
    oakAging: null,
  },
  // Zagreus wines
  {
    name: 'Zagreus Mavrud',
    vintage: 2021,
    type: 'red',
    grapeVarietyNames: ['Mavrud'],
    alcoholPercent: 14.5,
    regionName: 'Thracian Valley',
    description:
      "A powerful expression of Bulgaria's signature grape with dark plum, blackberry, and earthy notes.",
    oneLiner: "Bulgaria's signature grape at its most powerful",
    producerName: 'Zagreus Winery',
    price: 20.0,
    fermentationContainer: 'Oak barrels',
    oakAging: '12 months Bulgarian oak',
  },
  {
    name: 'Zagreus Rubin',
    vintage: 2021,
    type: 'red',
    grapeVarietyNames: ['Rubin'],
    alcoholPercent: 14.0,
    regionName: 'Thracian Valley',
    description:
      'Made from the rare Bulgarian Rubin variety (Nebbiolo × Syrah) with notes of rose, tar, and dark cherry.',
    oneLiner: 'Rare Rubin with rose, tar, and dark cherry',
    producerName: 'Zagreus Winery',
    price: 22.0,
    fermentationContainer: 'Oak barrels',
    oakAging: '14 months French oak',
  },
  {
    name: 'Zagreus Dimyat',
    vintage: 2023,
    type: 'white',
    grapeVarietyNames: ['Dimyat'],
    alcoholPercent: 12.0,
    regionName: 'Thracian Valley',
    description:
      'Light and fragrant white from an ancient Bulgarian variety with melon and white flower aromas.',
    oneLiner: 'Light fragrant white with melon and white flowers',
    producerName: 'Zagreus Winery',
    price: 10.0,
    fermentationContainer: 'Stainless steel',
    oakAging: null,
  },
  {
    name: 'Zagreus Late Harvest Muscat',
    vintage: 2021,
    type: 'dessert',
    grapeVarietyNames: ['Muscat Ottonel'],
    alcoholPercent: 11.0,
    regionName: 'Thracian Valley',
    description: 'Sweet and luscious with honey, apricot, and orange blossom.',
    oneLiner: 'Luscious dessert wine with honey and apricot',
    producerName: 'Zagreus Winery',
    price: 16.0,
    fermentationContainer: 'Stainless steel',
    oakAging: null,
  },
]

const SEED_FAIRS = [
  {
    name: 'Sofia Wine Festival 2025',
    description:
      'The largest wine festival in Bulgaria, featuring over 50 producers and 300 wines from across the country and beyond.',
    location: 'Inter Expo Center, Sofia',
    startDate: '2025-11-15',
    endDate: '2025-11-17',
    isActive: true,
  },
  {
    name: 'Plovdiv Wine & Food 2025',
    description:
      'A celebration of wine and local cuisine in the ancient city of Plovdiv, showcasing the best of the Thracian Valley.',
    location: 'International Fair Plovdiv',
    startDate: '2025-09-20',
    endDate: '2025-09-22',
    isActive: false,
  },
]

// Map of producer names to booth numbers per fair
const FAIR_ASSIGNMENTS: Record<string, { producers: Record<string, string>; wineNames: string[] }> =
  {
    'Sofia Wine Festival 2025': {
      producers: {
        'Bessa Valley Winery': 'A1',
        'Todoroff Wine Cellar': 'A2',
        'Midalidare Estate': 'B1',
        'Edoardo Miroglio': 'B2',
        'Villa Yustina': 'C1',
        'Rossidi Winery': 'C2',
        'Zagreus Winery': 'D1',
      },
      // All wines at the big festival
      wineNames: SEED_WINES.map((w) => `${w.name}|${w.vintage ?? 'NV'}|${w.producerName}`),
    },
    'Plovdiv Wine & Food 2025': {
      producers: {
        'Todoroff Wine Cellar': 'P1',
        'Midalidare Estate': 'P2',
        'Villa Yustina': 'P3',
        'Zagreus Winery': 'P4',
      },
      // Subset of wines at the smaller festival (Thracian + Rose Valley producers only)
      wineNames: SEED_WINES.filter((w) =>
        ['Todoroff Wine Cellar', 'Midalidare Estate', 'Villa Yustina', 'Zagreus Winery'].includes(
          w.producerName,
        ),
      ).map((w) => `${w.name}|${w.vintage ?? 'NV'}|${w.producerName}`),
    },
  }

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function createAuthUser(email: string): Promise<string | null> {
  const existing = await db.execute<{ id: string }>(sql`
    SELECT id FROM auth.users WHERE email = ${email}
  `)

  if (existing.length > 0) {
    console.log(`  Auth user ${email} already exists`)
    return existing[0]?.id ?? null
  }

  // Create auth user
  const newUsers = await db.execute<{ id: string }>(sql`
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud, confirmation_token, email_change,
      email_change_token_new, recovery_token, phone, phone_change,
      phone_change_token, email_change_token_current, reauthentication_token
    ) VALUES (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000', ${email}, '',
      now(), now(), now(), '{"provider": "email", "providers": ["email"]}',
      '{}', false, 'authenticated', 'authenticated', '', '', '', '', NULL, '', '', '', ''
    )
    RETURNING id
  `)

  const userId = newUsers[0]?.id
  if (!userId) return null

  // Create identity record
  await db.execute(sql`
    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      ${userId}::uuid, ${userId}::uuid, ${email}::varchar, 'email',
      jsonb_build_object('sub', ${userId}::text, 'email', ${email}::text, 'email_verified', true, 'provider', 'email'),
      now(), now(), now()
    )
  `)

  console.log(`  Created auth user ${email}`)
  return userId
}

async function seedAdminUsers() {
  console.log('Seeding admin users...')

  for (const seedUser of ADMIN_USERS) {
    const authId = await createAuthUser(seedUser.email)
    if (!authId) continue

    await db
      .insert(schema.userProfiles)
      .values({
        id: authId,
        email: seedUser.email,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        birthDate: seedUser.birthDate,
        role: 'admin',
      })
      .onConflictDoNothing()

    console.log(`  Profile for ${seedUser.email} ready`)
  }
}

async function seedAttendeeUsers() {
  console.log('Seeding attendee users...')

  for (const seedUser of ATTENDEE_USERS) {
    const authId = await createAuthUser(seedUser.email)
    if (!authId) continue

    await db
      .insert(schema.userProfiles)
      .values({
        id: authId,
        email: seedUser.email,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        birthDate: seedUser.birthDate,
        role: 'attendee',
      })
      .onConflictDoNothing()

    console.log(`  Profile for ${seedUser.email} ready`)
  }
}

async function seedRegions() {
  console.log('Seeding regions...')

  for (const r of SEED_REGIONS) {
    await db.insert(schema.regions).values(r).onConflictDoNothing()
  }

  const allRegions = await db.query.regions.findMany()
  console.log(`  ${allRegions.length} regions ready`)
}

async function seedGrapeVarieties() {
  console.log('Seeding grape varieties...')

  for (const gv of SEED_GRAPE_VARIETIES) {
    await db.insert(schema.grapeVarieties).values(gv).onConflictDoNothing()
  }

  const allGrapeVarieties = await db.query.grapeVarieties.findMany()
  console.log(`  ${allGrapeVarieties.length} grape varieties ready`)
}

async function seedProducers() {
  console.log('Seeding producers...')

  const allRegions = await db.query.regions.findMany()
  const regionByName = new Map(allRegions.map((r) => [r.name, r]))

  for (const p of SEED_PRODUCERS) {
    const existing = await db.query.producers.findFirst({
      where: eq(schema.producers.name, p.name),
    })

    if (existing) {
      console.log(`  Producer "${p.name}" already exists`)
      continue
    }

    const region = regionByName.get(p.regionName)
    await db.insert(schema.producers).values({
      name: p.name,
      regionId: region?.id,
      description: p.description,
      website: p.website,
    })
    console.log(`  Created producer "${p.name}"`)
  }
}

async function seedWines() {
  console.log('Seeding wines...')

  // Build lookups
  const allProducers = await db.query.producers.findMany()
  const producerByName = new Map(allProducers.map((p) => [p.name, p]))

  const allRegions = await db.query.regions.findMany()
  const regionByName = new Map(allRegions.map((r) => [r.name, r]))

  const allGrapeVarieties = await db.query.grapeVarieties.findMany()
  const grapeByName = new Map(allGrapeVarieties.map((gv) => [gv.name, gv]))

  // Track created wines for vintage linking
  const winesByKey = new Map<string, string>() // "name|producerName" -> id

  for (const w of SEED_WINES) {
    const producer = producerByName.get(w.producerName)
    if (!producer) {
      console.log(`  Producer "${w.producerName}" not found, skipping wine "${w.name}"`)
      continue
    }

    // Check if wine already exists (by name + vintage + producer)
    const existingWines = await db.query.wines.findMany({
      where: eq(schema.wines.producerId, producer.id),
    })
    const existing = existingWines.find((ew) => ew.name === w.name && ew.vintage === w.vintage)

    if (existing) {
      console.log(`  Wine "${w.name}" (${w.vintage}) already exists`)
      winesByKey.set(`${w.name}|${w.producerName}`, existing.id)
      continue
    }

    // Check for parent wine (same name, different vintage, same producer)
    const parentKey = `${w.name}|${w.producerName}`
    const parentWineId = winesByKey.get(parentKey) ?? null

    const region = regionByName.get(w.regionName)

    const [inserted] = await db
      .insert(schema.wines)
      .values({
        name: w.name,
        vintage: w.vintage,
        type: w.type,
        alcoholPercent: w.alcoholPercent,
        regionId: region?.id,
        description: w.description,
        oneLiner: w.oneLiner,
        producerId: producer.id,
        parentWineId,
        price: w.price,
        fermentationContainer: w.fermentationContainer,
        oakAging: w.oakAging,
      })
      .returning({ id: schema.wines.id })

    if (inserted) {
      // If no parent was set, this is the first vintage — store it as potential parent
      if (!winesByKey.has(parentKey)) {
        winesByKey.set(parentKey, inserted.id)
      }

      // Assign grape varieties
      for (const gvName of w.grapeVarietyNames) {
        const grape = grapeByName.get(gvName)
        if (grape) {
          await db
            .insert(schema.wineGrapeVarieties)
            .values({ wineId: inserted.id, grapeVarietyId: grape.id })
            .onConflictDoNothing()
        }
      }

      console.log(
        `  Created wine "${w.name}" (${w.vintage})${parentWineId ? ' [vintage link]' : ''} with ${w.grapeVarietyNames.length} grape(s)`,
      )
    }
  }
}

async function seedFairs() {
  console.log('Seeding fairs...')

  for (const f of SEED_FAIRS) {
    const existing = await db.query.fairs.findFirst({
      where: eq(schema.fairs.name, f.name),
    })

    if (existing) {
      console.log(`  Fair "${f.name}" already exists`)
      continue
    }

    await db.insert(schema.fairs).values(f)
    console.log(`  Created fair "${f.name}"`)
  }
}

async function seedFairAssignments() {
  console.log('Seeding fair assignments...')

  const allFairs = await db.query.fairs.findMany()
  const allProducers = await db.query.producers.findMany()
  const allWines = await db.query.wines.findMany()

  const fairByName = new Map(allFairs.map((f) => [f.name, f]))
  const producerByName = new Map(allProducers.map((p) => [p.name, p]))

  for (const [fairName, assignment] of Object.entries(FAIR_ASSIGNMENTS)) {
    const fair = fairByName.get(fairName)
    if (!fair) {
      console.log(`  Fair "${fairName}" not found, skipping assignments`)
      continue
    }

    // Assign producers
    for (const [producerName, boothNumber] of Object.entries(assignment.producers)) {
      const producer = producerByName.get(producerName)
      if (!producer) continue

      await db
        .insert(schema.fairProducers)
        .values({ fairId: fair.id, producerId: producer.id, boothNumber })
        .onConflictDoNothing()
    }
    console.log(`  Assigned ${Object.keys(assignment.producers).length} producers to "${fairName}"`)

    // Assign wines
    let wineCount = 0
    for (const wineKey of assignment.wineNames) {
      const [wineName, vintageStr, producerName] = wineKey.split('|')
      if (!wineName || !producerName) continue
      const vintage = vintageStr === 'NV' ? null : Number(vintageStr)

      const producer = producerByName.get(producerName)
      if (!producer) continue

      const wine = allWines.find(
        (w) => w.name === wineName && w.vintage === vintage && w.producerId === producer.id,
      )
      if (!wine) continue

      await db
        .insert(schema.fairWines)
        .values({ fairId: fair.id, wineId: wine.id })
        .onConflictDoNothing()
      wineCount++
    }
    console.log(`  Assigned ${wineCount} wines to "${fairName}"`)
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function seed() {
  await seedAdminUsers()
  await seedAttendeeUsers()
  await seedRegions()
  await seedGrapeVarieties()
  await seedProducers()
  await seedWines()
  await seedFairs()
  await seedFairAssignments()
  console.log('Seeding complete!')
}

seed()
  .catch((e) => {
    console.error('Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await conn.end()
  })
