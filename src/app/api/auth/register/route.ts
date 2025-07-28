// /app/api/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { hash } from 'bcryptjs';
import { z } from 'zod';

/* ───────── schema & helpers ───────── */
const schema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 chars'),
  email: z
    .string()
    .email('Invalid e‑mail')
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be ≥ 8 chars')
    .refine(
      (p) => /[a-z]/i.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p),
      'Password must contain letter, number & symbol'
    ),
});

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

/* ───────── handler ───────── */
export async function POST(req: NextRequest) {
  /* 1 ▸ ensure JSON body is valid ------------------------------------ */
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

  /* 2 ▸ DB ops -------------------------------------------------------- */
  try {
    const db = (await clientPromise).db('todoTracker');
    const users = db.collection('users');

    // (Optional but recommended) – make sure there's a unique index
    // await users.createIndex({ email: 1 }, { unique: true });

    if (await users.findOne({ email })) {
      return json({ error: 'Email already registered' }, 409);
    }

    await users.insertOne({
      name,
      email,
      passwordHash: await hash(password, 12),
      createdAt: new Date(),
    });

    return json({ ok: true }, 201);
  } catch (err) {
    console.error('Register error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

/* ───────── only allow POST ───────── */
export async function GET() {
  return json({ error: 'Method not allowed' }, 405);
}
