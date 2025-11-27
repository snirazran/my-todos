// /app/api/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

const pad = (n: number) => String(n).padStart(2, '0');
const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* ---------- schema & helpers ---------- */
const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 chars'),
  email: z
    .string()
    .email('Invalid email')
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 chars')
    .refine(
      (p) => /[a-z]/i.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p),
      'Password must contain letter, number & symbol'
    ),
});

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

/* ---------- handler ---------- */
export async function POST(req: NextRequest) {
  /* 1. ensure JSON body is valid */
  let data;
  try {
    data = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      422
    );
  }
  const { name, email, password } = parsed.data;

  /* 2. DB ops */
  try {
    await connectMongo();

    // (Optional but recommended) ensure the index exists
    // await UserModel.createIndexes();

    if (await UserModel.exists({ email })) {
      return json({ error: 'Email already registered' }, 409);
    }

    await UserModel.create({
      name,
      email,
      passwordHash: await hash(password, 12),
      createdAt: new Date(),
      wardrobe: {
        equipped: {},
        inventory: {},
        flies: 0,
        flyDaily: {
          date: ymdLocal(new Date()),
          earned: 0,
          taskIds: [],
          limitNotified: false,
        },
      },
    });

    return json({ ok: true }, 201);
  } catch (err) {
    console.error('Register error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

/* ---------- only allow POST ---------- */
export async function GET() {
  return json({ error: 'Method not allowed' }, 405);
}
