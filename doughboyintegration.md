# DOUGHBOY
## AI Agent Build Context & Product Specification
*For use by AI coding agents, developers, and collaborators*

---

## 1. What Is Doughboy

Doughboy is an AI profit agent built specifically for independent and small-to-mid-size restaurant owners. It gives independent restaurants access to the same financial intelligence that billion-dollar chains take for granted, delivered in plain English through a chat interface and a live dashboard.

Founded by Ajla, the child of Bosnian immigrants who grew up watching food bring people together, Doughboy was built from the belief that the independent restaurant owner deserves better tools. Not corporate dashboards. Not spreadsheets. A friend who knows the numbers.

---

## 2. The Problem Being Solved

Independent restaurant owners run on gut feel. They find out they lost money at the end of the month, not in real time. Specifically:

- Menu items are mispriced — the most popular dish often has the worst margin
- Food waste is invisible — they ordered 50lbs of protein, used 30, threw out 20
- Labor is mismanaged — consistently overstaffed on slow nights, understaffed on busy ones
- Supplier costs creep up — small price increases go unnoticed until margins collapse
- No benchmarking — they have no idea how they compare to similar restaurants

Big chains have entire finance teams watching these numbers daily. Independent owners have nothing. Doughboy fixes that.

---

## 3. Tech Stack

This is a vanilla HTML/CSS/JavaScript frontend with a Vercel serverless backend. No frameworks. No build tools unless absolutely necessary.

### Frontend
- HTML, CSS, vanilla JavaScript only
- Google Fonts: Fraunces (headings) + DM Sans (body)
- No React, no Vue, no Angular
- All CSS in `<style>` blocks per file
- Fully mobile responsive on all pages

### Backend & Infrastructure
- **Supabase** — authentication, database, user profiles
- **Vercel** — hosting and serverless API functions
- **OpenRouter API** — AI model routing (Claude Sonnet for complex, Claude Haiku for simple)
- **Resend** — transactional email (confirmation, daily reports, alerts)
- **Stripe** — subscription billing and usage limits

### AI Model Strategy
- **Claude Haiku via OpenRouter** — simple lookups, number formatting, basic questions
- **Claude Sonnet via OpenRouter** — menu analysis, margin recommendations, complex reasoning
- Route by complexity to control costs — simple query = Haiku, strategic advice = Sonnet
- Cache daily insight reports — compute once at 5am, serve from database all day
- Never recompute on page load — this alone cuts API costs 80-90%

### OpenRouter Setup
- Create account at openrouter.ai
- Generate API key and store as `OPENROUTER_API_KEY` in Vercel environment variables
- Never expose API key in frontend code — all calls go through Vercel serverless functions
- Base URL: `https://openrouter.ai/api/v1`
- Use OpenAI-compatible SDK format

### Model Routing Logic

| Query Type | Model | Approx Cost |
|---|---|---|
| Simple number lookup | claude-haiku-4-5 | ~$0.001 |
| Menu analysis | claude-sonnet-4-6 | ~$0.010 |
| Strategic recommendation | claude-sonnet-4-6 | ~$0.015 |
| Daily cached report | claude-haiku-4-5 | ~$0.002 |
| What-if simulator | claude-sonnet-4-6 | ~$0.012 |

### Vercel Serverless Function Pattern
Every AI call goes through `/api/chat.js` — never directly from the browser.

```
POST /api/chat
Body: { userId, message, csvData }
Flow: check usage limit → route to OpenRouter → increment counter → return response
```

---

## 4. Pages to Build

### index.html — Landing Page
- Navigation with logo and CTA button linking to login.html
- Hero section with background image, headline, subheadline, primary CTA
- Features/benefits section pulling value props from doughboybuild.md
- Social proof / testimonial section
- Final CTA section
- Footer with navigation links

