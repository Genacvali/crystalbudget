# CrystalBudget

![CrystalBudget Logo](src/assets/crystal-logo.png)

**CrystalBudget** is a transparent and intuitive personal finance management app designed to help you track expenses, manage income sources, and allocate budgets effectively. With features like family sharing, AI-powered insights, and Telegram bot integration, it makes budgeting simple and accessible.

## Key Features

- **Custom Categories & Allocations**: Create personalized expense categories with limits based on percentages or fixed amounts from income sources.
- **Income Tracking**: Manage multiple income sources with automatic rollovers of unspent funds.
- **Family Management**: Share budgets across family members with role-based access.
- **AI Assistant (G.A.I.A.)**: Get smart budget advice, forecasts, and optimizations powered by AI.
- **Telegram Bot Integration**: Add expenses/incomes via text, voice, or receipt photos directly in Telegram.
- **PWA Support**: Install as a progressive web app for offline access and mobile-friendly experience.
- **Multi-Currency Support**: Handle transactions in various currencies with automatic conversions.
- **Reports & Analytics**: Visualize your finances with charts and summaries.

Read more in [FEATURES.md](FEATURES.md) and [PITCH.md](PITCH.md).

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Shadcn/UI, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Integrations**: OpenAI (GPT-4o-mini for AI chat, vision, and transcription), Telegram Bot API
- **Other**: Recharts for charts, React Query for data fetching

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or Bun
- Supabase account (for backend)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/crystalbudget.git
   cd crystalbudget
   ```

2. Install dependencies:
   ```bash
   npm install
   # or bun install
   ```

3. Set up environment variables:
   Create a `.env` file in the root:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_OPENAI_API_KEY=your-openai-api-key
   VITE_TELEGRAM_BOT_TOKEN=your-telegram-bot-token
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:8080](http://localhost:8080) in your browser.

### Building for Production

```bash
npm run build
```

This will automatically bump the version and update the service worker cache.

### Supabase Setup

- Create a Supabase project.
- Run the migrations in `supabase/migrations/` using Supabase CLI.
- Deploy Edge Functions from `supabase/functions/`.

For detailed setup, refer to Supabase documentation.

## Usage

- **Sign Up/Login**: Use email or Telegram authentication.
- **Dashboard**: View summaries, add transactions, manage categories.
- **Telegram Bot**: Interact via `/start` for quick actions.
- **AI Chat**: Ask G.A.I.A. for budget advice.

## Contributing

We welcome contributions! Please fork the repo and submit a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Contact

Project Link: [https://github.com/yourusername/crystalbudget](https://github.com/yourusername/crystalbudget)

---

*Built with ❤️ for better financial clarity*
