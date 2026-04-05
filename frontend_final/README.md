# HOLMES Frontend (Next.js)

## Stack

- Next.js App Router
- Tailwind CSS
- Lucide React
- TanStack Query

## Run Locally

1. Install dependencies:
   npm install

2. Set environment variable in frontend/.env.local:
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1

3. Start dev server:
   npm run dev

4. Open:
   http://localhost:3000

## Implemented in this iteration

- Submission page with Evidence Intake UI
- Drag-and-drop image upload support
- Dedicated URL input with VirusTotal-backed result rendering
- JWT login/register + bearer token auth
- POST /upload/verify-file for image/video uploads
- POST /upload/verify for text or URL verification
- GET /history-backed results retrieval