### login.html — Login & Signup
- Animated toggle between Login and Create Account views (no page reload)
- Login form: email, password, forgot password link, submit
- Signup form: first name, last name, restaurant name, email, password, confirm password
- Supabase auth integration using `signUp()` and `signInWithPassword()`
- On signup: pass `first_name`, `last_name`, `restaurant_name` in user metadata options.data
- On login success: redirect to dashboard.html
- Loading states on submit buttons ("Just a moment...")
- Friendly inline error messages styled to brand
- Back link to index.html

### dashboard.html — Main App
- Protected route — check Supabase session on load, redirect to login.html if none
- Welcome header showing user's first name and restaurant name pulled from profiles table
- CSV upload section — drag and drop or click to upload POS export
- Ingredient cost entry form — appears after CSV upload for each unique menu item
- Key metrics display: revenue, food cost %, labor cost %, net margin
- AI insight panel — cached daily report displayed here (no API call on load)
- Chat agent window — users ask questions, get dollar-specific answers
- Usage counter — shows chat questions remaining this month at all times
- Logout button calling `supabase.auth.signOut()` then redirect to login.html

### founder.html — Our Story
- Hero with warm headline and background image
- Founder story with Ajla's exact copy (see Section 10 — do not rewrite or change voice)
- "From My Table..." food memory section with 4 photo placeholder cards
- "What I Believe" mission section
- Closing CTA linking to login.html with text "Pull up a chair"
- Add "Our Story" to nav on index.html

---

## 5. The AI Chat Agent

The chat agent is the core product experience. It lives inside dashboard.html and allows restaurant owners to ask plain-English questions and get back specific dollar answers.

### How It Works
1. Owner uploads CSV from their POS system
2. CSV is parsed and stored in Supabase against their user ID
3. Agent has access to their parsed data as context in every message
4. Owner types a question in the chat window
5. Request goes to Vercel serverless function at `/api/chat.js`
6. Function checks usage limit before calling API
7. Function routes to OpenRouter — Haiku for simple, Sonnet for complex
8. Response returns with specific numbers, not generic advice
9. Usage counter increments by 1
10. If limit reached, show upgrade prompt — do not call API

### Example Interactions
- "How did we do last night?" → Revenue, top sellers, margin flags
- "Which dish is losing me the most money?" → Specific item with exact dollar amount
- "What if I raise the burger $2?" → Margin impact, demand projection, monthly savings
- "Am I overstaffed on Tuesdays?" → Labor vs revenue by shift with specific numbers
- "What should I reorder this week?" → Based on sales velocity from CSV data
- "I need to reorder chicken from Sysco" → Triggers ordering agent cart flow

### Agent Persona
- Name: Doughboy
- Tone: warm, direct, like a friend who happens to know your numbers
- Always give specific dollar amounts — never vague
- Never condescending — restaurant owners are experts at their craft
- Proactive — flags issues before being asked when data warrants it

### System Prompt
Use this exact system prompt for every OpenRouter call:

```
You are Doughboy, an AI profit agent for independent restaurants. 
You have access to this restaurant's sales data, labor data, and 
food cost data. Always give specific dollar amounts. Never give 
generic advice. Speak like a knowledgeable friend, not a corporate 
consultant. If you see a margin problem, flag it immediately with 
the exact dollar impact. The restaurant owner is an expert at their 
craft — your job is to handle the numbers so they can focus on the 
food and the guests.
```

---

## 6. CSV Data & What to Do With It

### What a POS Export Contains

| Column | Example Value | What It Tells Us |
|---|---|---|
| Date | 2026-03-28 | Day of sale |
| Item Name | Chicken Parm | Menu item sold |
| Quantity | 47 | How many sold |
| Sale Price | $18.00 | What customer paid |
| Category | Entree | Menu section |
| Staff | Maria | Who sold it |
| Shift | Dinner | Time period |
| Hours Worked | 6 | Labor data |
| Hourly Rate | $14.00 | Labor cost |

