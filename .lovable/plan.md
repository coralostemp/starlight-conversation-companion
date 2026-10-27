# Open Finder — AI chat assistant (dark theme)

An original AI chat app with a layout similar to modern assistant apps. It uses its own name, logo and colors, with no Google or Gemini branding.

## What you get
- **Sign in / sign up** with email and password. Each person sees only their own chats.
- **Home screen**: a big greeting ("Hello, {name}"), a few suggestion chips, and a rounded message box at the bottom.
- **Sidebar** you can collapse: a "New chat" button, a list of past chats (newest first) with rename and delete, and your profile with sign out at the bottom.
- **Chat page**: every chat has its own link, so reloading keeps you in the same chat. Answers stream in as they're written, with formatted text and code blocks plus a copy button. There's a Stop button while it's answering.
- **Attachments**: a paperclip button adds images or PDFs (up to 10MB each). They show as thumbnails before you send, stay attached to the message, and the AI can read them.
- **Look**: dark only. Near-black background, a soft glowing gradient on the greeting, an original "Open Finder" mark, and a clean modern font.

## Pages
- `/auth` sign in / sign up
- `/` home screen with a new-chat prompt
- `/c/$chatId` a single chat

## Technical details
- Lovable Cloud: auth (email), `profiles` (display name), `chats` (id, user_id, title, updated_at), `messages` (uuid id, chat_id, role, parts jsonb, created_at). Includes GRANTs and owner-only RLS. Private `attachments` storage bucket with per-user folder policies; files are shown through signed URLs.
- Protected routes live under `_authenticated/`. A streaming server route checks the user and chat owner, calls the Lovable AI Gateway (`openai/gpt-6-astra`, Responses API) through the AI SDK, and saves messages in `onFinish`.
- The chat title is generated automatically from the first message.
- AI Elements components handle the conversation, message and prompt input; design tokens go in `src/styles.css`.
- Verify by creating two chats with one attachment, reloading, and checking that both histories come back.
