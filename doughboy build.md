# Restaurant AI Agent — Build Phases

## Phase 1: MVP (Weeks 1-4)
- Build a Next.js PWA (works on phone browser + desktop) with Supabase database and Claude API as the AI brain.
- Core feature: restaurant manager uploads CSV/Excel exports of sales, food costs, and labor — AI analyzes and returns actionable margin recommendations.
- Add receipt/invoice photo scanning using Claude Vision API so managers can snap photos instead of uploading files.
- Deploy on Vercel (free tier) and get 5-10 local Jacksonville restaurants using it for free to test.

## Phase 2: First API Integration + Sticky Features (Weeks 5-10)
- Integrate Square API first (open, free, most used by independent restaurants) so data pulls automatically instead of manual uploads.
- Build automated weekly email/SMS reports summarizing margin insights and recommendations.
- Add proactive push notifications — "your food cost jumped 4% this week, here's why" — this is your key differentiator vs ClearCOGS and MarginEdge.
- Start charging $50-99/month to early users; target 20-50 paying restaurants.

## Phase 3: Benchmarking + More Integrations (Months 3-6)
- Add Toast Partner API, Clover API, and QuickBooks API to become truly POS-agnostic.
- Build the benchmarking layer — once you have 30+ restaurants, show each one how they compare to similar restaurants anonymously.
- Create case studies proving real dollar savings for your first customers — these are your sales weapons.
- Expand beyond Jacksonville to other Florida markets.

## Phase 4: Proactive Agent Mode (Months 6-9)
- Shift from "dashboard you check" to "agent that texts you" — real-time staffing alerts ("send someone home at 3pm"), supplier price spike warnings, and dynamic menu pricing suggestions.
- Integrate weather and local event data to predict demand and make staffing/prep recommendations.
- This is the moat — nobody else does the full proactive agent experience on mobile.

## Phase 5: Scale + Fundraise (Months 9-15)
- Target 200-500 paying restaurants to demonstrate traction for pre-seed/seed fundraise ($500K-$1M).
- Pitch restaurant-focused VCs: Kitchen Fund, Branded Hospitality Ventures, Enlightened Hospitality Investments, Techstars Farm to Fork.
- Use funding to hire 1-2 engineers for integration maintenance and add group purchasing network (negotiate supplier deals on behalf of your restaurant base).

## Phase 6: Revenue Expansion + Series A (Months 15-24)
- Layer on revenue streams beyond SaaS: group purchasing commissions, restaurant lending/financing partnerships, anonymized market intelligence sales to distributors and CPG brands.
- Scale to 700-1,100 paying restaurants ($1-2M ARR) to hit Series A benchmarks.
- Raise Series A ($5-10M) and expand nationally.

---

## 7 Moats — How We Beat ClearCOGS and Everyone Else

### Moat 1: Self-Serve Onboarding for SMBs
- ClearCOGS takes 3 weeks to onboard with a consultative setup — we target same-day value.
- Owner uploads CSV or connects Square, gets first margin insight in 10-15 minutes, no sales call needed.
- This is the Deel playbook — anyone can sign up and get value immediately.
- ClearCOGS can't go downmarket without killing their high-touch model.

### Moat 2: Full P&L Agent, Not Just Prep Forecasting
- ClearCOGS answers "how much chicken should I prep today?" — we answer everything else.
- We cover menu pricing, labor waste, supplier cost spikes, overhead, and overall margin health.
- We tell them their chicken parm is losing money, their Tuesday lunch is overstaffed, and their beer margin is 18% when it should be 75%.

### Moat 3: Conversational Phone Interface
- Nobody has a true mobile-first conversational agent in this space.
- Owner texts the app "how did we do last night?" and gets a plain-English answer with dollar amounts.
- Restaurant owners live on their phones — they're never sitting at a desktop looking at dashboards.
- ClearCOGS sends a daily email prep sheet — that's a report, not an advisor in your pocket.

### Moat 4: Benchmarking Network Effects
- Once we have 200+ restaurants, every new restaurant makes the product better for everyone.
- "Your food cost is 33% — similar casual dining spots in your area average 28%."
- Classic network effect — the more restaurants join, the harder it is for anyone to compete with our data.
- This data advantage compounds over time and can't be replicated without getting the same number of restaurants.

### Moat 5: Supplier Marketplace / Group Purchasing
- Once we see 500 restaurants all paying different prices for the same chicken from the same distributor, we negotiate group deals.
- We become a group purchasing organization and take a cut of the savings.
- ClearCOGS doesn't do this, MarginEdge doesn't do this — this alone could be bigger than the SaaS subscription.

