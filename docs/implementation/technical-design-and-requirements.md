# Wine2cents Web App - Technical Design & Estimation

## Project Overview

Wine2cents is a wine rating and review web application designed for wine fair attendees and producers. The app allows users to scan wine labels, rate wines, take notes, and share their reviews.

## Development Constraints

- **Sprint Duration**: 2 weeks per sprint
- **Time Commitment**: 2 hours per week (4 hours per sprint)
- **Total MVP Timeline**: 3 months (6 sprints)
- **Tech Stack**: T3 (Next.js, TypeScript, tRPC, Tailwind), Supabase, Vercel

## MVP Sprint Breakdown (3 Months)

| Sprint | Duration | Features | Hours | Status |
| --- | --- | --- | --- | --- |
| **Sprint 1** | Weeks 1-2 | **Foundation & Authentication** | 4 hours | 🔴 Critical |
|  |  | • Supabase Auth setup (email/password + Google OAuth) |  |  |
|  |  | • Database schema design (all tables) |  |  |
|  |  | • Login/Signup pages with email verification |  |  |
|  |  | • Basic user profile structure |  |  |
| **Sprint 2** | Weeks 3-4 | **Core Data Models & Search** | 4 hours | 🔴 Critical |
|  |  | • Wine, Producer, Review CRUD operations |  |  |
|  |  | • Text search with filters (type, price, grape, region) |  |  |
|  |  | • Search results page with pagination |  |  |
|  |  | • Mobile-responsive wine cards |  |  |
| **Sprint 3** | Weeks 5-6 | **Wine Details & Rating System** | 4 hours | 🔴 Critical |
|  |  | • Wine detail pages with all attributes |  |  |
|  |  | • 5-star rating component |  |  |
|  |  | • Characteristic sliders (color, aroma, etc.) |  |  |
|  |  | • Text notes & save functionality |  |  |
|  |  | • Swipe navigation between wines |  |  |
| **Sprint 4** | Weeks 7-8 | **User Features & Reviews** | 4 hours | 🟡 High |
|  |  | • My Reviews page |  |  |
|  |  | • My Favorites functionality |  |  |
|  |  | • Edit/Delete reviews |  |  |
|  |  | • Basic user dashboard |  |  |
| **Sprint 5** | Weeks 9-10 | **Producer & Admin Features** | 4 hours | 🟡 High |
|  |  | • Producer profiles & dashboard |  |  |
|  |  | • Wine management for producers |  |  |
|  |  | • Master user roles for data management |  |  |
|  |  | • Bulk import functionality |  |  |
| **Sprint 6** | Weeks 11-12 | **Export, Share & Polish** | 4 hours | 🟡 High |
|  |  | • PDF generation for reviews |  |  |
|  |  | • Email/WhatsApp sharing |  |  |
|  |  | • Camera integration for label scanning |  |  |
|  |  | • Final UI polish & bug fixes |  |  |
|  |  | • Production deployment |  |  |

### **Total MVP Timeline: 12 weeks (3 months)**

### **Total MVP Hours: 24 hours**

---

## Post-MVP Development

### AI Recommendations Feature (After Month 3)

| Sprint | Duration | Features | Hours |
| --- | --- | --- | --- |
| **AI Sprint 1** | Weeks 13-14 | **Data Analysis & Model Setup** | 4 hours |
|  |  | • User preference analysis system |  |
|  |  | • Wine similarity algorithms |  |
|  |  | • Basic recommendation engine |  |
| **AI Sprint 2** | Weeks 15-16 | **AI Integration & UI** | 4 hours |
|  |  | • Recommendation API endpoints |  |
|  |  | • "Next Wine to Try" UI component |  |
|  |  | • Personalization based on ratings |  |

---

## Future Development (Not Scoped)

These features can be developed after the AI recommendation system:

- **Voice Search Integration** - Voice commands for searching wines
- **Ticket Integration** - Integration with Urbo ticketing platform
- **Gamification System** - Points, badges, achievements for rating wines
- **Wine Sales Platform** - E-commerce functionality for exclusive wines
- **Dynamic Pricing** - Algorithm-based pricing for wine sales
- **Advanced Analytics** - Wine preference analytics for producers

---

## Technical Architecture

### Frontend

- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS
- **State Management**: React Query (via tRPC)
- **UI Components**: Shadcn/ui
- **Internationalization (i18n)**: Support for English and Bulgarian languages

### Backend

- **API**: tRPC for type-safe APIs
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **File Storage**: Supabase Storage
- **Hosting**: Vercel

### Database Schema

```sql
-- Core tables needed from Sprint 1
users (id, email, first_name, last_name, role, created_at)
producers (id, name, region, user_id)
wines (id, name, vintage, type, grape, alcohol, producer_id, region, image_url, parent_wine_id)
reviews (id, user_id, wine_id, rating, notes, created_at, updated_at)
wine_characteristics (id, review_id, color, aroma, acidity, tannins, body, flavor)
favorites (user_id, wine_id, created_at)

-- parent_wine_id: Self-referential FK to link vintages of the same wine.
--   Allows tracking that multiple wines are related (e.g., same wine, different years)
--   while each vintage maintains independent ratings and reviews.

-- Note: When adding wines to a fair, producers can select an existing wine from the
--   catalog instead of creating a new entry, avoiding duplicates.
```

### Key Integrations

- **OCR**: Google Vision API (Sprint 6)
- **PDF**: React-PDF
- **Sharing**: Native Web Share API
- **Camera**: WebRTC/getUserMedia

---

## Development Approach

### Sprint 1-2: Foundation (Weeks 1-4)

Focus on getting authentication working perfectly and establishing the data structure. By end of Sprint 2, users can search and view wines.

### Sprint 3-4: Core Features (Weeks 5-8)

Complete the main user journey: finding wines, rating them, and managing reviews. This provides the core value proposition.

### Sprint 5-6: Polish & Producer Tools (Weeks 9-12)

Add producer capabilities, sharing features, and ensure the app is production-ready with label scanning.

---

## Risk Mitigation

1. **Camera/Label Scanning**: If OCR complexity is high, launch with manual search and add scanning in a patch
2. **Producer Adoption**: Master users can handle initial data entry
3. **Performance**: Use Vercel Image Optimization and edge functions

---

## MVP Success Criteria

By the end of 3 months, users can:
✅ Create accounts and login
✅ Search wines by multiple criteria
✅ Rate wines and characteristics
✅ Save notes and favorites
✅ Export and share reviews
✅ Scan labels to find wines
✅ Producers can manage their wine listings