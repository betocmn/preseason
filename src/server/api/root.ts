import { fairRouter } from '~/server/api/routers/fair'
import { favoriteRouter } from '~/server/api/routers/favorite'
import { grapeVarietyRouter } from '~/server/api/routers/grape-variety'
import { producerRouter } from '~/server/api/routers/producer'
import { regionRouter } from '~/server/api/routers/region'
import { reviewRouter } from '~/server/api/routers/review'
import { userRouter } from '~/server/api/routers/user'
import { wineRouter } from '~/server/api/routers/wine'
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc'

export const appRouter = createTRPCRouter({
  user: userRouter,
  producer: producerRouter,
  wine: wineRouter,
  fair: fairRouter,
  region: regionRouter,
  grapeVariety: grapeVarietyRouter,
  review: reviewRouter,
  favorite: favoriteRouter,
})

export type AppRouter = typeof appRouter
export const createCaller = createCallerFactory(appRouter)
