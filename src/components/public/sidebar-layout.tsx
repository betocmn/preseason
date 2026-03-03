import { CategoryTreeSidebar } from '~/components/public/category-tree-sidebar'
import { MobileCategoryTrigger } from '~/components/public/mobile-category-trigger'

type Subcategory = {
  id: string
  name: string
  slug: string
}

type CategoryGroup = {
  id: string
  name: string
  slug: string
  subcategories: Subcategory[]
}

type SidebarLayoutProps = {
  groups: CategoryGroup[]
  section: 'rankings' | 'matches' | 'critics' | 'prompts'
  children: React.ReactNode
}

export function SidebarLayout({ groups, section, children }: SidebarLayoutProps) {
  return (
    <div className="container py-6">
      <div className="mb-4 md:hidden">
        <MobileCategoryTrigger groups={groups} section={section} />
      </div>
      <div className="flex gap-8">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-4">
            <CategoryTreeSidebar groups={groups} section={section} />
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
