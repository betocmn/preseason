import type postgres from 'postgres'

type ToolReconciliationRule = {
  sourceSlug: string
  targetSlug: string
  preferredAlias: string
}

const TOOL_RECONCILIATION_RULES: ToolReconciliationRule[] = [
  {
    sourceSlug: 'vercel-ci',
    targetSlug: 'vercel',
    preferredAlias: 'Vercel CI',
  },
]

function normalizeAlias(alias: string) {
  return alias.toLowerCase().trim()
}

type ReferenceCounts = {
  matchConfigCount: number
  matchBatchCount: number
}

async function getMatchReferenceCounts(
  sql: postgres.Sql,
  sourceToolId: string,
): Promise<ReferenceCounts> {
  const [row] = await sql<ReferenceCounts[]>`
    select
      (
        select count(*)::int
        from public.preseason_match_config
        where tool_a_id = ${sourceToolId}::uuid or tool_b_id = ${sourceToolId}::uuid
      ) as "matchConfigCount",
      (
        select count(*)::int
        from public.preseason_match_batch
        where tool_a_id = ${sourceToolId}::uuid or tool_b_id = ${sourceToolId}::uuid
      ) as "matchBatchCount"
  `

  return {
    matchConfigCount: Number(row?.matchConfigCount ?? 0),
    matchBatchCount: Number(row?.matchBatchCount ?? 0),
  }
}

async function reconcileTool(sql: postgres.Sql, rule: ToolReconciliationRule): Promise<boolean> {
  const [toolIds] = await sql<Array<{ sourceId: string | null; targetId: string | null }>>`
    select
      (
        select id::text
        from public.preseason_tool
        where slug = ${rule.sourceSlug}
        limit 1
      ) as "sourceId",
      (
        select id::text
        from public.preseason_tool
        where slug = ${rule.targetSlug}
        limit 1
      ) as "targetId"
  `

  const sourceToolId = toolIds?.sourceId
  const targetToolId = toolIds?.targetId

  if (!sourceToolId) {
    return false
  }

  if (!targetToolId) {
    throw new Error(
      `Unable to reconcile duplicate tool "${rule.sourceSlug}": target "${rule.targetSlug}" not found`,
    )
  }

  const matchRefs = await getMatchReferenceCounts(sql, sourceToolId)
  if (matchRefs.matchConfigCount > 0 || matchRefs.matchBatchCount > 0) {
    const details = [
      matchRefs.matchConfigCount > 0 ? `match_config=${matchRefs.matchConfigCount}` : null,
      matchRefs.matchBatchCount > 0 ? `match_batch=${matchRefs.matchBatchCount}` : null,
    ]
      .filter((detail): detail is string => detail !== null)
      .join(', ')

    console.warn(
      `Skipping duplicate tool reconciliation for "${rule.sourceSlug}" because legacy match data still references it: ${details}`,
    )

    return false
  }

  const preferredAlias = rule.preferredAlias
  const normalizedPreferredAlias = normalizeAlias(preferredAlias)

  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as postgres.Sql

    await tx`
      insert into public.preseason_tool_category (id, tool_id, category_id, is_primary)
      select
        gen_random_uuid(),
        ${targetToolId}::uuid,
        source.category_id,
        case
          when exists (
            select 1
            from public.preseason_tool_category existing_primary
            where existing_primary.tool_id = ${targetToolId}::uuid
              and existing_primary.is_primary = true
          ) then false
          else source.is_primary
        end
      from public.preseason_tool_category source
      where source.tool_id = ${sourceToolId}::uuid
        and not exists (
          select 1
          from public.preseason_tool_category existing
          where existing.tool_id = ${targetToolId}::uuid
            and existing.category_id = source.category_id
        )
    `

    await tx`
      delete from public.preseason_tool_category
      where tool_id = ${sourceToolId}::uuid
    `

    await tx`
      update public.preseason_tool_alias
      set tool_id = ${targetToolId}::uuid
      where tool_id = ${sourceToolId}::uuid
    `

    await tx`
      insert into public.preseason_tool_alias (
        id,
        tool_id,
        alias,
        normalized_alias,
        source,
        "createdAt"
      )
      select
        gen_random_uuid(),
        ${targetToolId}::uuid,
        ${preferredAlias},
        ${normalizedPreferredAlias},
        'catalog_reconciliation',
        now()
      where not exists (
        select 1
        from public.preseason_tool_alias
        where normalized_alias = ${normalizedPreferredAlias}
      )
    `

    await tx`
      update public.preseason_benchmark_case_decision
      set tool_id = ${targetToolId}::uuid
      where tool_id = ${sourceToolId}::uuid
    `

    await tx`
      update public.preseason_tool_candidate
      set
        approved_tool_id = case
          when approved_tool_id = ${sourceToolId}::uuid then ${targetToolId}::uuid
          else approved_tool_id
        end,
        ai_suggested_tool_id = case
          when ai_suggested_tool_id = ${sourceToolId}::uuid then ${targetToolId}::uuid
          else ai_suggested_tool_id
        end
      where approved_tool_id = ${sourceToolId}::uuid
         or ai_suggested_tool_id = ${sourceToolId}::uuid
    `

    await tx`
      update public.preseason_match_evaluation
      set winner_id = ${targetToolId}::uuid
      where winner_id = ${sourceToolId}::uuid
    `

    await tx`
      update public.preseason_comment
      set target_id = ${targetToolId}::uuid
      where target_type = 'tool'
        and target_id = ${sourceToolId}::uuid
    `

    await tx`
      delete from public.preseason_tool
      where id = ${sourceToolId}::uuid
    `
  })

  return true
}

export async function ensureCanonicalToolReconciliation(sql: postgres.Sql): Promise<void> {
  for (const rule of TOOL_RECONCILIATION_RULES) {
    await reconcileTool(sql, rule)
  }
}
