# Customer Description of Requirements

## I. Front-end functionalities

### 1. Landing page
The landing page should be very simple in order not to push away people when they first open the app. It should include:

**2 boxes:**
- Username (email)
- Password

**2 buttons:**
- Login / Login with Google
- Create new account -> Fill out the boxes:
  - First name
  - Last name
  - Username (email)
  - Password
  - Captcha or similar tool
  -> Go to your inbox to confirm your email using the link
  -> Login successful -> Homepage

### 2. Homepage
My view is that the structure should be focused on the wine, rather than on the producer, on how the stands on the fair are arranged, etc. It should include:

- **Camera button (Label scan)** – opens your camera to scan a wine label (exactly like Wine-searcher). I strongly think that this is an essential feature.
- **Voice command button** – searches for a winery or a specific wine by a voice command
- **Search bar** – allows searching by producer name, wine name, grape variety, etc.
- **Advanced search options**
  - By type of wine: white/red/rose/orange/sparkling/dessert
  - By price range: below 9 EUR/between 9 and 18 EUR/above 18 EUR
  - By grape variety
  - By producer name
  - By region (best to stick to 9 regions for Bulgaria)

### 3. Search results
List of wines (one or more wines). The page of each wine should include a short description of the wine:

- Picture (of the label)
- Full wine name
- Vintage
- Type of wine (white/red/rose/orange/sparkling/dessert)
- Grape variety
- Alc.%
- Producer name
- Region

**The user can then take the following actions:**
- **Rate the wine** – between 1 and 5 stars
- **Add to favorites**
- **Rate/take note of the following characteristics of the wine:**
  - Color
  - Aroma
  - Acidity
  - Tannins
  - Body
  - Flavor

The exact list of these characteristics can be revised later. These characteristics can also be rated on the scale from 1 to 5, but their design should be different from the 1-5 stars general rating above – for example there could be a sliding bar for each of them (instead of stars)

- **Take notes** (typing box)
- **Take voice notes** (this is not an essential feature, but could be fun to use)
- **Save review button** at the end

If there are more wines that come up from the search, it would be best to slide left and right from one wine to another (rather than scroll down)

### 4. Bottom navigation
At the bottom of each page there should be the following quick links:

- **My reviews** – list of all wines that have been reviewed
- **My favorites** – list of all wines that have been added to 'Favorites'
- **Share my reviews** – this option should compile an easy-to-use pdf file with all your reviews that you can quickly send to your email or share with other people:
  - Send by email
  - Share via WhatsApp
  - Share via Viber
  - Or share via other messenger apps (if needed)

  I think that this is a very important feature that people will love.

- **Privacy policy** (GDPR compliance)

### 5. Multilanguage Support
The app should support both English and Bulgarian languages. Users should be able to switch between languages easily from the UI. All interface text, labels, buttons, and system messages should be translated.

---

## II. Back-end functionalities

### 1. Winery profile
Each producer should have a profile where they can add the wines that they will be presenting at the specific wine fair. The producers should add all the info from the wine description above:

- Picture (of the label)
- Full wine name
- Vintage
- Type of wine (white/red/rose/orange/sparkling/dessert)
- Grape variety
- Alc.%
- Producer name
- Region

Ideally, the producers should add more info that would not appear on the front-end of the app (it will be only used for our own analysis later):
- Fermentation container – stainless steel tank/barrel/kvevri, etc.
- Oak aging – yes/no (if yes – how long)
- Lees contact
- Sediment contact

In the beginning this info could be added by the fair organizers and/or by us – when each winery registers for the event. I.e. we don't necessarily need from the very beginning a profile for each winery where they can login and add their wines (although that would be useful).

**Adding wines to a fair:**
- When adding a wine to a fair, producers should be able to select an existing wine from the catalog (not just create a new one). This avoids duplicate entries and allows reusing wine data across multiple fairs.
- When adding a new wine, producers should be able to link it to an existing wine to indicate it is a new vintage of the same wine. These linked wines are specific entries that can receive their own ratings, but the system tracks that they are related (e.g., same wine, different years).

### 2. Master user profile
We know from experience that some wineries will fail to add info about their wines and it is crucial that the app contains info about all wines at the specific event, so that the app is actually useful for the users. This means that there should be several master user profiles that can add new wines and add/correct info of existing wines. We might have to hire 2-3 people to go through all stands at the beginning of each fair – to make sure that all wines have been added.

---

## III. Future development

1. **AI tool** – recommends the next wine to try at the fair based on your reviews so far
2. **Functionality to buy tickets** for the wine fair (most probably it would be easier to make an integration with an existing ticket merchant – most wine fairs in Bulgaria use Urbo: https://urboapp.com/)
3. **Encourage users to add more info** about themselves – age, sex, current city, etc., make them take fun questionnaires about their own personal preferences (about food, drinks, etc.)
4. **Encourage users to rate more wines** – this can be boosted by an element of gamification (e.g. earning points and receiving prizes for reaching certain milestones, etc.)
5. **Develop a functionality to sell unique wines** to the users – this could include the options to:
   - Offer certain wines to specific users only – based on their preferences
   - Allow users to pre-order
   - Limit the number of bottles each use can buy, show countdowns and other tricks to emphasize on the exclusivity element
   - Introduce dynamic pricing if a certain wine starts selling too quickly

**End goal:** To be able to sell unique wines to the userbase ("wine of the month" – between 300 and 3000 bottles per wine). These wines should be different from any other wine on the market (different vintage, different grape variety/blend) so that they are difficult to be compared with others on price.
