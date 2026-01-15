import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Cognito from "next-auth/providers/cognito";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Build providers array dynamically based on available config
const providers: Provider[] = [];

// AWS Cognito (only if configured)
if (process.env.COGNITO_CLIENT_ID && process.env.COGNITO_CLIENT_SECRET && process.env.COGNITO_ISSUER) {
  providers.push(
    Cognito({
      clientId: process.env.COGNITO_CLIENT_ID,
      clientSecret: process.env.COGNITO_CLIENT_SECRET,
      issuer: process.env.COGNITO_ISSUER,
    })
  );
}

// Google OAuth (only if configured)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

// Email/Password (always available)
providers.push(
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { email },
        include: { organization: true },
      });

      if (!user || !user.passwordHash) return null;

      // Dynamic import to avoid Edge Runtime issues
      const { verifyPassword } = await import("@/lib/password");
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  })
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/auth/error",
    newUser: "/onboarding",
  },
  providers,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user && user.id) {
        token.id = user.id;

        // Fetch organization details
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: {
            organization: {
              include: {
                subscription: {
                  include: { plan: true },
                },
              },
            },
          },
        });

        if (dbUser) {
          token.organizationId = dbUser.organizationId;
          token.organizationName = dbUser.organization.name;
          token.role = dbUser.role;
          token.subscriptionTier = dbUser.organization.subscriptionTier;
        }

        // Store Cognito ID if using Cognito
        if (account?.provider === "cognito") {
          await prisma.user.update({
            where: { id: user.id },
            data: { cognitoId: account.providerAccountId },
          });
        }
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.id as string,
          organizationId: token.organizationId as string,
          organizationName: token.organizationName as string,
          role: token.role as string,
          subscriptionTier: token.subscriptionTier as string,
        },
      };
    },
    async signIn({ user, account }) {
      // For OAuth providers, create organization if new user
      if (account && account.provider !== "credentials" && user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (!existingUser) {
          // Create new organization and user for OAuth signups
          const organization = await prisma.organization.create({
            data: {
              name: user.name || "My Company",
              slug: user.email.split("@")[0] + "-" + Date.now().toString(36),
              subscriptionTier: "starter",
            },
          });

          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name,
              image: user.image,
              organizationId: organization.id,
              role: "owner",
              cognitoId: account.provider === "cognito" ? account.providerAccountId : null,
            },
          });
        }
      }
      return true;
    },
  },
  events: {
    async createUser({ user }) {
      // Handle any post-creation logic
      console.log("New user created:", user.email);
    },
  },
});