### What Doughboy Calculates
- Revenue per item and per category
- Food cost % per dish (requires ingredient cost entry)
- Labor cost as % of revenue by shift
- Overstaffing flags — high labor % on low revenue shifts
- Menu engineering — popularity vs margin matrix
- Week over week and month over month trends
- Reorder suggestions based on sales velocity

### Ingredient Cost Entry
The POS CSV shows what was sold but not what ingredients cost. After CSV upload:
- Show a list of unique menu items found in the CSV
- For each item ask: "What does one portion cost you to make?"
- Store answers in Supabase against the user's profile permanently
- Never ask again once entered
- Agent can also collect this in chat: "I see you sold 47 Chicken Parms — what does one portion cost to make?"

### Food Cost Calculation
```
Food Cost % = (Ingredient Cost Per Portion / Sale Price) x 100
Industry standard: 28-32%
Flag anything above 32% as a margin problem
```

### Labor Optimization
```
Labor Cost % = (Total Hours x Hourly Rate) / Total Revenue x 100
Industry standard: 25-35%
Flag shifts where labor % exceeds 35%
Compare staffing levels on similar revenue days to identify overstaffing patterns
```

---

## 7. Ordering Agent (Cart Builder)

The ordering agent allows chefs to tell Doughboy what they need to reorder via chat, and the agent adds items to their supplier cart. Chef reviews and checks out — the agent never handles payment information.

### Chat Flow
1. Chef: "I need to reorder chicken breast from Sysco"
2. Agent confirms quantity based on past orders and current usage data
3. Agent uses Playwright web automation to open supplier website
4. Agent logs in using encrypted stored credentials
5. Agent adds items to cart
6. Agent sends chef a summary message with cart link
7. Chef opens link, reviews items and total, enters payment info, checks out
8. Payment info never stored or seen by Doughboy

### Supported Suppliers — Phase 1
- Sysco — largest US food distributor (build first)
- US Foods — second largest
- Restaurant Depot — popular with independents
- Chef can specify any supplier in chat

### Security Rules
- Supplier login credentials stored encrypted in Supabase vault
- Agent never accesses payment pages
- Agent session ends after cart is built
- All cart actions logged in Supabase for audit trail
- Chef must explicitly approve before agent logs into any supplier

### Technical Implementation
- Playwright running on Vercel serverless function
- Each supplier needs a custom automation script
- Fallback: if automation fails, agent provides direct link to supplier site with pre-filled search
- Start with Sysco only for phase 1

---

## 8. Usage Limits & Plan Enforcement

### Supabase Profiles Table Schema

| Column | Type | Purpose |
|---|---|---|
| id | uuid | Links to auth.users — foreign key |
| first_name | text | Display name |
| last_name | text | Display name |
| restaurant_name | text | Used in agent context |
| plan_type | text | starter, growth, pro, enterprise |
| chat_questions_used | integer | Resets monthly |
| chat_questions_limit | integer | 10, 50, 200, or 999999 for unlimited |
| billing_cycle_start | date | When to reset counter |
| created_at | timestamptz | Account creation — default now() |

### Plan Limits

| Plan | Price | Chat Questions | Key Features |
|---|---|---|---|
| Starter | $49/mo | 10/mo | CSV upload, daily report, weekly email |
| Growth | $99/mo | 50/mo | Live POS, SMS alerts, what-if simulator |
| Pro | $149/mo | 200/mo | Multi-location, benchmarking, all integrations |
| Enterprise | Custom | Unlimited | Everything plus dedicated support |

### Enforcement Logic
```javascript
// Before every API call in /api/chat.js
const profile = await supabase
  .from('profiles')
  .select('chat_questions_used, chat_questions_limit')
  .eq('id', userId)
  .single()

if (profile.chat_questions_used >= profile.chat_questions_limit) {
  return { error: 'limit_reached', message: 'Upgrade to ask more questions' }
}

// Call OpenRouter here

await supabase
  .from('profiles')
  .update({ chat_questions_used: profile.chat_questions_used + 1 })
  .eq('id', userId)
```

