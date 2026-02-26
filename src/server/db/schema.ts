import { relations } from 'drizzle-orm'
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTableCreator,
  real,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Multi-project schema prefix for Wine Fair
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `wine_fair_${name}`)

// ============================================================================
// USER & AUTH TABLES
// ============================================================================

/**
 * User role enum
 */
export const userRoleEnum = pgEnum('user_role', ['admin', 'producer', 'attendee'])

/**
 * User profiles table - extends Supabase auth.users
 *
 * Note: The `id` column references `auth.users.id` in Supabase.
 * Enforce FK at database level via migration or Supabase dashboard:
 * ALTER TABLE wine_fair_user_profile
 *   ADD CONSTRAINT fk_user_profile_auth_users
 *   FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
 */
export const userProfiles = createTable(
  'user_profile',
  (d) => ({
    id: uuid().primaryKey().notNull(),
    email: varchar({ length: 255 }).notNull().unique(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    birthDate: date('birth_date').notNull(),
    role: userRoleEnum().notNull().default('attendee'),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index('user_profile_email_idx').on(t.email), index('user_profile_role_idx').on(t.role)],
)

// ============================================================================
// REGION & GRAPE VARIETY TABLES
// ============================================================================

/**
 * Region table - normalized wine-producing regions
 */
export const regions = createTable(
  'region',
  (d) => ({
    id: uuid().primaryKey().defaultRandom().notNull(),
    name: varchar({ length: 255 }).notNull().unique(),
    country: varchar({ length: 255 }),
    description: text('description'),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index('region_name_idx').on(t.name)],
)

/**
 * Grape variety table - normalized grape varieties
 */
export const grapeVarieties = createTable(
  'grape_variety',
  (d) => ({
    id: uuid().primaryKey().defaultRandom().notNull(),
    name: varchar({ length: 255 }).notNull().unique(),
    description: text('description'),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index('grape_variety_name_idx').on(t.name)],
)

// ============================================================================
// PRODUCER & WINE TABLES
// ============================================================================

/**
 * Wine type enum
 */
export const wineTypeEnum = pgEnum('wine_type', [
  'white',
  'red',
  'rose',
  'orange',
  'sparkling',
  'dessert',
])

/**
 * Producer table - wine producers/wineries
 *
 * A producer can optionally be linked to a user account via userId.
 * This allows producers to log in and manage their own wines.
 */
export const producers = createTable(
  'producer',
  (d) => ({
    id: uuid().primaryKey().defaultRandom().notNull(),
    name: varchar({ length: 255 }).notNull(),
    regionId: uuid('region_id').references(() => regions.id, {
      onDelete: 'set null',
    }),
    description: text('description'),
    website: varchar({ length: 255 }),
    imageUrl: varchar('image_url', { length: 512 }),
    userId: uuid('user_id').references(() => userProfiles.id, {
      onDelete: 'set null',
    }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index('producer_name_idx').on(t.name),
    index('producer_user_id_idx').on(t.userId),
    index('producer_region_id_idx').on(t.regionId),
  ],
)

/**
 * Wine table - individual wines with their attributes
 *
 * parentWineId enables vintage linking: a wine can reference another wine
 * as its "parent" to group vintages of the same wine together.
 */
export const wines = createTable(
  'wine',
  (d) => ({
    id: uuid().primaryKey().defaultRandom().notNull(),
    name: varchar({ length: 255 }).notNull(),
    vintage: integer('vintage'),
    type: wineTypeEnum().notNull(),
    alcoholPercent: real('alcohol_percent'),
    regionId: uuid('region_id').references(() => regions.id, {
      onDelete: 'set null',
    }),
    description: text('description'),
    oneLiner: varchar('one_liner', { length: 280 }),
    imageUrl: varchar('image_url', { length: 512 }),
    producerId: uuid('producer_id')
      .references(() => producers.id, { onDelete: 'cascade' })
      .notNull(),
    parentWineId: uuid('parent_wine_id'),
    price: numeric('price', { precision: 8, scale: 2, mode: 'number' }),
    fermentationContainer: varchar('fermentation_container', { length: 100 }),
    oakAging: varchar('oak_aging', { length: 100 }),
    leesContact: varchar('lees_contact', { length: 100 }),
    sedimentContact: varchar('sediment_contact', { length: 100 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index('wine_producer_id_idx').on(t.producerId),
    index('wine_type_idx').on(t.type),
    index('wine_region_id_idx').on(t.regionId),
    index('wine_name_vintage_idx').on(t.name, t.vintage),
    index('wine_parent_wine_id_idx').on(t.parentWineId),
    foreignKey({
      columns: [t.parentWineId],
      foreignColumns: [t.id],
      name: 'wine_parent_wine_id_fk',
    }).onDelete('set null'),
  ],
)

/**
 * Wine-GrapeVariety junction table
 *
 * Enables wines to have one or multiple grape types (many-to-many).
 */
export const wineGrapeVarieties = createTable(
  'wine_grape_variety',
  (d) => ({
    id: uuid().primaryKey().defaultRandom().notNull(),
    wineId: uuid('wine_id')
      .references(() => wines.id, { onDelete: 'cascade' })
      .notNull(),
    grapeVarietyId: uuid('grape_variety_id')
      .references(() => grapeVarieties.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    unique('wine_grape_variety_wine_id_grape_variety_id_unique').on(t.wineId, t.grapeVarietyId),
    index('wine_grape_variety_wine_id_idx').on(t.wineId),
    index('wine_grape_variety_grape_variety_id_idx').on(t.grapeVarietyId),
  ],
)

// ============================================================================
// FAIR TABLES
// ============================================================================

/**
 * Fair table - wine fair events
 *
 * Represents a wine tasting event where producers present their wines.
 * Only one fair should be active at a time (enforced at application level).
 */
export const fairs = createTable(
  'fair',
  (d) => ({
    id: uuid().primaryKey().defaultRandom().notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: text('description'),
    location: varchar({ length: 255 }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    imageUrl: varchar('image_url', { length: 512 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index('fair_name_idx').on(t.name),
    index('fair_is_active_idx').on(t.isActive),
    index('fair_start_date_idx').on(t.startDate),
  ],
)

/**
 * Fair-Producer junction table
 *
 * Tracks which producers are registered at which fairs.
 * boothNumber is here (not on fair_wine) because at wine fairs,
 * producers have a single booth/stand where all their wines are displayed.
 */
export const fairProducers = createTable(
  'fair_producer',
  (d) => ({
    id: uuid().primaryKey().defaultRandom().notNull(),
    fairId: uuid('fair_id')
      .references(() => fairs.id, { onDelete: 'cascade' })
      .notNull(),
    producerId: uuid('producer_id')
      .references(() => producers.id, { onDelete: 'cascade' })
      .notNull(),
    boothNumber: varchar('booth_number', { length: 20 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    unique('fair_producer_fair_id_producer_id_unique').on(t.fairId, t.producerId),
    index('fair_producer_fair_id_idx').on(t.fairId),
    index('fair_producer_producer_id_idx').on(t.producerId),
  ],
)

/**
 * Fair-Wine junction table
 *
 * Tracks which wines are presented at which fairs.
 * A wine can appear at multiple fairs, but only once per fair.
 */
export const fairWines = createTable(
  'fair_wine',
  (d) => ({
    id: uuid().primaryKey().defaultRandom().notNull(),
    fairId: uuid('fair_id')
      .references(() => fairs.id, { onDelete: 'cascade' })
      .notNull(),
    wineId: uuid('wine_id')
      .references(() => wines.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    unique('fair_wine_fair_id_wine_id_unique').on(t.fairId, t.wineId),
    index('fair_wine_fair_id_idx').on(t.fairId),
    index('fair_wine_wine_id_idx').on(t.wineId),
  ],
)

// ============================================================================
// REVIEW & FAVORITES TABLES
// ============================================================================

/**
 * Review table - wine reviews/ratings by users
 *
 * Each user can review each wine exactly once (unique userId + wineId).
 * Characteristic ratings (color, aroma, etc.) are optional nullable fields,
 * flattened from a 1:1 relationship for query simplicity.
 */
export const reviews = createTable(
  'review',
  (d) => ({
    id: uuid().primaryKey().defaultRandom().notNull(),
    userId: uuid('user_id')
      .references(() => userProfiles.id, { onDelete: 'cascade' })
      .notNull(),
    wineId: uuid('wine_id')
      .references(() => wines.id, { onDelete: 'cascade' })
      .notNull(),
    rating: integer('rating').notNull(),
    notes: text('notes'),
    voiceNoteUrl: varchar('voice_note_url', { length: 512 }),
    colorRating: integer('color_rating'),
    aromaRating: integer('aroma_rating'),
    acidityRating: integer('acidity_rating'),
    tanninsRating: integer('tannins_rating'),
    bodyRating: integer('body_rating'),
    flavorRating: integer('flavor_rating'),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    unique('review_user_id_wine_id_unique').on(t.userId, t.wineId),
    index('review_user_id_idx').on(t.userId),
    index('review_wine_id_idx').on(t.wineId),
    index('review_rating_idx').on(t.rating),
  ],
)

/**
 * Favorites table - user wine favorites/bookmarks
 *
 * Each user can favorite each wine exactly once (unique userId + wineId).
 * No updatedAt needed since favorites are only created or deleted (toggled).
 */
export const favorites = createTable(
  'favorite',
  (d) => ({
    id: uuid().primaryKey().defaultRandom().notNull(),
    userId: uuid('user_id')
      .references(() => userProfiles.id, { onDelete: 'cascade' })
      .notNull(),
    wineId: uuid('wine_id')
      .references(() => wines.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    unique('favorite_user_id_wine_id_unique').on(t.userId, t.wineId),
    index('favorite_user_id_idx').on(t.userId),
    index('favorite_wine_id_idx').on(t.wineId),
  ],
)

// ============================================================================
// RELATIONS
// ============================================================================

export const regionRelations = relations(regions, ({ many }) => ({
  producers: many(producers),
  wines: many(wines),
}))

export const grapeVarietyRelations = relations(grapeVarieties, ({ many }) => ({
  wineGrapeVarieties: many(wineGrapeVarieties),
}))

export const userProfileRelations = relations(userProfiles, ({ one, many }) => ({
  producer: one(producers, {
    fields: [userProfiles.id],
    references: [producers.userId],
  }),
  reviews: many(reviews),
  favorites: many(favorites),
}))

export const producerRelations = relations(producers, ({ one, many }) => ({
  user: one(userProfiles, {
    fields: [producers.userId],
    references: [userProfiles.id],
  }),
  region: one(regions, {
    fields: [producers.regionId],
    references: [regions.id],
  }),
  wines: many(wines),
  fairProducers: many(fairProducers),
}))

export const wineRelations = relations(wines, ({ one, many }) => ({
  producer: one(producers, {
    fields: [wines.producerId],
    references: [producers.id],
  }),
  region: one(regions, {
    fields: [wines.regionId],
    references: [regions.id],
  }),
  parentWine: one(wines, {
    fields: [wines.parentWineId],
    references: [wines.id],
    relationName: 'wineVintages',
  }),
  vintages: many(wines, {
    relationName: 'wineVintages',
  }),
  wineGrapeVarieties: many(wineGrapeVarieties),
  fairWines: many(fairWines),
  reviews: many(reviews),
  favorites: many(favorites),
}))

export const wineGrapeVarietyRelations = relations(wineGrapeVarieties, ({ one }) => ({
  wine: one(wines, {
    fields: [wineGrapeVarieties.wineId],
    references: [wines.id],
  }),
  grapeVariety: one(grapeVarieties, {
    fields: [wineGrapeVarieties.grapeVarietyId],
    references: [grapeVarieties.id],
  }),
}))

// Fair relations

export const fairRelations = relations(fairs, ({ many }) => ({
  fairProducers: many(fairProducers),
  fairWines: many(fairWines),
}))

export const fairProducerRelations = relations(fairProducers, ({ one }) => ({
  fair: one(fairs, {
    fields: [fairProducers.fairId],
    references: [fairs.id],
  }),
  producer: one(producers, {
    fields: [fairProducers.producerId],
    references: [producers.id],
  }),
}))

export const fairWineRelations = relations(fairWines, ({ one }) => ({
  fair: one(fairs, {
    fields: [fairWines.fairId],
    references: [fairs.id],
  }),
  wine: one(wines, {
    fields: [fairWines.wineId],
    references: [wines.id],
  }),
}))

// Review & Favorite relations

export const reviewRelations = relations(reviews, ({ one }) => ({
  user: one(userProfiles, {
    fields: [reviews.userId],
    references: [userProfiles.id],
  }),
  wine: one(wines, {
    fields: [reviews.wineId],
    references: [wines.id],
  }),
}))

export const favoriteRelations = relations(favorites, ({ one }) => ({
  user: one(userProfiles, {
    fields: [favorites.userId],
    references: [userProfiles.id],
  }),
  wine: one(wines, {
    fields: [favorites.wineId],
    references: [wines.id],
  }),
}))
