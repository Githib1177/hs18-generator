export default function handler(req, res) {
  res.status(200).json({
    vercelEnv: process.env.VERCEL_ENV || null,      // "production" / "preview" / "development"
    has_SMS_LOGIN: !!process.env.SMS_LOGIN,         // true/false
    has_SMS_PASSWORD: !!process.env.SMS_PASSWORD    // true/false
  });
}
