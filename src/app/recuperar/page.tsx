import PasswordRecovery from "@/components/password-recovery";
export const dynamic = "force-dynamic";
export default function Recovery() {
  return (
    <PasswordRecovery
      emailRecoveryEnabled={Boolean(
        process.env.RESEND_API_KEY && process.env.EMAIL_FROM,
      )}
    />
  );
}
