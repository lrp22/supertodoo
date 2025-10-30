import { expo } from '@better-auth/expo';
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@supertodoo/db";
import * as schema from "@supertodoo/db/schema/auth";

export const auth = betterAuth<BetterAuthOptions>({
	database: drizzleAdapter(db, {
		provider: "pg",

		schema: schema,
	}),
	trustedOrigins: [process.env.CORS_ORIGIN || "", "mybettertapp://", "exp://"],
	emailAndPassword: {
		enabled: true,
	},
	advanced: {
		defaultCookieAttributes: {
			sameSite: "none",
			secure: true,
			httpOnly: true,
		},
	},
  plugins: [expo()]
});
