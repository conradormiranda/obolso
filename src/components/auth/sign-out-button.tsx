import { Button } from "@/components/ui/button";
import { signOutAction, signOutEverywhereAction } from "@/lib/actions/auth";

export function SignOutButton({ everywhere = false, className }: { everywhere?: boolean; className?: string }) {
  return (
    <form action={everywhere ? signOutEverywhereAction : signOutAction} className={className}>
      <Button type="submit" variant={everywhere ? "destructive" : "outline"} className="h-11 w-full">
        {everywhere ? "Sair de todos os dispositivos" : "Sair"}
      </Button>
    </form>
  );
}
