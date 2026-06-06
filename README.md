# Executive AI-Assistant Co-Pilot

A premium, high-trust, hands-free personal operating system and calendar management SaaS designed specifically for founders, executives (CEOs, CFOs, CTOs), and their Executive Assistants (EAs).

## Tech Stack
*   **Frontend**: Next.js 14+ (App Router) + TailwindCSS + Lucide Icons
*   **Backend**: Python FastAPI + LangChain (with Google Gemini integration)
*   **Database & Auth**: Supabase (PostgreSQL with RBAC support)

## Architecture Overview
*   **`/frontend`**: UI dashboard for both Executives and EAs. Multi-tenant workspace selection.
*   **`/backend`**: REST endpoints for calendar synchronization, transcription processing, and scheduling agent workflows.

## Setup Instructions

### Backend
1. Navigate to `/backend`
2. Create virtual environment:
   ```bash
   python -m venv venv
   source venv/Scripts/activate  # On Windows
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start development server:
   ```bash
   uvicorn main:app --reload
   ```

### Frontend
1. Navigate to `/frontend`
2. Install packages:
   ```bash
   npm install
   ```
3. Run local dev server:
   ```bash
   npm run dev
   ```
