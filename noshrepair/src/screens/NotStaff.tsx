import { Button } from "@/components/ui/button";
import { PageTitle } from "../ui";

export function NotStaff({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md py-12 text-sm leading-relaxed">
      <PageTitle eyebrow="NOT A SUPPORT ACCOUNT">This account cannot use NOSHREPAIR</PageTitle>
      <p className="mb-3">
        <span className="font-[600]">{email}</span> is not on the NOSHASHI support team, so you have been signed out.
      </p>
      <p className="mb-5 text-muted-foreground">
        If you are a new employee, ask the owner to invite this exact email, confirm it from your inbox, then sign in again.
      </p>
      <Button onClick={onBack}>Back to sign in</Button>
    </div>
  );
}
