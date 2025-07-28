// ───────────────────────────────────────────────
// 1.  src/lib/authOptions.ts
// ───────────────────────────────────────────────
import NextAuth, { type AuthOptions, type Session, type User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export const authOptions: AuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },

  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        if (!creds?.email || !creds.password) throw new Error('Missing creds');

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

        return {
          id: dbUser._id.toString(),
          email: dbUser.email,
          name: dbUser.name,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = (user as User).id;
      return token;
    },
    async session({ session, token }) {
      (session as Session).user.id = token.uid as string;
      return session;
    },
  },
};
