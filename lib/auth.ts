import type { NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: { scope: "openid email profile https://www.googleapis.com/auth/youtube.readonly" },
      },
    }),
  ],
  // the access token stays in the server-side JWT cookie; the browser never reads it
  // ponytail: no refresh token flow, token dies after 1h -> user logs in again
  callbacks: {
    jwt({ token, account }) {
      if (account) token.accessToken = account.access_token;
      return token;
    },
  },
};
