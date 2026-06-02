'use client'

import { Filter } from 'lucide-react'
import { CategoryTreeSidebar } from '~/components/public/category-tree-sidebar'
import { Button } from '~/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '~/components/ui/sheet'

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

type MobileCategoryTriggerProps = {
  groups: CategoryGroup[]
  section: 'rankings' | 'matches' | 'critics'
}

export function MobileCategoryTrigger({ groups, section }: MobileCategoryTriggerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter className="mr-2 h-4 w-4" />
          Categories
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 pt-8">
        <CategoryTreeSidebar groups={groups} section={section} />
      </SheetContent>
    </Sheet>
  )
}