### Moat 6: "What If" Simulator
- Owner asks "what happens to my margin if I raise burger price by $1?" — AI simulates the impact using their actual data.
- "What if I cut one server on Tuesdays?" — AI shows the projected labor savings vs. potential service impact.
- ClearCOGS talks about this concept on their blog but hasn't built it.

### Moat 7: The Learning Loop (Gets Smarter Over Time)
- When the AI recommends "raise your burger by $1.50" and the owner does it, we track what actually happened to sales.
- Over time, our AI has seen thousands of real-world pricing changes, menu removals, and staffing cuts across hundreds of restaurants.
- We know what actually works — not in theory, but from real results across our network.
- This outcome dataset is nearly impossible for a new competitor to replicate.

---

## AI Logic — The 4 Layers (How the Brain Actually Works)

### Layer 1: Data Processor (code you write, just math)
- Food cost % per menu item = (ingredient cost / menu price) × 100 — flag anything above 30-33%.
- Labor cost per hour by day and shift = total labor dollars / revenue for that period — flag shifts where labor exceeds 30% of revenue.
- Menu item contribution margin = menu price - ingredient cost - proportional labor — tells you actual dollar profit per plate.
- Sales mix analysis = what % of total sales each item represents — a low-margin item that's 25% of sales is a way bigger problem than one that's 2%.
- This is NOT AI — it's just math that runs on every data upload and stores results in your database.

### Layer 2: Rule Engine (code you write, catches obvious problems)
- If food cost on any item exceeds 35% → flag it.
- If labor cost during any shift exceeds 33% of that shift's revenue → flag it.
- If any ingredient price increased more than 5% week-over-week → flag it.
- If any menu item's sales dropped more than 20% month-over-month → flag it.
- If total daily revenue is 20%+ below the trailing average for that day of week → flag it.
- These rules generate a list of "problems detected" that get handed to the AI — you're not asking AI to find problems, you're asking it to explain them and recommend fixes.

### Layer 3: AI Recommendation Engine (Claude API)
- Feed Claude the flagged problems from Layer 2 plus restaurant context data.
- System prompt tells Claude to act as a restaurant financial advisor — be specific, include dollar amounts, give top 3 highest-impact recommendations only.
- Example output: "Raise your burger price from $14 to $15.50 — based on your sales volume this would add ~$620/month to your bottom line with minimal demand impact."
- The AI is the communication layer that turns numbers into advice a busy owner can act on in 30 seconds standing in their kitchen.
- You're NOT asking AI to analyze raw data — you do the math first (Layer 1), flag problems (Layer 2), then ask AI to be the advisor (Layer 3).

### Layer 4: Learning Loop (what makes it get smarter over time)
- When AI recommends a price change and the owner does it, track what actually happened to sales volume afterward.
- Did burger sales drop 5%? 15%? Not at all? That outcome data feeds back into your system.
- Over thousands of recommendations across hundreds of restaurants, you build a dataset of what actually works.
- This feedback loop is your long-term moat — future recommendations get more accurate because they're based on real outcomes, not theory.
- ClearCOGS has this for prep forecasting accuracy only — you build it for pricing, staffing, menu engineering, and supplier decisions.

---

## Pricing Tiers + API Cost Management (Don't Go Broke Strategy)

### How to Keep AI Costs Under Control — Use ALL 3 Methods Together

**Method 1: Cache & Pre-Compute (biggest cost saver)**
- Run the full AI analysis ONCE per day per restaurant (like 5am before they open) and save results to database.
- When user opens dashboard, display the saved results — no new API call needed.
- Only hit the live AI when user asks a NEW question in chat that cached data can't answer.
- This alone cuts your API costs by 80-90%.

**Method 2: Mix Cheap + Expensive Models**
- Use Claude Haiku (10x cheaper) for simple stuff — "what was my revenue yesterday," pulling numbers, formatting reports.
- Use Claude Sonnet (smarter, more expensive) only for complex recommendations — "analyze my full menu and tell me what to reprice."
- Route each request to the right model based on complexity — simple lookup = Haiku, strategic advice = Sonnet.

**Method 3: Tiered Plans with Usage Limits**
- Bake AI costs into subscription price and set clear limits per plan so no single user can blow up your bill.

### Pricing Tiers

**Starter — $49/mo (single location)**
- 1 restaurant connected
- Daily pre-computed insight report (cached, very cheap for you to serve)
- 10 AI chat questions per month (the expensive part — this is where you limit it)
- Weekly email summary
- CSV upload only (no live POS integration)
- Good for: restaurant owner who just wants to see where money is going