### Display to User
Always show in the chat window: "8 of 10 questions used this month. Upgrade for more."

### Cost Per User Per Month

| Plan | API Cost | Revenue | Gross Margin |
|---|---|---|---|
| Starter | ~$1-2 | $49 | ~96% |
| Growth | ~$3-7 | $99 | ~93% |
| Pro | ~$8-15 | $149 | ~90% |
| Enterprise | ~$20-40 | $300+ | ~85-90% |

---

## 9. Daily Insight Report

The daily insight report is pre-computed once per day at 5am and cached in Supabase. Dashboard displays the saved report instantly — zero API cost at view time.

### What It Contains
- Yesterday's revenue vs same day last week
- Top 3 selling items and their margins
- Margin flags — items with food cost above 32%
- Labor cost summary by shift
- One proactive recommendation with specific dollar impact
- Reorder reminder if any item's sales velocity suggests low stock

### Implementation
- Vercel cron job runs at 5am daily
- For each active user with CSV data, run one Claude Haiku call via OpenRouter
- Store result in Supabase `daily_reports` table with `user_id` and `date`
- Dashboard reads latest report on load — no API call needed
- Report auto-refreshes when new CSV is uploaded

### Supabase Table: daily_reports

| Column | Type |
|---|---|
| id | uuid |
| user_id | uuid (foreign key to profiles) |
| report_date | date |
| report_content | text |
| created_at | timestamptz |

---

## 10. Founder Page Copy

**CRITICAL: Use this copy exactly as written. Do not rewrite, do not change the voice, do not add em dashes. Polish grammar and punctuation only.**

### Hero
Headline options (pick the strongest):
- "Every good thing starts at a full table."
- "Built from a full table."
- "The little girl with the extra dough."

Subheadline:
> Doughboy was born in a grandmother's kitchen, built by an immigrant's daughter, and made for every restaurant owner who pours their heart into feeding people.

### Founder Story

> Ciao!
>
> My name is Ajla, and I'm the child of Bosnian immigrants who arrived in this country with very little but somehow, there was always a full table. Food was the center of everything. Some of my best memories as a kid are sitting in my grandmother's kitchen, watching her bake cookies, roll pita, and always handing me a little portion to taste test or a small batch of dough to try on my own.
>
> That's where it started. As I got older, cooking stopped being something I watched and became something I chased. Hosting dinners, experimenting with recipes, finding any excuse to bring people together around a meal.
>
> In college, I studied business intelligence, spent my days buried in data and analytics, and something clicked. I kept thinking about the restaurants I loved, the independent spots run by people who remind me of my grandmother, and how none of them had access to the kind of insights that big chains take for granted. I realized I could take what I was learning and point it at the thing I actually cared about.
>
> So I built Doughboy. It's my way of sitting beside those owners the way my grandmother sat beside me, helping them with the part that doesn't come naturally so they can focus on the part that does. The guests, the creativity, the craft.
>
> Bon appétit.

### From My Table... Section
Title: "FROM MY TABLE..."
Intro: "A few dishes, a lifetime of memories." and "The meals that made me who I am and the reason Doughboy exists."

4 cards with photo placeholders (photos coming after photoshoot — use styled placeholder boxes with brand colors and "Photo coming soon" label):

Card 1: "My grandmother's pita. She never measured anything, just knew by feel when the dough was right. I'd sit on the counter and she'd tear me off a corner before it even hit the pan. That's where I learned that the best food comes from instinct, not instructions."

Card 2: "Cookie day was every Sunday. My grandmother would line them up on the rack and I was quality control, taste one from every batch. She'd pretend to scold me but always had an extra one waiting. Those Sundays taught me that food is just love with a recipe."

Card 3: "The first dinner party I hosted on my own. Overcooked the salmon, undercooked the rice, and everyone stayed until midnight. That night I realized the meal is never really about the food. It's about the table you build around it."

