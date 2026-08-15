import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** OAuth provider id: google | github */
      provider?: string;
      /** GitHub login (unique handle) when provider is github */
      githubLogin?: string;
    };
  }
}

declare module "next-auth" {
  interface JWT {
    provider?: string;
    githubLogin?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.provider = account.provider;
      }
      if (account?.provider === "github" && profile) {
        const login = (profile as { login?: string }).login;
        if (login) token.githubLogin = login;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.provider = token.provider as string | undefined;
        session.user.githubLogin = token.githubLogin as string | undefined;
      }
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isOnPublish = request.nextUrl.pathname.startsWith("/publish");
      if (isOnPublish) {
        return isLoggedIn;
      }
      return true;
    },
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
});
