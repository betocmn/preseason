import { TRPCError } from '@trpc/server'
import { and, count, desc, eq, gte, ilike, inArray, lte, or, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { grapeVarieties, producers, regions, wineGrapeVarieties, wines } from '~/server/db/schema'

const wineTypeValues = ['white', 'red', 'rose', 'orange', 'sparkling', 'dessert'] as const

export const wineRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        type: z.enum(wineTypeValues).optional(),
        grapeVarietyId: z.string().uuid().optional(),
        regionId: z.string().uuid().optional(),
        minPrice: z.number().min(0).optional(),
        maxPrice: z.number().min(0).optional(),
        producerId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // If filtering by grape variety, first find matching wine IDs
      let grapeFilterWineIds: string[] | undefined
      if (input.grapeVarietyId) {
        const matchingWines = await ctx.db
          .select({ wineId: wineGrapeVarieties.wineId })
          .from(wineGrapeVarieties)
          .where(eq(wineGrapeVarieties.grapeVarietyId, input.grapeVarietyId))
        grapeFilterWineIds = matchingWines.map((w) => w.wineId)
        if (grapeFilterWineIds.length === 0) {
          return { items: [], total: 0 }
        }
      }

      const conditions: SQL[] = []

      if (input.type) conditions.push(eq(wines.type, input.type))
      if (input.regionId) conditions.push(eq(wines.regionId, input.regionId))
      if (input.minPrice !== undefined) conditions.push(gte(wines.price, input.minPrice))
      if (input.maxPrice !== undefined) conditions.push(lte(wines.price, input.maxPrice))
      if (input.producerId) conditions.push(eq(wines.producerId, input.producerId))
      if (grapeFilterWineIds) conditions.push(inArray(wines.id, grapeFilterWineIds))

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined

      const [items, totalResult] = await Promise.all([
        ctx.db
          .select({
            wine: wines,
            producerName: producers.name,
            regionName: regions.name,
          })
          .from(wines)
          .leftJoin(producers, eq(wines.producerId, producers.id))
          .leftJoin(regions, eq(wines.regionId, regions.id))
          .where(whereClause)
          .limit(input.limit)
          .offset(input.offset),
        ctx.db.select({ count: count() }).from(wines).where(whereClause),
      ])

      return { items, total: totalResult[0]?.count ?? 0 }
    }),

  listRecent: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(20).default(6),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          wine: wines,
          producerName: producers.name,
          regionName: regions.name,
        })
        .from(wines)
        .leftJoin(producers, eq(wines.producerId, producers.id))
        .leftJoin(regions, eq(wines.regionId, regions.id))
        .orderBy(desc(wines.createdAt))
        .limit(input.limit)
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const wine = await ctx.db.query.wines.findFirst({
        where: eq(wines.id, input.id),
        with: {
          producer: true,
          region: true,
          wineGrapeVarieties: {
            with: { grapeVariety: true },
          },
        },
      })

      if (!wine) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Wine not found' })
      }

      return wine
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        vintage: z.number().int().min(1800).max(2100).optional(),
        type: z.enum(wineTypeValues),
        alcoholPercent: z.number().min(0).max(100).optional(),
        regionId: z.string().uuid().optional(),
        description: z.string().optional(),
        oneLiner: z.string().max(280).optional(),
        imageUrl: z.string().url().max(512).optional(),
        producerId: z.string().uuid(),
        parentWineId: z.string().uuid().optional(),
        price: z.number().min(0).optional(),
        fermentationContainer: z.string().max(100).optional(),
        oakAging: z.string().max(100).optional(),
        leesContact: z.string().max(100).optional(),
        sedimentContact: z.string().max(100).optional(),
        grapeVarietyIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await requireRole(ctx.db, ctx.user.id, ['admin', 'producer'])

      if (profile.role === 'producer') {
        const producer = await ctx.db.query.producers.findFirst({
          where: eq(producers.id, input.producerId),
        })
        if (!producer || producer.userId !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Producers can only create wines for their own producer profile',
          })
        }
      }

      const { grapeVarietyIds, ...wineData } = input

      const result = await ctx.db
        .insert(wines)
        .values({
          name: wineData.name,
          vintage: wineData.vintage,
          type: wineData.type,
          alcoholPercent: wineData.alcoholPercent,
          regionId: wineData.regionId,
          description: wineData.description,
          oneLiner: wineData.oneLiner,
          imageUrl: wineData.imageUrl,
          producerId: wineData.producerId,
          parentWineId: wineData.parentWineId,
          price: wineData.price,
          fermentationContainer: wineData.fermentationContainer,
          oakAging: wineData.oakAging,
          leesContact: wineData.leesContact,
          sedimentContact: wineData.sedimentContact,
        })
        .returning()

      const wine = result[0]

      if (wine && grapeVarietyIds && grapeVarietyIds.length > 0) {
        await ctx.db
          .insert(wineGrapeVarieties)
          .values(grapeVarietyIds.map((gvId) => ({ wineId: wine.id, grapeVarietyId: gvId })))
      }

      return wine
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        vintage: z.number().int().min(1800).max(2100).optional().nullable(),
        type: z.enum(wineTypeValues).optional(),
        alcoholPercent: z.number().min(0).max(100).optional().nullable(),
        regionId: z.string().uuid().optional().nullable(),
        description: z.string().optional().nullable(),
        oneLiner: z.string().max(280).optional().nullable(),
        imageUrl: z.string().url().max(512).optional().nullable(),
        parentWineId: z.string().uuid().optional().nullable(),
        price: z.number().min(0).optional().nullable(),
        fermentationContainer: z.string().max(100).optional().nullable(),
        oakAging: z.string().max(100).optional().nullable(),
        leesContact: z.string().max(100).optional().nullable(),
        sedimentContact: z.string().max(100).optional().nullable(),
        grapeVarietyIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await requireRole(ctx.db, ctx.user.id, ['admin', 'producer'])

      const existing = await ctx.db.query.wines.findFirst({
        where: eq(wines.id, input.id),
      })

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Wine not found' })
      }

      if (profile.role === 'producer') {
        const producer = await ctx.db.query.producers.findFirst({
          where: eq(producers.id, existing.producerId),
        })
        if (!producer || producer.userId !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Producers can only update wines belonging to their producer profile',
          })
        }
      }

      const { id: _, grapeVarietyIds, ...fields } = input
      const updateData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updateData[key] = value
        }
      }

      let result = existing
      if (Object.keys(updateData).length > 0) {
        const updated = await ctx.db
          .update(wines)
          .set(updateData)
          .where(eq(wines.id, input.id))
          .returning()
        if (updated[0]) result = updated[0]
      }

      if (grapeVarietyIds !== undefined) {
        await ctx.db.delete(wineGrapeVarieties).where(eq(wineGrapeVarieties.wineId, input.id))
        if (grapeVarietyIds.length > 0) {
          await ctx.db
            .insert(wineGrapeVarieties)
            .values(grapeVarietyIds.map((gvId) => ({ wineId: input.id, grapeVarietyId: gvId })))
        }
      }

      return result
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const result = await ctx.db.delete(wines).where(eq(wines.id, input.id)).returning()

      if (!result[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Wine not found' })
      }

      return result[0]
    }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(255),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
        type: z.enum(wineTypeValues).optional(),
        grapeVarietyId: z.string().uuid().optional(),
        regionId: z.string().uuid().optional(),
        minPrice: z.number().min(0).optional(),
        maxPrice: z.number().min(0).optional(),
        producerId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const escaped = input.query.replace(/%/g, '\\%').replace(/_/g, '\\_')
      const searchPattern = `%${escaped}%`

      // Find wine IDs matching by grape variety name (text search)
      const grapeMatchWineIds = await ctx.db
        .select({ wineId: wineGrapeVarieties.wineId })
        .from(wineGrapeVarieties)
        .innerJoin(grapeVarieties, eq(wineGrapeVarieties.grapeVarietyId, grapeVarieties.id))
        .where(ilike(grapeVarieties.name, searchPattern))

      // Find wine IDs matching by region name (text search)
      const regionMatchWineIds = await ctx.db
        .select({ id: wines.id })
        .from(wines)
        .innerJoin(regions, eq(wines.regionId, regions.id))
        .where(ilike(regions.name, searchPattern))

      const matchedWineIds = [
        ...new Set([
          ...grapeMatchWineIds.map((r) => r.wineId),
          ...regionMatchWineIds.map((r) => r.id),
        ]),
      ]

      const searchCondition = or(
        ilike(wines.name, searchPattern),
        ilike(producers.name, searchPattern),
        matchedWineIds.length > 0 ? inArray(wines.id, matchedWineIds) : undefined,
      )

      // Build optional filter conditions
      const filterConditions: SQL[] = []
      if (input.type) filterConditions.push(eq(wines.type, input.type))
      if (input.regionId) filterConditions.push(eq(wines.regionId, input.regionId))
      if (input.minPrice !== undefined) filterConditions.push(gte(wines.price, input.minPrice))
      if (input.maxPrice !== undefined) filterConditions.push(lte(wines.price, input.maxPrice))
      if (input.producerId) filterConditions.push(eq(wines.producerId, input.producerId))

      // Grape variety filter (by ID, separate from text search)
      if (input.grapeVarietyId) {
        const matchingWines = await ctx.db
          .select({ wineId: wineGrapeVarieties.wineId })
          .from(wineGrapeVarieties)
          .where(eq(wineGrapeVarieties.grapeVarietyId, input.grapeVarietyId))
        const ids = matchingWines.map((w) => w.wineId)
        if (ids.length === 0) {
          return { items: [], total: 0 }
        }
        filterConditions.push(inArray(wines.id, ids))
      }

      const finalCondition =
        filterConditions.length > 0 ? and(searchCondition, ...filterConditions) : searchCondition

      const [items, totalResult] = await Promise.all([
        ctx.db
          .select({
            wine: wines,
            producerName: producers.name,
            regionName: regions.name,
          })
          .from(wines)
          .leftJoin(producers, eq(wines.producerId, producers.id))
          .leftJoin(regions, eq(wines.regionId, regions.id))
          .where(finalCondition)
          .limit(input.limit)
          .offset(input.offset),
        ctx.db
          .select({ count: count() })
          .from(wines)
          .leftJoin(producers, eq(wines.producerId, producers.id))
          .where(finalCondition),
      ])

      return { items, total: totalResult[0]?.count ?? 0 }
    }),
})