Card 4: "Last month I tried making croissants from scratch for the first time. Fourteen hours, butter everywhere, and the kitchen looked like a crime scene. They came out lopsided and imperfect and honestly, some of the best things I've ever baked."

### What I Believe Section
Title: "WHAT I BELIEVE"

"I believe the independent restaurant owner, the one who's there at 6am and still closing at midnight, deserves the same financial intelligence that billion-dollar chains get."

"I believe technology should feel like a friend who happens to know the numbers, not a dashboard that makes you feel behind."

"I believe the best restaurants aren't built by spreadsheets. They're built by people who care and Doughboy exists so those people never have to choose between their craft and their margins."

### Closing CTA
Headline: "There's always room at the table."
Subtext: "Whether you run one restaurant or ten, Doughboy was built for you, by someone who grew up believing that a full table fixes everything."
Button: "Pull up a chair" → links to login.html

---

## 11. Branding Rules

Read doughboybranding.pdf before building any UI. Quick reference below.

### Color Palette

| Name | Hex | Usage |
|---|---|---|
| Vanilla | #F4E1C1 | Primary background |
| Espresso | #363031 | Primary text, dark sections |
| Rumba | #7C2439 | CTAs, accents, highlights |
| Rumba Dark | #5E1A2B | Hover states |
| Vanilla Light | #FAF0E0 | Card backgrounds |
| Vanilla Deep | #EDD5AB | Secondary backgrounds |
| Espresso Light | #4A4344 | Secondary text |

### CSS Variables
```css
:root {
  --vanilla: #F4E1C1;
  --espresso: #363031;
  --rumba: #7C2439;
  --rumba-dark: #5E1A2B;
  --vanilla-light: #FAF0E0;
  --vanilla-deep: #EDD5AB;
  --espresso-light: #4A4344;
}
```

### Typography
- Headings: Fraunces (serif, Google Fonts) — weight 900 for hero, 700 for section heads
- Body: DM Sans (sans-serif, Google Fonts) — weight 400 regular, 600 semi-bold
- Hero font size: `clamp(2.8rem, 6vw, 5.5rem)`
- Section heading: `clamp(2rem, 4vw, 3rem)`
- Body text: 1rem, line-height 1.6-1.7

### Design Principles
- Premium and warm — not corporate, not generic SaaS
- Ombre transitions between sections using CSS linear-gradient
- Full-bleed photography with overlay for text sections
- Subtle scroll animations using Intersection Observer
- All images: `object-fit: cover`, full resolution, no compression, no filters
- Mobile-first responsive — test at 375px, 768px, 1280px
- Rounded buttons `border-radius: 100px` for all CTAs
- Fraunces italic for emphasis — color: var(--rumba)
- Never use em dashes anywhere in copy

---

## 12. Project File Structure

All files live in the root project folder.

```
project-root/
├── index.html                  ← Landing page
├── login.html                  ← Login and signup
├── dashboard.html              ← Main app with chat agent
├── founder.html                ← Our story page
├── doughboybuild.md            ← Full product roadmap (read this)
├── doughboybranding.pdf        ← Brand bible (read this before any UI)
├── doughboyintegration.md      ← This file — full build context
├── CLAUDE.md                   ← AI agent session instructions
├── images/                     ← All PNG photography assets (full quality)
├── api/
│   ├── chat.js                 ← Vercel serverless — chat agent
│   ├── analyze.js              ← Vercel serverless — CSV analysis
│   └── daily-report.js        ← Vercel cron — daily insight generation
└── vercel.json                 ← Vercel config including cron schedule
```

---

## 13. Supabase Setup

### Auth Configuration
- Email/password auth enabled
- Confirm email: OFF during development, ON before launch
- User metadata on signup: `first_name`, `last_name`, `restaurant_name`

### Database Tables

