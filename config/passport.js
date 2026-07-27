import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "../database/neon.js";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } from "./env.js";

passport.use(
    new GoogleStrategy(
        {
            clientID:     GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
            callbackURL:  GOOGLE_CALLBACK_URL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    return done(new Error("Google did not return an email address."), null);
                }

                // Try to find existing user by googleId first, then by email
                let user = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { googleId: profile.id },
                            { email },
                        ],
                    },
                });

                if (user) {
                    // Existing user — attach googleId if they signed up with email before
                    if (!user.googleId) {
                        user = await prisma.user.update({
                            where: { id: user.id },
                            data:  { googleId: profile.id, emailVerified: true },
                        });
                    }
                } else {
                    // New user — create account
                    user = await prisma.user.create({
                        data: {
                            firstName:     profile.name?.givenName  || profile.displayName || "User",
                            lastName:      profile.name?.familyName || "",
                            email,
                            googleId:      profile.id,
                            emailVerified: true,
                        },
                    });
                }

                return done(null, user);
            } catch (error) {
                return done(error, null);
            }
        }
    )
);

export default passport;
