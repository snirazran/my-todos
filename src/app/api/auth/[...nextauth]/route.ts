// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import type { NextAuthOptions, Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

import clientPromise from '@/lib/mongodb';
import { compare } from 'bcryptjs';
import { ObjectId } from 'mongodb';

/* ------------------------------------------------------------------ */
/* 1.  OPTIONS                                                         */
/* ------------------------------------------------------------------ */
export const authOptions: NextAuthOptions = {
  /* ───── SESSION ───── */
  session: { strategy: 'jwt' },

  secret: process.env.NEXTAUTH_SECRET,

  /* ───── PAGES ───── */
  pages: {
    signIn: '/login',
    error: '/login',
  },

  /* ───── PROVIDERS ───── */
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        if (!creds?.email || !creds.password) {
          throw new Error('Missing credentials');
        }

        const dbUser = await (
          await clientPromise
        )
          .db('todoTracker')
          .collection<{
            _id: ObjectId;
            email: string;
            name: string;
            passwordHash: string;
          }>('users')
          .findOne({ email: creds.email });

        if (!dbUser || !(await compare(creds.password, dbUser.passwordHash))) {
          throw new Error('Invalid credentials');
        }

        /** must return an object with at least { id } for the JWT */
        return {
          id: dbUser._id.toString(),
          email: dbUser.email,
          name: dbUser.name,
        };
      },
    }),
  ],

  /* ───── CALLBACKS ───── */
  callbacks: {
    /** enrich the JWT with our uid */
    async jwt({
      token,
      user,
    }: {
      token: JWT;
      user?: User | null;
    }): Promise<JWT> {
      if (user) token.uid = user.id; // thanks to the module‑augmentation
      return token;
    },

    /** expose uid on the client */
    async session({
      session,
      token,
    }: {
      session: Session;
      token: JWT;
    }): Promise<Session> {
      session.user.id = token.uid as string;
      return session;
    },
  },
};

/* ------------------------------------------------------------------ */
/* 2.  HANDLER (app‑router style)                                      */
/* ------------------------------------------------------------------ */
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