**profiles**
```sql
create table profiles (
  id uuid references auth.users primary key,
  first_name text,
  last_name text,
  restaurant_name text,
  plan_type text default 'starter',
  chat_questions_used integer default 0,
  chat_questions_limit integer default 10,
  billing_cycle_start date default now(),
  created_at timestamptz default now()
);
```

**daily_reports**
```sql
create table daily_reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  report_date date default now(),
  report_content text,
  created_at timestamptz default now()
);
```

**csv_data**
```sql
create table csv_data (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  upload_date timestamptz default now(),
  raw_data jsonb,
  parsed_summary jsonb
);
```

**ingredient_costs**
```sql
create table ingredient_costs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  item_name text,
  cost_per_portion numeric,
  updated_at timestamptz default now()
);
```

### Auto-Create Profile Trigger
```sql
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name, restaurant_name)
  values (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'restaurant_name'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### RLS Policies
Enable RLS on all tables. Add these policies:
```sql
-- profiles: users can only access their own row
alter table profiles enable row level security;
create policy "own profile only" on profiles using (auth.uid() = id);

-- daily_reports: users can only see their own reports
alter table daily_reports enable row level security;
create policy "own reports only" on daily_reports using (auth.uid() = user_id);

-- csv_data: users can only see their own data
alter table csv_data enable row level security;
create policy "own csv only" on csv_data using (auth.uid() = user_id);

-- ingredient_costs: users can only see their own costs
alter table ingredient_costs enable row level security;
create policy "own costs only" on ingredient_costs using (auth.uid() = user_id);
```

---

## 14. 30-Day Build Plan

Build in this exact order. Each phase depends on the previous.

### Week 1 — Core Pages & Auth
- index.html landing page
- login.html with Supabase auth fully wired
- dashboard.html shell with session protection
- founder.html our story page
- CLAUDE.md project context file
- Supabase tables and triggers set up

### Week 2 — Data & Analysis
- CSV upload and parsing in dashboard
- Ingredient cost entry form
- Food cost % calculation per dish
- Labor optimization from shift data in CSV
- Key metrics display on dashboard
- Store parsed data in Supabase csv_data table

### Week 3 — AI Chat Agent
- OpenRouter integration via Vercel serverless function
- Chat window UI in dashboard
- Agent context — user data passed with every message
- Usage limit enforcement system
- Daily cached insight report with Vercel cron job
- Remaining questions counter displayed in UI

### Week 4 — Ordering Agent & Launch
- Ordering agent chat commands
- Playwright cart builder for Sysco
- Supplier credential storage (encrypted in Supabase vault)
- Stripe subscription integration
- Full QA pass across all pages at 375px, 768px, 1280px
- Deploy to Vercel and connect doughboy.ai domain

---

## 15. Critical Rules for AI Agents

Read these before writing a single line of code.

### Never Do These
- Never expose OpenRouter API key or Supabase service role key in frontend code
- Never call AI APIs directly from the browser — always through Vercel serverless functions
- Never store or transmit payment information anywhere in the system
- Never compress, resize, or filter images — always full quality
- Never use React, Vue, or any JavaScript framework — HTML CSS vanilla JS only
- Never rewrite Ajla's founder story copy — grammar polish only, voice must stay identical
- Never use em dashes anywhere in any copy on any page
- Never load dashboard content without first verifying a valid Supabase session
- Never call the OpenRouter API without checking usage limits first

### Always Do These
- Read doughboybranding.pdf before building any UI element
- Read doughboybuild.md for product context and messaging
- Check usage limits before every AI API call
- Cache daily reports — compute once, serve forever until new CSV uploaded
- Pass restaurant name and CSV summary as context with every agent message
- Show remaining chat questions to user at all times in the chat window
- Redirect to login.html immediately if no valid Supabase session on protected pages
- Test mobile layout at 375px before marking any page complete
- Use Fraunces for all headings, DM Sans for all body text
- Use CSS variables for all colors — never hardcode hex values in styles

---

*Bon appétit.*
*Built by Ajla. Made for the little guy.*
