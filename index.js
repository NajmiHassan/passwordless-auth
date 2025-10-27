// CORE NODE.JS MODULES
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// THIRD-PARTY LIBRARIES
import express from 'express';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import cookieParser from 'cookie-parser';
import cors from 'cors';

// DATABASE & CONFIGURATION
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: [
      process.env.FRONTEND_BASE_URL,
      'http://127.0.0.1:5500'
    ],
    credentials: true,
  })
);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// EMAIL FUNCTION
// ==========================================

const sendMagicLinkEmail = async (email, name, magicLinkUrl) => {
	const transporter = nodemailer.createTransport({
		service: 'gmail',
		host: 'smtp.gmail.com',
		port: 465,
		secure: true,
		auth: {
			user: process.env.EMAIL_USER,
			pass: process.env.EMAIL_PASS,
		},
	});

	const mailOptions = {
		from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
		to: email,
		subject: 'Your Login Link',
		text: `Hi${name ? ` ${name}` : ''}!

Click this link to log in: ${magicLinkUrl}

This link expires in 15 minutes.

If you didn't request this, please ignore this email.`,
	};

	try {
		await transporter.sendMail(mailOptions);
		console.log(`Magic link sent to ${email}`);
	} catch (error) {
		console.error('Email sending failed:', error);
		throw new Error('Failed to send email');
	}
};

// ==========================================
// SIGNUP ENDPOINT
// ==========================================

app.post('/api/auth/signup', async (req, res) => {
	try {
		const { email, name } = req.body;

		if (!email || !email.includes('@')) {
			return res.status(400).json({
				success: false,
				message: 'Valid email is required',
			});
		}

		let user = await prisma.user.findUnique({
			where: { email },
		});

		if (user && user.verified) {
			return res.status(409).json({
				success: false,
				message: 'Account already exists and verified',
			});
		}

		const token = crypto.randomBytes(32).toString('hex');
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

		if (user) {
			user = await prisma.user.update({
				where: { email },
				data: {
					name: name || user.name,
					magicLinkToken: token,
					magicLinkExpires: expiresAt,
					magicLinkUsed: false,
				},
			});
		} else {
			user = await prisma.user.create({
				data: {
					email,
					name,
					magicLinkToken: token,
					magicLinkExpires: expiresAt,
					magicLinkUsed: false,
				},
			});
		}

		// Updated magic link URL to use same port as Express server
		const magicLinkUrl = `http://localhost:${process.env.PORT}/?token=${token}`;
		await sendMagicLinkEmail(email, name, magicLinkUrl);

		res.json({
			success: true,
			message: 'Verification link sent to your email! Check your inbox.',
			data: {
				email: user.email,
				name: user.name,
			},
		});
	} catch (error) {
		console.error('Signup error:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to create account. Please try again.',
		});
	}
});

// ==========================================
// LOGIN ENDPOINT
// ==========================================

app.post('/api/auth/login', async (req, res) => {
	try {
		const { email } = req.body;

		if (!email || !email.includes('@')) {
			return res.status(400).json({
				success: false,
				message: 'Valid email is required',
			});
		}

		const user = await prisma.user.findUnique({
			where: { email },
		});

		if (!user || !user.verified) {
			return res.status(404).json({
				success: false,
				message: 'No verified account found with this email',
			});
		}

		const token = crypto.randomBytes(32).toString('hex');
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

		await prisma.user.update({
			where: { email },
			data: {
				magicLinkToken: token,
				magicLinkExpires: expiresAt,
				magicLinkUsed: false,
			},
		});

		// Updated magic link URL
		const magicLinkUrl = `http://localhost:${process.env.PORT}/?token=${token}`;
		await sendMagicLinkEmail(email, user.name, magicLinkUrl);

		res.json({
			success: true,
			message: 'Login link sent to your email! Check your inbox.',
			data: {
				email: user.email,
				name: user.name,
			},
		});
	} catch (error) {
		console.error('Login error:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to send login link. Please try again.',
		});
	}
});

// ==========================================
// VERIFICATION ENDPOINT
// ==========================================

