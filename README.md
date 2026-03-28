# Price Guard — Marketplace Screenshot Checker
**Version A** · The Good Neighbor Guard · Truth · Safety · We Got Your Back

---

## What It Does

Price Guard lets you upload a screenshot of any marketplace listing (Facebook Marketplace, OfferUp, Craigslist, etc.) and tells you if the price is **FAIR**, **UNDERPRICED**, or **OVERPRICED**.

It uses a vision model to extract the item name, price, category, and condition directly from your screenshot — no typing required. Then it compares against built-in fair-price ranges and gives you a clear verdict with a risk note.

---

## Version A Notes

- Pricing ranges are **built-in and hardcoded** for 10 common categories.
- No live comps or external price feeds yet — that's Version B.
- No database, no auth, no scraping.
- This is a real, working, deployable app.

---

## Local Setup

**1. Clone and enter the project**
```bash
git clone <your-repo>
cd price-guard
```

**2. Create a virtual environment**
```bash
python -m venv venv
source venv/bin/activate      # Mac/Linux
venv\Scripts\activate         # Windows
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Set up your environment**
```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

**5. Run the app**
```bash
python app.py
```

Visit `http://localhost:5000`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key (needs GPT-4o access) |

---

## Render Deployment

1. Push your code to a GitHub repo.
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repo.
4. Set these values:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
   - **Environment:** Python 3
5. Add environment variable:
   - `OPENAI_API_KEY` = your key
6. Deploy.

Render free tier will spin down after inactivity. First request after sleep takes ~30 seconds to wake.

---

## Future Versions

- **Version B:** Live price comps from eBay sold listings / CL RSS feeds
- **Version C:** Seller trust signals (account age, listing history patterns)
- **Version D:** Saved history + personal dashboard

---

Built with care by Christopher Hughes · Sacramento, CA  
The Good Neighbor Guard · `thegoodneighborguard.com`
