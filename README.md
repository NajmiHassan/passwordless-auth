# Passwordless Authentication System

A simple email-based authentication system that uses magic links instead of passwords. Users receive a one-time login link via email that expires in 15 minutes.

## How It Works

1. **Signup**: User enters email → receives verification link → clicks link → account verified
2. **Login**: User enters email → receives magic link → clicks link → logged in
3. **Session**: JWT token stored in HTTP-only cookie, valid for 7 days

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: SQLite with Prisma ORM
- **Authentication**: JWT tokens
- **Email**: Nodemailer (Gmail SMTP)
- **Frontend**: Vanilla HTML, CSS, JavaScript

## Project Structure

```
project-root/
├── index.js              # Express server with API endpoints
├── .env                  # Environment variables
├── package.json          # Dependencies
├── prisma/
│   └── schema.prisma     # Database schema
└── public/
    └── index.html        # Frontend UI
```

## Prerequisites

- Node.js (v14 or higher)
- Gmail account with App Password enabled
- npm or yarn

## Installation

### 1. Clone and Install Dependencies

```bash
npm install express prisma @prisma/client jsonwebtoken nodemailer cookie-parser cors dotenv
npm install -D prisma
```

### 2. Setup Gmail App Password

1. Go to Google Account Settings → Security
2. Enable 2-Step Verification
3. Go to App Passwords
4. Generate password for "Mail"
5. Copy the 16-character password

### 3. Configure Environment Variables

Create `.env` file in project root:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secure-random-string-here"
API_BASE_URL=http://localhost:5001/api/auth/
FRONTEND_BASE_URL="http://localhost:5001"
PORT=5001
NODE_ENV="development"

EMAIL_USER="your-gmail@gmail.com"
EMAIL_PASS="your-16-char-app-password"
EMAIL_FROM="your-gmail@gmail.com"
```

**Important**: 
- Replace `EMAIL_USER` and `EMAIL_FROM` with your Gmail address
- Replace `EMAIL_PASS` with your Gmail App Password (no spaces)
- Generate a strong random string for `JWT_SECRET`

### 4. Setup Database

```bash
npx prisma generate
npx prisma migrate dev --name init
```

This creates the SQLite database and User table.

### 5. Create Folder Structure

```bash
mkdir public
# Move index.html into public folder
mv index.html public/
```

### 6. Start Server

```bash
node index.js
```

Server runs at: `http://localhost:5001`

## API Endpoints

### POST `/api/auth/signup`
Creates new user account and sends verification email.

**Request:**
```json
{
  "email": "user@example.com",
  "name": "John Doe"  // optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Verification link sent to your email!"
}
```

### POST `/api/auth/login`
Sends magic link to verified users.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login link sent to your email!"
}
```

### GET `/api/auth/verify?token=...`
Verifies magic link token and creates session.

**Response:**
- Sets `auth_token` cookie
- Returns user data

### POST `/api/auth/logout`
Clears authentication cookie.

### GET `/api/me`
Returns current user info (requires auth cookie).

### POST `/api/auth/resend-verification`
Resends verification link for unverified accounts.

## Database Schema

```prisma
model User {
  id               String    @id @default(cuid())
  email            String    @unique
  name             String?
  verified         Boolean   @default(false)
  magicLinkToken   String?   @unique
  magicLinkExpires DateTime?
  magicLinkUsed    Boolean   @default(false)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```

## Security Features

- **Token Expiry**: Magic links expire after 15 minutes
- **Single Use**: Tokens can only be used once
- **HTTP-Only Cookies**: JWT stored in HTTP-only cookie (prevents XSS)
- **Token Cleanup**: Expired tokens removed automatically every hour
- **Verified Status**: Users must verify email before login

## User Flow

### First Time User (Signup)
1. User enters email on signup form
2. System creates unverified account
3. Magic link sent to email
4. User clicks link within 15 minutes
5. Account marked as verified
6. JWT cookie set, user logged in

### Returning User (Login)
1. User enters email on login form
2. System checks if account exists and verified
3. New magic link generated and sent
4. User clicks link within 15 minutes
5. JWT cookie set, user logged in

### Session Management
- Cookie valid for 7 days
- User remains logged in across browser sessions
- Logout clears cookie

## Common Issues

### Email Not Sending
- Verify Gmail App Password is correct (16 characters, no spaces)
- Check 2-Step Verification is enabled
- Ensure `EMAIL_USER` matches the Gmail account

### "Cannot GET /index.html"
- Ensure `index.html` is in `public/` folder
- Verify static file middleware is configured
- Check server logs for errors

### Token Expired
- Magic links expire in 15 minutes
- Request new link from login/signup form

### Cookie Not Set
- Check `credentials: true` in frontend fetch
- Verify CORS configuration matches frontend URL
- For production, set `secure: true` in cookie options

## Development Notes

- SQLite database stored as `dev.db` file
- Frontend makes requests to `http://localhost:5001`
- Same-site cookie policy set to `lax`
- CORS allows `localhost:5001` and `127.0.0.1:5500`

## Production Deployment

Before deploying:

1. Change `JWT_SECRET` to cryptographically secure random string
2. Set `NODE_ENV="production"`
3. Update `FRONTEND_BASE_URL` to production domain
4. Change cookie `secure: true` (requires HTTPS)
5. Update magic link URLs in email templates
6. Consider switching from SQLite to PostgreSQL
7. Use environment variables, not `.env` file

## Testing

1. **Signup Flow**:
   - Enter email → Check inbox → Click link → Verify dashboard loads

2. **Login Flow**:
   - Enter verified email → Check inbox → Click link → Verify login

3. **Security**:
   - Try expired token → Should fail
   - Try reusing token → Should fail
   - Try login before verification → Should fail

## License

This is a demo project for educational purposes.

## Support

For issues related to:
- Gmail SMTP: Check Google Account settings
- Database: Run `npx prisma studio` to inspect data
- Token issues: Check server console logs
