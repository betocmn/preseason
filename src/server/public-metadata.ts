import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { serverSettings } from '~/constants/server-settings'
import { db } from '~/server/db'
import {
  categories,
  criticProfiles,
  prompts,
  subcategories,
  tools,
  userProfiles,
} from '~/server/db/schema'
import type { PromptLevel } from '~/server/llm/prompts'

// Social previews and page titles need labels, never benchmark history or comments.
export async function getRankingGroupMetadata(slug: string, database = db) {
  if (!serverSettings.publicSite.categoryGroupSlugs.includes(slug)) return null
  const [group] = await database
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1)
  return group ?? null
}

export async function getRankingCategoryMetadata(groupSlug: string, slug: string, database = db) {
  if (!serverSettings.publicSite.categoryGroupSlugs.includes(groupSlug)) return null
  const [category] = await database
    .select({ name: subcategories.name })
    .from(subcategories)
    .innerJoin(categories, eq(subcategories.categoryId, categories.id))
    .where(and(eq(subcategories.slug, slug), eq(categories.slug, groupSlug)))
    .limit(1)
  return category ?? null
}

export async function getMatchMetadata(
  input: {
    categorySlug: string
    toolASlug: string
    toolBSlug: string
  },
  database = db,
) {
  const [category] = await database
    .select({ name: subcategories.name })
    .from(subcategories)
    .innerJoin(categories, eq(subcategories.categoryId, categories.id))
    .where(
      and(
        eq(subcategories.slug, input.categorySlug),
        inArray(categories.slug, [...serverSettings.publicSite.categoryGroupSlugs]),
      ),
    )
    .limit(1)
  if (!category) return { category: null, toolA: null, toolB: null }
  const selectedTools = await database
    .select({ name: tools.name, slug: tools.slug })
    .from(tools)
    .where(inArray(tools.slug, [input.toolASlug, input.toolBSlug]))
  return {
    category: category ?? null,
    toolA: selectedTools.find((tool) => tool.slug === input.toolASlug) ?? null,
    toolB: selectedTools.find((tool) => tool.slug === input.toolBSlug) ?? null,
  }
}

export async function getToolMetadata(slug: string, database = db) {
  const [tool] = await database
    .select({ name: tools.name, description: tools.description })
    .from(tools)
    .where(eq(tools.slug, slug))
    .limit(1)
  return tool ?? null
}

export async function getPromptMetadata(slug: string, level: PromptLevel, database = db) {
  const [prompt] = await database
    .select({ title: prompts.title, description: prompts.description })
    .from(prompts)
    .where(and(eq(prompts.slug, slug), eq(prompts.level, level)))
    .limit(1)
  return prompt ?? null
}

export async function getCriticMetadata(slug: string, database = db) {
  const [critic] = await database
    .select({ displayName: userProfiles.displayName, bio: userProfiles.bio })
    .from(criticProfiles)
    .innerJoin(userProfiles, eq(criticProfiles.userId, userProfiles.id))
    .where(
      and(
        eq(criticProfiles.slug, slug),
        eq(criticProfiles.isActive, true),
        isNotNull(criticProfiles.verifiedAt),
      ),
    )
    .limit(1)
  return critic ?? null
}