app.get('/api/auth/verify', async (req, res) => {
	try {
		const { token } = req.query;

		if (!token) {
			return res.status(400).json({
				success: false,
				message: 'Verification token is required',
			});
		}

		const user = await prisma.user.findFirst({
			where: {
				magicLinkToken: token,
				magicLinkUsed: false,
				magicLinkExpires: {
					gt: new Date(),
				},
			},
		});

		if (!user) {
			return res.status(400).json({
				success: false,
				message: 'Invalid or expired verification link',
			});
		}

		const updatedUser = await prisma.user.update({
			where: { id: user.id },
			data: {
				verified: true,
				magicLinkToken: null,
				magicLinkExpires: null,
				magicLinkUsed: true,
			},
		});

		const jwtToken = jwt.sign(
			{
				userId: user.id,
				email: user.email,
				verified: true,
			},
			process.env.JWT_SECRET,
			{ expiresIn: '7d' }
		);

		res.cookie('auth_token', jwtToken, {
			httpOnly: true,
			secure: false,
			sameSite: 'lax',
			maxAge: 7 * 24 * 60 * 60 * 1000,
		});

		res.json({
			success: true,
			message: 'Successfully authenticated! Welcome back!',
			data: {
				user: {
					id: updatedUser.id,
					email: updatedUser.email,
					name: updatedUser.name,
					verified: updatedUser.verified,
				},
			},
		});
	} catch (error) {
		console.error('Verification error:', error);
		res.status(500).json({
			success: false,
			message: 'Verification failed. Please try again.',
		});
	}
});

// ==========================================
// RESEND VERIFICATION ENDPOINT
// ==========================================

app.post('/api/auth/resend-verification', async (req, res) => {
	try {
		const { email } = req.body;

		if (!email || !email.includes('@')) {
			return res.status(400).json({
				success: false,
				message: 'Valid email is required',
			});
		}

		const user = await prisma.user.findUnique({
			where: { email },
		});

		if (!user) {
			return res.status(404).json({
				success: false,
				message: 'No account found with this email',
			});
		}

		if (user.verified) {
			return res.status(400).json({
				success: false,
				message: 'Account is already verified',
			});
		}

		const token = crypto.randomBytes(32).toString('hex');
		const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

		await prisma.user.update({
			where: { email },
			data: {
				magicLinkToken: token,
				magicLinkExpires: expiresAt,
				magicLinkUsed: false,
			},
		});

		const magicLinkUrl = `http://localhost:${process.env.PORT}/?token=${token}`;
		await sendMagicLinkEmail(email, user.name, magicLinkUrl);

		res.json({
			success: true,
			message: 'New verification link sent to your email!',
			data: {
				email: user.email,
				name: user.name,
			},
		});
	} catch (error) {
		console.error('Resend verification error:', error);
		res.status(500).json({
			success: false,
			message: 'Failed to send verification link. Please try again.',
		});
	}
});

// ==========================================
// LOGOUT ENDPOINT
// ==========================================

app.post('/api/auth/logout', (req, res) => {
	res.clearCookie('auth_token');
	res.json({
		success: true,
		message: 'Successfully logged out',
	});
});

// ==========================================
// GET CURRENT USER
// ==========================================

app.get('/api/me', async (req, res) => {
	try {
		const token = req.cookies.auth_token;

		if (!token) {
			return res.status(401).json({
				success: false,
				message: 'Authentication required',
			});
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		const user = await prisma.user.findUnique({
			where: { id: decoded.userId },
		});

		if (!user) {
			return res.status(401).json({
				success: false,
				message: 'User not found',
			});
		}

		res.json({
			success: true,
			data: {
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
					verified: user.verified,
					createdAt: user.createdAt,
				},
			},
		});
	} catch (error) {
		console.error('Profile error:', error);
		res.status(401).json({
			success: false,
			message: 'Invalid token',
		});
	}
});

// ==========================================
// CLEANUP EXPIRED TOKENS
// ==========================================

const cleanupExpiredTokens = async () => {
	try {
		const result = await prisma.user.updateMany({
			where: {
				magicLinkExpires: {
					lt: new Date(),
				},
				magicLinkToken: {
					not: null,
				},
			},
			data: {
				magicLinkToken: null,
				magicLinkExpires: null,
				magicLinkUsed: false,
			},
		});

		if (result.count > 0) {
			console.log(`🧹 Cleaned up ${result.count} expired magic links`);
		}
	} catch (error) {
		console.error('Cleanup error:', error);
	}
};

setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

// ==========================================
// CATCH-ALL ROUTE - Serve index.html for all non-API routes
// ==========================================
app.get('*', (req, res) => {
	if (!req.path.startsWith('/api')) {
		res.sendFile(path.join(__dirname, 'public', 'index.html'));
	}
});

// ==========================================
// SERVER STARTUP
// ==========================================

app.listen(process.env.PORT, () => {
	console.log(
		`🚀 Passwordless Auth Server running on port ${process.env.PORT}`
	);
	console.log(`📁 Serving static files from: ${path.join(__dirname, 'public')}`);
	console.log(`🌐 Frontend available at: http://localhost:${process.env.PORT}`);
});