**Growth — $99/mo (single location)**
- 1 restaurant connected
- Daily pre-computed insight report
- 50 AI chat questions per month
- Daily email + SMS alerts for urgent margin issues
- Live POS integration (Square, Toast, Clover)
- Menu item margin analysis + "what if" simulator
- Benchmarking vs similar restaurants
- Good for: owner who wants proactive management

**Pro — $149/mo per location (multi-location)**
- Unlimited locations on same account
- Daily pre-computed insight reports per location
- 200 AI chat questions per month
- Real-time push notifications (staffing, supplier price spikes)
- All POS integrations + QuickBooks/payroll
- Full benchmarking + cross-location comparison
- Priority support
- Good for: multi-unit operator managing 2-10 locations

**Enterprise — Custom pricing ($300+/mo per location)**
- Everything in Pro
- Unlimited AI chat
- Dedicated account manager
- Custom integrations
- Group purchasing network access
- API access for internal tools
- Good for: 10+ location chains

### Estimated API Cost Per User Per Month
- Starter (cached daily report + 10 chats): ~$1-2/user/month
- Growth (cached daily report + 50 chats): ~$3-7/user/month
- Pro (cached daily report + 200 chats + notifications): ~$8-15/user/month
- Enterprise (unlimited): ~$20-40/user/month

### Margin Per Tier (what you keep after API costs)
- Starter: $49 - $2 API = ~$47 gross margin (96%)
- Growth: $99 - $7 API = ~$92 gross margin (93%)
- Pro: $149 - $15 API = ~$134 gross margin (90%)
- These are excellent SaaS margins — most SaaS companies target 70-80%

### Key Rules to Protect Yourself
- ALWAYS cache daily insights — never recompute on every page load.
- Set hard limits on chat questions per plan — show user how many they have left.
- If a user hits their chat limit, let them upgrade or wait until next billing cycle.
- Monitor your API spend weekly — if one user is somehow burning more than expected, investigate.
- As you scale, negotiate volume pricing with Anthropic — API costs drop significantly at higher volumes.
- NEVER do "bring your own API key" — restaurant owners don't know what that is and it kills the user experience.

---

## Key Competitors to Watch
- **ClearCOGS** — closest competitor, just raised $3.8M seed (March 2026), POS-agnostic, AI-driven prep and ordering recommendations. Weaknesses: high-touch onboarding (3 weeks), daily email reports not a proactive mobile agent, focused on prep forecasting only (not full P&L), targets multi-unit chains not SMBs. Founded by ex-Jimmy John's franchisee.
- **MarginEdge** — strong on invoice processing and food cost tracking, but tied to specific POS systems and not agent-style.
- **Restaurant365** — comprehensive all-in-one platform with AI features, but complex/expensive and targets mid-market/enterprise.
- **Nory** — AI restaurant management with labor + COGS, growing in UK/EU market.
- **Toast IQ** — AI layer built into Toast POS, but ONLY works for Toast customers (your advantage: you work with everyone).

## Your Differentiators
1. POS-agnostic — works with any system through API connectors + CSV fallback.
2. Mobile-first proactive agent — pushes recommendations to you vs. you going to check a dashboard.
3. Built for independent/SMB operators who can't afford Restaurant365 or full-service platforms.
4. AI-native from day one — not AI bolted onto a legacy platform.

## APIs You Need (in priority order)
1. **AI Brain — Multi-Provider API Keys (Claude, OpenAI, Gemini, etc.)** — don't lock into one provider. Set up API keys for multiple LLMs so you can route different tasks to whoever's cheapest or best. Use the cheapest model for simple stuff (lookups, formatting), the smartest for complex recommendations. Compare pricing and performance across providers regularly — this market changes fast and you want flexibility to switch without rewriting your whole app. Build a simple router in your code that picks which provider to call based on task type. More provider options to evaluate and discuss later.
2. **Square API** — free, open access, sign up at developer.squareup.com.
3. **Toast Partner API** — requires application/approval through Toast Partner Program.
4. **Clover API** — relatively open developer program.
5. **QuickBooks API** — open, for accounting/payroll data.
6. **Twilio API** — for SMS notifications to managers (~$0.01/text).
7. **SendGrid API** — for email reports (free tier available).

## Social Presence Strategy
- Post short-form video content on TikTok/Instagram showing real margin analysis examples ("This restaurant was losing $800/month and didn't know it").
- Join Restaurant Owner Facebook groups (50K+ members) and provide free value before pitching.
- Create a simple landing page to collect email signups from interested restaurant owners.
- Build credibility through case studies and testimonials from your first 10 users.
