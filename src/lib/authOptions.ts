// src/lib/authOptions.ts
import { type AuthOptions, type Session, type User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare } from 'bcryptjs';
import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';

export const authOptions: AuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        if (!creds?.email || !creds.password) throw new Error('Missing creds');

        await connectMongo();
        const dbUser = (await UserModel.findOne({
          email: creds.email,
        }).lean()) as (UserDoc & { _id: Required<UserDoc>['_id'] }) | null;

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
